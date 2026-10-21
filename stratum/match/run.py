"""Full-year matching: segment labels for one flight day (build prompt §5.5–5.6).

What it does, per flight day
----------------------------
1. **Detection** on every stored Meteosat slot of the day (``stratum detect``; skipped if done).
2. **Candidates**: every segment that meets the Schmidt–Appleman formation criterion
   (``forms``; pre-registered ``matching.candidate_segments: sac_formation``), persistent or
   not, any operator. ``commercial`` is carried along so later steps can filter.
3. **Advection** of both end points with the ERA5 wind at the segment's pressure (RK2, 5-min
   steps, ``advect.py``) up to 120 min.
4. For every stored slot with **20 ≤ age ≤ 120 min** (age from the segment midpoint time):
   parallax-corrected pixel line (``geometry.point_to_pixel`` at the segment's geometric
   height = ERA5 geopotential height, falling back to pressure altitude), **match** against
   detected objects at or above the operating threshold (``matching.matches_line``), and the
   three **observability** conditions (ERA5 high cloud at and above < 0.5; cloud mask: more than
   half of a 15 × 15-px box "cloudy" = opaque, with no-data pixels counted as cloudy so a gap
   in the mask can never create a "not observed"; VZA < 60°). Also stored: day or night (solar
   zenith at the midpoint), and the distance from the predicted midpoint to the nearest
   detected object with and without the parallax correction (for the before/after figure).
5. **Segment label** with the pre-registered rule (``matching.segment_labels``): y = 1 / 0 /
   missing. Unobservable stays missing.

Outputs (``interim/matches/<YYYY-MM>/<YYYY-MM-DD>/``): ``per_slot.parquet`` (one row per
segment × slot, for sensitivity analyses), ``labels.parquet`` (one row per candidate segment,
with the leakage keys ``flight_id`` and ``image_time_first``), ``manifest.json`` with the day
summary. Resumable per day (``_SUCCESS``).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
import xarray as xr

from stratum.manifest import RunManifest, UnitLock, UnitLockedError, is_done, mark_success
from stratum.match import advect as adv
from stratum.match import detectability as dtc
from stratum.match import matching as mt

Array = npt.NDArray[np.float64]
CLM_CLOUDY = 2
CLM_NODATA = (3, 255)
NEAREST_CAP_PX = 30.0
CHUNK = 40_000
SEG_COLS = [
    "segment_id",
    "flight_id",
    "time_start",
    "time_end",
    "time_mid",
    "lat_start",
    "lon_start",
    "lat_end",
    "lon_end",
    "lat_mid",
    "lon_mid",
    "alt_ft_mid",
    "geopotential_height_m",
    "pressure_pa",
    "heading_deg",
    "forms",
    "persists_raw",
    "commercial",
    "in_corridor",
]
VZA_BANDS = [0.0, 30.0, 45.0, 60.0, 90.0]


def season(month: npt.ArrayLike) -> npt.NDArray[np.str_]:
    """India Meteorological Department seasons."""
    m = np.asarray(month, int)
    out = np.full(m.shape, "winter", dtype=object)
    out[(m >= 3) & (m <= 5)] = "pre_monsoon"
    out[(m >= 6) & (m <= 9)] = "monsoon"
    out[m >= 10] = "post_monsoon"
    return out.astype(str)


def solar_zenith_deg(t_utc: pd.DatetimeIndex | pd.Series, lat: Array, lon: Array) -> Array:
    """Solar zenith angle (NOAA low-precision formulas; ≈ 0.5° accuracy, enough for day/night)."""
    t = pd.to_datetime(t_utc)
    doy = np.asarray(t.dayofyear, float)
    hour = np.asarray(t.hour + t.minute / 60.0 + t.second / 3600.0, float)
    g = 2 * np.pi / 365.0 * (doy - 1 + (hour - 12) / 24.0)
    decl = (
        0.006918
        - 0.399912 * np.cos(g)
        + 0.070257 * np.sin(g)
        - 0.006758 * np.cos(2 * g)
        + 0.000907 * np.sin(2 * g)
        - 0.002697 * np.cos(3 * g)
        + 0.00148 * np.sin(3 * g)
    )
    eqt = 229.18 * (
        0.000075
        + 0.001868 * np.cos(g)
        - 0.032077 * np.sin(g)
        - 0.014615 * np.cos(2 * g)
        - 0.040849 * np.sin(2 * g)
    )
    tst = hour * 60.0 + eqt + 4.0 * np.asarray(lon, float)
    ha = np.radians(tst / 4.0 - 180.0)
    la = np.radians(np.asarray(lat, float))
    cosz = np.sin(la) * np.sin(decl) + np.cos(la) * np.cos(decl) * np.cos(ha)
    out: Array = np.degrees(np.arccos(np.clip(cosz, -1.0, 1.0)))
    return out


def _height_m(seg: pd.DataFrame) -> Array:
    h = seg["geopotential_height_m"].to_numpy(float)
    alt = seg["alt_ft_mid"].to_numpy(float) * 0.3048
    out: Array = np.where(np.isfinite(h), h, alt)
    return out


def _epoch_s(s: pd.Series) -> Array:
    t = pd.to_datetime(s, utc=True).dt.tz_convert(None)
    out: Array = t.to_numpy("datetime64[s]").astype("int64").astype(float)
    return out


class SlotObjects:
    """Detected objects of one slot at or above the threshold, with a KD-tree on their points."""

    def __init__(self, objs: pd.DataFrame, threshold: float) -> None:
        from scipy.spatial import cKDTree

        o = objs[objs["confidence"] >= threshold]
        self.lines: list[tuple[Array, Array]] = [
            (np.asarray(r, float), np.asarray(c, float))
            for r, c in zip(o["poly_row"], o["poly_col"], strict=True)
        ]
        pts, owner = [], []
        for i, (r, c) in enumerate(self.lines):
            d = _densify(r, c)
            pts.append(d)
            owner.append(np.full(len(d), i))
        self.tree = cKDTree(np.vstack(pts)) if pts else None
        self.owner = np.concatenate(owner) if owner else np.zeros(0, int)

    def nearest(self, row: Array, col: Array) -> Array:
        out = np.full(len(row), np.nan)
        if self.tree is None:
            return out
        ok = np.isfinite(row) & np.isfinite(col)
        if ok.any():
            d, _ = self.tree.query(
                np.column_stack([row[ok], col[ok]]), distance_upper_bound=NEAREST_CAP_PX
            )
            out[ok] = np.where(np.isfinite(d), d, np.nan)
        return out

    def matched(
        self, a_r: Array, a_c: Array, b_r: Array, b_c: Array, rules: mt.MatchRules
    ) -> npt.NDArray[np.bool_]:
        out = np.zeros(len(a_r), bool)
        if self.tree is None:
            return out
        mr, mc = (a_r + b_r) / 2, (a_c + b_c) / 2
        half = np.hypot(b_r - a_r, b_c - a_c) / 2
        # only lines with some object point near their midpoint can match (vectorised pre-filter)
        d_mid = self.nearest(mr, mc)
        ok = np.isfinite(half) & (d_mid <= half + rules.max_distance_px + 0.5)
        for i in np.flatnonzero(ok):
            near = self.tree.query_ball_point(
                [mr[i], mc[i]], r=half[i] + rules.max_distance_px + 0.5
            )
            if not near:
                continue
            cand = [self.lines[j] for j in np.unique(self.owner[near])]
            out[i] = mt.matches_line((a_r[i], a_c[i]), (b_r[i], b_c[i]), cand, rules)
        return out


def _densify(r: Array, c: Array, step: float = 0.5) -> Array:
    seg = np.hypot(np.diff(r), np.diff(c))
    s = np.concatenate([[0.0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], max(2, int(s[-1] / step) + 1))
    return np.column_stack([np.interp(t, s, r), np.interp(t, s, c)])


def per_slot_rows(
    seg: pd.DataFrame,
    grid: Any,
    slots: list[pd.Timestamp],
    objects_by_slot: dict[pd.Timestamp, SlotObjects],
    cloudy_by_slot: dict[pd.Timestamp, npt.NDArray[np.bool_]],
    vza: Array,
    area: tuple[str, list[float], tuple[int, int]],
    rules: mt.MatchRules = mt.DEFAULT_RULES,
    min_age_min: float = 20.0,
    max_age_min: float = 120.0,
) -> pd.DataFrame:
    """All (segment, slot) rows for a chunk of candidate segments."""
    from stratum.match.geometry import point_to_pixel

    proj4, extent, shape = area
    n = len(seg)
    t_start, t_end, t_mid = (_epoch_s(seg[c]) for c in ("time_start", "time_end", "time_mid"))
    p = seg["pressure_pa"].to_numpy(float)
    h = _height_m(seg)
    lat0 = np.concatenate([seg["lat_start"].to_numpy(float), seg["lat_end"].to_numpy(float)])
    lon0 = np.concatenate([seg["lon_start"].to_numpy(float), seg["lon_end"].to_numpy(float)])
    t0 = np.concatenate([t_start, t_end])
    max_age_s = max_age_min * 60.0 + float(np.nanmax(np.abs(t_end - t_start), initial=0.0)) + 60
    ages, la, lo = adv.advect(grid, lat0, lon0, np.concatenate([p, p]), t0, max_age_s)
    slot_s = np.array([pd.Timestamp(t).value / 1e9 for t in slots])
    parts = []
    for k, ts in enumerate(slot_s):
        age_mid = ts - t_mid
        sel = np.flatnonzero(
            (age_mid >= min_age_min * 60 - 1e-6) & (age_mid <= max_age_min * 60 + 1e-6)
        )
        if sel.size == 0:
            continue
        want = np.concatenate([ts - t_start[sel], ts - t_end[sel]])
        rows_pts = np.concatenate([sel, sel + n])
        pla, plo = adv.positions_at(ages, la[rows_pts], lo[rows_pts], want[:, None])
        pla, plo = pla[:, 0], plo[:, 0]
        m = sel.size
        hh = np.concatenate([h[sel], h[sel]])
        r, c = point_to_pixel(pla, plo, hh, proj4, extent, shape)
        r0, c0 = point_to_pixel(pla, plo, hh, proj4, extent, shape, parallax=False)
        a_r, b_r, a_c, b_c = r[:m], r[m:], c[:m], c[m:]
        mid_r, mid_c = (a_r + b_r) / 2, (a_c + b_c) / 2
        mid_lat, mid_lon = (pla[:m] + pla[m:]) / 2, (plo[:m] + plo[m:]) / 2
        t = slots[k]
        so = objects_by_slot.get(t)
        matched = so.matched(a_r, a_c, b_r, b_c, rules) if so is not None else np.zeros(m, bool)
        nearest = so.nearest(mid_r, mid_c) if so is not None else np.full(m, np.nan)
        nearest0 = (
            so.nearest((r0[:m] + r0[m:]) / 2, (c0[:m] + c0[m:]) / 2)
            if so is not None
            else np.full(m, np.nan)
        )
        cloudy = cloudy_by_slot.get(t)
        cf = (
            mt.box_fraction(cloudy, mid_r, mid_c, rules.box_px)
            if cloudy is not None
            else np.full(m, np.nan)
        )
        ri = np.floor(mid_r + 0.5)
        ci = np.floor(mid_c + 0.5)
        inside = (
            np.isfinite(ri)
            & np.isfinite(ci)
            & (ri >= 0)
            & (ci >= 0)
            & (ri < shape[0])
            & (ci < shape[1])
        )
        vz = np.full(m, np.nan)
        vz[inside] = vza[ri[inside].astype(int), ci[inside].astype(int)]
        hc = mt.high_cloud_at_and_above(grid, np.full(m, ts), mid_lat, mid_lon, p[sel])
        obs = mt.observable(hc, cf, vz, rules)
        if so is None:
            obs[:] = False  # no detection for this slot → it cannot say "not observed"
        sza = solar_zenith_deg(pd.DatetimeIndex([t] * m), mid_lat, mid_lon)
        parts.append(
            pd.DataFrame(
                {
                    "segment_id": seg["segment_id"].to_numpy()[sel],
                    "flight_id": seg["flight_id"].to_numpy()[sel],
                    "image_time": t,
                    "age_min": age_mid[sel] / 60.0,
                    "row_a": a_r,
                    "col_a": a_c,
                    "row_b": b_r,
                    "col_b": b_c,
                    "lat_adv": mid_lat,
                    "lon_adv": mid_lon,
                    "high_cloud": hc,
                    "cloudy_fraction": cf,
                    "vza_deg": vz,
                    "observable": obs,
                    "matched": matched,
                    "nearest_px": nearest,
                    "nearest_px_no_parallax": nearest0,
                    "night": sza > 90.0,
                }
            )
        )
    if not parts:
        return pd.DataFrame()
    return pd.concat(parts, ignore_index=True)


def label_table(
    seg: pd.DataFrame, per: pd.DataFrame, rules: mt.MatchRules = mt.DEFAULT_RULES
) -> pd.DataFrame:
    """One row per candidate segment: label, counts, keys and the stratifying columns."""
    if len(per):
        first = per.groupby("segment_id")["image_time"].min().rename("image_time_first")
        lab = mt.segment_labels(per.drop(columns=["flight_id"]), rules).merge(
            first, on="segment_id", how="left"
        )
        nights = per.groupby("segment_id")["night"].mean().rename("night_fraction")
        lab = lab.merge(nights, on="segment_id", how="left")
    else:
        lab = pd.DataFrame(
            columns=[
                "segment_id",
                "n_slots",
                "n_observable",
                "n_matched_observable",
                "n_matched_unobservable",
                "y",
                "image_time_first",
                "night_fraction",
            ]
        )
    keep = [
        "segment_id",
        "flight_id",
        "time_mid",
        "lat_mid",
        "lon_mid",
        "pressure_pa",
        "persists_raw",
        "commercial",
        "in_corridor",
    ]
    out = seg[[c for c in keep if c in seg]].merge(lab, on="segment_id", how="left")
    out["n_slots"] = out["n_slots"].fillna(0).astype(int)
    for c in ("n_observable", "n_matched_observable", "n_matched_unobservable"):
        out[c] = out[c].fillna(0).astype(int)
    out["y"] = out["y"].astype(float)  # segments with no slot in the window stay missing
    month = pd.to_datetime(out["time_mid"], utc=True).dt.month.to_numpy()
    out["season"] = season(month)
    out["west_of_80e"] = out["lon_mid"].to_numpy(float) < 80.0
    return out


def summarise(lab: pd.DataFrame, per: pd.DataFrame) -> dict[str, Any]:
    y = lab["y"]

    def counts(df: pd.DataFrame) -> dict[str, int]:
        return {
            "candidates": len(df),
            "y1": int((df["y"] == 1).sum()),
            "y0": int((df["y"] == 0).sum()),
            "missing": int(df["y"].isna().sum()),
        }

    out: dict[str, Any] = counts(lab)
    out["observable_fraction_of_slots"] = (
        round(float(per["observable"].mean()), 4) if len(per) else None
    )
    out["slots_rows"] = len(per)
    out["by_west_east"] = {
        ("west" if k else "east"): counts(g) for k, g in lab.groupby("west_of_80e")
    }
    out["by_season"] = {str(k): counts(g) for k, g in lab.groupby("season")}
    if len(per):
        band = pd.cut(per["vza_deg"], VZA_BANDS, right=False).astype(str)
        out["slots_by_vza_band"] = {
            b: {
                "rows": len(g),
                "observable": int(g["observable"].sum()),
                "matched_observable": int((g["observable"] & g["matched"]).sum()),
            }
            for b, g in per.groupby(band)
        }
        out["slots_by_day_night"] = {
            ("night" if k else "day"): {
                "rows": len(g),
                "observable": int(g["observable"].sum()),
                "matched_observable": int((g["observable"] & g["matched"]).sum()),
            }
            for k, g in per.groupby("night")
        }
    out["y1_persistent_raw"] = int(((y == 1) & lab["persists_raw"].astype(bool)).sum())
    return out


def _stale_detections(root: Path, d: str, p: Any, track: str = "line") -> bool:
    """True if stored detections of day ``d`` were made with other detector settings (e.g.
    the Phase 3 provisional ones): they are then recomputed, never silently reused."""
    import json

    from stratum.detect.run import detections_dir
    from stratum.manifest import MANIFEST_NAME

    mf = detections_dir(root, track) / d / MANIFEST_NAME
    if not (is_done(mf.parent) and mf.exists()):
        return False
    old = json.loads(json.dumps(json.loads(mf.read_text()).get("params") or {}))
    return bool(old != json.loads(json.dumps(p.model_dump())))


def _detectability(
    root: Path, day: date, static: xr.Dataset, min_age_min: float, max_age_min: float
) -> pd.DataFrame | None:
    """Driver et al. flag from the day's CoCiP B1 evolution table, if CoCiP ran (else None)."""
    f = root / "interim" / "cocip" / "B1" / f"{day:%Y-%m}" / f"{day:%Y-%m-%d}" / "contrail.parquet"
    if not (is_done(f.parent) and f.exists()):
        return None
    con = pd.read_parquet(f)
    if not {"tau_contrail", "width", "age"} <= set(con.columns):
        return None
    px = dtc.pixel_km_lookup(
        static["lat"].values.astype(float),
        static["lon"].values.astype(float),
        static["pixel_area_km2"].values.astype(float),
    )
    return dtc.detectability(con, px, min_age_min, max_age_min)


