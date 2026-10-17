"""Tune the detector on expert-labelled scenes (deviation D-002; build prompt §5.1).

What it does
------------
The DLR dataset (``stratum/labelling/dlr.py``) gives 140 SEVIRI scenes of 256 × 256 px with
contrails drawn by three experts. The dataset's own split is kept: **51 training scenes** to
tune on, **89 evaluation scenes** to check on. Nothing about the evaluation scenes is used for
any choice.

1. **Detector settings** (``configs/pipeline.yaml: detector``, not pre-registered) are chosen by
   a two-stage grid search on the training scenes only (``HYSTERESIS``, ``STAGE2``).
2. **Confidence weights**: a logistic regression on the six object features the detector
   already uses (filter response, length, line-fit residual, BTD contrast, cold T10.8 check,
   flank asymmetry). Target: does the object lie on an expert contrail (``pair_match``, the
   same rule as labeller agreement: mean distance ≤ 2 px over ≥ 50 % of the shorter line,
   ≤ 20°). L2-penalised, fitted on standardised features, stored in physical units.
3. **Operating threshold**: the confidence that maximises object F1 on the training scenes,
   using out-of-fold confidences (5 folds by scene), so the threshold is not chosen on scores
   the model was fitted to.
4. **Check** on the evaluation scenes: precision, recall and F1 with 95 % scene-bootstrap CIs.

Scoring is one-to-one (Hungarian), exactly like labeller agreement: precision = matched
detections / detections, recall = matched expert lines / expert lines. Expert lines shorter than
10 px are dropped (pre-registered ``labelling_rules.min_contrail_length_px``), as for our own
labels. A "lenient" recall (an expert line counts as found if any detection lies on it) is
reported as well, because the detector may split one long contrail into pieces.

Frame: detection runs on the netCDF arrays as stored (rows = file rows); expert lines are
mapped to the same frame (``dlr.expert_polylines`` with no flips). Checked on the real files:
detections lie on the expert pixel mask as stored, not on its flipped copy.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.detect.params import ConfidenceWeights, DetectorParams
from stratum.detect.run import detect_slot
from stratum.labelling import agreement as ag
from stratum.labelling import dlr

Array = npt.NDArray[np.float64]
FEATURES = [
    "mean_response",
    "length_px",
    "line_residual_px",
    "btd_contrast_k",
    "cold_k",
    "flank_asymmetry",
]
WEIGHT_NAMES = ["response", "length", "linearity", "btd_contrast", "cold", "edge"]
THRESHOLDS = np.round(np.arange(0.05, 0.96, 0.05), 2)
FOLDS = 5
L2_C = 1.0

# Settings searched on the training scenes, in two stages (everything else stays as in
# pipeline.yaml): stage 1 = hysteresis thresholds alone; stage 2 = the other four settings
# together, at the stage-1 winner. A first single-stage grid (17 Oct 2026) put the best
# hysteresis at the edge of its range, so stage 1 reaches higher.
HYSTERESIS = [(3.5, 6.0), (4.5, 7.0), (5.5, 8.0), (6.5, 9.5), (7.5, 11.0), (9.0, 13.0)]
STAGE2: dict[str, list[Any]] = {
    "noise_px": [41, 81],
    "max_flank_asymmetry": [0.8, 1.5],
    "max_orientation_spread_deg": [15.0, 25.0],
    "max_line_residual_px": [1.2, 2.0],
}
SEARCH_KEYS = ["hysteresis", *STAGE2]


@dataclass
class Scene:
    k: int
    arrays: dict[str, Any]
    vza: Array
    coast: npt.NDArray[np.bool_]
    experts: list[Array]


def load_scene(dlr_dir: Path, k: int, coast_buffer_px: int = 2) -> Scene:
    a = dlr.scene_arrays(dlr_dir / "data" / f"scene_{k:03d}.nc")
    vza = 90.0 - np.asarray(a["sat_elevation_angle"], float)
    land = (np.nan_to_num(a["land_sea_mask"]) > 50).astype(np.uint8)
    edge = cv2.morphologyEx(land, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    b = coast_buffer_px
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * b + 1, 2 * b + 1))
    coast = cv2.dilate(edge, kern).astype(bool) if b > 0 else edge.astype(bool)
    lines = dlr.expert_polylines(
        dlr_dir / "geojson" / f"scene_{k:03d}.geojson", dlr.Orientation(False, False)
    )
    experts = [np.asarray(x, float) for x in lines]
    experts = [e for e in experts if ag.length(e) >= ag.MIN_LENGTH_PX]
    return Scene(k, a, vza, coast, experts)


def detect_scene(s: Scene, p: DetectorParams) -> pd.DataFrame:
    a = s.arrays
    df, _ = detect_slot(
        a["IR108"], a["IR120"], a["latitude"], a["longitude"], s.vza, p, s.coast, s.k
    )
    df["scene"] = s.k
    polys = [np.column_stack([r, c]) for r, c in zip(df["poly_row"], df["poly_col"], strict=True)]
    df["on_expert"] = [any(ag.pair_match(d, e) is not None for e in s.experts) for d in polys]
    return df


def features(df: pd.DataFrame) -> Array:
    x: Array = df[FEATURES].to_numpy(float).copy()
    x[:, FEATURES.index("cold_k")] = np.clip(x[:, FEATURES.index("cold_k")], -5.0, 5.0)
    return x


def fit_weights(df: pd.DataFrame) -> ConfidenceWeights:
    """L2 logistic regression (standardised features) → weights in physical units."""
    from sklearn.linear_model import LogisticRegression

    x, y = features(df), df["on_expert"].to_numpy(bool)
    mu, sd = x.mean(axis=0), np.maximum(x.std(axis=0), 1e-9)
    m = LogisticRegression(C=L2_C, max_iter=2000).fit((x - mu) / sd, y)
    w = m.coef_[0] / sd
    b = float(m.intercept_[0] - np.sum(m.coef_[0] * mu / sd))
    return ConfidenceWeights(
        intercept=round(b, 4),
        **{n: round(float(v), 4) for n, v in zip(WEIGHT_NAMES, w, strict=True)},
    )


def score(df: pd.DataFrame, w: ConfidenceWeights) -> Array:
    z = w.intercept + features(df) @ np.array([getattr(w, n) for n in WEIGHT_NAMES])
    out: Array = 1.0 / (1.0 + np.exp(-z))
    return out


def out_of_fold(df: pd.DataFrame, folds: int = FOLDS) -> Array:
    """Confidence of each object from a model fitted without its scene's fold."""
    scenes = np.array(sorted(df["scene"].unique()))
    fold_of = {s: i % folds for i, s in enumerate(scenes)}
    f = df["scene"].map(fold_of).to_numpy()
    out = np.full(len(df), np.nan)
    for i in range(folds):
        tr = f != i
        if df.loc[tr, "on_expert"].nunique() < 2:
            continue
        out[~tr] = score(df[~tr], fit_weights(df[tr]))
    return out


