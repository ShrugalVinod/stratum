"""WMO lapse-rate tropopause on synthetic profiles with known answers (build prompt §4.4)."""

from __future__ import annotations

import numpy as np

from stratum.physics import tropopause as tp

ERA5_LEVELS_HPA = np.array([50, 70, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500])


def _profile(levels_hpa: np.ndarray, z_tp_km: float, lapse_trop: float, lapse_strat: float):
    """T on pressure levels for T(z) = 300 − Γ z below z_tp, then −Γs above (surface 1000 hPa)."""
    z = np.linspace(0, 30000, 300001)
    T = np.where(z <= z_tp_km * 1000, 300 - lapse_trop * z / 1000, 0.0)
    t_tp = 300 - lapse_trop * z_tp_km
    T = np.where(z <= z_tp_km * 1000, T, t_tp - lapse_strat * (z / 1000 - z_tp_km))
    lnp = np.log(1000e2) - np.cumsum(tp.G0 / (tp.R_D * T)) * (z[1] - z[0])
    zl = np.interp(np.log(levels_hpa * 100.0), lnp[::-1], z[::-1])
    tl = np.interp(zl, z, T)
    z500 = np.interp(np.log(500e2), lnp[::-1], z[::-1])
    p_true = np.exp(np.interp(z_tp_km * 1000, z, lnp))
    return tl, z500, p_true


def test_dense_levels_recover_kink_exactly() -> None:
    lev = np.arange(50, 501, 5.0)
    t, z500, p_true = _profile(lev, 16.0, 7.0, -2.0)  # stratosphere warms 2 K/km
    p, z, _ = tp.wmo_tropopause(lev * 100, t)
    assert abs((z + z500) / 1000 - 16.0) < 0.2
    assert abs(p - p_true) / p_true < 0.03


def test_era5_levels_tropical_profile() -> None:
    """On ERA5's coarse levels a tropical tropopause near 100 hPa is found within 0.3 km."""
    for z_true in (16.0, 16.5, 17.0):
        t, z500, p_true = _profile(ERA5_LEVELS_HPA.astype(float), z_true, 7.0, -2.5)
        p, z, _ = tp.wmo_tropopause(ERA5_LEVELS_HPA * 100.0, t)
        assert abs((z + z500) / 1000 - z_true) < 0.3
        assert abs(p - p_true) / p_true < 0.06
        assert 80e2 <= p <= 110e2


def test_thin_stable_layer_is_not_a_tropopause() -> None:
    """An isothermal slab 9–10 km (Γ = 0 for only 1 km) must be rejected by the 2-km rule."""
    lev = np.arange(50, 501, 5.0)
    z = np.linspace(0, 30000, 300001)
    zk = z / 1000
    lapse = np.where((zk > 9) & (zk < 10), 0.0, np.where(zk < 16, 7.0, -2.0))
    T = 300 - np.concatenate([[0.0], np.cumsum(lapse[1:] * np.diff(zk))])
    lnp = np.log(1000e2) - np.cumsum(tp.G0 / (tp.R_D * T)) * (z[1] - z[0])
    zl = np.interp(np.log(lev * 100.0), lnp[::-1], z[::-1])
    z500 = np.interp(np.log(500e2), lnp[::-1], z[::-1])
    _, z_tp, _ = tp.wmo_tropopause(lev * 100, np.interp(zl, z, T))
    assert abs((z_tp + z500) / 1000 - 16.0) < 0.3  # the real tropopause, not the 9-km slab


def test_no_tropopause_gives_nan_and_vectorises() -> None:
    lev = ERA5_LEVELS_HPA.astype(float)
    t_good, _, _ = _profile(lev, 17.0, 7.0, -2.5)
    t_none = 300.0 - 7.0 * tp.heights_m(lev[::-1] * 100, np.full(lev.size, 250.0))[::-1] / 1000
    p, z, _ = tp.wmo_tropopause(lev * 100, np.stack([t_good, t_none]))
    assert np.isfinite(p[0]) and np.isnan(p[1]) and np.isnan(z[1])


def test_high_tropopause_near_profile_top_is_found() -> None:
    """Real ERA5 column (22.25°N 97.75°E, 15 Jan 2026): stable layer starts at 70 hPa, only
    1.95 km below the 50 hPa top. The 2-km rule is applied to the available depth (≥ 1.5 km)."""
    lev = np.array([500, 450, 400, 350, 300, 250, 225, 200, 175, 150, 125, 100, 70, 50.0])
    t = np.array(
        [
            268.0,
            262.8,
            256.8,
            249.5,
            240.8,
            230.9,
            226.2,
            221.2,
            216.0,
            209.9,
            202.1,
            194.4,
            190.3,
            205.0,
        ]
    )
    p, _z, _ = tp.wmo_tropopause(lev * 100, t)
    assert 70e2 <= p <= 100e2
