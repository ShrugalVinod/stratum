"""Phase 7 correction model (build prompt §7.3–7.5): monotonicity, calibration, scaling factor,
held-out discipline and H2 on a synthetic year."""

from pathlib import Path

import numpy as np
import pandas as pd
from hypothesis import given, settings
from hypothesis import strategies as st
from scipy.special import expit
from sklearn.metrics import roc_auc_score

from stratum import config as cfg
from stratum.evaluate import h2 as h2m
from stratum.evaluate import metrics as mt
from stratum.evaluate import splits as sp
from stratum.model import features as fe
from stratum.model import run as mr
from stratum.model import scaling as sc
from stratum.model import train as tr

PRE = cfg.load_preregistered()
NAMES = list(PRE.correction_model.features)
COLS = fe.columns(NAMES)
MONO = fe.monotone_vector(NAMES, dict(PRE.correction_model.monotone))


def _year(seed: int = 0, per_day: int = 700) -> tuple[pd.DataFrame, pd.DataFrame]:
    """One synthetic day per month; y depends on RHi (+) and T − T_LM (−)."""
    rng = np.random.default_rng(seed)
    rows, imgs = [], []
    days = [f"{m}-15" for m in pd.period_range("2025-03", "2026-02", freq="M").strftime("%Y-%m")]
    for d in days:
        n = per_day
        f = pd.DataFrame({c: rng.normal(size=n) for c in COLS})
        f["rhi"] = rng.uniform(0.6, 1.3, n)
        f["temp_minus_TLM"] = rng.uniform(-12, 0, n)
        f["lat_mid"] = rng.uniform(6, 37, n)
        f["lon_mid"] = rng.uniform(68, 98, n)
        logit = 9 * (f["rhi"] - 1.15) - 0.25 * (f["temp_minus_TLM"] + 6) - 3.5
        f["y"] = (rng.random(n) < expit(logit)).astype(float)
        f["segment_id"] = [f"{d}_{i}" for i in range(n)]
        f["flight_id"] = [f"{d}_f{i // 50}" for i in range(n)]
        f["day"] = d
        rows.append(f)
        imgs.append(pd.DataFrame({"segment_id": f["segment_id"],
                                  "image_time": [f"{d} {i // 50:02d}:00" for i in range(n)]}))  # fmt: skip
    t = pd.concat(rows, ignore_index=True)
    t["month"] = pd.to_datetime(t["day"]).dt.month
    t["season"] = sp.season_of(t["month"])
    for m in ("B1", "B2", "B3"):
        t[m] = (t["rhi"] >= {"B1": 1.0, "B2": 0.95, "B3": 0.9}[m]).astype(float)
    t["B0"] = t["B0_all"] = 0.05
    return t, pd.concat(imgs, ignore_index=True)


def test_every_preregistered_feature_has_a_column_and_constraints_apply() -> None:
    assert len(COLS) == len(NAMES) == 18
    assert MONO[NAMES.index("rhi_at_level")] == 1
    assert MONO[NAMES.index("temp_minus_TLM")] == -1
    assert sum(abs(m) for m in MONO) == 2
    assert "| rhi_at_level | `rhi` |" in fe.markdown_table(NAMES)


_T, _IM = _year()
_TR = _T[_T["season"] != "winter"]
_MODEL, _VAL = tr.train_fold(
    _TR[COLS].to_numpy(float), _TR["y"].to_numpy(float), _TR["day"].to_numpy(),
    _TR["rhi"].to_numpy(float), NAMES, MONO, n_trials=3, seed=1,
)  # fmt: skip


