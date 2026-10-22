"""Website extras on synthetic data: per-card TreeSHAP, probability-weighted physics (D-006)
and the "Beat STRATUM" pool."""

import numpy as np
import pandas as pd
import pytest
from scipy.special import logit

from stratum.decide import weighted as wd
from stratum.export import explain as xp
from stratum.export import game
from stratum.model import train as tr
from tests.model.test_decide import PL_15JAN
from tests.model.test_model import COLS, MONO, NAMES, _year


def _model() -> tr.Corrector:
    t, _ = _year(per_day=200)
    X, y = t[COLS].to_numpy(float), t["y"].to_numpy(float)
    params = {"num_leaves": 7, "learning_rate": 0.1, "min_data_in_leaf": 20,
              "feature_fraction": 1.0, "bagging_fraction": 1.0, "lambda_l2": 1.0}  # fmt: skip
    b = tr.fit_gbm(X, y, {**params, "num_boost_round": 40}, MONO, 0)
    p = np.asarray(b.predict(X), float)
    return tr.Corrector(b, tr.fit_isotonic(p, y), tr.fit_logistic(t["rhi"].to_numpy(float), y),
                        NAMES, params)  # fmt: skip


def test_explanations_add_up_and_explain_the_most_likely_segment() -> None:
    m = _model()
    t, _ = _year(seed=1, per_day=30)
    t["time_mid"] = pd.Timestamp("2026-01-15 03:00")
    t["alt_ft_mid"] = 36_000.0
    part = t.iloc[:10].copy()
    part.loc[part.index[3], "rhi"] = np.nan  # no ERA5: skipped, not explained
    base, items = xp.explain_parts(m, NAMES, [("card_a", part), ("card_b", t.iloc[[]])])
    assert set(items) == {"card_a"}  # an empty portion gives no card
    it = items["card_a"]
    ok = part[np.isfinite(part["rhi"])]
    best = ok.iloc[int(np.argmax(m.predict(ok[COLS].to_numpy(float))))]
    assert it["x"][NAMES.index("rhi_at_level")] == float(f"{best['rhi']:.4g}")
    raw = float(m.raw(best[COLS].to_numpy(float)[None])[0])
    assert abs(base + sum(it["phi"]) - logit(raw)) < 1e-2  # log-odds add up
    assert abs(it["score"] - logit(raw)) < 1e-2 and len(it["phi"]) == len(NAMES)


def test_weight_is_p_over_detection_efficiency_capped_at_one() -> None:
    w = wd.weight([0.01, 0.08, 0.5, np.nan], 0.16)
    assert np.allclose(w[:3], [0.0625, 0.5, 1.0]) and np.isnan(w[3])


def test_weighted_ef_lines_up_rows_with_waypoints() -> None:
    frames = pd.DataFrame({"flight_id": ["a|0"] * 3 + ["a|+2000"] * 3})
    ef = pd.DataFrame({"flight_id": ["a|0"] * 3 + ["a|+2000"] * 2,
                       "waypoint": [0, 1, 2, 0, 2], "ef": [1e9, 2e9, 4e9, 8e9, 1e9]})  # fmt: skip
    p = np.array([0.16, 0.08, 0.0, 0.016, 0.5, 0.16])
    out = wd.weighted_ef(ef, frames, p, 0.16)
    assert np.isclose(out["a|0"], 1e9 + 0.5 * 2e9)  # third row: w = 0
    assert np.isclose(out["a|+2000"], 0.1 * 8e9 + 1e9)  # missing waypoint 1 = no contrail
    assert list(out.index) == ["a|0", "a|+2000"]


def test_top_portions_keep_the_strongest_weighted_warmers_whole() -> None:
    t0 = pd.Timestamp("2026-01-15")
    seg = pd.DataFrame({
        "flight_id": ["A"] * 6 + ["B"] * 3,
        "segment_id": [f"A{i}" for i in range(6)] + [f"B{i}" for i in range(3)],
        "time_start": [t0 + pd.Timedelta(minutes=m) for m in (0, 1, 2, 30, 31, 32, 0, 1, 2)],
    })  # fmt: skip
    dom = pd.DataFrame({
        "segment_id": seg["segment_id"], "flight_id": seg["flight_id"],
        "commercial": [True] * 6 + [False] * 3,
        "persistent_1": [1, 1, 0, 1, 1, 1, 1, 1, 1], "ef_b1": [5e9, 5e9, 0, 1e9, 1e9, 1e9, 9e10, 9e10, 9e10],
        "w": [1.0] * 9,
    })  # fmt: skip
    dom["ef_w"] = dom["w"] * dom["ef_b1"]
    keep = wd.top_portions(seg, dom, top=1)
    assert keep == {"A0", "A1"}  # B is not commercial; A's first portion is the stronger
    assert wd.top_portions(seg, dom, top=5) == {"A0", "A1", "A3", "A4", "A5"}


