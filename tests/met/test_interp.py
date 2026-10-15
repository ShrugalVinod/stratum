"""ERA5 interpolation is exact on fields linear in (time, lat, lon, ln p) (build prompt §4.5)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr

from stratum.met.interp import MetGrid, at_level, interp_points

LEVELS = np.array([100.0, 150.0, 200.0, 250.0, 300.0])


def _grid() -> MetGrid:
    times = pd.date_range("2026-01-01", periods=3, freq="h")
    lat = np.arange(10.0, 12.01, 0.25)
    lon = np.arange(70.0, 72.01, 0.25)
    t = (times.values.astype("datetime64[s]").astype("int64") - 1767225600) / 3600.0
    tt, lnp, la, lo = np.meshgrid(t, np.log(LEVELS * 100), lat, lon, indexing="ij")
    field = 200 + 2.0 * tt + 0.5 * la - 0.3 * lo + 10.0 * lnp
    ds = xr.Dataset(
        {"f": (("time", "level", "latitude", "longitude"), field)},
        coords={"time": times, "level": LEVELS, "latitude": lat, "longitude": lon},
    )
    return MetGrid.from_dataset(ds.transpose("longitude", "latitude", "level", "time"))


def _truth(t_h: np.ndarray, lat: np.ndarray, lon: np.ndarray, p: np.ndarray) -> np.ndarray:
    return 200 + 2.0 * t_h + 0.5 * lat - 0.3 * lon + 10.0 * np.log(p)


def test_exact_on_linear_field_and_nan_outside() -> None:
    g = _grid()
    t0 = 1767225600.0
    t_s = t0 + np.array([1800.0, 5400.0, 3600.0, 99999.0, 1800.0])
    lat = np.array([10.1, 11.37, 12.0, 11.0, 11.0])
    lon = np.array([70.05, 71.9, 70.0, 71.0, 71.0])
    p = np.array([175e2, 123e2, 300e2, 200e2, 400e2])  # last one below the lowest level
    v, info = interp_points(g, ["f"], t_s, lat, lon, p)
    exp = _truth((t_s - t0) / 3600.0, lat, lon, p)
    assert np.allclose(v["f"][:3], exp[:3], atol=1e-9)
    assert np.isnan(v["f"][3]) and np.isnan(v["f"][4])  # outside time / below pressure range
    assert g.out_of_domain["f"] == 2
    # bracketing native levels: 175 hPa sits between 150 (above) and 200 (below)
    assert LEVELS[info["lev_above"][0]] == 150 and LEVELS[info["lev_below"][0]] == 200
    lv = at_level(g, "f", t_s[:1], lat[:1], lon[:1], info["lev_above"][:1])
    assert np.allclose(lv, _truth(np.array([0.5]), lat[:1], lon[:1], np.array([150e2])))
