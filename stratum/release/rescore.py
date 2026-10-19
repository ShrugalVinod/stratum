"""Recompute H1 and H2 from the released segment table (build prompt §8.3, reproduce level 2).

``stratum rescore --release <folder>`` reads ``segments_predictions_labels.parquet`` and runs the
same code as the logged final runs (``stratum.evaluate``: per-day sums, 1,000 paired day
resamples, the pre-registered seed) and prints the result next to the logged one in
``results.json``. The release holds **commercial flights only** (privacy), while the logged runs
used every labelled segment, so the numbers agree closely but not exactly; the difference is
shown. H3 and H4 need the CoCiP energy forcing per segment, which is not in the release.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from stratum.evaluate import bootstrap as bs
from stratum.evaluate import hypotheses as hy
from stratum.evaluate import metrics as mt
from stratum.evaluate import splits as sp

SEED = 20261017  # preregistered.yaml: detection.labelled_split.seed, used by every final run
REFS = ["B3", "RATE", "B0", "LOGIT"]


def h2(t: pd.DataFrame, n: int, seed: int) -> dict[str, Any]:
    """Mean Brier skill of STRATUM over the four held-out seasons, as in evaluate.h2."""
    lab = t[t["y"].notna()]
    stats: dict[str, dict[str, dict[str, Any]]] = {}
    per_season: dict[str, Any] = {}
    for i, season in enumerate(sp.SEASONS):
        test = lab[lab["season"] == season]
        stats[season] = {
            m: mt.day_stats(test["day"].to_numpy(), test["y"].to_numpy(), test[m].to_numpy())
            for m in ["STRATUM", *REFS]
        }
        w = bs.count_matrix(len(stats[season]["B3"]["days"]), n, seed + i)
        per_season[season] = bs.skill_vs(stats[season]["STRATUM"], stats[season]["B3"], w)
        per_season[season]["auroc"] = bs.model_metrics(stats[season]["STRATUM"], w)["auroc"]
    mean = {}
    for ref in REFS:
        pairs = [(stats[s]["STRATUM"], stats[s][ref]) for s in sp.SEASONS]
        mean[ref] = bs.mean_skill_over_folds(pairs, n, seed)
    return {"vs": mean, "per_season": per_season}


def rescore(release: Path, n: int = 1000, seed: int = SEED) -> dict[str, Any]:
    t = pd.read_parquet(release / "segments_predictions_labels.parquet")
    logged = json.loads((release / "results.json").read_text())
    hyp = {h["id"]: h for h in logged.get("hypotheses", [])}
    lab = t[t["y"].notna()]
    r1 = hy.h1(lab, n, seed)
    r2 = h2(t, n, seed)
    return {
        "rows": {"segments": len(t), "labelled": len(lab), "flights": int(t["flight"].nunique())},
        "H1": {"release": r1["ratio"], "logged": hyp.get("H1", {}).get("estimate"),
               "predicted_B1": r1["predicted_B1"], "observed": r1["observed_y1"],
               "efficiency_adjusted": (r1.get("secondary") or {}).get("ratio")},
        "H2": {"release": r2["vs"]["B3"], "logged": hyp.get("H2", {}).get("estimate"),
               "vs_RATE": r2["vs"]["RATE"], "vs_B0": r2["vs"]["B0"], "vs_LOGIT": r2["vs"]["LOGIT"],
               "per_season": r2["per_season"]},
    }  # fmt: skip


def fmt(r: dict[str, float] | None) -> str:
    if not r:
        return "—"
    return f"{r['value']:.3g} [{r['lo']:.3g}, {r['hi']:.3g}]"
