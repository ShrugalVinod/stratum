"""Run every baseline through the same harness (build prompt §6.2–6.6).

``evaluate(table, images, …)`` returns one JSON-able dict with:

* ``folds``: for each held-out season (and winter without January 2026, and both spatial
  directions): per model, every metric with its paired day-bootstrap 95 % interval, and the
  Brier skill score vs B3;
* ``primary``: the pre-registered primary metric, BSS vs B3 averaged over the four held-out
  seasons (days resampled within each season);
* ``reliability``: 10 equal-count bins per model on all seasonal test rows;
* ``h1``: the H1 test (primary, secondary if CoCiP is available), breakdowns, and the same
  ratio under the 1-image and 3-image label rules (sensitivity);
* ``b4``: not run, with the reason.

Rows with a missing label under the primary rule (D-004) are never scored.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from stratum.evaluate import bootstrap as bs
from stratum.evaluate import hypotheses as hy
from stratum.evaluate import metrics as mt
from stratum.evaluate import splits as sp

BASE_MODELS = ["B0", "B1", "B2", "B3"]
REFERENCE = "B3"
B4_REASON = (
    "B4 (Wolf et al. 2025 bivariate quantile mapping) not run: its published coefficients are "
    "fitted to IAGOS flights over the North Atlantic and Europe and do not cover India "
    "(build prompt §6.3: run only if the coefficients apply to our domain)."
)


def models_in(t: pd.DataFrame) -> list[str]:
    extra = ["B1_cocip"] if "B1_cocip" in t and t["B1_cocip"].notna().any() else []
    return BASE_MODELS + extra


def fold_result(
    t: pd.DataFrame, fold: sp.Fold, models: list[str], n: int, seed: int, b0_col: str = "B0"
) -> dict[str, Any]:
    test = t[fold.test & t["y"].notna().to_numpy()]
    out: dict[str, Any] = {"test_rows": len(test), "test_days": int(test["day"].nunique()),
                           "test_y1": int((test["y"] == 1).sum()), "dropped": fold.dropped}  # fmt: skip  # noqa: E501
    if test.empty:
        return out
    stats = {}
    for m in models:
        col = b0_col if m == "B0" else m
        stats[m] = mt.day_stats(test["day"].to_numpy(), test["y"].to_numpy(), test[col].to_numpy())
    days = stats[REFERENCE]["days"]
    w = bs.count_matrix(len(days), n, seed)
    out["models"] = {}
    for m in models:
        if not np.array_equal(stats[m]["days"], days):  # a model with NaN on a whole day
            out["models"][m] = {"note": "days differ from the reference; skipped"}
            continue
        r = bs.model_metrics(stats[m], w)
        r["bss_vs_B3"] = bs.skill_vs(stats[m], stats[REFERENCE], w)
        out["models"][m] = r
    out["_stats"] = stats
    return out


def evaluate(
    t: pd.DataFrame, images: pd.DataFrame, n: int = 1000, seed: int = 20261017
) -> dict[str, Any]:
    models = models_in(t)
    groups = sp.leakage_groups(t, images)
    seasonal = sp.seasonal_folds(t)
    extra = [sp.winter_without_month(t)]
    spatial = sp.spatial_folds(t)
    for f in [*seasonal, *extra, *spatial]:
        sp.assert_no_leak(f, groups, t["flight_id"])
    res: dict[str, Any] = {"models": models, "folds": {}}
    for i, f in enumerate([*seasonal, *extra]):
        res["folds"][f.name] = fold_result(t, f, models, n, seed + i)
    for i, f in enumerate(spatial):
        res["folds"][f.name] = fold_result(t, f, models, n, seed + 10 + i, b0_col="B0_all")
    # primary metric: mean BSS vs B3 over the four held-out seasons
    res["primary"] = {}
    for m in models:
        pairs = [
            (res["folds"][f.name]["_stats"][m], res["folds"][f.name]["_stats"][REFERENCE])
            for f in seasonal
            if "_stats" in res["folds"][f.name]
            and np.array_equal(
                res["folds"][f.name]["_stats"][m]["days"],
                res["folds"][f.name]["_stats"][REFERENCE]["days"],
            )
        ]
        if pairs:
            res["primary"][m] = {"seasons": len(pairs), **bs.mean_skill_over_folds(pairs, n, seed)}
    for f in res["folds"].values():
        f.pop("_stats", None)
    lab = t[t["y"].notna()]
    seas = lab[lab["season"].isin(sp.SEASONS)]
    res["reliability"] = {
        m: mt.reliability(seas["y"], seas[m]).to_dict(orient="records") for m in models
    }
    res["h1"] = hy.h1(lab, n, seed)
    res["h1"]["sentence"] = hy.paper_sentence(res["h1"])
    res["h1"]["breakdowns"] = {
        by: hy.breakdown(lab, by, n, seed)
        for by in ("season", "west_of_80e", "vza_band", "fl_band", "day_night")
    }
    res["h1"]["sensitivity_label_rule"] = {}
    for col in ("y_k1", "y_k3"):
        if col in t:
            alt = t[t[col].notna()].assign(y=lambda d, c=col: d[c])
            r = hy.h1(alt, n, seed)
            res["h1"]["sensitivity_label_rule"][col] = {
                k: r[k] for k in ("segments", "predicted_B1", "observed_y1", "ratio", "supported")
            }
    win = lab[pd.to_datetime(lab["day"]).dt.strftime("%Y-%m") != "2026-01"]
    r = hy.h1(win, n, seed)
    res["h1"]["without_january_2026"] = {k: r[k] for k in ("segments", "ratio", "supported")}
    res["b4"] = {"run": False, "reason": B4_REASON}
    res["data"] = {
        "rows_labelled_primary": len(lab),
        "y1": int((lab["y"] == 1).sum()),
        "days": int(lab["day"].nunique()),
        "by_season": lab.groupby("season")["y"]
        .agg(["size", "sum"])
        .astype(int)
        .to_dict(orient="index"),
    }
    return res
