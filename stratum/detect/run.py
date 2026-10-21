"""Run the contrail detector on Meteosat slots and days (build prompt §3.1 steps 1–6, §3.2).

Detection happens in the satellite's native geometry; nothing is reprojected, so thin lines
are not blurred. Stored crops are south-up and east-left (native SEVIRI scan order). That does
not matter for detection; figures flip them north-up.

Output per object (one Parquet row): image_time, object_id, the polyline in pixels and in
lat/lon, centroid, length (px and km), geographic orientation (degrees clockwise from north,
0–180), mean BTD and BTD anomaly, mean filter response, line-fit residual, width, how much
colder than its surroundings in T10.8, mean VZA and the confidence score.

Confidence is a logistic function of mean filter response, length, line-fit residual, BTD
contrast, the cold-T10.8 check (clipped to ±5 K) and the flank asymmetry (cloud-edge check).
Its weights are provisional (hand-set) until the Phase 5 tuning half is labelled. Objects with
flank asymmetry > ``max_flank_asymmetry`` are dropped as cloud edges.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt
import pandas as pd
import xarray as xr
from scipy.ndimage import map_coordinates

from stratum.detect.btd import contrail_field
from stratum.detect.line_filters import kernel_bank, line_response
from stratum.detect.objects import LineObject, ObjectLog, extract_objects
from stratum.detect.params import DetectorParams, load_detector_params
from stratum.manifest import RunManifest, UnitLock, UnitLockedError, is_done, mark_success

Array = npt.NDArray[np.float64]
EARTH_R_KM = 6371.0


def confidence(
    mean_response: float,
    length_px: float,
    residual_px: float,
    btd_contrast_k: float,
    cold_k: float,
    flank_asymmetry: float,
    p: DetectorParams,
) -> float:
    w = p.confidence
    z = (
        w.intercept
        + w.response * mean_response
        + w.length * length_px
        + w.linearity * residual_px
        + w.btd_contrast * btd_contrast_k
        + w.cold * float(np.clip(cold_k, -5.0, 5.0))
        + w.edge * flank_asymmetry
    )
    return float(1.0 / (1.0 + np.exp(-z)))


def flank_asymmetry(
    btd: Array, poly_row: Array, poly_col: Array, length_px: float, offset_px: float = 4.0
) -> float:
    """|BTD(left flank) − BTD(right flank)| / (BTD(core) − mean flank), raw BTD in K.

    A contrail sits on similar air on both sides (≈ 0). A line along a cloud edge has a large
    jump between its sides (≳ 1). Raw BTD is used on purpose: the median background keeps
    edges sharp, so in the background-removed field a cloud edge looks like a thin symmetric
    line. Flanks are sampled ``offset_px`` either side of the polyline.
    """
    f = np.where(np.isfinite(btd), btd, np.nanmedian(btd))
    n = max(20, int(length_px * 2))
    u = np.linspace(0, len(poly_row) - 1, n)
    rr = np.interp(u, np.arange(len(poly_row)), poly_row)
    cc = np.interp(u, np.arange(len(poly_col)), poly_col)
    dr, dc = np.gradient(rr), np.gradient(cc)
    norm = np.maximum(np.hypot(dr, dc), 1e-9)
    nr, nc = dc / norm, -dr / norm
    core = float(map_coordinates(f, [rr, cc], order=1).mean())
    a = float(map_coordinates(f, [rr + offset_px * nr, cc + offset_px * nc], order=1).mean())
    b = float(map_coordinates(f, [rr - offset_px * nr, cc - offset_px * nc], order=1).mean())
    return abs(a - b) / max(core - (a + b) / 2.0, 0.05)


def coast_mask(area: Any, shape: tuple[int, int], buffer_px: int) -> npt.NDArray[np.bool_]:
    """Pixels within ``buffer_px`` of a Natural Earth coastline, in the crop's pixel grid."""
    from stratum.io.meteosat_plots import coastline_pixels

    m = np.zeros(shape, dtype=np.uint8)
    for col, row in coastline_pixels(area):
        pts = np.round(np.column_stack([col, row])).astype(np.int32)
        cv2.polylines(m, [pts], isClosed=False, color=1, thickness=1)
    if buffer_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * buffer_px + 1, 2 * buffer_px + 1))
        return np.asarray(cv2.dilate(m, k), dtype=bool)
    return m.astype(bool)


def _haversine_km(lat1: Array, lon1: Array, lat2: Array, lon2: Array) -> Array:
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    out: Array = 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return out


def _axial_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Orientation of the line through two points, degrees clockwise from north, in [0, 180)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return float(np.degrees(np.arctan2(y, x)) % 180.0)


