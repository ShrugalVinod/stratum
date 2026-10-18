"""Day bootstrap with paired resamples (paper §6.3; build prompt §6.5).

Whole days are resampled with replacement, 1,000 times (pre-registered ``bootstrap``), because
segments and images on one day share the weather and are not independent. The resample is a
(resamples × days) **count matrix** W drawn once per comparison and used for every model, so
model differences are paired. Every metric is then W @ (per-day sums): fully vectorised.
Percentile 95 % intervals. Seeded.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt

from stratum.evaluate import metrics as mt

Array = npt.NDArray[np.float64]


def count_matrix(n_days: int, n_resamples: int, seed: int) -> Array:
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, n_days, size=(n_resamples, n_days))
    w: Array = np.zeros((n_resamples, n_days))
    np.add.at(w, (np.arange(n_resamples)[:, None], draws), 1.0)
    return w


def percentile_ci(x: Array, level: float = 0.95) -> tuple[float, float]:
    lo, hi = (1 - level) / 2 * 100, (1 + level) / 2 * 100
    v = np.asarray(x, float)
    v = v[np.isfinite(v)]
    if v.size == 0:
        return float("nan"), float("nan")
    return float(np.percentile(v, lo)), float(np.percentile(v, hi))


def summarise(point: float, draws: Array, level: float = 0.95) -> dict[str, float]:
    lo, hi = percentile_ci(draws, level)
    return {"value": float(point), "lo": lo, "hi": hi}


def model_metrics(st: dict[str, Any], w: Array, level: float = 0.95) -> dict[str, dict[str, float]]:
    """Every metric of one model with its day-bootstrap interval (W shared across models)."""
    point = mt.from_sums(mt.total(st))
    boot = mt.from_sums(mt.total(st, w))
    return {k: summarise(float(point[k]), boot[k], level) for k in point}


def skill_vs(
    st: dict[str, Any], ref: dict[str, Any], w: Array, level: float = 0.95
) -> dict[str, float]:
    """Brier skill score of ``st`` vs ``ref`` on the same rows/days, paired resamples."""
    p = mt.brier_skill(mt.from_sums(mt.total(st))["brier"], mt.from_sums(mt.total(ref))["brier"])
    b = mt.brier_skill(
        mt.from_sums(mt.total(st, w))["brier"], mt.from_sums(mt.total(ref, w))["brier"]
    )
    return summarise(float(p), b, level)


def mean_skill_over_folds(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    n_resamples: int,
    seed: int,
    level: float = 0.95,
) -> dict[str, float]:
    """Mean BSS across held-out seasons: days resampled within each season, then averaged."""
    points, boots = [], []
    for i, (st, ref) in enumerate(pairs):
        w = count_matrix(len(st["days"]), n_resamples, seed + i)
        points.append(
            mt.brier_skill(
                mt.from_sums(mt.total(st))["brier"], mt.from_sums(mt.total(ref))["brier"]
            )
        )
        boots.append(
            mt.brier_skill(
                mt.from_sums(mt.total(st, w))["brier"], mt.from_sums(mt.total(ref, w))["brier"]
            )
        )
    return summarise(float(np.nanmean(points)), np.nanmean(np.vstack(boots), axis=0), level)
