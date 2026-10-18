"""Contrail energy forcing and CO₂ on one scale (build prompt §7.6.4; open question 5).

CO₂e [kg] = EF [J] × efficacy × factor_H, factor_H = 1 / (AGWP_CO₂(H) × A_earth × s_yr), with
AGWP_CO₂ from IPCC AR5 WG1 Ch. 8 (20 yr: 2.49e-14, 100 yr: 9.17e-14 W m⁻² yr kg⁻¹). The factors
come from ``preregistered.yaml: avoidance.metric_conversion``; the efficacy (ERF/RF of contrail
cirrus, Lee et al. 2021) from the settled Q5 answer: central 0.42, Monte Carlo uniform 0.42–1.0.
``check_against_preregistration`` recomputes the factors and checks the efficacy against the Q5
text, so the code cannot drift from the locked answer.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]

A_EARTH_M2 = 5.101e14
S_PER_YEAR = 31_536_000.0
AGWP_CO2 = {20: 2.49e-14, 100: 9.17e-14}  # W m⁻² yr (kg CO₂)⁻¹, IPCC AR5 WG1 Ch. 8
EFFICACY_CENTRAL = 0.42
EFFICACY_RANGE = (0.42, 1.0)


def factor(horizon: int) -> float:
    """kg CO₂-equivalent per J of contrail EF (before efficacy)."""
    return 1.0 / (AGWP_CO2[horizon] * A_EARTH_M2 * S_PER_YEAR)


def co2e_kg(ef_j: npt.ArrayLike, horizon: int, efficacy: npt.ArrayLike = EFFICACY_CENTRAL) -> Array:
    out: Array = np.asarray(ef_j, float) * np.asarray(efficacy, float) * factor(horizon)
    return out


def draw_efficacy(n: int, seed: int) -> Array:
    lo, hi = EFFICACY_RANGE
    out: Array = np.random.default_rng(seed).uniform(lo, hi, n)
    return out


def check_against_preregistration(pre: Any, open_questions: Path) -> dict[str, float]:
    """Raise if the code's factors or efficacy differ from the locked Q5 answer."""
    mc = pre.avoidance.metric_conversion
    got = {20: factor(20), 100: factor(100)}
    want = {20: float(mc.factor_h20), 100: float(mc.factor_h100)}
    for h in (20, 100):
        if abs(got[h] / want[h] - 1) > 2e-3:
            raise AssertionError(f"factor_h{h}: code {got[h]:.4e} vs preregistered {want[h]:.4e}")
    text = open_questions.read_text()
    q5 = text[text.index("### 5. ") : text.index("### 6. ")]
    if "SETTLED" not in q5.splitlines()[0]:
        raise AssertionError("open question 5 is not settled")
    for needle in ("central **0.42**", "uniformly between 0.42 and 1.0"):
        if needle not in q5:
            raise AssertionError(f"Q5 text no longer says {needle!r}")
    return {"factor_h20": got[20], "factor_h100": got[100], "efficacy_central": EFFICACY_CENTRAL}