def detect_slot(
    t108: Array,
    t120: Array,
    lat: Array,
    lon: Array,
    vza: Array,
    p: DetectorParams,
    coast: npt.NDArray[np.bool_] | None = None,
    image_time: Any = None,
    response: Array | None = None,
) -> tuple[pd.DataFrame, ObjectLog]:
    """Detect line objects in one slot (all inputs on the same native pixel grid).

    ``response``: a per-pixel contrail probability from the learned detector (D-005). It then
    replaces the line-filter response (``p.hysteresis`` must be in probability units) and each
    object's confidence is its mean probability; the filter bank still supplies the per-pixel
    line direction for ridge thinning, and every other step is unchanged."""
    f = contrail_field(t108, t120, p.background_px, p.noise_px, p.t120_weight)
    bank = _bank(p.orientations, tuple(p.lengths_px), p.core_sigma_px, p.flank_px)
    resp, theta = line_response(f["field"], bank)
    if response is not None:
        resp = np.asarray(response, float)
    valid = np.isfinite(t108) & np.isfinite(t120) & (np.nan_to_num(vza, nan=90.0) <= p.max_vza_deg)
    objs, log = extract_objects(resp, f["field"], theta, valid, coast, p)
    rows = [_row(o, i, f, lat, lon, vza, p, image_time) for i, o in enumerate(objs)]
    df = pd.DataFrame(rows, columns=OUT_COLUMNS)
    edge = df["flank_asymmetry"] > p.max_flank_asymmetry
    log.rejected["cloud_edge"] += int(edge.sum())
    df = df[~edge].reset_index(drop=True)
    df["object_id"] = np.arange(len(df))
    if response is not None:
        df["confidence"] = df["mean_response"].astype(float)
    return df, log


OUT_COLUMNS = [
    "image_time", "object_id", "poly_row", "poly_col", "poly_lat", "poly_lon",
    "centroid_lat", "centroid_lon", "length_px", "length_km", "orientation_deg",
    "mean_btd_k", "btd_contrast_k", "cold_k", "mean_response", "line_residual_px",
    "width_px", "orientation_spread_deg", "flank_asymmetry", "vza_deg", "confidence",
]  # fmt: skip


@lru_cache(maxsize=4)
def _bank(n: int, lengths: tuple[int, ...], sigma: float, flank: float) -> list[Any]:
    return kernel_bank(n, list(lengths), sigma, flank)


def _row(
    o: LineObject, i: int, f: dict[str, Array], lat: Array, lon: Array, vza: Array,
    p: DetectorParams, image_time: Any,
) -> dict[str, Any]:  # fmt: skip
    r, c = o.rows.astype(int), o.cols.astype(int)
    plat = map_coordinates(lat, [o.poly_row, o.poly_col], order=1, mode="nearest")
    plon = map_coordinates(lon, [o.poly_row, o.poly_col], order=1, mode="nearest")
    contrast = float(np.nanmean(f["btd_anomaly"][r, c]))
    cold = float(-np.nanmean(f["t108_anomaly"][r, c]))
    asym = flank_asymmetry(f["btd"], o.poly_row, o.poly_col, o.length_px)
    return {
        "image_time": image_time,
        "object_id": i,
        "poly_row": o.poly_row.round(2).tolist(),
        "poly_col": o.poly_col.round(2).tolist(),
        "poly_lat": plat.round(4).tolist(),
        "poly_lon": plon.round(4).tolist(),
        "centroid_lat": float(np.nanmean(lat[r, c])),
        "centroid_lon": float(np.nanmean(lon[r, c])),
        "length_px": o.length_px,
        "length_km": float(_haversine_km(plat[:-1], plon[:-1], plat[1:], plon[1:]).sum()),
        "orientation_deg": _axial_bearing_deg(plat[0], plon[0], plat[-1], plon[-1]),
        "mean_btd_k": float(np.nanmean(f["btd"][r, c])),
        "btd_contrast_k": contrast,
        "cold_k": cold,
        "mean_response": o.mean_response,
        "line_residual_px": o.residual_px,
        "width_px": o.width_px,
        "orientation_spread_deg": o.spread_deg,
        "flank_asymmetry": asym,
        "vza_deg": float(np.nanmean(vza[r, c])),
        "confidence": confidence(
            o.mean_response, o.length_px, o.residual_px, contrast, cold, asym, p
        ),
    }


def detections_dir(root: Path, track: str = "line") -> Path:
    """``interim/detections`` (pre-registered line filter) or ``interim/detections_nn`` (D-005)."""
    return root / "interim" / ("detections" if track == "line" else f"detections_{track}")