def scene_counts(dets: pd.DataFrame, scenes: list[Scene], conf: Array, th: float) -> pd.DataFrame:
    """Per scene: detections, expert lines, one-to-one matches, lenient expert hits."""
    rows = []
    keep = conf >= th
    for s in scenes:
        sel = (dets["scene"].to_numpy() == s.k) & keep
        d = dets[sel]
        polys = [np.column_stack([r, c]) for r, c in zip(d["poly_row"], d["poly_col"], strict=True)]
        tp = len(ag.match_objects(polys, s.experts))
        hit = sum(any(ag.pair_match(x, e) is not None for x in polys) for e in s.experts)
        rows.append({"scene": s.k, "det": len(polys), "exp": len(s.experts), "tp": tp, "hit": hit})
    return pd.DataFrame(rows)


def prf(c: pd.DataFrame) -> dict[str, float]:
    det, exp, tp, hit = (float(c[k].sum()) for k in ("det", "exp", "tp", "hit"))
    p = tp / det if det else float("nan")
    r = tp / exp if exp else float("nan")
    f1 = 2 * tp / (det + exp) if det + exp else float("nan")
    return {
        "precision": p,
        "recall": r,
        "f1": f1,
        "recall_lenient": hit / exp if exp else float("nan"),
    }


def bootstrap_ci(c: pd.DataFrame, seed: int, n: int = 2000) -> dict[str, list[float]]:
    rng = np.random.default_rng(seed)
    vals: dict[str, list[float]] = {k: [] for k in ("precision", "recall", "f1", "recall_lenient")}
    arr = c[["det", "exp", "tp", "hit"]].to_numpy(float)
    for _ in range(n):
        b = arr[rng.integers(0, len(arr), len(arr))].sum(axis=0)
        det, exp, tp, hit = b
        vals["precision"].append(tp / det if det else np.nan)
        vals["recall"].append(tp / exp if exp else np.nan)
        vals["f1"].append(2 * tp / (det + exp) if det + exp else np.nan)
        vals["recall_lenient"].append(hit / exp if exp else np.nan)
    return {
        k: [round(float(np.nanpercentile(v, 2.5)), 3), round(float(np.nanpercentile(v, 97.5)), 3)]
        for k, v in vals.items()
    }


