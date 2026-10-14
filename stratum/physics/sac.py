"""The Schmidt–Appleman criterion (SAC): does a contrail form, and does it persist?

What it does
------------
Hot, moist exhaust mixes with cold ambient air. On a diagram of temperature T against
water-vapour pressure e, the plume moves along a straight **mixing line** from the
exhaust towards the ambient point. Its slope is (paper §2.1, eq. 1)::

    G = EI_H2O · c_p · p / (ε · Q · (1 − η))          [Pa K⁻¹]

If anywhere along that line the plume becomes saturated with respect to liquid water,
droplets form and freeze: a contrail. The limiting mixing line just *touches* the water
saturation curve e_w(T). Where it touches defines the **threshold temperature T_LM**
(eq. 2)::

    de_w/dT (T_LM) = G

* Dry ambient air (RH_w = 0) forms a contrail if it is colder than
  ``T_LM − e_w(T_LM)/G``. Saturated air (RH_w = 1) forms one up to T_LM.
* In general the **critical temperature T_LC** solves (Schumann 1996, eq. 11)::

      e_w(T_LM) − G · (T_LM − T_LC) = RH_w · e_w(T_LC)

  i.e. the mixing line through the ambient point (T_LC, RH_w·e_w(T_LC)) passes through the
  tangent point. For RH_w ≥ 1, T_LC = T_LM.

**Formation:** T ≤ T_LC. **Persistence:** formation *and* RHi ≥ 1 (ice-supersaturated air,
paper §2.2, §4.3).

Constants (EI_H2O = 1.23, c_p = 1004, ε = 0.622, Q = 43.2 MJ/kg) are pre-registered and
read from ``configs/preregistered.yaml``. Saturation curves are Murphy & Koop (2005),
see :mod:`stratum.physics.thermo`.

Numerics: both roots are found with a vectorised, bracketed Illinois (modified regula
falsi) iteration, so 10⁷ segments need no Python loop. It always stays inside a bracket
that contains the root, so it cannot diverge. :func:`t_lm_brent` and :func:`t_lc_brent`
are slow scalar references using SciPy's Brent method, used in tests to check the fast
path to < 1e-6 K.

Differences from pycontrails 0.64 (``pycontrails.models.sac``, measured in
``tests/physics/test_sac.py``): its G uses a moist c_p (0.01 % larger at q = 1e-4); its default
T_LM is an empirical fit (Schumann 1996 eq. 31) that differs from our exact root by up to
0.03 K, while its ``T_sat_liquid_high_accuracy`` matches ours to < 0.001 K.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from scipy.optimize import brentq

from stratum.physics import constants as c
from stratum.physics.thermo import de_sat_water_dT, e_sat_water, rhi_to_rhw

FloatArray = npt.NDArray[np.float64]
BoolArray = npt.NDArray[np.bool_]

# Search ranges (build prompt §4.3): T_LM in [180 K, 260 K]; T_LC in (150 K, T_LM].
T_LM_BRACKET = (180.0, 260.0)
T_LC_LOWER = 150.0
_TOL_K = 1e-9


@dataclass(frozen=True)
class SACConstants:
    """Pre-registered Schmidt–Appleman constants (paper Appendix A)."""

    EI_H2O: float = c.EI_H2O
    c_p: float = c.C_P
    epsilon: float = c.EPSILON
    Q: float = c.Q_FUEL
    persistence_rhi: float = 1.0

    @classmethod
    def from_preregistered(cls) -> SACConstants:
        """Read the constants from ``configs/preregistered.yaml`` (the binding source)."""
        from stratum.config import load_preregistered

        s = load_preregistered().sac
        return cls(s.EI_H2O, s.c_p, s.epsilon, s.Q, s.persistence_rhi)


def mixing_line_slope(
    p: npt.ArrayLike, eta: npt.ArrayLike, k: SACConstants | None = None
) -> FloatArray:
    """Slope G of the mixing line (Pa K⁻¹), paper eq. 1. ``p`` in Pa, ``eta`` in (0, 1)."""
    k = k or SACConstants()
    p_ = np.asarray(p, dtype=np.float64)
    eta_ = np.asarray(eta, dtype=np.float64)
    return k.EI_H2O * k.c_p * p_ / (k.epsilon * k.Q * (1.0 - eta_))


def _illinois(
    f: Callable[[FloatArray], FloatArray],
    lo: FloatArray,
    hi: FloatArray,
    tol: float = _TOL_K,
    maxiter: int = 100,
) -> FloatArray:
    """Vectorised bracketed root finder (Illinois / modified regula falsi).

    Requires f(lo) and f(hi) to have opposite signs (or one to be 0) element-wise.
    Elements where that fails come back as NaN instead of a wrong number.
    """
    a, b = lo.astype(np.float64).copy(), hi.astype(np.float64).copy()
    fa, fb = f(a), f(b)
    bad = ~(np.sign(fa) * np.sign(fb) <= 0)
    side = np.zeros(a.shape, dtype=np.int8)
    x = np.where(fa == 0, a, b)
    done = (fa == 0) | (fb == 0) | bad
    for _ in range(maxiter):
        if done.all():
            break
        denom = fb - fa
        x_new = np.where(
            denom != 0, (a * fb - b * fa) / np.where(denom != 0, denom, 1.0), 0.5 * (a + b)
        )
        x_new = np.where(done, x, x_new)
        fx = f(x_new)
        same_as_b = np.sign(fx) == np.sign(fb)
        upd_b = ~done & same_as_b
        upd_a = ~done & ~same_as_b
        # Move the end that has the same sign; halve the stale end's f if it was kept twice.
        fa = np.where(upd_b & (side == -1), 0.5 * fa, fa)
        fb = np.where(upd_a & (side == 1), 0.5 * fb, fb)
        b, fb = np.where(upd_b, x_new, b), np.where(upd_b, fx, fb)
        a, fa = np.where(upd_a, x_new, a), np.where(upd_a, fx, fa)
        side = np.where(upd_b, -1, np.where(upd_a, 1, side)).astype(np.int8)
        converged = (np.abs(x_new - x) < tol) | (fx == 0) | (np.abs(b - a) < tol)
        x = x_new
        done |= converged
    x = np.where(bad, np.nan, x)
    return x


def t_lm(G: npt.ArrayLike) -> FloatArray:
    """Threshold temperature T_LM (K): where the water saturation curve has slope G (eq. 2).

    Solved on [180 K, 260 K] in log form, ln(de_w/dT) − ln G = 0, which is monotonic.
    """
    G_ = np.asarray(G, dtype=np.float64)
    flat = G_.ravel()
    uniq, inverse = np.unique(flat, return_inverse=True)  # G often repeats (same p, η)
    ln_g = np.log(uniq)

    def f(T: FloatArray) -> FloatArray:
        return np.log(de_sat_water_dT(T)) - ln_g

    lo = np.full(uniq.shape, T_LM_BRACKET[0])
    hi = np.full(uniq.shape, T_LM_BRACKET[1])
    return _illinois(f, lo, hi)[inverse].reshape(G_.shape)


def t_lc(T_LM: npt.ArrayLike, rhw: npt.ArrayLike, G: npt.ArrayLike) -> FloatArray:
    """Critical temperature T_LC (K) for ambient RH over water ``rhw`` (fraction).

    Root of ``e_w(T_LM) − G·(T_LM − T) − rhw·e_w(T) = 0`` on (150 K, T_LM].
    For rhw ≥ 1, returns T_LM exactly.
    """
    T_LM_, rhw_, G_ = np.broadcast_arrays(
        np.asarray(T_LM, dtype=np.float64),
        np.asarray(rhw, dtype=np.float64),
        np.asarray(G, dtype=np.float64),
    )
    out = T_LM_.astype(np.float64).copy()
    solve = (rhw_ < 1.0) & np.isfinite(T_LM_) & np.isfinite(rhw_) & np.isfinite(G_)
    if solve.any():
        tm, u, g = T_LM_[solve], np.clip(rhw_[solve], 0.0, None), G_[solve]
        ew_tm = e_sat_water(tm)

        def f(T: FloatArray) -> FloatArray:
            return np.asarray(ew_tm - g * (tm - T) - u * e_sat_water(T), dtype=np.float64)

        out[solve] = _illinois(f, np.full(tm.shape, T_LC_LOWER), tm)
    out[~np.isfinite(rhw_) | ~np.isfinite(G_)] = np.nan
    return out


# ── Slow scalar references (tests only) ─────────────────────────────────────


def t_lm_brent(G: float) -> float:
    """Scalar T_LM via SciPy's Brent method on [180, 260] K (reference implementation)."""
    return float(brentq(lambda T: float(de_sat_water_dT(T)) - G, *T_LM_BRACKET, xtol=1e-12))