def test_game_pool_is_balanced_one_round_per_flight_and_split_by_physics() -> None:
    rng = np.random.default_rng(0)
    n = 400
    t = pd.DataFrame({
        "segment_id": [f"s{i}" for i in range(n)], "flight_id": [f"f{i // 2}" for i in range(n)],
        "commercial": True, "STRATUM": rng.uniform(0, 0.1, n),
        "y": (rng.random(n) < 0.3).astype(float), "B1_cocip": (rng.random(n) < 0.3).astype(float),
        "n_observable": rng.integers(0, 6, n), "n_matched_observable": rng.integers(0, 4, n),
    })  # fmt: skip
    pool = game.pick(t, seed=1)
    assert (pool["y"] == 1).sum() == game.N_POS and (pool["y"] == 0).sum() == game.N_NEG
    assert pool["flight_id"].is_unique
    neg = pool[pool["y"] == 0]
    assert (neg["B1_cocip"] == 1).sum() == game.N_NEG // 2
    assert (pool.loc[pool["y"] == 1, "n_matched_observable"] >= 2).all()
    assert (neg["n_observable"] >= 3).all()
    assert game.round_id("s1", "salt-a") != game.round_id("s1", "salt-b")


def test_game_shows_the_matched_image_nearest_45_minutes() -> None:
    per = pd.DataFrame({
        "image_time": pd.to_datetime(["2026-01-15 03:00", "2026-01-15 03:15", "2026-01-15 03:30"]),
        "age_min": [20.0, 35.0, 50.0], "observable": [True, True, True],
        "matched": [True, True, False],
    })  # fmt: skip
    assert game._slot_rows(per, seen=True)["age_min"].tolist() == [35.0]
    assert game._slot_rows(per, seen=False)["age_min"].tolist() == [50.0]


def test_game_export_on_the_synthetic_matching_day(tmp_path) -> None:  # type: ignore[no-untyped-def]
    import json

    from stratum.detect.params import load_detector_params
    from stratum.match import run as mrun
    from tests.match.test_run import DAY, build_root

    root = build_root(tmp_path / "drive")
    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    assert mrun.match_day(root, DAY, det_params=p)["status"] == "done"
    md = root / "interim" / "matches" / "2026-01" / "2026-01-01"
    lab = pd.read_parquet(md / "labels.parquet")
    per = pd.read_parquet(md / "per_slot.parquet")
    g = per.assign(om=per["observable"] & per["matched"]).groupby("segment_id")
    t = lab[["segment_id", "y"]].assign(
        flight_id=lambda x: "f" + x["segment_id"], day="2026-01-01", commercial=True,
        n_observable=lambda x: x["segment_id"].map(g["observable"].sum()),
        n_matched_observable=lambda x: x["segment_id"].map(g["om"].sum()),
        B1_cocip=lambda x: (x["segment_id"] == "B").astype(float),
    )  # fmt: skip
    (root / "interim" / "evaluation").mkdir(parents=True)
    t.to_parquet(root / "interim" / "evaluation" / "table.parquet")
    (root / "interim" / "model_predictions").mkdir(parents=True)
    pd.DataFrame(
        {"segment_id": t["segment_id"], "STRATUM": [0.09, 0.02, 0.03, 0.01][: len(t)]}
    ).to_parquet(root / "interim" / "model_predictions" / "heldout.parquet")
    out = tmp_path / "game"
    r = game.export(root, out, "a-test-salt-that-is-long-enough", track="line", n_pos=1, n_neg=2)
    idx = json.loads((out / "index.json").read_text())
    assert r["rounds"] == len(idx["rounds"]) >= 2 and r["seen"] == 1
    seen = next(x for x in idx["rounds"] if x["seen"])
    assert seen["stratum_says"] and (out / "img" / seen["slot"]["img"]).exists()
    assert set(seen["wx"]) == set(game.WX) and seen["fl"] == 360
    assert all("segment_id" not in x and "flight_id" not in x for x in idx["rounds"])  # no raw ids


@pytest.mark.slow
@pytest.mark.skipif(not PL_15JAN.exists(), reason="needs the local 15 Jan 2026 ERA5 test day")
def test_weighted_chain_on_the_15_jan_issr_crossing() -> None:
    """Planned + alternatives: STRATUM rebuilt at each level, B1 CoCiP per segment, Σ w·EF."""
    import xarray as xr
    from pycontrails import MetDataset

    from stratum.decide import run as dr
    from stratum.met.features import PL_VARS, tropopause_grid
    from stratum.met.interp import MetGrid
    from stratum.physics import cocip_runner as cr
    from tests.model.test_decide import _issr_flight

    pl = xr.open_zarr(PL_15JAN).load()
    tt = xr.open_zarr(str(PL_15JAN).replace("/pl/", "/tropo_T/")).load()
    rad = MetDataset(xr.open_zarr(str(PL_15JAN).replace("/pl/", "/sl/")).load())
    seg = _issr_flight()
    frames, _ = dr._variant_frames(seg, {f"TEST_{i:04d}" for i in range(15, 25)}, [-2000, 2000])
    p = wd.variant_weights(
        frames, _model(), NAMES, MetGrid.from_dataset(pl, PL_VARS), tropopause_grid(pl, tt)
    )
    assert len(p) == len(frames) and np.isfinite(p).mean() > 0.9
    lvl = frames.assign(p=p).groupby("flight_id")["p"].mean()
    assert lvl.max() > lvl.min()  # the alternatives see different air
    flights = cr.segments_to_flights(frames)
    ef = wd._ef_rows(flights, MetDataset(pl), rad, None, 6.0)
    w = wd.weighted_ef(ef, frames, p, 0.16)
    assert set(w.index) == set(frames["flight_id"]) and np.isfinite(w).all()
    raw = ef.groupby("flight_id")["ef"].sum().reindex(w.index, fill_value=0.0)
    assert (w.abs() <= raw.abs() + 1e-6).all()  # w ≤ 1 can only shrink each segment's EF
