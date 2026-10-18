"""B0 climatology physics/interpolation and the final-run lock (build prompt §6.3, §6.8)."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from stratum import lock as lk
from stratum.baselines import climatology as clim
from stratum.physics.thermo import e_sat_ice


def test_monthly_frequency_counts_persistent_hours() -> None:
    t = pd.date_range("2026-01-01", periods=4, freq="h")
    lev, la, lo = np.array([250.0]), np.array([20.0, 21.0]), np.array([75.0])
    T = np.full((4, 1, 2, 1), 215.0)
    p = 25000.0
    q_sat = 0.622 * e_sat_ice(215.0) / p
    q = np.empty_like(T)
    q[:, :, 0, :] = 1.2 * q_sat  # cell 0: supersaturated every hour
    q[:2, :, 1, :] = 1.2 * q_sat  # cell 1: half of the hours
    q[2:, :, 1, :] = 0.5 * q_sat
    ds = xr.Dataset(
        {"air_temperature": (("time", "level", "latitude", "longitude"), T),
         "specific_humidity": (("time", "level", "latitude", "longitude"), q)},
        coords={"time": t, "level": lev, "latitude": la, "longitude": lo},
    )  # fmt: skip
    f = clim.monthly_frequency(ds)
    assert np.allclose(f.values[0, :, 0], [1.0, 0.5])


def test_predict_interpolates_in_log_pressure() -> None:
    lev = np.array([200.0, 300.0])
    da = xr.DataArray(
        np.stack([np.full((2, 2), 0.2), np.full((2, 2), 0.6)]),
        dims=("level", "latitude", "longitude"),
        coords={"level": lev, "latitude": [10.0, 11.0], "longitude": [70.0, 71.0]},
    )
    p = np.exp((np.log(20000) + np.log(30000)) / 2)
    v = clim.predict(da, np.array([10.1, 10.0]), np.array([70.2, 70.0]), np.array([p, 50000.0]))
    assert np.isclose(v[0], 0.4) and np.isclose(v[1], 0.6)  # midway; clipped below the lowest level


def test_final_run_needs_a_verified_lock_and_logs_are_append_only(tmp_path: Path) -> None:
    ok, _ = lk.final_allowed(lk.VerifyResult(lock_found=True, changed=["x"], undocumented=[]))
    bad, why = lk.final_allowed(lk.VerifyResult(lock_found=True, changed=["x"], undocumented=["x"]))
    none, _ = lk.final_allowed(lk.VerifyResult(lock_found=False))
    assert ok and not bad and "undocumented" in why and not none
    log = tmp_path / "final_runs.jsonl"
    lk.append_run_record(log, {"run_id": "a", "h1": 0.5})
    lk.append_run_record(log, {"run_id": "b", "h1": 0.7})
    lines = [json.loads(x) for x in log.read_text().splitlines()]
    assert [r["run_id"] for r in lines] == ["a", "b"]
    assert lk.results_hash({"a": 1, "b": 2}) == lk.results_hash({"b": 2, "a": 1})


def test_evaluate_refuses_held_out_scoring_without_final_or_peek(
    tmp_path: Path, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from typer.testing import CliRunner

    from stratum.cli import app

    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(tmp_path))
    r = CliRunner().invoke(app, ["evaluate"])
    assert r.exit_code == 1 and "blocked" in r.output
    r = CliRunner().invoke(app, ["evaluate", "--peek", "please"])
    assert r.exit_code == 1
    assert not (tmp_path / "_locks").exists()  # nothing scored, nothing logged


def test_climatology_command_lists_the_evaluation_months(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from typer.testing import CliRunner

    from stratum.cli import app

    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(tmp_path))
    r = CliRunner().invoke(app, ["climatology"], env={"COLUMNS": "200"})
    assert r.exit_code == 0, r.output
    assert "climatology 2025-03" in r.output and "climatology 2026-02" in r.output
    assert "no ERA5 pl" in r.output  # empty root: reported, not crashed


def test_a_second_final_run_needs_a_reason(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import json

    from typer.testing import CliRunner

    from stratum.cli import app

    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(tmp_path))
    (tmp_path / "_locks").mkdir()
    (tmp_path / "_locks" / "final_runs.jsonl").write_text(
        json.dumps({"run_id": "r1", "final": True, "hypotheses": ["H2"]}) + "\n"
    )
    assert lk.previous_finals(tmp_path / "_locks" / "final_runs.jsonl", "H2") == ["r1"]
    assert lk.previous_finals(tmp_path / "_locks" / "final_runs.jsonl", "H3") == []
    r = CliRunner().invoke(app, ["evaluate-h2", "--final"], env={"COLUMNS": "200"})
    assert r.exit_code == 1 and "--rerun-reason" in r.output
    # with a reason it gets past the gate (and stops later: no models in this empty root)
    r = CliRunner().invoke(
        app, ["evaluate-h2", "--final", "--rerun-reason", "bug fix"], env={"COLUMNS": "200"}
    )
    assert r.exit_code == 1 and "No trained models" in r.output
