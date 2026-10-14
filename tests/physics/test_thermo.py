"""Tests for Murphy & Koop saturation curves and humidity conversions (build prompt §4.2)."""

from __future__ import annotations

import numpy as np
import pytest

from stratum.physics import thermo as t


def test_triple_point_values() -> None:
    """Both curves give ≈ 611.66 Pa at the triple point (273.16 K) [Murphy & Koop 2005]."""
    assert float(t.e_sat_ice(273.16)) == pytest.approx(611.66, rel=1e-3)
    assert float(t.e_sat_water(273.16)) == pytest.approx(611.66, rel=1e-3)


def test_ice_below_water_when_supercooled() -> None:
    T = np.linspace(190, 272, 200)
    assert np.all(t.e_sat_ice(T) < t.e_sat_water(T))


def test_analytic_derivative_matches_finite_difference() -> None:
    T = np.linspace(190, 270, 81)
    h = 1e-4
    fd = (t.e_sat_water(T + h) - t.e_sat_water(T - h)) / (2 * h)
    assert np.allclose(t.de_sat_water_dT(T), fd, rtol=1e-7)


def test_vapour_pressure_and_rh_roundtrip() -> None:
    T, p = 225.0, 25000.0
    e_i = float(t.e_sat_ice(T))
    # specific humidity that gives exactly ice saturation: invert e = q p / (ε + (1-ε) q)
    q = 0.622 * e_i / (p - (1 - 0.622) * e_i)
    assert float(t.rhi_from_q(q, T, p)) == pytest.approx(1.0, rel=1e-12)
    assert float(t.rhw_from_q(q, T, p)) == pytest.approx(e_i / float(t.e_sat_water(T)))
    rhi = np.array([0.3, 1.0, 1.4])
    assert np.allclose(t.rhw_to_rhi(t.rhi_to_rhw(rhi, T), T), rhi)


def test_against_pycontrails_thermo() -> None:
    """Agreement claimed in thermo.py's docstring (liquid identical; ice within 0.13 %)."""
    from pycontrails.physics import thermo as pt

    T = np.linspace(200, 250, 501)
    assert np.abs(t.e_sat_water(T) / pt.e_sat_liquid(T) - 1).max() < 1e-3  # build prompt: <0.1 %
    assert np.abs(t.e_sat_ice(T) / pt.e_sat_ice(T) - 1).max() < 1.5e-3
