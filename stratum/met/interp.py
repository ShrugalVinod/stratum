"""ERA5 → arbitrary points (build prompt §4.5; preregistered.yaml ``met_interpolation``).

What it does
------------
Interpolates gridded ERA5 fields to flight-segment points:

* **time**: linear between the two hourly fields around the point;
* **horizontal**: bilinear in latitude/longitude on the 0.25° grid;
* **vertical**: linear in **log-pressure** between the two pressure levels around the point.

Points outside the grid (in time, space or pressure) get NaN and are counted, never
extrapolated. ``at_level`` does the same without the vertical step, on one native level, so a
segment can also be described by the ERA5 levels immediately above and below it.

Why not pycontrails' interpolation? Its ``MetDataset`` interpolates linearly in pressure; the
pre-registered rule is log-pressure. CoCiP itself still uses pycontrails' internal
interpolation (documented in docs/decisions.md); all STRATUM features and SAC flags use this.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
import xarray as xr


@dataclass
class MetGrid:
    """ERA5 fields loaded into memory as (time, level, lat, lon) float64 arrays."""

    times_s: np.ndarray  # epoch seconds, increasing
    levels_pa: np.ndarray  # increasing pressure (top → bottom)
    lat: np.ndarray  # increasing
    lon: np.ndarray  # increasing
    fields: dict[str, np.ndarray]
    out_of_domain: dict[str, int] = field(default_factory=dict)

    @classmethod
    def from_dataset(cls, ds: xr.Dataset, variables: list[str] | None = None) -> MetGrid:
        names = variables or [str(v) for v in ds.data_vars]
        ds = ds.sortby(["time", "level", "latitude", "longitude"])
        fields = {
            n: np.asarray(ds[n].transpose("time", "level", "latitude", "longitude").values, float)
            for n in names
        }
        return cls(
            times_s=ds["time"].values.astype("datetime64[s]").astype("int64"),
            levels_pa=ds["level"].values.astype(float) * 100.0,
            lat=ds["latitude"].values.astype(float),
            lon=ds["longitude"].values.astype(float),
            fields=fields,
        )


def _bracket(axis: np.ndarray, x: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Lower index, weight of the upper neighbour, and in-range mask for sorted ``axis``."""
    i = np.clip(np.searchsorted(axis, x, side="right") - 1, 0, len(axis) - 2)
    a0, a1 = axis[i], axis[i + 1]
    w = (x - a0) / (a1 - a0)
    ok = (x >= axis[0]) & (x <= axis[-1]) & np.isfinite(x)
    return i, np.clip(w, 0.0, 1.0), ok


def _time_space(
    grid: MetGrid, t_s: np.ndarray, lat: np.ndarray, lon: np.ndarray
) -> tuple[list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]], np.ndarray]:
    it, wt, okt = _bracket(grid.times_s.astype(float), t_s)
    ia, wa, oka = _bracket(grid.lat, lat)
    io, wo, oko = _bracket(grid.lon, lon)
    corners = []
    for dt, ft in ((0, 1 - wt), (1, wt)):
        for da, fa in ((0, 1 - wa), (1, wa)):
            for do, fo in ((0, 1 - wo), (1, wo)):
                corners.append((it + dt, ia + da, io + do, ft * fa * fo))
    return corners, okt & oka & oko


def at_level(
    grid: MetGrid,
    name: str,
    t_s: npt.ArrayLike,
    lat: npt.ArrayLike,
    lon: npt.ArrayLike,
    level_idx: npt.ArrayLike,
) -> np.ndarray:
    """Field ``name`` at native level index ``level_idx`` (per point), time+bilinear only."""
    t_s, lat, lon = (np.asarray(x, dtype=float) for x in (t_s, lat, lon))
    lev = np.asarray(level_idx, dtype=int)
    corners, ok = _time_space(grid, t_s, lat, lon)
    f = grid.fields[name]
    lev_ok = (lev >= 0) & (lev < f.shape[1])
    levc = np.clip(lev, 0, f.shape[1] - 1)
    out = sum(w * f[i_t, levc, i_a, i_o] for i_t, i_a, i_o, w in corners)
    return np.where(ok & lev_ok, out, np.nan)


def interp_points(
    grid: MetGrid,
    names: list[str],
    t_s: npt.ArrayLike,
    lat: npt.ArrayLike,
    lon: npt.ArrayLike,
    p_pa: npt.ArrayLike,
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    """Fields at points (time s, lat, lon, pressure Pa).

    Returns ``(values, info)``; ``info`` has ``lev_above`` / ``lev_below`` (indices of the
    native levels around each point: above = lower pressure) and ``ok`` (in-domain mask).
    """
    t_s, lat, lon, p = (np.asarray(x, dtype=float) for x in (t_s, lat, lon, p_pa))
    lnp = np.log(grid.levels_pa)
    il, wl, okl = _bracket(lnp, np.log(np.where(p > 0, p, np.nan)))
    corners, ok_ts = _time_space(grid, t_s, lat, lon)
    ok = ok_ts & okl
    vals: dict[str, np.ndarray] = {}
    for n in names:
        f = grid.fields[n]
        acc = np.zeros_like(t_s)
        for i_t, i_a, i_o, w in corners:
            acc += w * ((1 - wl) * f[i_t, il, i_a, i_o] + wl * f[i_t, il + 1, i_a, i_o])
        vals[n] = np.where(ok, acc, np.nan)
        grid.out_of_domain[n] = grid.out_of_domain.get(n, 0) + int((~ok).sum())
    return vals, {"lev_above": il, "lev_below": il + 1, "ok": ok}