def best_threshold(dets: pd.DataFrame, scenes: list[Scene], conf: Array) -> tuple[float, float]:
    best = (0.5, -1.0)
    for th in THRESHOLDS:
        f1 = prf(scene_counts(dets, scenes, conf, float(th)))["f1"]
        if f1 > best[1] + 1e-12:
            best = (float(th), f1)
    return best


def evaluate_settings(p: DetectorParams, train: list[Scene]) -> dict[str, Any]:
    """Tuning objective for one detector setting: best out-of-fold F1 on the training scenes."""
    dets = pd.concat([detect_scene(s, p) for s in train], ignore_index=True)
    if dets["on_expert"].nunique() < 2:
        return {"f1": 0.0, "threshold": 0.5, "objects": len(dets)}
    th, f1 = best_threshold(dets, train, out_of_fold(dets))
    return {"f1": f1, "threshold": th, "objects": len(dets)}


def stage2_grid(base: DetectorParams) -> list[tuple[dict[str, Any], DetectorParams]]:
    keys = list(STAGE2)
    out = []
    for combo in itertools.product(*(STAGE2[k] for k in keys)):
        ch = dict(zip(keys, combo, strict=True))
        out.append((ch, base.model_copy(update=ch)))
    return out


def _record(ch: dict[str, Any], p: DetectorParams, r: dict[str, Any], stage: int) -> dict[str, Any]:
    vals = {k: getattr(p, k) for k in SEARCH_KEYS}
    vals["hysteresis"] = list(vals["hysteresis"])
    return {"stage": stage, **vals, **r}


def tune(dlr_dir: Path, base: DetectorParams, seed: int, log: Any = print) -> dict[str, Any]:
    """Full D-002 tuning: grid search + refit + threshold on training; check on evaluation."""
    train = [load_scene(dlr_dir, k, base.coast_buffer_px) for k in dlr.TRAINING]
    evals = [load_scene(dlr_dir, k, base.coast_buffer_px) for k in dlr.EVALUATION]

    search = []
    for h in HYSTERESIS:
        p1 = base.model_copy(update={"hysteresis": h})
        r = evaluate_settings(p1, train)
        search.append(_record({"hysteresis": h}, p1, r, 1))
        log(f"  stage 1 {h} → out-of-fold F1 {r['f1']:.3f} at {r['threshold']}")
    s1 = [x for x in search if x["stage"] == 1]
    best_h = tuple(s1[int(np.argmax([x["f1"] for x in s1]))]["hysteresis"])
    for ch, p2 in stage2_grid(base.model_copy(update={"hysteresis": best_h})):
        r = evaluate_settings(p2, train)
        search.append(_record(ch, p2, r, 2))
        log(f"  stage 2 {ch} → out-of-fold F1 {r['f1']:.3f} at {r['threshold']}")
    best_i = int(np.argmax([x["f1"] for x in search]))
    best = {k: search[best_i][k] for k in SEARCH_KEYS}
    p = base.model_copy(update={k: tuple(v) if k == "hysteresis" else v for k, v in best.items()})

    dtr = pd.concat([detect_scene(s, p) for s in train], ignore_index=True)
    w = fit_weights(dtr)
    th, _ = best_threshold(dtr, train, out_of_fold(dtr))
    p = p.model_copy(update={"confidence": w, "operating_threshold": th})

    dev = pd.concat([detect_scene(s, p) for s in evals], ignore_index=True)
    ctr = scene_counts(dtr, train, score(dtr, w), th)
    cev = scene_counts(dev, evals, score(dev, w), th)
    # the settings in pipeline.yaml before tuning, on the same evaluation scenes, for comparison
    dold = pd.concat([detect_scene(s, base) for s in evals], ignore_index=True)
    cold = scene_counts(dold, evals, dold["confidence"].to_numpy(float), base.operating_threshold)
    return {
        "dataset": dlr.CREDIT,
        "doi": dlr.DOI,
        "training_scenes": len(train),
        "evaluation_scenes": len(evals),
        "expert_lines": {"training": int(ctr["exp"].sum()), "evaluation": int(cev["exp"].sum())},
        "search": search,
        "chosen_settings": best,
        "confidence_weights": w.model_dump(),
        "operating_threshold": th,
        "training_in_sample": {k: round(v, 3) for k, v in prf(ctr).items()},
        "evaluation": {k: round(v, 3) for k, v in prf(cev).items()},
        "evaluation_ci95": bootstrap_ci(cev, seed),
        "evaluation_before_tuning": {k: round(v, 3) for k, v in prf(cold).items()},
        "evaluation_before_tuning_ci95": bootstrap_ci(cold, seed),
        "evaluation_per_scene": cev.to_dict(orient="records"),
        "params": p,
    }