@settings(max_examples=60, deadline=None)
@given(
    row=st.integers(0, len(_TR) - 1),
    lo=st.floats(0.5, 1.4),
    step=st.floats(0.001, 0.5),
    t_lo=st.floats(-15, 0),
    t_step=st.floats(0.01, 10),
)
def test_monotone_in_rhi_and_temperature_margin(
    row: int, lo: float, step: float, t_lo: float, t_step: float
) -> None:
    x = _TR[COLS].to_numpy(float)[row]
    j_r, j_t = NAMES.index("rhi_at_level"), NAMES.index("temp_minus_TLM")
    a, b = x.copy(), x.copy()
    a[j_r], b[j_r] = lo, lo + step
    pa, pb = _MODEL.predict(np.vstack([a, b]))
    assert pb >= pa - 1e-12  # more humid → never less likely
    c, d = x.copy(), x.copy()
    c[j_t], d[j_t] = t_lo, t_lo + t_step
    pc, pd_ = _MODEL.predict(np.vstack([c, d]))
    assert pd_ <= pc + 1e-12  # warmer relative to T_LM → never more likely
    ra, rb = _MODEL.raw(np.vstack([a, b]))
    assert rb >= ra - 1e-12  # the constraint holds before calibration too


def test_calibration_improves_validation_brier_and_beats_constant() -> None:
    v = _VAL
    assert v["brier_gbm_calibrated"] <= v["brier_gbm_raw"] + 1e-4
    assert v["brier_gbm_calibrated"] < v["brier_climatology"]
    assert len(v["trials"]) == 3 and all("brier_lodo" in r for r in v["trials"])
    # cross-fitted: no day is calibrated with its own labels
    oof = v["_oof"]
    assert np.isfinite(oof["cal"]).all() and np.isfinite(oof["raw"]).all()


def test_scaling_factor_recovers_known_s_and_tau() -> None:
    rng = np.random.default_rng(3)
    rhi = rng.uniform(0.6, 1.5, 60_000)
    y = (rng.random(rhi.size) < sc.prob(rhi, 1.07, 0.05)).astype(float)
    f = sc.fit(rhi, y)
    assert abs(f["s"] - 1.07) < 0.01 and abs(f["tau"] - 0.05) < 0.01 and not f["s_at_bound"]
    y2 = (rng.random(rhi.size) < 0.002).astype(float)  # almost never observed → s on the bound
    assert sc.fit(rhi, y2)["s_at_bound"]
    bands = [(6.0, 15.0), (15.0, 25.0), (25.0, 37.0)]
    assert list(sc.band_index(np.array([3.0, 6.0, 14.9, 15.0, 30.0, 40.0]), bands)) == [
        0,
        0,
        0,
        1,
        2,
        2,
    ]


def test_auroc_is_exact_enough_for_small_calibrated_probabilities() -> None:
    rng = np.random.default_rng(5)
    p = rng.beta(0.5, 150, 50_000)  # rare-event forecasts, mostly < 0.01
    y = (rng.random(p.size) < p).astype(float)
    st_ = mt.day_stats(np.zeros(p.size, int), y, p)
    assert abs(float(mt.from_sums(mt.total(st_))["auroc"]) - roc_auc_score(y, p)) < 2e-3


def test_train_all_then_h2_never_trains_on_held_out_rows(tmp_path: Path) -> None:
    t, im = _year(seed=7, per_day=400)
    res = mr.train_all(t, PRE, tmp_path / "model", n_trials=2, seed=11)
    figs = res.pop("_figs")
    assert set(res["folds"]) == {*sp.SEASONS, "train_west_test_east", "train_east_test_west"}
    for f in sp.seasonal_folds(t):
        v = res["folds"][f.name]
        tr_ids = t.loc[f.train & t["y"].notna().to_numpy(), "segment_id"]
        assert v["train_ids_hash"] == mr.ids_hash(tr_ids)
        assert v["train_rows"] == int((f.train & t["y"].notna().to_numpy()).sum())
        assert all(m["violations"] == 0 for m in v["monotonicity"].values())
    assert res["a_vs_b"]["choice"] in ("a", "b") and len(figs) == 6
    assert res["model_hash"] == mr.dir_hash(tmp_path / "model")
    p = mr.predict_heldout(t, PRE, tmp_path / "model")
    assert p["STRATUM"].notna().all() and p["STRATUM_b"].notna().all()
    assert p["STRATUM__train_west_test_east"].notna().sum() > 0
    h = h2m.evaluate_h2(p, im, n=200, seed=1)
    assert set(h["h2"]) >= {"bss", "supported", "sentence"}
    assert h["h2"]["bss"]["value"] > 0  # a calibrated probability beats a 0/1 rule here
    assert "H2" in h["h2"]["sentence"]


