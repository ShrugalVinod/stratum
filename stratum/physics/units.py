"""Flight level ↔ pressure, using the ICAO Standard Atmosphere (ISA).

What it does
------------
ADS-B reports *barometric* (pressure) altitude: the altitude the ISA would give for the
pressure the aircraft's instruments measure. A flight level is that altitude in hundreds of
feet (FL340 = 34,000 ft). So turning a flight level into the real ambient pressure is an
exact inversion of the ISA, whatever the actual weather. That is why each aircraft can be
placed on ERA5's pressure levels without knowing the real temperature profile.

Below 20 km the ISA has two layers:

* troposphere (0–11 km), temperature falls 6.5 K per km:
  ``p = p0 · (1 − L·h / T0) ^ (g / (R·L))``
* lower stratosphere (11–20 km), isothermal at 216.65 K:
  ``p = p11 · exp(−g·(h − 11 km) / (R·T11))``

Known answers (build prompt §4.2; paper §3.1): FL250 ≈ 376 hPa, FL340 ≈ 250 hPa.
Cross-checked against ``pycontrails.physics.units`` in ``tests/physics/test_units.py``.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from stratum.physics import constants as c

FloatArray = npt.NDArray[np.float64]

_EXP = c.G0 / (c.R_DRY * c.ISA_LAPSE)  # ≈ 5.2559, barometric exponent in the troposphere
_P11 = c.ISA_P0 * (c.ISA_T_TROPOPAUSE / c.ISA_T0) ** _EXP  # ≈ 22632 Pa at 11 km


def altitude_m_to_pressure(h_m: npt.ArrayLike) -> FloatArray:
    """ISA pressure (Pa) at pressure altitude ``h_m`` (m). Valid from 0 to 20 km."""
    h = np.asarray(h_m, dtype=np.float64)
    with np.errstate(invalid="ignore"):  # each branch is only used where it is valid
        tropo = c.ISA_P0 * (1.0 - c.ISA_LAPSE * h / c.ISA_T0) ** _EXP
    strato = _P11 * np.exp(-c.G0 * (h - c.ISA_H_TROPOPAUSE) / (c.R_DRY * c.ISA_T_TROPOPAUSE))
    return np.where(h <= c.ISA_H_TROPOPAUSE, tropo, strato)


def pressure_to_altitude_m(p_pa: npt.ArrayLike) -> FloatArray:
    """ISA pressure altitude (m) for pressure ``p_pa`` (Pa). Inverse of the function above."""
    p = np.asarray(p_pa, dtype=np.float64)
    tropo = c.ISA_T0 / c.ISA_LAPSE * (1.0 - (p / c.ISA_P0) ** (1.0 / _EXP))
    strato = c.ISA_H_TROPOPAUSE - c.R_DRY * c.ISA_T_TROPOPAUSE / c.G0 * np.log(p / _P11)
    return np.where(p >= _P11, tropo, strato)


def flight_level_to_pressure(fl: npt.ArrayLike) -> FloatArray:
    """Ambient pressure (Pa) at flight level ``fl`` (hundreds of feet)."""
    return altitude_m_to_pressure(np.asarray(fl, dtype=np.float64) * 100.0 * c.FT_TO_M)


def pressure_to_flight_level(p_pa: npt.ArrayLike) -> FloatArray:
    """Flight level (hundreds of feet, unrounded) for pressure ``p_pa`` (Pa)."""
    return pressure_to_altitude_m(p_pa) / c.FT_TO_M / 100.0


def ft_to_pressure(alt_ft: npt.ArrayLike) -> FloatArray:
    """Ambient pressure (Pa) for a barometric altitude in feet (as ADS-B reports it)."""
    return altitude_m_to_pressure(np.asarray(alt_ft, dtype=np.float64) * c.FT_TO_M)