def _stale_matches(out_dir: Path, p: Any, rules: mt.MatchRules | None = None) -> bool:
    """True if a finished match day was made with other detector settings or label rules."""
    import json

    from stratum.manifest import MANIFEST_NAME

    mf = out_dir / MANIFEST_NAME
    if not (is_done(out_dir) and mf.exists()):
        return False
    params = json.loads(mf.read_text()).get("params") or {}
    if params.get("detector") != json.loads(json.dumps(p.model_dump())):
        return True
    if params.get("label_rule_version") != mt.LABEL_RULE_VERSION:
        return True
    return bool(rules is not None and params.get("rules") != json.loads(json.dumps(rules.__dict__)))


def match_day(
    root: Path,
    day: date,
    det_params: Any = None,
    rules: mt.MatchRules = mt.DEFAULT_RULES,
    min_age_min: float = 20.0,
    max_age_min: float = 120.0,
    config_hash: str | None = None,
    force: bool = False,
    max_segments: int | None = None,
    image_day: date | None = None,
    variant: str | None = None,
    track: str = "line",
) -> dict[str, Any]:
    """Labels for the flights of ``day``.

    With ``image_day`` (≠ ``day``): the **wrong-day null**. The flights of ``day`` are moved in
    time to ``image_day`` and matched against that day's images and ERA5. No real contrail of
    these flights can be in those images, so every y = 1 is a chance match; the y = 1 rate
    estimates how many of the real labels are coincidences. Written to ``interim/matches_null``.

    ``track="nn"``: detections of the learned detector (D-005); labels go to
    ``interim/matches_nn`` (null: ``matches_null_nn``), never over the pre-registered ones.
    """
    from stratum import phase2
    from stratum.detect.params import load_detector_params
    from stratum.detect.run import detect_day, detections_dir, nn_detector
    from stratum.manifest import SUCCESS_MARKER
    from stratum.met.interp import MetGrid

    p = (
        nn_detector(root, det_params)[1]
        if track == "nn"
        else (det_params or load_detector_params())
    )
    sfx = "" if track == "line" else f"_{track}"
    seg_d = f"{day:%Y-%m-%d}"
    seg_dir = root / "interim" / "segments_met" / f"{day:%Y-%m}" / seg_d
    null = image_day is not None and image_day != day
    img_day = image_day if null and image_day is not None else day
    d = f"{img_day:%Y-%m-%d}"
    met = root / "raw" / "meteosat"
    out_dir = (
        root / "interim" / f"matches_null{sfx}" / f"{seg_d}_on_{d}"
        if null
        else root / "interim" / f"matches{sfx}" / f"{day:%Y-%m}" / d
    )
    if variant is not None and not null:  # sensitivity analysis: other tolerances, kept apart
        out_dir = root / "interim" / "matches_sens" / variant / f"{day:%Y-%m}" / d
    shift = pd.Timestamp(img_day) - pd.Timestamp(day)
    if force or _stale_matches(out_dir, p, rules):
        (out_dir / SUCCESS_MARKER).unlink(missing_ok=True)
    if is_done(out_dir):
        return {"day": seg_d, "status": "already done"}
    if not is_done(seg_dir):
        return {"day": seg_d, "status": "segments_met missing"}
    if not (is_done(met / "l15_crop" / d) and is_done(met / "clm" / d)):
        return {"day": d, "status": "Meteosat day missing"}
    stale = _stale_detections(root, d, p, track)
    det = detect_day(root, img_day, det_params, config_hash, force=stale, track=track)
    if det.get("status") not in ("done", "already done"):
        return {"day": d, "status": f"detection: {det.get('status')}"}
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        lock = UnitLock(out_dir)
        lock.acquire()
    except UnitLockedError:
        return {"day": d, "status": "locked by another run"}
    try:
        man = RunManifest.start(
            "match-day",
            unit=f"{seg_d}_on_{d}" if null else d,
            config_hash=config_hash,
            params={
                "operating_threshold": p.operating_threshold,
                "detector": p.model_dump(),
                "rules": rules.__dict__,
                "label_rule_version": mt.LABEL_RULE_VERSION,
                "age_window_min": [min_age_min, max_age_min],
                "candidates": "sac_formation (forms)",
                "null_image_day": d if null else None,
            },
        )
        seg = pd.read_parquet(seg_dir / "segments_met.parquet", columns=SEG_COLS)
        ok = seg["forms"].astype(bool) & np.isfinite(
            seg[["lat_start", "lon_start", "lat_end", "lon_end", "pressure_pa"]]
        ).all(axis=1)
        cand = seg[ok].reset_index(drop=True)
        for c in ("time_start", "time_end", "time_mid"):
            cand[c] = cand[c] + shift
        static = xr.open_zarr(met / "static_grid.zarr").load()
        vza = static["vza_deg"].values.astype(float)
        shape = (int(vza.shape[0]), int(vza.shape[1]))
        area = (str(static.attrs["area_proj4"]), list(static.attrs["area_extent"]), shape)
        clm = xr.open_zarr(met / "clm" / d / "data.zarr")["cloud_mask"]
        slots = [pd.Timestamp(t) for t in clm["time"].values]
        cloudy = {
            t: np.isin(np.asarray(clm.isel(time=i).values), (CLM_CLOUDY, *CLM_NODATA))
            for i, t in enumerate(slots)
        }
        objs = pd.read_parquet(detections_dir(root, track) / d / "objects.parquet")
        objs["image_time"] = pd.to_datetime(objs["image_time"])
        by_slot = {
            pd.Timestamp(t): SlotObjects(g, p.operating_threshold)
            for t, g in objs.groupby("image_time")
        }
        l15_times = {
            pd.Timestamp(t) for t in xr.open_zarr(met / "l15_crop" / d / "data.zarr")["time"].values
        }
        for t in slots:  # a slot with imagery but no object still has a (empty) detection result
            if t in l15_times and t not in by_slot:
                by_slot[t] = SlotObjects(objs.iloc[:0], p.operating_threshold)
        # only segments with at least one stored slot in their 20–120 min window
        tm = _epoch_s(cand["time_mid"])
        ss = np.sort(np.array([t.value / 1e9 for t in slots]))
        lo_i = np.searchsorted(ss, tm + min_age_min * 60 - 1e-6)
        hi_i = np.searchsorted(ss, tm + max_age_min * 60 + 1e-6, side="right")
        cand = cand[hi_i > lo_i].reset_index(drop=True)
        if max_segments is not None:
            cand = cand.iloc[:max_segments]
        t0 = pd.Timestamp(img_day)
        pl = phase2.era5_window(root, "pl", t0 - pd.Timedelta(hours=1), t0 + pd.Timedelta(hours=28))
        grid = MetGrid.from_dataset(pl[[*adv.WIND, "fraction_of_cloud_cover"]].load())
        parts = []
        for i in range(0, len(cand), CHUNK):
            parts.append(
                per_slot_rows(
                    cand.iloc[i : i + CHUNK],
                    grid,
                    slots,
                    by_slot,
                    cloudy,
                    vza,
                    area,
                    rules,
                    min_age_min,
                    max_age_min,
                )
            )
        per = (
            pd.concat([x for x in parts if len(x)], ignore_index=True)
            if any(len(x) for x in parts)
            else pd.DataFrame()
        )
        lab = label_table(cand, per, rules)
        lab = dtc.attach(
            lab, None if null else _detectability(root, day, static, min_age_min, max_age_min)
        )
        f1, f2 = out_dir / "per_slot.parquet", out_dir / "labels.parquet"
        per.to_parquet(f1, index=False)
        lab.to_parquet(f2, index=False)
        summary = {"segments_total": len(seg), **summarise(lab, per)}
        con_f = root / "interim" / "cocip" / "B1" / f"{day:%Y-%m}" / seg_d / "contrail.parquet"
        if not null and con_f.exists() and len(per):
            summary["advection_vs_cocip"] = dtc.advection_vs_cocip(per, pd.read_parquet(con_f))
        if "detectable" in lab and lab["detectable"].notna().any():
            summary["detectable_share_of_cocip_contrails"] = round(
                float(
                    lab.loc[lab["cocip_contrail"].astype(bool), "detectable"].astype(float).mean()
                ),
                3,
            )
        man.stats = summary
        man.add_outputs([f1, f2])
        mark_success(out_dir, man)
    finally:
        lock.release()
    return {"day": seg_d, **({"image_day": d} if null else {}), "status": "done", **summary}
