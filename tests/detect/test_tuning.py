"""Detector tuning on expert labels (D-002): weights, out-of-fold threshold, scoring, CIs."""

import numpy as np
import pandas as pd

from stratum.detect import tuning as tu
from stratum.detect.params import load_detector_params


def _objects(n: int, seed: int) -> pd.DataFrame:
    """Synthetic objects: real contrails are long, strong and linear; the rest are not."""
    rng = np.random.default_rng(seed)
    on = rng.random(n) < 0.3
    return pd.DataFrame(
        {
            "scene": rng.integers(0, 20, n),
            "on_expert": on,
            "mean_response": np.where(on, 11, 8) + rng.normal(0, 1.5, n),
            "length_px": np.where(on, 30, 15) + rng.normal(0, 6, n),
            "line_residual_px": np.where(on, 0.4, 0.8) + rng.normal(0, 0.2, n),
            "btd_contrast_k": rng.normal(0.5, 0.2, n),
            "cold_k": rng.normal(0.3, 1.0, n),
            "flank_asymmetry": np.where(on, 0.2, 0.5) + rng.normal(0, 0.15, n),
        }
    )


def test_fitted_weights_rank_contrails_higher_and_round_trip() -> None:
    df = _objects(2000, 1)
    w = tu.fit_weights(df)
    assert w.response > 0 and w.length > 0 and w.linearity < 0 and w.edge < 0
    conf = tu.score(df, w)
    assert conf[df["on_expert"]].mean() > conf[~df["on_expert"]].mean() + 0.3
    # the weights in physical units reproduce the detector's own confidence formula
    from stratum.detect.run import confidence

    p = load_detector_params().model_copy(update={"confidence": w})
    r = df.iloc[0]
    c = confidence(
        r.mean_response,
        r.length_px,
        r.line_residual_px,
        r.btd_contrast_k,
        r.cold_k,
        r.flank_asymmetry,
        p,
    )
    assert abs(c - conf[0]) < 1e-9


def test_out_of_fold_never_scores_its_own_scenes() -> None:
    df = _objects(600, 2)
    oof = tu.out_of_fold(df, folds=5)
    assert np.isfinite(oof).all()
    # a model that sees the scene would score its own objects better on average
    full = tu.score(df, tu.fit_weights(df))
    y = df["on_expert"].to_numpy()

    def auc(s: np.ndarray) -> float:
        pos, neg = s[y], s[~y]
        return float((pos[:, None] > neg[None, :]).mean())

    assert auc(oof) <= auc(full) + 1e-9


def test_prf_and_bootstrap_ci() -> None:
    c = pd.DataFrame({"det": [4, 2, 0], "exp": [3, 3, 1], "tp": [2, 1, 0], "hit": [3, 1, 0]})
    m = tu.prf(c)
    assert m["precision"] == 3 / 6 and m["recall"] == 3 / 7 and m["f1"] == 6 / 13
    assert m["recall_lenient"] == 4 / 7
    ci = tu.bootstrap_ci(c, seed=20261017, n=500)
    assert ci["f1"][0] <= m["f1"] <= ci["f1"][1]


def test_search_space_is_fixed_before_tuning() -> None:
    # stage 1 reaches beyond the first grid's edge; stage 2 has 16 combinations
    assert max(h[0] for h in tu.HYSTERESIS) > 5.5
    assert len(tu.stage2_grid(load_detector_params())) == 16
