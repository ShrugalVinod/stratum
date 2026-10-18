"""Split leakage tests and the H1 rule (build prompt §6.2, §6.6)."""

import numpy as np
import pandas as pd
import pytest

from stratum.evaluate import hypotheses as hy
from stratum.evaluate import splits as sp


def _table() -> tuple[pd.DataFrame, pd.DataFrame]:
    rows, imgs = [], []
    days = ["2025-03-01", "2025-07-01", "2025-11-01", "2026-01-01", "2026-02-01"]
    for d in days:
        for f in range(4):
            for k in range(3):
                sid = f"{d}_f{f}_{k}"
                rows.append({"segment_id": sid, "flight_id": f"{d}_f{f}", "day": d,
                             "lon_mid": 70.0 + 4.5 * f + k, "month": int(d[5:7])})  # fmt: skip
                imgs.append({"segment_id": sid, "image_time": f"{d} 0{k}:00"})
    t = pd.DataFrame(rows)
    t["season"] = sp.season_of(t["month"])
    return t, pd.DataFrame(imgs)


def test_seasonal_folds_have_no_leak_and_cover_everything() -> None:
    t, im = _table()
    g = sp.leakage_groups(t, im)
    folds = sp.seasonal_folds(t)
    assert sum(f.test.sum() for f in folds) == len(t)
    for f in folds:
        sp.assert_no_leak(f, g, t["flight_id"])
        assert not (f.train & f.test).any()
    wj = sp.winter_without_month(t)
    assert t.loc[wj.test, "day"].str.startswith("2026-02").all()


def test_leak_is_detected() -> None:
    t, im = _table()
    im = pd.concat(
        [
            im,
            pd.DataFrame(
                {"segment_id": [t.segment_id.iloc[0]], "image_time": ["2025-07-01 00:00"]}
            ),
        ]
    )
    g = sp.leakage_groups(t, im)  # one March segment now shares an image with July
    with pytest.raises(AssertionError):
        sp.assert_no_leak(sp.seasonal_folds(t)[0], g, t["flight_id"])


def test_spatial_split_keeps_each_flight_on_one_side() -> None:
    t, im = _table()
    for f in sp.spatial_folds(t):
        sp.assert_no_leak(f, sp.leakage_groups(t, im), t["flight_id"])
        assert f.dropped > 0  # flights crossing 80°E lose their minority-side segments


def test_validation_days_inside_training() -> None:
    t, _ = _table()
    f = sp.seasonal_folds(t)[0]
    v = sp.validation_days(t, f.train)
    assert all(not (val & f.test).any() and not (fit & val).any() for _, fit, val in v)


def test_h1_supported_only_if_whole_ci_below_one() -> None:
    rng = np.random.default_rng(0)
    n = 20 * 500
    day = np.repeat([f"d{i:02d}" for i in range(20)], 500)
    y = (rng.random(n) < 0.10).astype(float)
    under = pd.DataFrame({"day": day, "y": y, "B1": (rng.random(n) < 0.05).astype(float)})
    equal = under.assign(B1=(rng.random(n) < 0.10).astype(float))
    r1, r2 = hy.h1(under, 1000, 1), hy.h1(equal, 1000, 1)
    assert r1["supported"] and r1["ratio"]["hi"] < 1
    assert not r2["supported"] and r2["ratio"]["lo"] < 1 < r2["ratio"]["hi"]
    assert "H1 is supported" in hy.paper_sentence(r1)


def test_h1_secondary_efficiency_adjustment() -> None:
    t = pd.DataFrame({"day": ["a", "a", "b", "b"], "y": [1.0, 0, 1, 0], "B1": [1.0, 1, 0, 0],
                      "cocip_contrail": [True, True, True, False], "detectable": [True, False, False, False]})  # fmt: skip
    r = hy.h1(t, 100, 1)
    s = r["secondary"]
    assert s["detection_efficiency"] == round(1 / 3, 4)
    assert abs(s["ratio"]["value"] - 2 / (2 / (1 / 3))) < 1e-12  # 2 predicted / (2 observed ÷ ⅓)


def test_paper_paragraph_states_each_outcome() -> None:
    base = {"segments": 100, "days": 5, "predicted_B1": 50, "observed_y1": 10,
            "sensitivity_label_rule": {"y_k1": {"supported": False}}}  # fmt: skip
    over = {**base, "ratio": {"value": 5.0, "lo": 3.0, "hi": 7.0}, "supported": False}
    under = {**base, "ratio": {"value": 0.5, "lo": 0.3, "hi": 0.8}, "supported": True}
    unclear = {**base, "ratio": {"value": 1.1, "lo": 0.7, "hi": 1.6}, "supported": False}
    assert "opposite of the hypothesis" in hy.paper_paragraph({"h1": over})
    assert "as hypothesised" in hy.paper_paragraph({"h1": under})
    assert "not robust" in hy.paper_paragraph({"h1": under})
    assert "cannot tell" in hy.paper_paragraph({"h1": unclear})
