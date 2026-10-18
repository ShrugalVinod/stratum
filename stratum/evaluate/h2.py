"""H2 on the Phase 6 harness (build prompt §7.5; paper Table 5).

H2: the STRATUM correction improves on the best published correction (B3). Statistic: mean Brier
skill score of STRATUM vs B3 over the four held-out seasons, days resampled within each season
(paired, 1,000 resamples). **Supported iff the mean ≥ 0.10 and the lower 95 % bound > 0.**

"STRATUM" here is the calibrated boosted model (paper §4.6 "the main model"), decided 18 Oct 2026
before any validation or test number; the option-(b) scaling probability (STRATUM_b), the
uncalibrated model and the RHi-only logistic are reported beside it. Every model is also
compared with B0 (climatology), B1 and B2, descriptively.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from stratum.evaluate import bootstrap as bs
from stratum.evaluate import metrics as mt
from stratum.evaluate import splits as sp
from stratum.evaluate.run import B4_REASON

BASE = ["B0", "B1", "B2", "B3"]
STRATUM_MODELS = ["LOGIT", "STRATUM_b", "STRATUM_raw", "STRATUM"]
REFS = ["B3", "B0", "LOGIT", "B1", "B2"]
H2_MIN = 0.10


def _col(m: str, fold: str, b0_col: str) -> str:
    if m == "B0":
        return b0_col
    if m in STRATUM_MODELS and fold not in sp.SEASONS and not fold.startswith("winter_without"):
        return f"{m}__{fold}"
    return m


def _fold(
    t: pd.DataFrame, fold: sp.Fold, models: list[str], n: int, seed: int, b0_col: str
) -> dict[str, Any]:
    test = t[fold.test & t["y"].notna().to_numpy()]
    out: dict[str, Any] = {
        "test_rows": len(test),
        "test_days": int(test["day"].nunique()),
        "test_y1": int((test["y"] == 1).sum()),
        "dropped": fold.dropped,
    }
    if test.empty:
        return out
    stats = {
        m: mt.day_stats(
            test["day"].to_numpy(),
            test["y"].to_numpy(),
            test[_col(m, fold.name, b0_col)].to_numpy(),
        )
        for m in models
    }
    days = stats["B3"]["days"]
    w = bs.count_matrix(len(days), n, seed)
    out["models"] = {}
    for m in models:
        if not np.array_equal(stats[m]["days"], days):
            out["models"][m] = {"note": "days differ from the reference; skipped"}
            continue
        r = bs.model_metrics(stats[m], w)
        for ref in REFS:
            if ref != m and np.array_equal(stats[ref]["days"], days):
                r[f"bss_vs_{ref}"] = bs.skill_vs(stats[m], stats[ref], w)
        out["models"][m] = r
    out["_stats"] = stats
    return out


def evaluate_h2(
    t: pd.DataFrame, images: pd.DataFrame, n: int = 1000, seed: int = 20261017
) -> dict[str, Any]:
    models = BASE + (["B1_cocip"] if "B1_cocip" in t and t["B1_cocip"].notna().any() else [])
    models += STRATUM_MODELS
    groups = sp.leakage_groups(t, images)
    seasonal = sp.seasonal_folds(t)
    extra = [sp.winter_without_month(t)]
    spatial = sp.spatial_folds(t)
    for f in [*seasonal, *extra, *spatial]:
        sp.assert_no_leak(f, groups, t["flight_id"])
    res: dict[str, Any] = {"models": models, "folds": {}}
    for i, f in enumerate([*seasonal, *extra]):
        res["folds"][f.name] = _fold(t, f, models, n, seed + i, "B0")
    for i, f in enumerate(spatial):
        res["folds"][f.name] = _fold(t, f, models, n, seed + 10 + i, "B0_all")
    # mean skill over the four held-out seasons, every model against every reference
    res["mean_over_seasons"] = {}
    for m in models:
        res["mean_over_seasons"][m] = {}
        for ref in REFS:
            if ref == m:
                continue
            pairs = [
                (res["folds"][f.name]["_stats"][m], res["folds"][f.name]["_stats"][ref])
                for f in seasonal
                if "_stats" in res["folds"][f.name]
                and np.array_equal(
                    res["folds"][f.name]["_stats"][m]["days"],
                    res["folds"][f.name]["_stats"][ref]["days"],
                )
            ]
            if len(pairs) == len(seasonal):
                res["mean_over_seasons"][m][f"bss_vs_{ref}"] = bs.mean_skill_over_folds(
                    pairs, n, seed
                )
    h = res["mean_over_seasons"]["STRATUM"]["bss_vs_B3"]
    res["h2"] = {
        "statistic": "mean BSS of STRATUM vs B3 over the 4 held-out seasons",
        "bss": h,
        "supported": bool(h["value"] >= H2_MIN and h["lo"] > 0),
        "per_season": {
            f.name: res["folds"][f.name]["models"]["STRATUM"].get("bss_vs_B3")
            for f in seasonal
            if "models" in res["folds"][f.name]
        },
        "vs_B0": res["mean_over_seasons"]["STRATUM"].get("bss_vs_B0"),
        "vs_LOGIT": res["mean_over_seasons"]["STRATUM"].get("bss_vs_LOGIT"),
    }
    res["h2"]["sentence"] = sentence(res["h2"])
    for f in res["folds"].values():
        f.pop("_stats", None)
    lab = t[t["y"].notna()]
    seas = lab[lab["season"].isin(sp.SEASONS)]
    res["class_balance"] = {
        str(k): {"labelled": int(g.size), "y1": int(g.sum()), "rate": float(g.mean())}
        for k, g in lab.groupby("season")["y"]
    }
    res["reliability"] = {
        m: mt.reliability(seas["y"], seas[m]).to_dict(orient="records")
        for m in ["B0", "LOGIT", "STRATUM_b", "STRATUM"]
    }
    res["b4"] = {"run": False, "reason": B4_REASON}
    return res


def sentence(h: dict[str, Any]) -> str:
    v = h["bss"]
    verdict = "supported" if h["supported"] else "not supported"
    s = (
        f"On the four held-out seasons, the calibrated STRATUM model's mean Brier skill score "
        f"against the latitude-dependent correction (B3) was {v['value']:.2f} (95 % day-bootstrap "
        f"interval {v['lo']:.2f} to {v['hi']:.2f}); H2 (mean ≥ 0.10 and lower bound > 0) is "
        f"{verdict}."
    )
    if h.get("vs_B0"):
        b = h["vs_B0"]
        s += (
            f" Against climatology (B0) its skill was {b['value']:.2f} "
            f"({b['lo']:.2f} to {b['hi']:.2f})."
        )
    return s
