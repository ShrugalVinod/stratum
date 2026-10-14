"""Tests for ISA flight level ↔ pressure conversion (build prompt §4.2)."""

from __future__ import annotations

import numpy as np
import pytest

from stratum.physics import units as u


def test_known_flight_levels() -> None:
    assert float(u.flight_level_to_pressure(250)) / 100 == pytest.approx(376.0, abs=0.5)
    assert float(u.flight_level_to_pressure(340)) / 100 == pytest.approx(250.0, abs=0.5)
    assert float(u.flight_level_to_pressure(0)) == pytest.approx(101325.0)
    assert float(u.altitude_m_to_pressure(11000.0)) == pytest.approx(22632.0, abs=1.0)


def test_roundtrip_both_layers() -> None:
    fl = np.arange(0, 600, 5, dtype=float)  # crosses the 11 km (≈ FL361) boundary
    assert np.allclose(u.pressure_to_flight_level(u.flight_level_to_pressure(fl)), fl, atol=1e-9)


def test_continuous_at_tropopause() -> None:
    below, above = u.altitude_m_to_pressure([10999.999, 11000.001])
    assert abs(below - above) < 1e-2


def test_against_pycontrails() -> None:
    from pycontrails.physics import units as pu

    fl = np.arange(200, 451, 10, dtype=float)
    assert np.abs(u.flight_level_to_pressure(fl) / 100 - pu.ft_to_pl(fl * 100)).max() < 0.01
