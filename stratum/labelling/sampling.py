"""Choose the satellite scenes the team labels by hand (paper §4.4; build prompt §5.1).

What it does
------------
The detector is checked against **200 hand-labelled Meteosat-9 scenes of 256 × 256 pixels**,
plus a separate **20-scene pilot** used only to improve the labelling guide. If we let people
pick scenes, they would pick clear, easy ones and the detector would look better than it is.
So scenes are drawn **at random, stratified** so every kind of situation is represented
(paper §4.4: "across months, times of day and predicted contrail density"):

* **month**: the 12 flight days, one per month (1st of the month, Mar 2025 – Feb 2026);
* **time of day** in local solar time at the scene centre: night (20–05 h), dawn (05–08 h),
  day (08–17 h), dusk (17–20 h). Contrail visibility in the infrared changes with the
  surface temperature, so all four must be present;
* **predicted contrail density**: how many B1 persistent-contrail segments (Schmidt–Appleman
  forms AND RHi ≥ 1 in raw ERA5, Phase 2) were flown inside the scene 20–120 min before
  the image. This is the age window used for matching (§4.5), so "dense" scenes are where
  physics expects visible contrails. Density is split into three classes (terciles). Most
  scenes have zero, so when the lower third is all zeros the classes are *zero*, *below the
  median of the non-zero scenes* and *above it* (recorded in the manifest).

Candidate scenes are 256 × 256-px windows of the stored crop on a 128-px grid (so windows can
overlap by half) at every 15-minute slot that has both neighbours (labellers flip between
t − 15, t and t + 15 min to see motion) and at least 120 min after 00 UTC of the flight day
(flight data start at 00 UTC, so the density of earlier slots would be unknown, not zero).
A window is a candidate if its centre lies in the study domain (6–37°N, 68–98°E) and < 5 % of
it is "no data" in the cloud mask.

Allocation: 12 × 4 × 3 = 144 strata. Every non-empty stratum gets one scene; the remaining
scenes go to strata chosen at random. Within a stratum scenes are drawn at random, never two
that overlap in space within 60 min on the same day (they would be near-duplicates). The 200
are then split **100 tuning / 100 held-out**, alternating through the list sorted by stratum,
so both halves cover the same strata. The pilot's 20 scenes are drawn afterwards from what is
left, two per month where possible. Everything uses the pre-registered seed (Q16 = 20261017);
re-drawing to get a "nicer" set would be leakage.

For each scene we also record the viewing zenith angle (mean, max), the ERA5 high-cloud
fraction, the cloud-mask cloudy fraction and whether it is west or east of 80°E, because
detection is harder at steep angles and the correction model is tested east of 80°E.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

SCENE_PX = 256
STRIDE_PX = 128
TOD_BINS = ("night", "dawn", "day", "dusk")
CLM_CLOUDY = 2
CLM_NODATA = (3, 255)
MAX_NODATA_FRACTION = 0.05
OVERLAP_MINUTES = 60.0


def local_solar_hour(t_utc: pd.Timestamp | pd.Series, lon: npt.ArrayLike) -> Any:
    """Mean local solar time (h): UTC + longitude / 15° per hour."""
    t = pd.to_datetime(t_utc)
    h = t.dt.hour + t.dt.minute / 60.0 if isinstance(t, pd.Series) else t.hour + t.minute / 60.0
    return (np.asarray(h, float) + np.asarray(lon, float) / 15.0) % 24.0


def tod_bin(lst_h: npt.ArrayLike) -> npt.NDArray[np.str_]:
    """Local solar hour → night (20–05), dawn (05–08), day (08–17), dusk (17–20)."""
    h = np.asarray(lst_h, float)
    out = np.full(h.shape, "night", dtype="<U5")
    out[(h >= 5) & (h < 8)] = "dawn"
    out[(h >= 8) & (h < 17)] = "day"
    out[(h >= 17) & (h < 20)] = "dusk"
    return out


def tile_origins(
    shape: tuple[int, int], size: int = SCENE_PX, stride: int = STRIDE_PX
) -> list[tuple[int, int]]:
    """Top-left (row, col) of every size × size window on a stride grid inside ``shape``."""
    ny, nx = shape
    return [
        (r, c) for r in range(0, ny - size + 1, stride) for c in range(0, nx - size + 1, stride)
    ]


def tile_table(
    lat: npt.NDArray[np.floating[Any]],
    lon: npt.NDArray[np.floating[Any]],
    vza: npt.NDArray[np.floating[Any]],
    study_lat: tuple[float, float],
    study_lon: tuple[float, float],
    size: int = SCENE_PX,
    stride: int = STRIDE_PX,
) -> pd.DataFrame:
    """One row per candidate window whose centre is inside the study domain."""
    rows = []
    for k, (r0, c0) in enumerate(tile_origins(lat.shape, size, stride)):
        la, lo, vz = (a[r0 : r0 + size, c0 : c0 + size] for a in (lat, lon, vza))
        lat_c, lon_c = (
            float(lat[r0 + size // 2, c0 + size // 2]),
            float(lon[r0 + size // 2, c0 + size // 2]),
        )
        if not (np.isfinite(lat_c) and np.isfinite(lon_c)):
            continue
        if not (study_lat[0] <= lat_c <= study_lat[1] and study_lon[0] <= lon_c <= study_lon[1]):
            continue
        rows.append(
            {
                "tile": k,
                "r0": r0,
                "c0": c0,
                "lat_c": lat_c,
                "lon_c": lon_c,
                "lat_min": float(np.nanmin(la)),
                "lat_max": float(np.nanmax(la)),
                "lon_min": float(np.nanmin(lo)),
                "lon_max": float(np.nanmax(lo)),
                "vza_mean": float(np.nanmean(vz)),
                "vza_max": float(np.nanmax(vz)),
                "west_of_80e": bool(lon_c < 80.0),
            }
        )
    return pd.DataFrame(rows)


def block_sums(mask: npt.NDArray[Any], block: int = STRIDE_PX) -> npt.NDArray[np.int64]:
    """Sum (count True pixels) in each block × block block (incomplete edge blocks dropped)."""
    ny, nx = mask.shape[0] // block, mask.shape[1] // block
    m = mask[: ny * block, : nx * block].astype(np.int64)
    out: npt.NDArray[np.int64] = m.reshape(ny, block, nx, block).sum(axis=(1, 3))
    return out


def tile_values_from_blocks(
    blocks: npt.NDArray[Any], tiles: pd.DataFrame, per: int = SCENE_PX // STRIDE_PX
) -> npt.NDArray[Any]:
    """Sum the per × per blocks that make up each tile (tiles start on block boundaries)."""
    bi = (tiles["r0"].to_numpy() // STRIDE_PX).astype(int)
    bj = (tiles["c0"].to_numpy() // STRIDE_PX).astype(int)
    out = np.zeros(len(tiles), dtype=blocks.dtype)
    for di in range(per):
        for dj in range(per):
            out = out + blocks[bi + di, bj + dj]
    return out


def density_for_slot(
    seg_row: npt.NDArray[np.floating[Any]],
    seg_col: npt.NDArray[np.floating[Any]],
    seg_tmin: npt.NDArray[np.floating[Any]],
    slot_tmin: float,
    tiles: pd.DataFrame,
    shape: tuple[int, int],
    min_age_min: float = 20.0,
    max_age_min: float = 120.0,
) -> npt.NDArray[np.int64]:
    """Persistent segments flown 20–120 min before ``slot_tmin`` (minutes) inside each tile.

    ``seg_row/col`` are the parallax-corrected pixel positions of the segment midpoints."""
    age = slot_tmin - seg_tmin
    sel = (age >= min_age_min) & (age <= max_age_min)
    r = np.floor(seg_row[sel] + 0.5).astype(int)
    c = np.floor(seg_col[sel] + 0.5).astype(int)
    ok = (r >= 0) & (c >= 0) & (r < shape[0]) & (c < shape[1])
    counts = np.zeros(shape, dtype=np.int64)
    np.add.at(counts, (r[ok], c[ok]), 1)
    return tile_values_from_blocks(block_sums(counts), tiles)


def density_classes(d: npt.ArrayLike) -> tuple[npt.NDArray[np.int64], dict[str, Any]]:
    """Terciles of density → 0 (low), 1 (mid), 2 (high), with a zero-heavy fallback."""
    x = np.asarray(d, float)
    q1, q2 = (float(v) for v in np.quantile(x, [1 / 3, 2 / 3]))
    if q1 < q2:
        cls = np.where(x <= q1, 0, np.where(x <= q2, 1, 2))
        return cls.astype(np.int64), {"method": "terciles", "q1": q1, "q2": q2}
    pos = x[x > 0]
    med = float(np.median(pos)) if len(pos) else 0.0
    cls = np.where(x <= 0, 0, np.where(x <= med, 1, 2))
    return cls.astype(np.int64), {
        "method": "zero / positive below median / positive above median (lower third all zeros)",
        "q1": q1,
        "q2": q2,
        "positive_median": med,
        "share_zero": float(np.mean(x <= 0)),
    }


def allocate(available: dict[Any, int], n: int, rng: np.random.Generator) -> dict[Any, int]:
    """One scene per non-empty stratum, the rest to random strata (never above what exists)."""
    keys = [k for k, v in available.items() if v > 0]
    if sum(available[k] for k in keys) < n:
        raise ValueError(f"only {sum(available[k] for k in keys)} candidates for {n} scenes")
    quota = dict.fromkeys(keys, 0)
    order = list(keys)
    rng.shuffle(order)
    left = n
    for k in order:  # one each (random order, in case there are more strata than scenes)
        if left == 0:
            break
        quota[k] += 1
        left -= 1
    while left > 0:
        open_keys = [k for k in keys if quota[k] < available[k]]
        k = open_keys[int(rng.integers(len(open_keys)))]
        quota[k] += 1
        left -= 1
    return quota


@dataclass
class _Picked:
    day: str
    tmin: float
    r0: int
    c0: int


def _conflicts(p: _Picked, chosen: list[_Picked], size: int) -> bool:
    for q in chosen:
        if (
            q.day == p.day
            and abs(q.tmin - p.tmin) <= OVERLAP_MINUTES
            and abs(q.r0 - p.r0) < size
            and abs(q.c0 - p.c0) < size
        ):
            return True
    return False


STRATA = ["month", "tod_bin", "density_class"]


def sample_scenes(
    cands: pd.DataFrame,
    n_main: int,
    n_pilot: int,
    seed: int,
    size: int = SCENE_PX,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Stratified random draw of the main set and the pilot set, then the 100/100 split.

    ``cands`` needs: day, time (UTC), tmin (minutes since the day's 00 UTC), r0, c0, month,
    tod_bin, density, density_class (+ any metadata, which is carried through)."""
    rng = np.random.default_rng(seed)
    cands = cands.reset_index(drop=True)
    groups = {k: g.index.to_numpy() for k, g in cands.groupby(STRATA)}
    quota = allocate({k: len(v) for k, v in groups.items()}, n_main, rng)
    chosen: list[_Picked] = []
    picked_idx: list[int] = []
    short: dict[Any, int] = {}
    for k in sorted(quota, key=str):
        idx = np.array(groups[k], copy=True)
        rng.shuffle(idx)
        need = quota[k]
        for i in idx:
            if need == 0:
                break
            r = cands.loc[i]
            p = _Picked(str(r["day"]), float(r["tmin"]), int(r["r0"]), int(r["c0"]))
            if _conflicts(p, chosen, size):
                continue
            chosen.append(p)
            picked_idx.append(int(i))
            need -= 1
        if need:
            short[k] = need
    if short:  # strata that ran out (overlaps): fill from anywhere, at random
        rest = np.array(np.setdiff1d(cands.index.to_numpy(), picked_idx), copy=True)
        rng.shuffle(rest)
        need = sum(short.values())
        for i in rest:
            if need == 0:
                break
            r = cands.loc[i]
            p = _Picked(str(r["day"]), float(r["tmin"]), int(r["r0"]), int(r["c0"]))
            if not _conflicts(p, chosen, size):
                chosen.append(p)
                picked_idx.append(int(i))
                need -= 1
    main = cands.loc[picked_idx].copy()
    main["role"] = "main"
    # 100/100 split: alternate through the list sorted by stratum (random order within)
    main["_r"] = rng.random(len(main))
    main = main.sort_values([*STRATA, "_r"]).drop(columns="_r")
    first = int(rng.integers(2))
    main["split"] = np.where((np.arange(len(main)) + first) % 2 == 0, "tuning", "heldout")
    # pilot: from what is left, spread over months
    rest_idx = np.setdiff1d(cands.index.to_numpy(), picked_idx)
    rest = cands.loc[rest_idx]
    pilot_idx: list[int] = []
    months = sorted(rest["month"].unique())
    per_month = {m: n_pilot // len(months) for m in months}
    for m in rng.permutation(months)[: n_pilot - sum(per_month.values())]:
        per_month[m] += 1
    for m in months:
        idx = np.array(rest.index[rest["month"] == m].to_numpy(), copy=True)
        rng.shuffle(idx)
        need = per_month[m]
        for i in idx:
            if need == 0:
                break
            r = cands.loc[i]
            p = _Picked(str(r["day"]), float(r["tmin"]), int(r["r0"]), int(r["c0"]))
            if _conflicts(p, chosen, size):
                continue
            chosen.append(p)
            pilot_idx.append(int(i))
            need -= 1
    pilot = cands.loc[pilot_idx].copy()
    pilot["role"] = "pilot"
    pilot["split"] = "pilot"
    out = pd.concat([main, pilot], ignore_index=True)
    # scene ids carry no information about stratum or split (labellers see them)
    ids = rng.permutation(len(out)) + 1
    out.insert(0, "scene_id", [f"S{i:03d}" for i in ids])
    info = {
        "seed": seed,
        "n_candidates": len(cands),
        "n_strata_nonempty": len(groups),
        "strata_short_filled_elsewhere": int(sum(short.values())),
        "n_main": int((out["role"] == "main").sum()),
        "n_pilot": int((out["role"] == "pilot").sum()),
        "split_counts": out.loc[out["role"] == "main", "split"].value_counts().to_dict(),
    }
    return out.sort_values("scene_id").reset_index(drop=True), info


# ── Building the candidate table from the stored data (runs on Colab) ──────────


def candidates_for_day(
    day_str: str,
    clm: Any,
    segments: pd.DataFrame,
    high_cloud: Any,
    tiles: pd.DataFrame,
    area_proj4: str,
    area_extent: list[float],
    min_age_min: float = 20.0,
    max_age_min: float = 120.0,
) -> pd.DataFrame:
    """All candidate scenes (slot × tile) of one day with density and cloud metadata.

    ``clm``: cloud-mask DataArray (time, y, x); ``segments``: that day's segments_met;
    ``high_cloud``: DataArray (time, latitude, longitude) of the max ERA5 cloud fraction at
    or above 400 hPa."""
    from stratum.match.geometry import point_to_pixel

    shape = (int(clm.sizes["y"]), int(clm.sizes["x"]))
    day0 = pd.Timestamp(day_str)
    times = pd.to_datetime(clm["time"].values)
    have = set(times)
    step = pd.Timedelta(minutes=15)
    per = segments[segments["persists_raw"].astype(bool)]
    if len(per):
        alt_m = per["alt_ft_mid"].to_numpy(float) * 0.3048
        row, col = point_to_pixel(
            per["lat_mid"].to_numpy(float),
            per["lon_mid"].to_numpy(float),
            alt_m,
            area_proj4,
            area_extent,
            shape,
        )
        tmid = pd.to_datetime(per["time_mid"], utc=True).dt.tz_convert(None)
        seg_tmin = ((tmid - day0) / pd.Timedelta(minutes=1)).to_numpy(float)
    else:
        row = col = seg_tmin = np.zeros(0)
    rows = []
    for k, t in enumerate(times):
        if (t - step) not in have or (t + step) not in have:
            continue
        # the density window needs flights from t − 120 min; flight data start at 00 UTC of the
        # day, so earlier slots would look empty when they are really unknown
        if (t - day0) < pd.Timedelta(minutes=max_age_min):
            continue
        cm = np.asarray(clm.isel(time=k).values)
        n_px = SCENE_PX * SCENE_PX
        cloudy = tile_values_from_blocks(block_sums(cm == CLM_CLOUDY), tiles) / n_px
        nodata = tile_values_from_blocks(block_sums(np.isin(cm, CLM_NODATA)), tiles) / n_px
        tmin = float((t - day0) / pd.Timedelta(minutes=1))
        dens = density_for_slot(row, col, seg_tmin, tmin, tiles, shape, min_age_min, max_age_min)
        hc = high_cloud.sel(time=t, method="nearest")
        hc_vals = []
        for _, tl in tiles.iterrows():
            box = hc.sel(
                latitude=slice(tl["lat_max"], tl["lat_min"])
                if hc["latitude"][0] > hc["latitude"][-1]
                else slice(tl["lat_min"], tl["lat_max"]),
                longitude=slice(tl["lon_min"], tl["lon_max"]),
            )
            hc_vals.append(float(box.mean()) if box.size else np.nan)
        lst = local_solar_hour(t, tiles["lon_c"].to_numpy())
        rows.append(
            tiles.assign(
                day=day_str,
                time=t,
                tmin=tmin,
                month=day_str[:7],
                lst_h=lst,
                tod_bin=tod_bin(lst),
                density=dens,
                clm_cloudy_frac=cloudy,
                clm_nodata_frac=nodata,
                era5_high_cloud_frac=hc_vals,
            )
        )
    if not rows:
        return pd.DataFrame()
    out = pd.concat(rows, ignore_index=True)
    return out[out["clm_nodata_frac"] < MAX_NODATA_FRACTION].reset_index(drop=True)
