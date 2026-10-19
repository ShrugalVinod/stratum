"""Phase 8.3 release bundle on a synthetic year: commercial only, hashed ids, rounded positions."""

import json
import shutil
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

SALT = "a-test-salt-that-is-long-enough"


@pytest.mark.slow
def test_release_bundle(tmp_path: Path) -> None:
    from stratum import config as cfg
    from stratum.model import run as mr
    from stratum.release import bundle

    sys.path.insert(0, str(Path(__file__).parents[1] / "model"))
    import test_model as tm  # synthetic year with the real feature columns

    root, repo = tmp_path / "drive", Path(".")
    pre = cfg.load_preregistered()
    t, _ = tm._year(seed=21, per_day=300)
    rng = np.random.default_rng(0)
    t = t.assign(
        commercial=rng.random(len(t)) < 0.8,
        time_mid=pd.to_datetime(t["day"]) + pd.to_timedelta(rng.integers(0, 24, len(t)), unit="h"),
        alt_ft_mid=rng.uniform(30000, 40000, len(t)),
        night_fraction=rng.random(len(t)),
        lat_mid=t["lat_mid"] + 0.0123,
    )
    mr.train_all(t, pre, mr.model_dir(root), n_trials=1, seed=3)
    (root / "interim" / "evaluation").mkdir(parents=True)
    t.to_parquet(root / "interim" / "evaluation" / "table.parquet")
    who = root / "labels" / "raw" / "some_labeller_name"
    who.mkdir(parents=True)
    (who / "scene_001.json").write_text("{}")
    (root / "_locks").mkdir()
    shutil.copy("_locks/final_runs.jsonl", root / "_locks" / "final_runs.jsonl")

    info = bundle.build(root, repo, tmp_path / "release", "0.0.0-test", SALT)
    out = tmp_path / "release" / "0.0.0-test"
    seg = pd.read_parquet(out / "segments_predictions_labels.parquet")
    assert info["segments"] == len(seg) == int(t["commercial"].sum())
    assert not {"flight_id", "segment_id", "icao24", "callsign"} & set(seg.columns)
    assert not set(seg["flight"]) & set(t["flight_id"].astype(str))
    assert ((seg["lat"] * 4) % 1 == 0).all() and ((seg["lon"] * 4) % 1 == 0).all()
    assert seg["STRATUM"].notna().mean() > 0.9 and {"y", "B1", "B3", "RATE"} <= set(seg.columns)
    assert (out / "labels" / "L1" / "scene_001.json").exists()
    assert not any("some_labeller_name" in str(p) for p in out.rglob("*"))
    assert json.loads((out / "results.json").read_text())
    assert (out / "data_card.md").exists() and (out / "CITATION.cff").exists()
    with zipfile.ZipFile(info["zip"]) as z:
        assert "0.0.0-test/segments_predictions_labels.parquet" in z.namelist()


@pytest.mark.slow
def test_rescore_runs_on_a_bundle(tmp_path: Path) -> None:
    """Level-2 reproduction: H1 and H2 recomputed from the released table alone."""
    from stratum.release.rescore import rescore

    test_release_bundle(tmp_path)  # builds tmp_path/release/0.0.0-test
    rel = tmp_path / "release" / "0.0.0-test"
    r = rescore(rel, n=50)
    assert r["rows"]["labelled"] > 0
    assert {"value", "lo", "hi"} <= set(r["H1"]["release"]) and r["H1"]["observed"] > 0
    assert {"value", "lo", "hi"} <= set(r["H2"]["release"])
    assert set(r["H2"]["per_season"]) == {"pre_monsoon", "monsoon", "post_monsoon", "winter"}
