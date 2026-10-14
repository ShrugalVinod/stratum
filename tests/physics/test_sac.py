"""Known-answer and property tests for the Schmidt–Appleman criterion (build prompt §4.3).

The known answers were computed independently for the build prompt and match paper §2.1 /
Fig. 1. If an implementation fails them, the implementation is wrong: do not edit these
values to make a test pass.
"""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from stratum.physics import constants
from stratum.physics import sac as s

K = constants.ZERO_CELSIUS
P250 = 25000.0  # Pa
ETA = 0.3


# ── Known answers (build prompt §4.3 table) ──────────────────────────────────


def test_slope_known_answer() -> None:
    assert float(s.mixing_line_slope(P250, ETA)) == pytest.approx(1.641, abs=0.002)


def test_threshold_known_answer() -> None:
    G = s.mixing_line_slope(P250, ETA)
    assert float(s.t_lm(G)) - K == pytest.approx(-41.91, abs=0.03)


@pytest.mark.parametrize(
    ("T_c", "rhi", "rhw", "tlc_c", "forms", "persists"),
    [
        (-52.0, 0.60, 0.368, -49.9, True, False),  # point A, paper Fig. 1
        (-50.0, 1.12, 0.698, -47.9, True, True),  # point B
        (-38.0, 0.58, 0.401, -49.7, False, False),  # point C
    ],
    ids=["A", "B", "C"],
)
def test_points_abc(
    T_c: float, rhi: float, rhw: float, tlc_c: float, forms: bool, persists: bool
) -> None:
    r = s.schmidt_appleman(T_c + K, rhi, P250, ETA)
    assert float(r.rhw) == pytest.approx(rhw, abs=0.001)
    assert float(r.T_LC) - K == pytest.approx(tlc_c, abs=0.05)
    assert bool(r.forms) is forms
    assert bool(r.persists) is persists


def test_monotonic_in_eta() -> None:
    """Higher η → steeper mixing line → contrails form at warmer T (paper §2.1)."""
    eta = np.linspace(0.2, 0.45, 26)
    G = s.mixing_line_slope(P250, eta)
    tlm = s.t_lm(G)
    assert np.all(np.diff(G) > 0)
    assert np.all(np.diff(tlm) > 0)


def test_rhw_one_gives_tlm_exactly() -> None:
    G = s.mixing_line_slope(np.array([20000.0, 25000.0, 30000.0]), ETA)
    tlm = s.t_lm(G)
    assert np.array_equal(s.t_lc(tlm, np.ones(3), G), tlm)
    assert np.array_equal(s.t_lc(tlm, np.full(3, 1.2), G), tlm)  # supersaturated w.r.t. water


# ── Fast vectorised solver vs. slow Brent reference ─────────────────────────


@settings(max_examples=60, deadline=None)
@given(
    p=st.floats(15000, 40000),
    eta=st.floats(0.2, 0.45),
    rhw=st.floats(0.0, 0.9999),
)
def test_vectorised_matches_brent(p: float, eta: float, rhw: float) -> None:
    G = float(s.mixing_line_slope(p, eta))
    tlm_ref = s.t_lm_brent(G)
    assert float(s.t_lm(G)) == pytest.approx(tlm_ref, abs=1e-6)
    tlc_ref = s.t_lc_brent(tlm_ref, rhw, G)
    assert float(s.t_lc(tlm_ref, rhw, G)) == pytest.approx(tlc_ref, abs=1e-6)


def test_tlc_root_satisfies_equation() -> None:
    """Geometric check: the mixing line through the ambient point hits (T_LM, e_w(T_LM))."""
    from stratum.physics.thermo import e_sat_water

    G = s.mixing_line_slope(P250, ETA)
    tlm = s.t_lm(G)
    for u in [0.0, 0.3, 0.7, 0.95, 0.999]:
        tlc = s.t_lc(tlm, u, G)
        lhs = e_sat_water(tlm) - G * (tlm - tlc)
        assert float(lhs) == pytest.approx(float(u * e_sat_water(tlc)), abs=1e-9)
        assert float(tlc) <= float(tlm)


def test_tlm_tangency() -> None:
    """At T_LM the water curve's slope equals G (eq. 2)."""
    from stratum.physics.thermo import de_sat_water_dT

    G = s.mixing_line_slope(np.array([18000.0, 25000.0, 35000.0]), np.array([0.25, 0.3, 0.4]))
    assert np.allclose(de_sat_water_dT(s.t_lm(G)), G, rtol=1e-9)


# ── Vectorisation and robustness ────────────────────────────────────────────


def test_large_array_no_nans_and_shape_kept() -> None:
    rng = np.random.default_rng(0)
    n = 200_000
    T = rng.uniform(200, 250, n)
    rhi = rng.uniform(0, 1.6, n)
    p = rng.uniform(15000, 40000, n)
    eta = rng.uniform(0.2, 0.45, n)
    r = s.schmidt_appleman(T, rhi, p, eta)
    assert r.T_LC.shape == (n,)
    assert np.isfinite(r.T_LC).all() and np.isfinite(r.T_LM).all()
    assert np.all(r.T_LC <= r.T_LM + 1e-12)
    assert not np.any(r.persists & ~r.forms)  # persistence requires formation
    assert np.array_equal(r.forms, T <= r.T_LC)


def test_nan_inputs_give_nan_not_false_negative() -> None:
    r = s.schmidt_appleman(np.array([220.0, np.nan]), np.array([np.nan, 1.1]), P250, ETA)
    assert np.isnan(r.T_LC).all()
    assert not r.forms.any()  # flags False, but T_LC is NaN so callers can tell it's missing


def test_constants_equal_preregistered() -> None:
    """Defaults in physics/constants.py must equal the pre-registered values."""
    assert s.SACConstants() == s.SACConstants.from_preregistered()


# ── Cross-check against pycontrails (differences documented in sac.py) ──────


def test_against_pycontrails_sac() -> None:
    from pycontrails.models import sac as ps

    p = np.linspace(15000, 40000, 26)
    G = s.mixing_line_slope(p, np.full_like(p, ETA))
    tlm = s.t_lm(G)
    assert np.abs(tlm - ps.T_sat_liquid_high_accuracy(G)).max() < 1e-3  # same physics
    assert np.abs(tlm - ps.T_sat_liquid(G)).max() < 0.05  # pycontrails' empirical fit
    Gp = ps.slope_mixing_line(np.full_like(p, 1e-4), p, ETA, 1.23, 43.2e6)
    assert np.abs(G / Gp - 1).max() < 5e-4  # moist vs dry c_p
