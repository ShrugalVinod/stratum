"""Water-vapour thermodynamics: saturation pressures and relative humidity.

What it does
------------
Air can only hold so much water vapour before it condenses (over liquid water) or deposits
as ice. That limit, the *saturation vapour pressure*, depends only on temperature and is
lower over ice than over water. That gap is what makes ice-supersaturated regions
possible: air can be above saturation for ice (so ice crystals grow, and a contrail
persists) while still below saturation for water (so no ordinary cloud forms).

Formulas (paper §4.3, pre-registered: Murphy & Koop 2005, QJRMS 131, 1539–1565), T in K,
e in Pa:

* over liquid water (their eq. 10, valid ~123–332 K)::

    ln e_w = 54.842763 − 6763.22/T − 4.210 ln T + 0.000367 T
             + tanh(0.0415 (T − 218.8)) · (53.878 − 1331.22/T − 9.44523 ln T + 0.014025 T)

* over ice (their eq. 7, valid T > 110 K)::

    ln e_i = 9.550426 − 5723.265/T + 3.53068 ln T − 0.00728332 T

* vapour pressure from specific humidity q and pressure p: ``e = q·p / (ε + (1 − ε)·q)``
* relative humidity: ``RHi = e / e_i(T)``, ``RHw = e / e_w(T)``

The slope ``de_w/dT`` is computed analytically (the Schmidt–Appleman threshold needs it).

Difference from pycontrails 0.64 (measured in ``tests/physics/test_thermo.py``): over liquid
water it also uses Murphy & Koop, so the curves are identical. Over ice it uses Sonntag (1994),
which differs from Murphy & Koop by at most 0.13 % between 200 and 250 K (0.16 % over
190–270 K). So an RHi computed inside CoCiP can differ from ours by about 0.1 %, which matters
only for points within 0.001 of the RHi = 1 persistence threshold. STRATUM keeps Murphy & Koop
for both because it is pre-registered.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from stratum.physics import constants as c

FloatArray = npt.NDArray[np.float64]

# Murphy & Koop (2005) eq. 10 (liquid) coefficients
_W0, _W1, _W2, _W3 = 54.842763, 6763.22, 4.210, 0.000367
_TANH_A, _TANH_T0 = 0.0415, 218.8
_B0, _B1, _B2, _B3 = 53.878, 1331.22, 9.44523, 0.014025
# Murphy & Koop (2005) eq. 7 (ice) coefficients
_I0, _I1, _I2, _I3 = 9.550426, 5723.265, 3.53068, 0.00728332


def _f64(x: npt.ArrayLike) -> FloatArray:
    return np.asarray(x, dtype=np.float64)


def e_sat_water(T: npt.ArrayLike) -> FloatArray:
    """Saturation vapour pressure over (supercooled) liquid water, Pa. Murphy & Koop eq. 10."""
    T = _f64(T)
    lnT = np.log(T)
    b = _B0 - _B1 / T - _B2 * lnT + _B3 * T
    ln_e = _W0 - _W1 / T - _W2 * lnT + _W3 * T + np.tanh(_TANH_A * (T - _TANH_T0)) * b
    return np.exp(ln_e)


def e_sat_ice(T: npt.ArrayLike) -> FloatArray:
    """Saturation vapour pressure over ice, Pa. Murphy & Koop eq. 7."""
    T = _f64(T)
    return np.exp(_I0 - _I1 / T + _I2 * np.log(T) - _I3 * T)


def dlne_sat_water_dT(T: npt.ArrayLike) -> FloatArray:
    """Analytic derivative d(ln e_w)/dT, K⁻¹ (product rule on the tanh term)."""
    T = _f64(T)
    lnT = np.log(T)
    th = np.tanh(_TANH_A * (T - _TANH_T0))
    b = _B0 - _B1 / T - _B2 * lnT + _B3 * T
    db = _B1 / T**2 - _B2 / T + _B3
    return _W1 / T**2 - _W2 / T + _W3 + _TANH_A * (1.0 - th**2) * b + th * db


def de_sat_water_dT(T: npt.ArrayLike) -> FloatArray:
    """Slope of the liquid saturation curve, de_w/dT = e_w · d(ln e_w)/dT, Pa K⁻¹."""
    return e_sat_water(T) * dlne_sat_water_dT(T)


def vapour_pressure(q: npt.ArrayLike, p: npt.ArrayLike, epsilon: float = c.EPSILON) -> FloatArray:
    """Water-vapour partial pressure (Pa) from specific humidity q (kg/kg) and pressure p (Pa)."""
    q = _f64(q)
    return q * _f64(p) / (epsilon + (1.0 - epsilon) * q)


def rhi_from_q(
    q: npt.ArrayLike, T: npt.ArrayLike, p: npt.ArrayLike, epsilon: float = c.EPSILON
) -> FloatArray:
    """Relative humidity over ice (fraction, 1.0 = saturated) from q, T (K), p (Pa)."""
    return vapour_pressure(q, p, epsilon) / e_sat_ice(T)


def rhw_from_q(
    q: npt.ArrayLike, T: npt.ArrayLike, p: npt.ArrayLike, epsilon: float = c.EPSILON
) -> FloatArray:
    """Relative humidity over liquid water (fraction) from q, T (K), p (Pa)."""
    return vapour_pressure(q, p, epsilon) / e_sat_water(T)


def rhi_to_rhw(rhi: npt.ArrayLike, T: npt.ArrayLike) -> FloatArray:
    """Convert RH over ice to RH over water at the same T: ``RHw = RHi · e_i / e_w``."""
    return _f64(rhi) * e_sat_ice(T) / e_sat_water(T)


def rhw_to_rhi(rhw: npt.ArrayLike, T: npt.ArrayLike) -> FloatArray:
    """Convert RH over water to RH over ice at the same T: ``RHi = RHw · e_w / e_i``."""
    return _f64(rhw) * e_sat_water(T) / e_sat_ice(T)
