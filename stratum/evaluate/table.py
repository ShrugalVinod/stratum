"""The evaluation table: one row per labelled segment, every model's prediction (build prompt §6.1).

Rows: every SAC-forming candidate segment whose label is known under the primary rule (D-004:
y = 1 needs ≥ 2 matched observable images) **or** under the original 1-image rule, so the rule
can be varied as a sensitivity analysis. Columns:

* keys: segment_id, flight_id, day, image_time_first (+ a separate (segment, image) table for
  the leakage groups);
* labels: ``y`` (primary, D-004), ``y_k1`` (any 1 image, the original pre-registered rule),
  ``y_k3`` (≥ 3 images);
* strata: season (pre-registered folds), month, west_of_80e, vza_band, day_night, fl_band;
* predictions in [0, 1]: B0 (climatology of the fold's training months), B0_all (all 12
  months, for the spatial split), B1, B2, B3, and — where the Phase 6 domain CoCiP run exists —
  B1_cocip (CoCiP B1 "persistent contrail formed") plus the Driver detectability flag.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.baselines import climatology as clim
from stratum.baselines import physics as ph
from stratum.evaluate.splits import SEASONS, season_of
from stratum.manifest import is_done

SEG_FEATURES = [
    "segment_id", "temperature_k", "specific_humidity", "rhi", "pressure_pa", "engine_efficiency",
    "alt_ft_mid", "lat_mid", "lon_mid", "persists_raw", "commercial", "in_corridor",
]  # fmt: skip
LAB_COLS = ["segment_id", "flight_id", "time_mid", "y", "n_observable", "n_matched_observable", "night_fraction", "image_time_first"]  # fmt: skip  # noqa: E501
FL_BANDS = [0, 300, 340, 380, 1000]
FL_NAMES = ["<FL300", "FL300-339", "FL340-379", ">=FL380"]
VZA_BANDS = [0, 30, 45, 60, 90]


def _rule(n_mo: np.ndarray, n_obs: np.ndarray, k: int) -> np.ndarray:
    return np.where(n_mo >= k, 1.0, np.where((n_mo == 0) & (n_obs >= 2), 0.0, np.nan))


AGE_WINDOWS = {"y_age_20_90": (20.0, 90.0), "y_age_40_120": (40.0, 120.0)}


def age_window_labels(per: pd.DataFrame, k: int = 2) -> pd.DataFrame:
    """Primary-rule labels (≥ k matched observable images) using only images whose contrail
    age lies in a narrower window (sensitivity analysis of the pre-registered 20–120 min)."""
    out = pd.DataFrame({"segment_id": per["segment_id"].unique()})
    for name, (lo, hi) in AGE_WINDOWS.items():
        w = per[(per["age_min"] >= lo) & (per["age_min"] <= hi)]
        g = w.assign(om=w["observable"] & w["matched"]).groupby("segment_id")
        n_obs = g["observable"].sum().reindex(out["segment_id"]).fillna(0).to_numpy()
        n_mo = g["om"].sum().reindex(out["segment_id"]).fillna(0).to_numpy()
        out[name] = _rule(n_mo, n_obs, k)
    return out


def day_rows(root: Path, day_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Labelled rows of one matched day + its (segment, image) pairs."""
    day = day_dir.name
    lab = pd.read_parquet(day_dir / "labels.parquet", columns=LAB_COLS)
    n_mo = lab["n_matched_observable"].to_numpy()
    n_obs = lab["n_observable"].to_numpy()
    lab["y_k1"] = _rule(n_mo, n_obs, 1)
    lab["y_k3"] = _rule(n_mo, n_obs, 3)
    lab = lab[lab["y"].notna() | lab["y_k1"].notna()].copy()
    per = pd.read_parquet(
        day_dir / "per_slot.parquet",
        columns=["segment_id", "image_time", "vza_deg", "age_min", "observable", "matched"],
    )
    per = per[per["segment_id"].isin(lab["segment_id"])]
    vza = per.groupby("segment_id")["vza_deg"].median().rename("vza_median")
    lab = lab.merge(age_window_labels(per), on="segment_id", how="left")
    seg_dir = root / "interim" / "segments_met" / day[:7] / day
    seg = pd.read_parquet(seg_dir / "segments_met.parquet", columns=SEG_FEATURES)
    t = lab.merge(seg, on="segment_id", how="left").merge(vza, on="segment_id", how="left")
    for vdir in sorted((root / "interim" / "matches_sens").glob(f"*/{day[:7]}/{day}")):
        if is_done(vdir):
            name = vdir.parent.parent.name
            v = pd.read_parquet(vdir / "labels.parquet", columns=["segment_id", "y"])
            t = t.merge(v.rename(columns={"y": f"y_tol_{name}"}), on="segment_id", how="left")
    t["day"] = day
    return t, per[["segment_id", "image_time"]]


