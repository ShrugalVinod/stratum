"""Correction model: sanity logistic, monotone LightGBM, isotonic calibration (build prompt §7.3).

Everything here sees **training rows only**. The outer split (held-out season, or the spatial
side) is chosen by the caller; inside the training rows:

* **Inner validation = leave-one-day-out** (``stratum.evaluate.splits`` convention): every
  training day is predicted by a model fitted on the other training days. Days hold whole
  flights and whole satellite images, so no flight or image is on both sides.
* **Hyperparameter search**: Optuna TPE, fixed seed, ``n_trials`` trials (pre-registered budget
  50–100), minimising the pooled leave-one-day-out Brier score. Every trial is logged.
* **Main model**: LightGBM, binary log-loss, native monotone constraints (+1 on RHi at the
  segment level, −1 on T − T_LM; no post-hoc clipping), deterministic, fixed seed.
* **Calibration**: isotonic regression (increasing, clipped to [0, 1]) fitted on the
  leave-one-day-out predictions of the chosen settings, then applied to the final model fitted
  on all training rows. An increasing map keeps the monotonicity. To report calibration
  honestly, the validation Brier after calibration is *cross-fitted*: each day is calibrated
  by an isotonic map fitted on the other days only.
* **Sanity baseline**: logistic regression on RHi alone (plus intercept), unpenalised.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import lightgbm as lgb
import numpy as np
import numpy.typing as npt
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

Array = npt.NDArray[np.float64]

FIXED = {
    "objective": "binary",
    "verbosity": -1,
    "deterministic": True,
    "force_col_wise": True,
    "monotone_constraints_method": "advanced",
}


def search_space(trial: Any) -> dict[str, Any]:
    return {
        "num_leaves": trial.suggest_int("num_leaves", 4, 64, log=True),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
        "num_boost_round": trial.suggest_int("num_boost_round", 50, 600, log=True),
        "min_child_samples": trial.suggest_int("min_child_samples", 20, 2000, log=True),
        "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
        "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
        "lambda_l2": trial.suggest_float("lambda_l2", 1e-3, 10.0, log=True),
    }


def fit_gbm(
    X: Array, y: Array, params: dict[str, Any], monotone: list[int], seed: int
) -> lgb.Booster:
    p = {**FIXED, **params, "monotone_constraints": monotone, "seed": seed, "bagging_freq": 1}
    rounds = int(p.pop("num_boost_round"))
    return lgb.train(p, lgb.Dataset(X, label=y, free_raw_data=True), num_boost_round=rounds)


def lodo_predict(
    X: Array, y: Array, day: np.ndarray, params: dict[str, Any], monotone: list[int], seed: int
) -> Array:
    """Leave-one-day-out predictions: each day from a model fitted on the other days."""
    out = np.full(len(y), np.nan)
    for d in np.unique(day):
        v = day == d
        out[v] = fit_gbm(X[~v], y[~v], params, monotone, seed).predict(X[v])
    return out


def brier(y: Array, p: Array) -> float:
    return float(np.mean((p - y) ** 2))


def fit_isotonic(p: Array, y: Array) -> IsotonicRegression:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
    iso.fit(p, y)
    return iso


def crossfit_isotonic(p: Array, y: Array, day: np.ndarray) -> Array:
    """Each day calibrated by an isotonic map fitted on the other days' predictions."""
    out = np.full(len(y), np.nan)
    for d in np.unique(day):
        v = day == d
        out[v] = fit_isotonic(p[~v], y[~v]).predict(p[v])
    return out


def fit_logistic(rhi: Array, y: Array) -> LogisticRegression:
    m = LogisticRegression(C=np.inf, max_iter=1000)  # unpenalised
    m.fit(rhi.reshape(-1, 1), y.astype(int))
    return m


def lodo_logistic(rhi: Array, y: Array, day: np.ndarray) -> Array:
    out = np.full(len(y), np.nan)
    for d in np.unique(day):
        v = day == d
        out[v] = fit_logistic(rhi[~v], y[~v]).predict_proba(rhi[v].reshape(-1, 1))[:, 1]
    return out


@dataclass
class Corrector:
    """The trained correction model of one outer fold: booster → isotonic map."""

    booster: lgb.Booster
    iso: IsotonicRegression
    logistic: LogisticRegression
    feature_names: list[str]
    params: dict[str, Any]
    info: dict[str, Any] = field(default_factory=dict)

    def raw(self, X: Array) -> Array:
        out: Array = np.asarray(self.booster.predict(X), float)
        return out

    def predict(self, X: Array) -> Array:
        out: Array = np.asarray(self.iso.predict(self.raw(X)), float)
        return out

    def predict_logistic(self, rhi: Array) -> Array:
        out: Array = self.logistic.predict_proba(rhi.reshape(-1, 1))[:, 1]
        return out


def search(
    X: Array,
    y: Array,
    day: np.ndarray,
    monotone: list[int],
    n_trials: int,
    seed: int,
) -> tuple[dict[str, Any], Array, list[dict[str, Any]]]:
    """Optuna search on leave-one-day-out Brier. Returns best params, their LODO predictions
    and the trial log."""
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    preds: dict[int, Array] = {}
    log: list[dict[str, Any]] = []

    def objective(trial: Any) -> float:
        params = search_space(trial)
        t0 = time.time()
        p = lodo_predict(X, y, day, params, monotone, seed)
        preds[trial.number] = p
        b = brier(y, p)
        log.append(
            {"trial": trial.number, **params, "brier_lodo": b, "sec": round(time.time() - t0, 1)}
        )
        # keep memory flat: only the current best predictions are needed afterwards
        best = min(log, key=lambda r: r["brier_lodo"])["trial"]
        for k in [k for k in preds if k != best]:
            del preds[k]
        return b

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=n_trials)
    best = study.best_trial
    return search_space(optuna.trial.FixedTrial(best.params)), preds[best.number], log


def train_fold(
    X: Array,
    y: Array,
    day: np.ndarray,
    rhi: Array,
    feature_names: list[str],
    monotone: list[int],
    n_trials: int,
    seed: int,
) -> tuple[Corrector, dict[str, Any]]:
    """Search, calibrate and fit the final model on one fold's training rows.

    Returns the model and its validation summary (all numbers from training days only)."""
    params, oof_raw, log = search(X, y, day, monotone, n_trials, seed)
    oof_cal = crossfit_isotonic(oof_raw, y, day)
    oof_log = lodo_logistic(rhi, y, day)
    booster = fit_gbm(X, y, params, monotone, seed)
    model = Corrector(
        booster=booster,
        iso=fit_isotonic(oof_raw, y),
        logistic=fit_logistic(rhi, y),
        feature_names=feature_names,
        params=params,
    )
    val = {
        "train_rows": len(y),
        "train_pos": int(y.sum()),
        "train_days": len(np.unique(day)),
        "base_rate": float(y.mean()),
        "brier_climatology": brier(y, np.full(len(y), y.mean())),
        "brier_logistic_rhi": brier(y, oof_log),
        "brier_gbm_raw": brier(y, oof_raw),
        "brier_gbm_calibrated": brier(y, oof_cal),
        "best_params": params,
        "trials": log,
    }
    model.info = {k: v for k, v in val.items() if k != "trials"}
    return model, {**val, "_oof": {"raw": oof_raw, "cal": oof_cal, "logistic": oof_log}}
