"""Could Meteosat have seen this contrail at all? (build prompt §5.5 step 7; open question 4).

What it does
------------
A satellite misses contrails that are too thin or too narrow. Driver et al. (2025, AMT 18,
1115–1134) show that detection needs an optical depth of about **0.05** (p. 1123) and a width
near the imager's pixel size (p. 1120). Pre-registered (``hypotheses.H1.
detection_efficiency_thresholds``, Q4 settled 17 Oct 2026, option A):

    detectable = CoCiP optical depth ≥ 0.05 AND CoCiP width ≥ 1 local Meteosat pixel

at **any** CoCiP time step with contrail age 20–120 min (the matching window). The local pixel
size is √(pixel area) from ``raw/meteosat/static_grid.zarr`` at the contrail's position.

This is a **separate uncertainty term** for the secondary, efficiency-adjusted H1 only. It is
**never folded into the labels**: a segment with y = 0 stays y = 0 whether or not CoCiP thinks
it was detectable. Segments CoCiP gives no contrail at all (no persistent contrail) get
``detectable = False`` with ``cocip_contrail = False``; days without a CoCiP run get NaN.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

Array = npt.NDArray[np.float64]
MIN_TAU = 0.05
MIN_WIDTH_PX = 1.0


def pixel_km_lookup(lat_grid: Array, lon_grid: Array, area_km2: Array) -> Any:
    """Nearest-pixel lookup (lat, lon) → local pixel size in km = √area."""
    from scipy.spatial import cKDTree

    ok = np.isfinite(lat_grid) & np.isfinite(lon_grid) & np.isfinite(area_km2)
    tree = cKDTree(np.column_stack([lat_grid[ok], lon_grid[ok]]))
    size = np.sqrt(area_km2[ok])

    def f(lat: npt.ArrayLike, lon: npt.ArrayLike) -> Array:
        la, lo = np.asarray(lat, float), np.asarray(lon, float)
        out = np.full(la.shape, np.nan)
        good = np.isfinite(la) & np.isfinite(lo)
        if good.any():
            d, i = tree.query(np.column_stack([la[good], lo[good]]), distance_upper_bound=0.1)
            hit = np.isfinite(d)
            v = np.full(good.sum(), np.nan)
            v[hit] = size[i[hit]]
            out[good] = v
        return out

    return f


def detectability(
    contrail: pd.DataFrame,
    pixel_km: Any,
    min_age_min: float = 20.0,
    max_age_min: float = 120.0,
    min_tau: float = MIN_TAU,
    min_width_px: float = MIN_WIDTH_PX,
) -> pd.DataFrame:
    """Per segment (flight_id + waypoint): detectable flag, best τ and width in the window.

    ``contrail``: CoCiP evolution table (columns flight_id, waypoint, age, latitude, longitude,
    width [m], tau_contrail)."""
    if contrail.empty:
        cols = ["segment_id", "cocip_contrail", "detectable", "tau_max", "width_px_max"]
        return pd.DataFrame(columns=cols)
    c = contrail.copy()
    age_min = pd.to_timedelta(c["age"]).dt.total_seconds() / 60.0
    wp = c["waypoint"].astype(int).map("{:04d}".format)
    c["segment_id"] = c["flight_id"].astype(str) + "_" + wp
    c["width_px"] = (c["width"].astype(float) / 1000.0) / pixel_km(c["latitude"], c["longitude"])
    win = (age_min >= min_age_min) & (age_min <= max_age_min)
    c["ok"] = win & (c["tau_contrail"].astype(float) >= min_tau) & (c["width_px"] >= min_width_px)
    w = c[win]
    out = pd.DataFrame({"segment_id": c["segment_id"].unique()})
    out["cocip_contrail"] = True
    agg = c.groupby("segment_id")["ok"].any().rename("detectable")
    tau = w.groupby("segment_id")["tau_contrail"].max().rename("tau_max")
    wid = w.groupby("segment_id")["width_px"].max().rename("width_px_max")
    for part in (agg, tau, wid):
        out = out.merge(part, on="segment_id", how="left")
    return out


def attach(labels: pd.DataFrame, det: pd.DataFrame | None) -> pd.DataFrame:
    """Add the detectability columns to a label table (NaN if CoCiP did not run that day)."""
    out = labels.copy()
    if det is None:
        out["cocip_contrail"] = np.nan
        out["detectable"] = np.nan
        return out
    out = out.merge(det, on="segment_id", how="left")
    out["cocip_contrail"] = out["cocip_contrail"].astype("boolean").fillna(False)
    out["detectable"] = out["detectable"].astype("boolean").fillna(False)
    return out


def advection_vs_cocip(
    per: pd.DataFrame, contrail: pd.DataFrame, tol_min: float = 3.0
) -> dict[str, Any]:
    """Distance (km) between our ERA5-wind position and CoCiP's at the same time and segment.

    Build prompt §5.5 step 2: our advection is primary (pre-registered); CoCiP's evolution
    table is the comparison. Rows are paired when CoCiP has a time step within ``tol_min`` of
    the image time."""
    if per.empty or contrail.empty:
        return {"pairs": 0}
    c = contrail[["flight_id", "waypoint", "time", "latitude", "longitude"]].copy()
    c["segment_id"] = (
        c["flight_id"].astype(str) + "_" + c["waypoint"].astype(int).map("{:04d}".format)
    )
    c["time"] = (
        pd.to_datetime(c["time"]).dt.tz_localize(None)
        if pd.to_datetime(c["time"]).dt.tz is not None
        else pd.to_datetime(c["time"])
    )
    a = per[["segment_id", "image_time", "lat_adv", "lon_adv"]].copy()
    a["image_time"] = pd.to_datetime(a["image_time"])
    m = pd.merge_asof(
        a.sort_values("image_time"),
        c.sort_values("time"),
        left_on="image_time",
        right_on="time",
        by="segment_id",
        tolerance=pd.Timedelta(minutes=tol_min),
        direction="nearest",
    ).dropna(subset=["latitude"])
    if m.empty:
        return {"pairs": 0}
    p1, p2 = np.radians(m["lat_adv"].to_numpy(float)), np.radians(m["latitude"].to_numpy(float))
    dl = np.radians(m["longitude"].to_numpy(float) - m["lon_adv"].to_numpy(float))
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    km = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))
    return {
        "pairs": len(m),
        "median_km": round(float(np.median(km)), 2),
        "p90_km": round(float(np.percentile(km, 90)), 2),
        "share_within_3km": round(float((km <= 3).mean()), 3),
    }
