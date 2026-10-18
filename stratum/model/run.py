"""Phase 7 model jobs: train on training rows only, then (separately) predict held-out rows.

``train_all`` (Colab 07a, **no held-out scoring**): for each outer fold — the four held-out
seasons and both spatial directions — it searches, calibrates and fits the correction model on
that fold's training rows, fits the option-(b) scaling cells, and saves everything to
``interim/model/<fold>/``. Its summary holds validation numbers only (leave-one-day-out inside
the training rows): the sanity logistic, the boosted model before/after calibration, option
(b), the (a)-vs-(b) decision by the pre-stated rule, SHAP importance and the monotonicity check.

``predict_heldout`` (inside the H2 final run): loads those frozen models and adds prediction
columns for each fold's held-out rows. The models are never refitted there.

The (a)-vs-(b) rule (build prompt §7.4, recorded before any test number): choose (b) unless
(a)'s mean validation Brier over the four seasonal folds is better by more than 0.005.
"""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.evaluate import metrics as mt
from stratum.evaluate import splits as sp
from stratum.model import features as fe
from stratum.model import scaling as sc
from stratum.model import train as tr

Array = npt.NDArray[np.float64]
A_VS_B_MARGIN = 0.005
SHAP_SAMPLE = 20_000
PRED_COLS = {
    "STRATUM": "calibrated boosted model (a)",
    "STRATUM_raw": "boosted model before calibration",
    "STRATUM_b": "RHi scaling factor per latitude band (b)",
    "LOGIT": "logistic on RHi (sanity)",
}


def model_dir(root: Path) -> Path:
    return root / "interim" / "model"


def outer_folds(t: pd.DataFrame) -> list[sp.Fold]:
    """Seasonal folds (winter-without-January reuses the winter model) and both spatial ones."""
    return [*sp.seasonal_folds(t), *sp.spatial_folds(t)]


def _train_rows(t: pd.DataFrame, fold: sp.Fold) -> pd.DataFrame:
    """Labelled rows on the fold's training side (missing labels are never used)."""
    return t[fold.train & t["y"].notna().to_numpy()]


def ids_hash(ids: pd.Series) -> str:
    return hashlib.sha256("\n".join(sorted(map(str, ids))).encode()).hexdigest()[:16]


def dir_hash(d: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(p for p in d.rglob("*") if p.is_file() and p.name != "summary.json"):
        h.update(f.relative_to(d).as_posix().encode())
        h.update(f.read_bytes())
    return h.hexdigest()


def monotonicity_check(
    model: tr.Corrector, X: Array, names: list[str], monotone: list[int], seed: int, n: int = 500
) -> dict[str, Any]:
    """On real training rows, sweep each constrained feature over its 1–99 % range and count
    rows where the calibrated prediction moves the wrong way (must be 0)."""
    rng = np.random.default_rng(seed)
    rows = X[rng.choice(len(X), min(n, len(X)), replace=False)]
    out: dict[str, Any] = {}
    for j, sign in enumerate(monotone):
        if sign == 0:
            continue
        grid = np.nanpercentile(X[:, j], np.linspace(1, 99, 25))
        Z = np.repeat(rows, len(grid), axis=0)
        Z[:, j] = np.tile(grid, len(rows))
        p = model.predict(Z).reshape(len(rows), len(grid))
        step = np.diff(p, axis=1) * sign
        out[names[j]] = {"rows": len(rows), "violations": int((step < -1e-12).any(axis=1).sum())}
    return out


def shap_summary(model: tr.Corrector, X: Array, names: list[str], seed: int) -> dict[str, Any]:
    """TreeSHAP (LightGBM's exact pred_contrib) on a sample of training rows."""
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(X), min(SHAP_SAMPLE, len(X)), replace=False)
    contrib = np.asarray(model.booster.predict(X[idx], pred_contrib=True))[:, :-1]
    imp = np.abs(contrib).mean(axis=0)
    order = np.argsort(-imp)
    return {
        "importance": {names[i]: float(imp[i]) for i in order},
        "_sample": {"X": X[idx], "shap": contrib},
    }