def add_strata(t: pd.DataFrame, folds: dict[str, list[int]] | None = None) -> pd.DataFrame:
    t = t.copy()
    m = pd.to_datetime(t["day"]).dt.month
    t["month"] = pd.to_datetime(t["day"]).dt.strftime("%Y-%m")
    t["season"] = season_of(m.to_numpy(), folds)
    t["west_of_80e"] = t["lon_mid"].to_numpy(float) < 80.0
    t["vza_band"] = pd.cut(t["vza_median"], VZA_BANDS, right=False).astype(str)
    t["day_night"] = np.where(t["night_fraction"] > 0.5, "night", "day")
    t["fl_band"] = pd.cut(t["alt_ft_mid"] / 100.0, FL_BANDS, right=False, labels=FL_NAMES).astype(
        str
    )
    return t


def add_physics(t: pd.DataFrame) -> pd.DataFrame:
    t = t.copy()
    t["B1"] = ph.b1(t)
    t["B2"] = ph.b2(t)
    t["B3"] = ph.b3(t)
    return t


def add_b0(root: Path, t: pd.DataFrame, folds: dict[str, list[int]] | None = None) -> pd.DataFrame:
    """B0 per seasonal fold (training months only) and B0_all (all evaluation months)."""
    t = t.copy()
    f = folds or SEASONS
    months = sorted(t["month"].unique())
    have = [m for m in months if (clim.climatology_dir(root) / f"{m}.nc").exists()]
    t["B0"] = np.nan
    t["B0_all"] = np.nan
    if not have:
        return t
    lat, lon, p = (t[c].to_numpy(float) for c in ("lat_mid", "lon_mid", "pressure_pa"))
    t["B0_all"] = clim.predict(clim.load_mean(root, have), lat, lon, p)
    for season, ms in f.items():
        test = t["season"].to_numpy() == season
        train_months = [m for m in have if int(m[5:7]) not in ms]
        if test.any() and train_months:
            c = clim.load_mean(root, train_months)
            t.loc[test, "B0"] = clim.predict(c, lat[test], lon[test], p[test])
    return t


def add_cocip(root: Path, t: pd.DataFrame, min_age_min: float, max_age_min: float) -> pd.DataFrame:
    """CoCiP B1 variant + Driver detectability from the Phase 6 domain run (where it exists)."""
    import xarray as xr

    from stratum.match import detectability as dtc

    t = t.copy()
    t["B1_cocip"] = np.nan
    t["cocip_contrail"] = np.nan
    t["detectable"] = np.nan
    runs = {
        day: root / "interim" / "cocip_domain" / "B1" / day[:7] / day
        for day in sorted(t["day"].unique())
    }
    runs = {k: v for k, v in runs.items() if is_done(v)}
    if not runs:
        return t
    static = xr.open_zarr(root / "raw" / "meteosat" / "static_grid.zarr")
    px = dtc.pixel_km_lookup(
        *(static[v].values.astype(float) for v in ("lat", "lon", "pixel_area_km2"))
    )
    for day, d in runs.items():
        rows = t["day"].to_numpy() == day
        seg = pd.read_parquet(d / "segments.parquet", columns=["segment_id", "persistent_1"])
        pers = t.loc[rows, ["segment_id"]].merge(seg, on="segment_id", how="left")["persistent_1"]
        t.loc[rows, "B1_cocip"] = (pers.fillna(0).to_numpy(float) > 0).astype(float)
        det = dtc.detectability(
            pd.read_parquet(d / "contrail.parquet"), px, min_age_min, max_age_min
        )
        lab = dtc.attach(t.loc[rows, ["segment_id"]], det)
        t.loc[rows, "cocip_contrail"] = lab["cocip_contrail"].astype(float).to_numpy()
        t.loc[rows, "detectable"] = lab["detectable"].astype(float).to_numpy()
    return t


def build(
    root: Path, min_age_min: float = 20.0, max_age_min: float = 120.0
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    days = [d for d in sorted((root / "interim" / "matches").glob("*/*")) if is_done(d)]
    parts, imgs = [], []
    for d in days:
        t, im = day_rows(root, d)
        parts.append(t)
        imgs.append(im)
    t = pd.concat(parts, ignore_index=True)
    images = pd.concat(imgs, ignore_index=True)
    t = add_cocip(root, add_b0(root, add_physics(add_strata(t))), min_age_min, max_age_min)
    info = {
        "days": [d.name for d in days],
        "rows": len(t),
        "rows_primary": int(t["y"].notna().sum()),
        "y1_primary": int((t["y"] == 1).sum()),
        "b0_months": int(t["B0"].notna().any()),
        "cocip_days": int(t.groupby("day")["B1_cocip"].apply(lambda s: s.notna().any()).sum()),
    }
    return t, images, info