def test_cli_train_then_h2_peek_and_refusals(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import json

    from typer.testing import CliRunner

    import stratum.cli as cli
    from stratum import lock as lk

    root = tmp_path / "drive"
    (root / "interim" / "evaluation").mkdir(parents=True)
    t, im = _year(seed=9, per_day=300)
    t.to_parquet(root / "interim" / "evaluation" / "table.parquet", index=False)
    im.to_parquet(root / "interim" / "evaluation" / "images.parquet", index=False)
    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(root))
    monkeypatch.setattr(cli, "repo_root", lambda: tmp_path / "repo")
    run = CliRunner()
    r = run.invoke(cli.app, ["evaluate-h2"])
    assert r.exit_code == 1 and "blocked" in r.output
    r = run.invoke(cli.app, ["model-train", "--trials", "1"], env={"COLUMNS": "200"})
    assert r.exit_code == 0, r.output
    assert (root / "interim" / "model" / "winter" / "booster.txt").exists()
    reports = list((root / "reports" / "phase7_validation").glob("*/model_validation.html"))
    assert len(reports) == 1
    r = run.invoke(cli.app, ["model-train", "--trials", "1"])
    assert r.exit_code == 1  # frozen unless --force
    r = run.invoke(cli.app, ["evaluate-h2", "--peek", lk.PEEK_PHRASE], env={"COLUMNS": "200"})
    assert r.exit_code == 0, r.output
    rec = json.loads((root / "_locks" / "peek_runs.jsonl").read_text().splitlines()[-1])
    assert rec["hypotheses"] == ["H2"] and not rec["final"]
    assert (tmp_path / "repo" / "_locks" / "peek_runs.jsonl").exists()
    # a changed model file is refused
    (root / "interim" / "model" / "winter" / "params.json").write_text("{}")
    r = run.invoke(cli.app, ["evaluate-h2", "--peek", lk.PEEK_PHRASE])
    assert r.exit_code == 1 and "changed" in r.output


def test_scaling_with_detection_efficiency_recovers_the_persistence_curve() -> None:
    rng = np.random.default_rng(4)
    rhi = rng.uniform(0.6, 1.5, 120_000)
    de = 0.16
    y = (rng.random(rhi.size) < de * sc.prob(rhi, 1.02, 0.04)).astype(float)
    with_de = sc.fit(rhi, y, de)
    literal = sc.fit(rhi, y, 1.0)
    assert abs(with_de["s"] - 1.02) < 0.015 and with_de["de"] == de
    assert literal["s"] > with_de["s"] + 0.05  # ignoring ε "dries" the air to fit fewer contrails
    t = pd.DataFrame({"cocip_contrail": [1, 1, 1, 1, 0, np.nan], "detectable": [1, 0, 0, 0, 1, 1]})
    assert sc.detection_efficiency(t) == 0.25


def test_fit_correction_writes_per_fold_cells_draws_and_the_a_vs_b_rule(tmp_path: Path) -> None:
    from stratum.model import correction as co

    t, _ = _year(seed=12, per_day=400)
    t["cocip_contrail"] = (t["rhi"] > 1.0).astype(float)
    t["detectable"] = (np.random.default_rng(0).random(len(t)) < 0.2).astype(float)
    bands = [(6.0, 15.0), (15.0, 25.0), (25.0, 37.0)]
    val = {"folds": {f: {"brier_gbm_calibrated": 0.03} for f in sp.SEASONS}}
    res = co.fit_correction(t, bands, tmp_path, n_draws=4, seed=1, validation=val)
    assert set(res["folds"]) == set(sp.SEASONS)
    for f in sp.SEASONS:
        assert (tmp_path / f / "scaling_band.csv").exists()
        assert np.load(tmp_path / f / "s_draws.npy").shape == (4, 3)
        assert 0.1 < res["folds"][f]["detection_efficiency"] < 0.3
    assert res["a_vs_b"]["choice"] in ("a", "b")
    from stratum.decide import humidity as hu

    _, s = hu.scaling_for_day(tmp_path, "2026-01-15", bands)
    assert s == [round(x, 12) for x in s] and len(s) == 3