def train_all(t: pd.DataFrame, pre: Any, out: Path, n_trials: int, seed: int) -> dict[str, Any]:
    """Colab 07a. ``t``: evaluation table with feature columns attached."""
    names = list(pre.correction_model.features)
    cols = fe.columns(names)
    mono = fe.monotone_vector(names, dict(pre.correction_model.monotone))
    bands = [tuple(b) for b in pre.correction_model.latitude_bands_deg]
    j_rhi = names.index("rhi_at_level")
    res: dict[str, Any] = {
        "features": names,
        "monotone": mono,
        "n_trials": n_trials,
        "seed": seed,
        "folds": {},
    }
    figs: dict[str, Any] = {}
    for i, fold in enumerate(outer_folds(t)):
        d = _train_rows(t, fold)
        d = d[np.isfinite(d["rhi"].to_numpy(float))]  # no ERA5 at the segment: not trainable
        X = d[cols].to_numpy(float)
        y = d["y"].to_numpy(float)
        day = d["day"].to_numpy()
        model, val = tr.train_fold(X, y, day, X[:, j_rhi], names, mono, n_trials, seed + i)
        oof = val.pop("_oof")
        # option (b)
        cells_season = sc.fit_cells(d, bands, by_season=True)
        cells_band = sc.fit_cells(d, bands, by_season=False)
        p_b = sc.lodo_predict(d, bands)
        val["brier_scaling_b"] = tr.brier(y, p_b)
        val["auroc"] = {
            k: _auroc(y, p)
            for k, p in (
                ("logistic_rhi", oof["logistic"]),
                ("gbm_raw", oof["raw"]),
                ("gbm_calibrated", oof["cal"]),
                ("scaling_b", p_b),
            )
        }
        val["reliability"] = {
            "before": mt.reliability(y, oof["raw"]).to_dict(orient="records"),
            "after": mt.reliability(y, oof["cal"]).to_dict(orient="records"),
        }
        val["monotonicity"] = monotonicity_check(model, X, names, mono, seed)
        sh = shap_summary(model, X, names, seed)
        val["shap_importance"] = sh["importance"]
        val["scaling_cells_season_band"] = cells_season.to_dict(orient="records")
        val["scaling_cells_band"] = cells_band.to_dict(orient="records")
        val["train_ids_hash"] = ids_hash(d["segment_id"])
        fdir = out / fold.name
        fdir.mkdir(parents=True, exist_ok=True)
        model.booster.save_model(str(fdir / "booster.txt"))
        with (fdir / "iso_logistic.pkl").open("wb") as fh:
            pickle.dump({"iso": model.iso, "logistic": model.logistic}, fh)
        cells_band.to_csv(fdir / "scaling_band.csv", index=False)
        cells_season.to_csv(fdir / "scaling_season_band.csv", index=False)
        (fdir / "params.json").write_text(
            json.dumps({"params": model.params, "features": names, "monotone": mono}, indent=1)
        )
        pd.DataFrame(val["trials"]).to_csv(fdir / "trials.csv", index=False)
        figs[fold.name] = {"y": y, "oof": oof, "p_b": p_b, "shap": sh["_sample"]}
        res["folds"][fold.name] = {k: v for k, v in val.items() if k != "trials"}
    seasonal = [f for f in sp.SEASONS if f in res["folds"]]
    a = float(np.mean([res["folds"][f]["brier_gbm_calibrated"] for f in seasonal]))
    b = float(np.mean([res["folds"][f]["brier_scaling_b"] for f in seasonal]))
    res["a_vs_b"] = {
        "rule": f"choose (b) unless (a) validation Brier is better by > {A_VS_B_MARGIN}",
        "mean_validation_brier_a": a,
        "mean_validation_brier_b": b,
        "difference_b_minus_a": b - a,
        "choice": "a" if b - a > A_VS_B_MARGIN else "b",
    }
    res["model_hash"] = dir_hash(out)
    res["_figs"] = figs
    return res


def _auroc(y: Array, p: Array) -> float:
    st = mt.day_stats(np.zeros(len(y), int), y, p)
    return float(mt.from_sums(mt.total(st))["auroc"])


def load(fdir: Path) -> tuple[tr.Corrector, pd.DataFrame]:
    import lightgbm as lgb

    booster = lgb.Booster(model_file=str(fdir / "booster.txt"))
    with (fdir / "iso_logistic.pkl").open("rb") as fh:
        extra = pickle.load(fh)
    meta = json.loads((fdir / "params.json").read_text())
    model = tr.Corrector(booster, extra["iso"], extra["logistic"], meta["features"], meta["params"])
    return model, pd.read_csv(fdir / "scaling_band.csv")


def predict_heldout(t: pd.DataFrame, pre: Any, mdir: Path) -> pd.DataFrame:
    """Add STRATUM / STRATUM_raw / STRATUM_b / LOGIT for each fold's held-out rows.

    Seasonal folds fill the plain columns; the spatial folds fill ``<col>__<fold>`` columns
    (their test rows overlap the seasonal ones)."""
    names = list(pre.correction_model.features)
    cols = fe.columns(names)
    bands = [tuple(b) for b in pre.correction_model.latitude_bands_deg]
    t = t.copy()
    for c in PRED_COLS:
        t[c] = np.nan
    for fold in outer_folds(t):
        model, cells = load(mdir / fold.name)
        rows = fold.test & np.isfinite(t["rhi"].to_numpy(float))
        X = t.loc[rows, cols].to_numpy(float)
        preds = {
            "STRATUM": model.predict(X),
            "STRATUM_raw": model.raw(X),
            "STRATUM_b": sc.predict(t.loc[rows], cells, bands),
            "LOGIT": model.predict_logistic(t.loc[rows, "rhi"].to_numpy(float)),
        }
        seasonal = fold.name in sp.SEASONS
        for c, p in preds.items():
            col = c if seasonal else f"{c}__{fold.name}"
            if col not in t:
                t[col] = np.nan
            t.loc[rows, col] = p
    return t
