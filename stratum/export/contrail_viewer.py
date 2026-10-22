"""Data for the contrail proof viewer (website): each satellite-confirmed contrail, shown.

For every flight stretch whose segments the satellite saw (``y = 1`` from the chosen detector
track; by default the learned detector v3, ``nn3``, deviation D-005), up to ``MAX_SLOTS``
Meteosat-9 images are cropped around the contrail and drawn in EUMETSAT's "ash" false colour
(R = T12.0 − T10.8, G = T10.8 − T8.7, B = T10.8; north up, east right). Three overlays, in the
crop's pixel grid:

* ``track``    where the aircraft flew (its segments, parallax-corrected for the flight level);
* ``drift``    where the physics says the contrail was at that image time (advected by the
  ERA5 wind, parallax-corrected: the same prediction the matching used);
* ``detected`` the line objects the detector found in the crop; ``matched`` marks the one
  nearest the prediction.

Privacy as for the map: commercial flights only, salted-hash ids. The images are rendered
pictures (8-bit PNG) with the EUMETSAT credit; no numerical satellite data are exported.

Output: ``<out>/index.json`` and ``<out>/days/<day>/contrails.json`` + ``<event>_<k>.png``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.manifest import is_done

CROP = 96  # px (≈ 300–450 km over India)
MAX_SLOTS = 4
GAP_MIN = 5.0  # y = 1 segments of one flight closer than this form one event
ASH = {"r": (-4.0, 2.0), "g": (-4.0, 5.0), "b": (243.0, 303.0)}
CREDIT = "Meteosat-9 imagery © EUMETSAT 2026 (ash false colour, rendered by STRATUM)"
EXTRA_COLS = ["callsign", "typecode", "alt_ft_mid", "commercial", "pressure_pa"]


def ash_rgb(
    t087: npt.NDArray[Any] | None, t108: npt.NDArray[Any], t120: npt.NDArray[Any]
) -> npt.NDArray[np.uint8]:
    """EUMETSAT ash RGB; without IR8.7 the green channel is a neutral grey."""

    def scale(a: npt.NDArray[Any], lo: float, hi: float) -> npt.NDArray[Any]:
        out: npt.NDArray[Any] = np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1)
        return out

    r = scale(t120 - t108, *ASH["r"])
    g = scale(t108 - t087, *ASH["g"]) if t087 is not None else np.full_like(r, 0.5)
    b = scale(t108, *ASH["b"])
    return np.round(np.stack([r, g, b], -1) * 255).astype(np.uint8)


def _events(y1: pd.DataFrame) -> list[pd.DataFrame]:
    """Consecutive y = 1 segments of one flight (gaps ≤ GAP_MIN) → one event each."""
    out: list[pd.DataFrame] = []
    for _, g in y1.sort_values("time_mid").groupby("flight_id", sort=False):
        t = pd.to_datetime(g["time_mid"]).to_numpy()
        breaks = np.flatnonzero(np.diff(t) > np.timedelta64(int(GAP_MIN * 60), "s")) + 1
        out.extend(g.iloc[a:b] for a, b in zip([0, *breaks], [*breaks, len(g)], strict=True))
    return out


def _orient(lat: npt.NDArray[Any], lon: npt.NDArray[Any]) -> tuple[bool, bool]:
    """(flip rows, flip cols) that make the native grid north-up / east-right."""
    flip_rows = np.nanmean(lat[0, :]) < np.nanmean(lat[-1, :])
    flip_cols = np.nanmean(lon[:, 0]) > np.nanmean(lon[:, -1])
    return bool(flip_rows), bool(flip_cols)


def _xy(
    rows: npt.ArrayLike,
    cols: npt.ArrayLike,
    r0: int,
    c0: int,
    h: int,
    w: int,
    flip: tuple[bool, bool],
) -> list[list[float]]:
    """Native pixel coords → crop coords [x, y] after the north-up flips (pixel centres)."""
    r = np.asarray(rows, float) - r0
    c = np.asarray(cols, float) - c0
    if flip[0]:
        r = (h - 1) - r
    if flip[1]:
        c = (w - 1) - c
    return [[round(float(x), 2), round(float(y), 2)] for x, y in zip(c, r, strict=True)]


class Scene:
    """One day's Meteosat crop source: grid geometry, the L1.5 cube and the detected lines."""

    def __init__(self, root: Path, day: str, track: str = "nn3") -> None:
        import xarray as xr

        from stratum.detect.run import detections_dir

        met = root / "raw" / "meteosat"
        static = xr.open_zarr(met / "static_grid.zarr").load()
        lat_g, lon_g = static["lat"].values.astype(float), static["lon"].values.astype(float)
        self.proj4, self.extent = str(static.attrs["area_proj4"]), list(static.attrs["area_extent"])
        self.shape = (int(lat_g.shape[0]), int(lat_g.shape[1]))
        self.flip = _orient(lat_g, lon_g)
        self.ds = xr.open_zarr(met / "l15_crop" / day / "data.zarr")
        self.have87 = "IR_087" in self.ds
        self.objs = pd.read_parquet(detections_dir(root, track) / day / "objects.parquet")
        self.objs["image_time"] = pd.to_datetime(self.objs["image_time"])

    def track_px(self, ev: pd.DataFrame) -> tuple[Any, Any]:
        """Native pixel coords of the segments' start and end points (parallax at the FL)."""
        from stratum.match.geometry import point_to_pixel

        alt_m = (
            ev["alt_ft_mid"].to_numpy(float) * 0.3048
            if "alt_ft_mid" in ev
            else np.full(len(ev), 11000.0)
        )
        g = (self.proj4, self.extent, self.shape)
        return (
            point_to_pixel(ev["lat_start"], ev["lon_start"], alt_m, *g),
            point_to_pixel(ev["lat_end"], ev["lon_end"], alt_m, *g),
        )

    def slot(
        self, q: pd.DataFrame, t: Any, tr: tuple[Any, Any], path: Path
    ) -> dict[str, Any] | None:
        """Render the crop around ``q`` (per-slot rows of one image time) to ``path`` and return
        its overlays (track, drift, detected lines) in crop pixels."""
        import imageio.v2 as imageio

        shape, flip = self.shape, self.flip
        rr = np.concatenate([q["row_a"], q["row_b"]]).astype(float)
        cc = np.concatenate([q["col_a"], q["col_b"]]).astype(float)
        if not np.isfinite(rr).any():
            return None
        r0 = int(np.clip(round(np.nanmean(rr)) - CROP // 2, 0, max(0, shape[0] - CROP)))
        c0 = int(np.clip(round(np.nanmean(cc)) - CROP // 2, 0, max(0, shape[1] - CROP)))
        h, w = min(CROP, shape[0]), min(CROP, shape[1])
        s = self.ds.sel(time=np.datetime64(t)).load()
        win = (slice(r0, r0 + h), slice(c0, c0 + w))
        img = ash_rgb(
            s["IR_087"].values[win] if self.have87 else None,
            s["IR_108"].values[win],
            s["IR_120"].values[win],
        )
        if flip[0]:
            img = img[::-1]
        if flip[1]:
            img = img[:, ::-1]
        imageio.imwrite(path, np.ascontiguousarray(img))
        drift = [
            _xy([a, b], [c, d], r0, c0, h, w, flip)
            for a, b, c, d in zip(q["row_a"], q["row_b"], q["col_a"], q["col_b"], strict=True)
            if np.isfinite([a, b, c, d]).all()
        ]
        (tr_a, tr_b) = tr
        trk = [
            _xy([a, b], [c, d], r0, c0, h, w, flip)
            for a, b, c, d in zip(tr_a[0], tr_b[0], tr_a[1], tr_b[1], strict=True)
            if np.isfinite([a, b, c, d]).all()
        ]
        o = self.objs[self.objs["image_time"] == t]
        det, best, best_d = [], None, np.inf
        pred = np.column_stack([rr, cc])[np.isfinite(rr) & np.isfinite(cc)]
        for _, row in o.iterrows():
            pr, pc = np.asarray(row["poly_row"], float), np.asarray(row["poly_col"], float)
            inside = (pr >= r0) & (pr < r0 + h) & (pc >= c0) & (pc < c0 + w)
            if not inside.any():
                continue
            dist = float(np.min(np.hypot(pred[:, None, 0] - pr[None], pred[:, None, 1] - pc[None])))
            det.append(
                {
                    "pts": _xy(pr, pc, r0, c0, h, w, flip),
                    "matched": False,
                    "lat": [round(float(v), 4) for v in row["poly_lat"]],
                    "lon": [round(float(v), 4) for v in row["poly_lon"]],
                }
            )
            if dist < best_d:
                best, best_d = len(det) - 1, dist
        if best is not None:
            det[best]["matched"] = True
        return {
            "t": f"{pd.Timestamp(t):%Y-%m-%dT%H:%M}Z",
            "img": path.name,
            "w": w,
            "h": h,
            "age_min": round(float(q["age_min"].mean()), 1),
            "vza_deg": round(float(np.nanmean(q["vza_deg"])), 1)
            if q["vza_deg"].notna().any()
            else None,
            "track": trk,
            "drift": drift,
            "detected": det,
            "match_px": round(best_d, 2) if np.isfinite(best_d) else None,
        }


def export_day(
    root: Path, day: str, out: Path, salt: str, names: dict[str, str], track: str = "nn3"
) -> list[dict[str, Any]]:
    from stratum.export.web_export import hash_id

    sfx = "" if track == "line" else f"_{track}"
    md = root / "interim" / f"matches{sfx}" / day[:7] / day
    if not is_done(md):
        return []
    lab = pd.read_parquet(md / "labels.parquet", columns=["segment_id", "y"])
    per = pd.read_parquet(md / "per_slot.parquet")
    seg = pd.read_parquet(
        root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
    )
    keep = [
        c
        for c in [
            "segment_id",
            "flight_id",
            "time_mid",
            "time_start",
            "time_end",
            "lat_start",
            "lon_start",
            "lat_end",
            "lon_end",
            *EXTRA_COLS,
        ]
        if c in seg
    ]
    y1 = lab[lab["y"] == 1].merge(seg[keep], on="segment_id", how="inner")
    if "commercial" in y1:
        y1 = y1[y1["commercial"].fillna(False).astype(bool)]
    if y1.empty:
        return []
    sc = Scene(root, day, track)
    per["image_time"] = pd.to_datetime(per["image_time"])
    ddir = out / "days" / day
    ddir.mkdir(parents=True, exist_ok=True)
    events = []
    for k, ev in enumerate(_events(y1)):
        sids = set(ev["segment_id"])
        p = per[per["segment_id"].isin(sids)]
        good = p[p["matched"] & p["observable"]]
        if good.empty:
            continue
        slot_order = (
            good.groupby("image_time").size().sort_values(ascending=False).index[:MAX_SLOTS]
        )
        tr = sc.track_px(ev)
        fid = str(ev["flight_id"].iloc[0])
        cs = (
            str(ev["callsign"].iloc[0])
            if "callsign" in ev and pd.notna(ev["callsign"].iloc[0])
            else ""
        )
        eid = f"{hash_id(fid, salt)}_{k:03d}"
        slots: list[dict[str, Any]] = []
        for t in sorted(slot_order):
            one = sc.slot(p[p["image_time"] == t], t, tr, ddir / f"{eid}_{len(slots)}.png")
            if one is not None:
                slots.append(one)
        if not slots:
            continue
        ts = pd.to_datetime(ev["time_mid"])
        tc = ev["typecode"].iloc[0] if "typecode" in ev else None
        actype = str(tc) if tc is not None and pd.notna(tc) else None
        events.append(
            {
                "id": eid,
                "flight_id": hash_id(fid, salt),
                "callsign": cs or None,
                "airline": names.get(cs[:3]) if cs else None,
                "aircraft_type": actype,
                "fl": round(float(ev["alt_ft_mid"].mean()) / 100) if "alt_ft_mid" in ev else None,
                "t_start": f"{ts.min():%Y-%m-%dT%H:%M}Z",
                "t_end": f"{ts.max():%Y-%m-%dT%H:%M}Z",
                "segments": len(ev),
                "lat": round(float(ev[["lat_start", "lat_end"]].to_numpy().mean()), 3),
                "lon": round(float(ev[["lon_start", "lon_end"]].to_numpy().mean()), 3),
                "slots": slots,
            }
        )
    (ddir / "contrails.json").write_text(json.dumps(events, separators=(",", ":")))
    return events


def export(root: Path, out: Path, salt: str, track: str = "nn3") -> dict[str, Any]:
    from stratum import phase5
    from stratum.config import configs_dir
    from stratum.export.web_export import airline_names

    names = airline_names(configs_dir() / "airlines.yaml")
    days: dict[str, int] = {}
    for d in phase5._segment_days(root):
        ev = export_day(root, f"{d:%Y-%m-%d}", out, salt, names, track)
        if ev:
            days[f"{d:%Y-%m-%d}"] = len(ev)
    detector = {"line": "line filter (pre-registered)", "nn": "learned v1", "nn3": "learned v3"}
    index = {
        "track": track,
        "detector": detector.get(track, track),
        "days": days,
        "events": sum(days.values()),
        "credit": CREDIT,
        "note": "Labels from the detector named here (D-005, second analysis); "
        "commercial flights only.",
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.json").write_text(json.dumps(index, indent=1))
    return index