def t_lc_brent(T_LM: float, rhw: float, G: float) -> float:
    """Scalar T_LC via Brent's method (reference implementation)."""
    if rhw >= 1.0:
        return T_LM
    ew = float(e_sat_water(T_LM))
    return float(
        brentq(
            lambda T: ew - G * (T_LM - T) - rhw * float(e_sat_water(T)),
            T_LC_LOWER,
            T_LM,
            xtol=1e-12,
        )
    )


# ── Everything a segment needs ──────────────────────────────────────────────


@dataclass(frozen=True)
class SACResult:
    """SAC outputs for each input point (arrays of the broadcast input shape)."""

    G: FloatArray  # Pa K⁻¹
    T_LM: FloatArray  # K
    rhw: FloatArray  # fraction
    T_LC: FloatArray  # K
    forms: BoolArray  # T ≤ T_LC
    persists: BoolArray  # forms and RHi ≥ persistence_rhi
    temp_margin_K: FloatArray  # T_LC − T  (positive = colder than the threshold)
    temp_minus_TLM: FloatArray  # T − T_LM (positive = warmer than T_LM); a model feature


def schmidt_appleman(
    T: npt.ArrayLike,
    rhi: npt.ArrayLike,
    p: npt.ArrayLike,
    eta: npt.ArrayLike,
    k: SACConstants | None = None,
) -> SACResult:
    """Apply the SAC to ambient temperature T (K), RHi (fraction), pressure p (Pa), η.

    NaN inputs give NaN outputs and ``False`` flags (never a silent "no contrail" that could
    be mistaken for a real result: callers should check ``np.isfinite(result.T_LC)``).
    """
    k = k or SACConstants()
    T_, rhi_, p_, eta_ = np.broadcast_arrays(
        *(np.asarray(x, dtype=np.float64) for x in (T, rhi, p, eta))
    )
    G = mixing_line_slope(p_, eta_, k)
    TLM = t_lm(G)
    rhw = rhi_to_rhw(rhi_, T_)
    TLC = t_lc(TLM, rhw, G)
    with np.errstate(invalid="ignore"):
        forms = np.isfinite(TLC) & (T_ <= TLC)
        persists = forms & (rhi_ >= k.persistence_rhi)
    return SACResult(
        G=G,
        T_LM=TLM,
        rhw=rhw,
        T_LC=TLC,
        forms=forms,
        persists=persists,
        temp_margin_K=TLC - T_,
        temp_minus_TLM=T_ - TLM,
    )