def nn_detector(root: Path, params: DetectorParams | None = None) -> tuple[Any, DetectorParams]:
    """The learned detector (D-005) and the object settings chosen with it on the DLR
    training scenes; every object that passes them is kept (operating threshold 0)."""
    from stratum.detect import nn
    from stratum.detect.nn_run import nn_dir, nn_params

    model, meta = nn.load(nn_dir(root) / "model.pt")
    geom = (meta["max_line_residual_px"], meta["max_orientation_spread_deg"])
    p = nn_params(params or load_detector_params(), tuple(meta["hysteresis"]), geom)
    return model, p.model_copy(update={"operating_threshold": 0.0})


def detect_day(
    root: Path,
    day: date,
    params: DetectorParams | None = None,
    config_hash: str | None = None,
    force: bool = False,
    track: str = "line",
) -> dict[str, Any]:
    """All slots of one stored Meteosat day → ``<detections dir>/YYYY-MM-DD/objects.parquet``.

    ``track="nn"``: the learned detector (D-005) supplies the per-pixel probability; output in
    ``interim/detections_nn`` so the pre-registered detections are never overwritten."""
    from stratum.io.meteosat_plots import area_from_attrs
    from stratum.manifest import SUCCESS_MARKER

    model = None
    if track == "nn":
        model, p = nn_detector(root, params)
    else:
        p = params or load_detector_params()
    src = root / "raw" / "meteosat" / "l15_crop" / f"{day:%Y-%m-%d}"
    out_dir = detections_dir(root, track) / f"{day:%Y-%m-%d}"
    if force:
        (out_dir / SUCCESS_MARKER).unlink(missing_ok=True)
    if is_done(out_dir):
        return {"day": str(day), "status": "already done"}
    if not (src / "data.zarr").exists():
        return {"day": str(day), "status": f"no Meteosat day in {src}"}
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        lock = UnitLock(out_dir)
        lock.acquire()
    except UnitLockedError:
        return {"day": str(day), "status": "locked by another run"}
    try:
        man = RunManifest.start(
            "detect" if track == "line" else f"detect-{track}", unit=str(day),
            config_hash=config_hash, params=p.model_dump(),
        )  # fmt: skip
        ds = xr.open_zarr(src / "data.zarr")
        grid = xr.open_zarr(root / "raw" / "meteosat" / "static_grid.zarr").load()
        lat, lon, vza = (grid[v].values.astype(float) for v in ("lat", "lon", "vza_deg"))
        coast = coast_mask(area_from_attrs(ds), lat.shape, p.coast_buffer_px)
        frames, rejected, cand = [], ObjectLog().rejected, 0
        for t in ds["time"].values:
            chans = ["IR_108", "IR_120"] + (["IR_087"] if model is not None else [])
            s = ds.sel(time=t)[chans].load()
            prob = None
            if model is not None:
                from stratum.detect import nn
                from stratum.detect.nn_data import channels

                x = channels(s["IR_087"].values, s["IR_108"].values, s["IR_120"].values)
                prob = nn.predict(model, x[None])[0]
            df, log = detect_slot(
                s["IR_108"].values, s["IR_120"].values, lat, lon, vza, p, coast,
                pd.Timestamp(t), response=prob,
            )  # fmt: skip
            frames.append(df)
            rejected.update(log.rejected)
            cand += log.candidates
        objs = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=OUT_COLUMNS)
        f1 = out_dir / "objects.parquet"
        objs.to_parquet(f1, index=False)
        summary = day_summary(objs, len(ds["time"]), cand, dict(rejected), p)
        man.stats = summary
        man.add_outputs([f1])
        mark_success(out_dir, man)
    finally:
        lock.release()
    return {"day": str(day), "status": "done", **summary}


def day_summary(
    objs: pd.DataFrame, slots: int, candidates: int, rejected: dict[str, int], p: DetectorParams
) -> dict[str, Any]:
    conf = objs["confidence"].to_numpy(float) if len(objs) else np.array([])
    hist, _ = np.histogram(conf, bins=np.linspace(0, 1, 11))
    above = conf >= p.operating_threshold
    return {
        "slots": slots,
        "candidates": candidates,
        "rejected": rejected,
        "objects": len(objs),
        "objects_above_threshold": int(above.sum()),
        "objects_per_slot_median": float(objs.groupby("image_time").size().median())
        if len(objs)
        else 0.0,
        "confidence_hist_0_to_1_by_0.1": hist.tolist(),
        "median_length_km": float(objs["length_km"].median()) if len(objs) else None,
    }
