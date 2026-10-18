"""The humidity correction fed back into the physics (option b with detection efficiency, Team OK
"Option 2", 18 Oct 2026). Training rows only; never scores a held-out season.

For each seasonal outer fold, on that fold's labelled training rows:

* ε = share of CoCiP-persistent segments that are detectable (Driver et al. thresholds);
* band cells (s, τ) fitted with y ~ Bernoulli(ε · σ((RHi/s − 1)/τ)) — used for the corrected
  CoCiP runs (H3, H4, decisions) of the days that fold holds out;
* the same fitted per season × band (reported) and with ε = 1 (the literal form, sensitivity);
* leave-one-day-out validation Brier of the option-(b) probability of an *observed* contrail,
  for the pre-stated (a)-vs-(b) rule against 07a's calibrated boosted model;
* ``n_draws`` day-bootstrap draws of (s per band, ε) for the decision-layer Monte Carlo.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.decide import humidity as hu
from stratum.evaluate import splits as sp
from stratum.model import scaling as sc
from stratum.model import train as tr

A_VS_B_MARGIN = 0.005


def fit_correction(
    t: pd.DataFrame,
    bands: list[tuple[float, float]],
    out: Path,
    n_draws: int,
    seed: int,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    res: dict[str, Any] = {"folds": {}, "n_draws": n_draws, "seed": seed}
    for i, fold in enumerate(sp.seasonal_folds(t)):
        d = t[fold.train & t["y"].notna().to_numpy()]
        d = d[np.isfinite(d["rhi"].to_numpy(float))]
        y = d["y"].to_numpy(float)
        de = sc.detection_efficiency(d)
        band = sc.fit_cells(d, bands, by_season=False, de=de)
        season_band = sc.fit_cells(d, bands, by_season=True, de=de)
        literal = sc.fit_cells(d, bands, by_season=False, de=1.0)
        p_b = sc.lodo_predict(d, bands, de)
        s_draws, de_draws = hu.bootstrap(d, bands, n_draws, seed + i)
        fdir = out / fold.name
        fdir.mkdir(parents=True, exist_ok=True)
        band.to_csv(fdir / "scaling_band.csv", index=False)
        season_band.to_csv(fdir / "scaling_season_band.csv", index=False)
        literal.to_csv(fdir / "scaling_band_literal.csv", index=False)
        np.save(fdir / "s_draws.npy", s_draws)
        np.save(fdir / "de_draws.npy", de_draws)
        res["folds"][fold.name] = {
            "train_rows": len(d),
            "train_pos": int(y.sum()),
            "detection_efficiency": de,
            "de_draws_p05_p95": [
                float(np.percentile(de_draws, 5)),
                float(np.percentile(de_draws, 95)),
            ],
            "brier_scaling_b_de": tr.brier(y, p_b),
            "s_band": band[["band_deg", "s", "tau", "n", "pos", "s_at_bound"]].to_dict(
                orient="records"
            ),
            "s_band_literal": literal[["band_deg", "s", "tau", "s_at_bound"]].to_dict(
                orient="records"
            ),
            "s_draws_p05_p95": [
                [float(np.percentile(s_draws[:, k], 5)), float(np.percentile(s_draws[:, k], 95))]
                for k in range(len(bands))
            ],
            "s_season_band": season_band[
                ["season", "band_deg", "s", "tau", "n", "pos", "s_at_bound"]
            ].to_dict(orient="records"),
        }
    if validation:
        names = [f for f in sp.SEASONS if f in validation["folds"] and f in res["folds"]]
        a = float(np.mean([validation["folds"][f]["brier_gbm_calibrated"] for f in names]))
        b = float(np.mean([res["folds"][f]["brier_scaling_b_de"] for f in names]))
        res["a_vs_b"] = {
            "rule": f"choose (b) unless (a) validation Brier is better by > {A_VS_B_MARGIN}",
            "mean_validation_brier_a": a,
            "mean_validation_brier_b": b,
            "difference_b_minus_a": b - a,
            "choice": "a" if b - a > A_VS_B_MARGIN else "b",
            "folds": names,
        }
    (out / "summary.json").write_text(json.dumps(res, indent=1, default=str))
    return res
