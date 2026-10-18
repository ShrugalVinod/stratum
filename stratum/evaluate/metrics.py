"""Forecast verification metrics (paper §6.3; build prompt §6.4).

Every metric is computed from **per-day sufficient statistics** (``day_stats``), so the day
bootstrap only has to add up rows: 1,000 resamples × all metrics take well under a second.

* Contingency (forecast "yes" = probability ≥ 0.5): hit rate / POD = a / (a + c), false alarm
  ratio FAR = b / (a + b), critical success index CSI = a / (a + b + c).
* Brier score BS = mean (p − y)²; **Brier skill score vs B3** = 1 − BS_model / BS_B3
  (pre-registered primary metric).
* AUROC from per-day histograms of the probability for positives and negatives
  (``AUC_BINS`` bins, ties counted half). For 0/1 forecasts this equals the exact AUROC; for
  continuous ones it is within ~1/AUC_BINS of scikit-learn's value (tested).
* Reliability diagram: 10 equal-count bins of the probability (with counts), on the pooled
  test set (not bootstrapped).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

Array = npt.NDArray[np.float64]
AUC_BINS = 1000
THRESHOLD = 0.5
STAT_KEYS = ("n", "pos", "sum_p", "brier", "a", "b", "c")


def day_stats(day: npt.ArrayLike, y: npt.ArrayLike, p: npt.ArrayLike) -> dict[str, Any]:
    """Per-day sums for one model: arrays over the sorted unique days (rows with NaN p dropped)."""
    d = np.asarray(day)
    yy = np.asarray(y, float)
    pp = np.asarray(p, float)
    ok = np.isfinite(yy) & np.isfinite(pp)
    days = np.unique(d)
    k = np.searchsorted(days, d[ok])
    yy, pp = yy[ok], pp[ok]
    yes = pp >= THRESHOLD
    n_d = len(days)

    def s(w: Array) -> Array:
        out: Array = np.bincount(k, weights=w, minlength=n_d).astype(float)
        return out

    bins = np.clip((pp * AUC_BINS).astype(int), 0, AUC_BINS - 1)
    hist_pos = np.zeros((n_d, AUC_BINS))
    hist_neg = np.zeros((n_d, AUC_BINS))
    np.add.at(hist_pos, (k[yy == 1], bins[yy == 1]), 1)
    np.add.at(hist_neg, (k[yy == 0], bins[yy == 0]), 1)
    return {
        "days": days,
        "n": s(np.ones_like(yy)),
        "pos": s(yy),
        "sum_p": s(pp),
        "brier": s((pp - yy) ** 2),
        "a": s((yes & (yy == 1)).astype(float)),
        "b": s((yes & (yy == 0)).astype(float)),
        "c": s((~yes & (yy == 1)).astype(float)),
        "hist_pos": hist_pos,
        "hist_neg": hist_neg,
    }


def _div(a: Array, b: Array) -> Array:
    with np.errstate(invalid="ignore", divide="ignore"):
        out: Array = np.where(b > 0, a / np.where(b > 0, b, 1), np.nan)
    return out


def auroc_from_hist(hp: Array, hn: Array) -> Array:
    """AUROC from positive/negative histograms over increasing probability bins (last axis)."""
    cneg = np.cumsum(hn, axis=-1) - hn  # negatives strictly below each bin
    num = (hp * (cneg + 0.5 * hn)).sum(axis=-1)
    den = hp.sum(axis=-1) * hn.sum(axis=-1)
    return _div(num, den)


def from_sums(t: dict[str, Array]) -> dict[str, Array]:
    """Metrics from summed statistics (scalars, or arrays over bootstrap resamples)."""
    a, b, c = t["a"], t["b"], t["c"]
    return {
        "n": t["n"],
        "observed_rate": _div(t["pos"], t["n"]),
        "predicted_rate": _div(t["sum_p"], t["n"]),
        "brier": _div(t["brier"], t["n"]),
        "pod": _div(a, a + c),
        "far": _div(b, a + b),
        "csi": _div(a, a + b + c),
        "auroc": auroc_from_hist(t["hist_pos"], t["hist_neg"]),
    }


def total(st: dict[str, Any], weights: Array | None = None) -> dict[str, Array]:
    """Sum day statistics: plain sum, or weighted by a (resamples × days) count matrix."""
    out: dict[str, Array] = {}
    for k, v in st.items():
        if k == "days":
            continue
        if weights is None:
            out[k] = np.asarray(v).sum(axis=0)
        elif np.ndim(v) == 1:
            out[k] = weights @ np.asarray(v)
        else:
            out[k] = np.einsum("rd,db->rb", weights, np.asarray(v))
    return out


def reliability(y: npt.ArrayLike, p: npt.ArrayLike, bins: int = 10) -> pd.DataFrame:
    """Equal-count bins: mean forecast, observed frequency and count per bin."""
    yy, pp = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(yy) & np.isfinite(pp)
    yy, pp = yy[ok], pp[ok]
    if len(pp) == 0:
        return pd.DataFrame(columns=["bin", "mean_forecast", "observed", "count"])
    order = np.argsort(pp, kind="stable")
    parts = np.array_split(order, min(bins, len(pp)))
    rows = [
        {
            "bin": i,
            "mean_forecast": float(pp[ix].mean()),
            "observed": float(yy[ix].mean()),
            "count": len(ix),
        }
        for i, ix in enumerate(parts)
        if len(ix)
    ]
    return pd.DataFrame(rows)


def brier_skill(bs_model: Array, bs_ref: Array) -> Array:
    out: Array = 1.0 - _div(bs_model, bs_ref)
    return out
