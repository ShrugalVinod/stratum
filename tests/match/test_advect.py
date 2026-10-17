"""Advection: exact for uniform and time-linear winds, NaN outside the wind field, slot ages."""

import numpy as np
import pytest

from stratum.match import advect as av
from stratum.met.interp import MetGrid


def _grid(u, v, times_h=(0, 1, 2, 3)):  # type: ignore[no-untyped-def]
    t = np.array(times_h, float) * 3600.0
    lev = np.array([200e2, 250e2])
    lat = np.arange(0.0, 41.0, 1.0)
    lon = np.arange(60.0, 101.0, 1.0)
    shape = (len(t), len(lev), len(lat), len(lon))
    U = np.zeros(shape)
    V = np.zeros(shape)
    for k, tt in enumerate(t):
        U[k] = u(tt)
        V[k] = v(tt)
    return MetGrid(
        times_s=t.astype("int64"),
        levels_pa=lev,
        lat=lat,
        lon=lon,
        fields={"eastward_wind": U, "northward_wind": V},
    )


def test_uniform_northward_wind_moves_exactly() -> None:
    g = _grid(lambda t: 0.0, lambda t: 20.0)
    ages, la, lo = av.advect(g, [20.0], [80.0], [225e2], [0.0], max_age_s=7200)
    assert ages[-1] == 7200 and la.shape == (1, 25)
    expect = 20.0 + np.degrees(20.0 * 7200 / av.R_EARTH_M)
    assert la[0, -1] == pytest.approx(expect, abs=1e-9) and lo[0, -1] == pytest.approx(80.0)


def test_eastward_wind_scales_with_latitude() -> None:
    g = _grid(lambda t: 30.0, lambda t: 0.0)
    _, _la, lo = av.advect(g, [0.5, 30.0], [80.0, 80.0], [225e2, 225e2], [0.0, 0.0], max_age_s=3600)
    d0, d30 = lo[0, -1] - 80.0, lo[1, -1] - 80.0
    assert d30 / d0 == pytest.approx(np.cos(np.radians(0.5)) / np.cos(np.radians(30.0)), rel=1e-3)


def test_time_linear_wind_is_integrated_exactly() -> None:
    # v grows linearly in time: displacement = ∫ (a·t) dt = a·T²/2
    a = 10.0 / 3600.0
    g = _grid(lambda t: 0.0, lambda t: a * t)
    _, la, _ = av.advect(g, [10.0], [80.0], [225e2], [0.0], max_age_s=7200)
    assert la[0, -1] - 10.0 == pytest.approx(np.degrees(a * 7200**2 / 2 / av.R_EARTH_M), rel=1e-9)


def test_outside_the_wind_field_is_nan_not_zero() -> None:
    g = _grid(lambda t: 0.0, lambda t: 0.0)
    _, la, _ = av.advect(g, [50.0], [80.0], [225e2], [0.0], max_age_s=900)  # 50°N: outside
    assert np.isnan(la[0, -1])


def test_positions_at_slot_ages() -> None:
    g = _grid(lambda t: 0.0, lambda t: 20.0)
    ages, la, lo = av.advect(g, [20.0], [80.0], [225e2], [0.0], max_age_s=7200)
    want = av.slot_ages(np.array([600.0]), 1200, 7200)  # t0 = 00:10 → slots 00:30 … 02:00
    assert np.allclose(want[0][np.isfinite(want[0])], [1200, 2100, 3000, 3900, 4800, 5700, 6600])
    pla, _ = av.positions_at(ages, la, lo, want)
    assert pla[0, 0] == pytest.approx(20.0 + np.degrees(20.0 * 1200 / av.R_EARTH_M))
