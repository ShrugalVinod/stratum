"""Metrics vs scikit-learn and hand-computed values; day bootstrap coverage (build prompt §6.4–6.5)."""

import numpy as np
from sklearn.metrics import brier_score_loss, roc_auc_score

from stratum.evaluate import bootstrap as bs
from stratum.evaluate import metrics as mt


def test_contingency_by_hand() -> None:
    y = np.array([1, 1, 0, 0, 1, 0])
    p = np.array([1, 0, 1, 0, 1, 0], float)  # a = 2, b = 1, c = 1, d = 2
    m = mt.from_sums(mt.total(mt.day_stats(np.zeros(6), y, p)))
    assert m["pod"] == 2 / 3 and m["far"] == 1 / 3 and m["csi"] == 2 / 4
    assert m["brier"] == 2 / 6 and m["observed_rate"] == 0.5


def test_brier_and_auroc_match_sklearn() -> None:
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 5000)
    p = np.clip(0.3 * y + rng.random(5000) * 0.7, 0, 1)
    m = mt.from_sums(mt.total(mt.day_stats(rng.integers(0, 12, 5000), y, p)))
    assert abs(m["brier"] - brier_score_loss(y, p)) < 1e-12
    assert abs(m["auroc"] - roc_auc_score(y, p)) < 2e-3  # binned
    pb = (p > 0.5).astype(float)  # binary forecasts: exact
    mb = mt.from_sums(mt.total(mt.day_stats(np.zeros(5000), y, pb)))
    assert abs(mb["auroc"] - roc_auc_score(y, pb)) < 1e-12


def test_bss_and_reliability() -> None:
    assert mt.brier_skill(np.array(0.05), np.array(0.10)) == 0.5
    r = mt.reliability(np.r_[np.zeros(50), np.ones(50)], np.linspace(0, 1, 100))
    assert len(r) == 10 and r["count"].sum() == 100 and r["observed"].iloc[-1] == 1.0


def test_day_bootstrap_ci_coverage_is_about_95_percent() -> None:
    """Days with random effects; the true rate is known; CIs should cover it ~95 % of the time."""
    true_rate, n_days, hits, sims = 0.2, 40, 0, 200
    for k in range(sims):
        rng = np.random.default_rng(1000 + k)
        day_rate = np.clip(rng.normal(true_rate, 0.05, n_days), 0.01, 0.99)
        n = rng.integers(200, 400, n_days)
        day = np.repeat(np.arange(n_days), n)
        y = rng.random(day.size) < day_rate[day]
        st = mt.day_stats(day, y.astype(float), np.full(day.size, 0.5))
        w = bs.count_matrix(n_days, 1000, seed=k)
        r = bs.model_metrics(st, w)["observed_rate"]
        hits += r["lo"] <= true_rate <= r["hi"]
    assert 0.88 <= hits / sims <= 0.99


def test_paired_skill_and_fold_mean() -> None:
    rng = np.random.default_rng(3)
    day = rng.integers(0, 10, 3000)
    y = (rng.random(3000) < 0.3).astype(float)
    good = np.clip(y * 0.6 + 0.2, 0, 1)
    ref = np.full(3000, 0.3)
    st, sr = mt.day_stats(day, y, good), mt.day_stats(day, y, ref)
    w = bs.count_matrix(10, 500, 1)
    r = bs.skill_vs(st, sr, w)
    assert r["lo"] > 0  # clearly better than the reference
    m = bs.mean_skill_over_folds([(st, sr), (st, sr)], 500, 1)
    assert abs(m["value"] - r["value"]) < 1e-12
