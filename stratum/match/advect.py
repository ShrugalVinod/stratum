"""Carry a young contrail with the wind (paper §4.5; build prompt §5.5, step 2).

What it does
------------
A contrail drifts with the wind at the altitude it formed. To check a predicted contrail
against a satellite image taken 20–120 min later, we must know **where it has drifted to**.
For every flight segment we move both of its end points with the ERA5 wind at the segment's
pressure level (pre-registered: ``matching.advection_winds: era5_at_segment_pressure_level``):

* winds are interpolated with the same rules as all STRATUM met features (linear in time,
  bilinear in space, linear in log-pressure; ``stratum/met/interp.py``);
* the position is integrated with **RK2 (midpoint) steps of 5 minutes**:
  x_mid = x + ½·Δt·v(t, x);  x_next = x + Δt·v(t + ½Δt, x_mid).
  The midpoint rule is exact for winds that vary linearly in time and space, and its error over
  2 h at typical jet-stream curvature is far below one 3-km pixel;
* positions at the satellite slot times in between are interpolated linearly within a step.

On the sphere: Δlat = v·Δt / R, Δlon = u·Δt / (R·cos lat), with R = 6,371 km. The vertical
motion is ignored (contrails stay near their formation level over 2 h; CoCiP's sinking of a few
hundred metres moves the satellite position by less than a pixel). Where the wind is missing
(outside the ERA5 box) the position becomes NaN and the segment is later treated as
unobservable at that time, never as "no contrail".
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from stratum.met.interp import MetGrid, interp_points

Array = npt.NDArray[np.float64]
R_EARTH_M = 6_371_000.0
STEP_S = 300.0
WIND = ["eastward_wind", "northward_wind"]


def _velocity(
    grid: MetGrid, t_s: Array, lat: Array, lon: Array, p_pa: Array
) -> tuple[Array, Array]:
    """(dlat/dt, dlon/dt) in degrees per second."""
    vals, _ = interp_points(grid, WIND, t_s, lat, lon, p_pa)
    u, v = vals["eastward_wind"], vals["northward_wind"]
    dlat = np.degrees(v / R_EARTH_M)
    dlon = np.degrees(u / (R_EARTH_M * np.cos(np.radians(lat))))
    return dlat, dlon


def advect(
    grid: MetGrid,
    lat0: npt.ArrayLike,
    lon0: npt.ArrayLike,
    p_pa: npt.ArrayLike,
    t0_s: npt.ArrayLike,
    max_age_s: float,
    step_s: float = STEP_S,
) -> tuple[Array, Array, Array]:
    """Trajectories of n points: (ages_s[K+1], lat[n, K+1], lon[n, K+1]), RK2 with fixed steps."""
    lat = np.asarray(lat0, float).copy()
    lon = np.asarray(lon0, float).copy()
    p = np.asarray(p_pa, float)
    t = np.asarray(t0_s, float).copy()
    k = int(np.ceil(max_age_s / step_s))
    ages: Array = np.arange(k + 1, dtype=float) * step_s
    out_lat: Array = np.full((lat.size, k + 1), np.nan)
    out_lon: Array = np.full((lat.size, k + 1), np.nan)
    out_lat[:, 0], out_lon[:, 0] = lat, lon
    for i in range(k):
        d1a, d1o = _velocity(grid, t, lat, lon, p)
        mid_lat = lat + 0.5 * step_s * d1a
        mid_lon = lon + 0.5 * step_s * d1o
        d2a, d2o = _velocity(grid, t + 0.5 * step_s, mid_lat, mid_lon, p)
        lat = lat + step_s * d2a
        lon = lon + step_s * d2o
        t = t + step_s
        out_lat[:, i + 1], out_lon[:, i + 1] = lat, lon
    return ages, out_lat, out_lon


def positions_at(
    ages_s: Array, lat: Array, lon: Array, want_age_s: npt.ArrayLike
) -> tuple[Array, Array]:
    """Linear interpolation of each trajectory to the requested ages (per point, same shape).

    ``want_age_s`` has shape (n, m) (or (m,) for every point); ages outside the trajectory → NaN."""
    w = np.asarray(want_age_s, float)
    if w.ndim == 1:
        w = np.broadcast_to(w, (lat.shape[0], w.size))
    step = ages_s[1] - ages_s[0]
    j = np.clip(np.floor(w / step).astype(int), 0, len(ages_s) - 2)
    f = w / step - j
    rows = np.arange(lat.shape[0])[:, None]
    la = lat[rows, j] * (1 - f) + lat[rows, j + 1] * f
    lo = lon[rows, j] * (1 - f) + lon[rows, j + 1] * f
    bad = (w < 0) | (w > ages_s[-1]) | ~np.isfinite(w)
    return np.where(bad, np.nan, la), np.where(bad, np.nan, lo)


def slot_ages(
    t0_s: npt.ArrayLike, min_age_s: float, max_age_s: float, slot_s: float = 900.0
) -> Array:
    """Ages of every satellite slot in [t0 + min_age, t0 + max_age] (rows; NaN-padded)."""
    t0 = np.asarray(t0_s, float)
    first = np.ceil((t0 + min_age_s) / slot_s) * slot_s
    m = int(np.floor((max_age_s - min_age_s) / slot_s)) + 1
    times = first[:, None] + np.arange(m)[None, :] * slot_s
    ages = times - t0[:, None]
    return np.where(ages <= max_age_s + 1e-9, ages, np.nan)
