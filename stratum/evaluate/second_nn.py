"""Second analysis with the learned detector (deviation D-005; Colab 09c). **Descriptive.**

The logged final runs (H1–H4, ``_locks/final_runs.jsonl``) are never changed. This re-labels
the 12 flight days with the learned detector (``track="nn"``: ``interim/detections_nn``,
``interim/matches_nn``), repeats the wrong-day null on the new labels (how many matches are
chance), builds the evaluation table from them and recomputes, with the same code, bootstrap
and seed as the logged runs:

* **H1**: B1-predicted ÷ observed persistent contrails (and the efficiency-adjusted ratio);
* **H2**: STRATUM vs B3 etc., using the **frozen** Phase 7 models (trained on the line-filter
  labels) scored against the new labels. Retraining on the new labels is a separate step.

Output: ``reports/second_analysis_nn/results.json``, with the logged numbers alongside.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from stratum.manifest import is_done


def _labels(root: Path, sub: str) -> pd.DataFrame:
    dirs = [
        d for d in sorted((root / "interim" / sub).glob("**/labels.parquet")) if is_done(d.parent)
    ]
    if not dirs:
        return pd.DataFrame(columns=["segment_id", "flight_id", "y"])
    return pd.concat([pd.read_parquet(f, columns=["segment_id", "flight_id", "y"]) for f in dirs])


def label_counts(root: Path, track: str) -> dict[str, Any]:
    sfx = "" if track == "line" else f"_{track}"
    real, null = _labels(root, f"matches{sfx}"), _labels(root, f"matches_null{sfx}")

    def rate(t: pd.DataFrame) -> float | None:
        lab = t[t["y"].notna()]
        return round(float((lab["y"] == 1).mean()), 5) if len(lab) else None

    r, n = rate(real), rate(null)
    return {
        "labelled": int(real["y"].notna().sum()),
        "y1": int((real["y"] == 1).sum()),
        "flights_with_y1": int(real.loc[real["y"] == 1, "flight_id"].nunique()),
        "y1_rate_real": r,
        "y1_rate_wrong_day": n,
        "chance_share": round(n / r, 3) if r and n is not None else None,
    }


def run(root: Path, pre: Any, config_hash: str, log: Any = print) -> dict[str, Any]:
    from stratum import phase5
    from stratum.evaluate import h2 as h2m
    from stratum.evaluate import hypotheses as hy
    from stratum.evaluate import table as tb
    from stratum.export.web_v1 import build_results
    from stratum.match.matching import rules_from_preregistered
    from stratum.match.run import match_day
    from stratum.model import features as fe
    from stratum.model import run as mr

    lo, hi = pre.matching.min_age_min, pre.matching.max_age_min
    n, seed = pre.bootstrap.n_resamples, pre.detection.labelled_split.seed or 0
    rules = rules_from_preregistered()
    days = phase5._segment_days(root)
    for d in days:
        r = match_day(root, d, None, rules, lo, hi, config_hash, track="nn")
        log(f"  labels {d}: {r.get('status')} y1={r.get('y1')} y0={r.get('y0')}")
    for d, other in zip(days, [*days[1:], days[0]], strict=True):
        r = match_day(root, d, None, rules, lo, hi, config_hash, image_day=other, track="nn")
        log(f"  wrong-day null {d} on {other}: {r.get('status')}")
    counts = {"line": label_counts(root, "line"), "nn": label_counts(root, "nn")}
    log(f"  labels: {counts}")

    t, images, info = tb.build(root, lo, hi, track="nn")
    ev = root / "interim" / "evaluation_nn"
    ev.mkdir(parents=True, exist_ok=True)
    t.to_parquet(ev / "table.parquet", index=False)
    images.to_parquet(ev / "images.parquet", index=False)

    lab = t[t["y"].notna()]
    h1 = hy.h1(lab, n, seed)
    eff = (h1.get("secondary") or {}).get("ratio")
    t = fe.attach(root, t, list(pre.correction_model.features))
    t = mr.predict_heldout(t, pre, mr.model_dir(root))
    h2 = h2m.evaluate_h2(t, images, n, seed)
    logged = {h["id"]: h.get("estimate") for h in build_results(root).get("hypotheses", [])}
    res = {
        "note": "Descriptive second analysis (D-005): labels from the learned detector. "
        "The logged final runs are unchanged.",
        "labels": counts,
        "table": info,
        "H1": {"nn": h1["ratio"], "logged": logged.get("H1"), "predicted_B1": h1["predicted_B1"],
               "observed": h1["observed_y1"], "efficiency_adjusted": eff},
        "H2": {"nn": h2["h2"]["bss"], "logged": logged.get("H2"), "vs_RATE": h2["h2"]["vs_RATE"],
               "vs_B0": h2["h2"]["vs_B0"], "vs_LOGIT": h2["h2"]["vs_LOGIT"],
               "per_season": h2["h2"]["per_season"],
               "auroc": {f: (x.get("models") or {}).get("STRATUM", {}).get("auroc")
                         for f, x in h2["folds"].items()}},
    }  # fmt: skip
    out = root / "reports" / "second_analysis_nn"
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps(res, indent=1, default=str))
    return res
