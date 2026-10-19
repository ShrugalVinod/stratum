"""Decision layer pieces (build prompt §7.6–7.7): climate metric, alternatives, fuel, H3, H4."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from stratum import config as cfg
from stratum import lock as lk
from stratum.decide import alternatives as al
from stratum.decide import climate_metric as cm
from stratum.evaluate import h34


def test_climate_factors_match_the_locked_q5_answer() -> None:
    pre = cfg.load_preregistered()
    got = cm.check_against_preregistration(pre, lk.default_paths()["open_questions"])
    assert got["factor_h20"] == pytest.approx(2.497e-9, rel=2e-3)
    assert got["factor_h100"] == pytest.approx(6.779e-10, rel=2e-3)
    # 1e12 J of contrail EF at efficacy 1 ≈ 2,497 kg CO₂e over 20 years, 678 kg over 100
    assert cm.co2e_kg(1e12, 20, 1.0) == pytest.approx(2497, rel=2e-3)
    assert cm.co2e_kg(1e12, 100, 0.42) == pytest.approx(678 * 0.42, rel=3e-3)
    e = cm.draw_efficacy(10_000, 1)
    assert e.min() >= 0.42 and e.max() <= 1.0


def _flight(n: int = 40, alt: float = 36_000.0, otype: str = "a320") -> pd.DataFrame:
    t = pd.date_range("2026-01-01 10:00", periods=n + 1, freq="min", tz="UTC")
    return pd.DataFrame(
        {
            "flight_id": "F1",
            "time_start": t[:-1],
            "time_end": t[1:],
            "duration_s": 60.0,
            "alt_ft_start": alt,
            "alt_ft_end": alt,
            "alt_ft_mid": alt,
            "openap_type": otype,
            "aircraft_mass_kg": 0.8 * 78_000,
            "true_airspeed_ms": 230.0,
            "fuel_flow_kg_s": 0.7,
            "engine_efficiency": 0.30,
            "flagged": [10 <= i <= 14 or 17 <= i <= 18 or i == 35 for i in range(n)],
        }
    )


def test_portions_merge_short_gaps_and_split_long_ones() -> None:
    f = _flight()
    assert al.portions(f) == [(10, 18), (35, 35)]


def test_shifted_profile_holds_the_new_level_over_the_portion_and_ramps() -> None:
    f = _flight()
    a = al.build(f, 10, 14, 2000.0)
    assert a.feasible
    assert np.allclose(a.seg_alt_ft[10:15], 38_000.0)
    assert a.seg_alt_ft[0] == 36_000.0 and a.seg_alt_ft[-1] == 36_000.0
    # climb 2,000 ft at 1,000 ft/min: 2 min of ramp before; descent at 1,500 ft/min after
    assert a.info["changed_segments"] == 5 + 2 + 2
    assert a.extra_fuel_kg != 0.0 and np.isfinite(a.extra_fuel_kg)


def test_infeasible_alternatives_are_rejected_with_a_reason() -> None:
    hi = al.build(_flight(alt=40_000.0), 10, 14, 4000.0)
    assert not hi.feasible and "ceiling" in hi.reason
    lo = al.build(_flight(alt=27_000.0), 10, 14, -4000.0)
    assert not lo.feasible and lo.reason == "below FL250"


def test_h3_share_and_lorenz_curve() -> None:
    # 100 segments of 10 km per day; 5 per day carry 90 % of positive EF → share 5 %
    rows = []
    for d in ("2026-01-01", "2026-01-02", "2026-01-03"):
        ef = np.r_[np.full(5, 18.0), np.full(20, 0.5), np.zeros(70), np.full(5, -3.0)]
        rows.append(pd.DataFrame({"day": d, "ef": ef, "length_km": 10.0}))
    r = h34.h3(pd.concat(rows), 200, 1)
    assert r["share"]["value"] == pytest.approx(0.05, abs=0.011)
    assert r["supported"]
    assert r["curve"]["ef_share"][-1] == 1.0 and r["curve"]["distance_share"][0] == 0.0


def test_h4_night_share_difference() -> None:
    rng = np.random.default_rng(0)
    rows = []
    for k in range(10):
        lst = rng.uniform(0, 24, 2000)
        night = h34.is_night(lst)
        ef = np.where(night, 3.0, 1.0) * rng.uniform(0.5, 1.5, 2000)
        rows.append(
            pd.DataFrame({"day": f"d{k}", "local_solar_time_h": lst, "ef": ef, "length_km": 10.0})
        )
    r = h34.h4(pd.concat(rows), 500, 2)
    assert r["night_share_distance"] == pytest.approx(0.5, abs=0.03)
    assert r["night_share_positive_ef"] == pytest.approx(0.75, abs=0.03)
    assert r["supported"] and r["difference"]["lo"] > 0
    assert list(h34.is_night(np.array([17.9, 18.0, 23.0, 0.0, 5.99, 6.0]))) == [
        False,
        True,
        True,
        True,
        True,
        False,
    ]


PL_15JAN = Path("data/drive_local/raw/era5/pl/2026-01_days-15-15/data.zarr")


@pytest.mark.slow
@pytest.mark.skipif(not PL_15JAN.exists(), reason="needs the local 15 Jan 2026 ERA5 test day")
def test_decision_chain_on_the_15_jan_issr_crossing() -> None:
    """Flagged portion → 4 alternatives → paired CoCiP members → net warming → ranking."""
    import xarray as xr
    from pycontrails import MetDataset
    from pycontrails.models.cocip import CocipUncertaintyParams

    from stratum.decide import humidity as hu
    from stratum.decide import run as dr
    from stratum.physics import cocip_runner as cr

    met = MetDataset(xr.open_zarr(PL_15JAN).load())
    rad = MetDataset(xr.open_zarr(str(PL_15JAN).replace("/pl/", "/sl/")).load())
    n = 40
    t = pd.date_range("2026-01-15T05:40", periods=n + 1, freq="1min", tz="UTC")
    lon = np.linspace(85.5, 87.5, n + 1)
    seg = pd.DataFrame(
        {
            "flight_id": "TEST",
            "segment_id": [f"TEST_{i:04d}" for i in range(n)],
            "time_start": t[:-1],
            "time_end": t[1:],
            "duration_s": 60.0,
            "lon_start": lon[:-1],
            "lon_end": lon[1:],
            "lat_start": 38.9,
            "lat_end": 38.9,
            "alt_ft_start": 34000.0,
            "alt_ft_end": 34000.0,
            "alt_ft_mid": 34000.0,
            "fuel_flow_kg_s": 0.7,
            "engine_efficiency": 0.35,
            "aircraft_mass_kg": 63200.0,
            "openap_type": "a20n",
            "typecode": "A20N",
            "wingspan_m": 35.8,
            "true_airspeed_ms": 230.0,
        }
    )
    flagged = {f"TEST_{i:04d}" for i in range(15, 25)}
    frames, cands = dr._variant_frames(seg, flagged, [-4000, -2000, 2000, 4000])
    assert set(cands["delta_ft"]) == {-4000, -2000, 2000, 4000} and cands["feasible"].all()
    assert frames["flight_id"].nunique() == 5  # planned + 4 alternatives, cropped
    flights = cr.segments_to_flights(frames)
    sc = hu.scaling([6, 15, 25, 37], [1.0, 1.0, 1.0])
    cols = [
        dr._ef_by_variant(
            flights, met, rad, sc, None if m == 0 else CocipUncertaintyParams(seed=m).as_dict(), 6.0
        )
        for m in range(3)
    ]
    ef = pd.concat(cols, axis=1)
    assert ef.shape == (5, 3) and np.isfinite(ef.to_numpy()).all()
    c = dr.summarise_candidates(cands, ef, np.array([0.42, 0.6, 0.9]))
    assert {"net_h20_p05", "net_h100_p95", "lower_bound", "extra_co2_kg"} <= set(c.columns)
    r = dr.rank(c)
    assert len(r) == 1 and r["best_delta_ft"].iloc[0] in (-4000, -2000, 2000, 4000)
    lb = r["lower_bound"].iloc[0]
    assert r["alert"].iloc[0] == bool(
        r["net_h20_p05"].iloc[0] > 0 and r["net_h100_p05"].iloc[0] > 0
    )
    assert np.isfinite(lb)


def test_evaluate_h34_cli_on_fake_corrected_runs(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import json

    from typer.testing import CliRunner

    import stratum.cli as cli
    from stratum.manifest import RunManifest, mark_success

    root = tmp_path / "drive"
    rng = np.random.default_rng(1)
    days = ["2025-03-15", "2025-07-15", "2025-11-15", "2026-01-15"]
    rows = []
    for d in days:
        n = 500
        sid = [f"{d}_{i}" for i in range(n)]
        sm = root / "interim" / "segments_met" / d[:7] / d
        sm.mkdir(parents=True)
        pd.DataFrame(
            {
                "segment_id": sid,
                "length_km": 14.0,
                "commercial": True,
                "local_solar_time_h": rng.uniform(0, 24, n),
            }
        ).to_parquet(sm / "segments_met.parquet")
        cd = root / "interim" / "cocip_domain" / "STRATUM" / d[:7] / d
        cd.mkdir(parents=True)
        ef = np.where(rng.random(n) < 0.03, rng.lognormal(27, 1, n), 0.0)
        pd.DataFrame({"segment_id": sid, "ef": ef}).to_parquet(cd / "segments.parquet")
        mark_success(cd, RunManifest.start("test", unit=d))
        rows.append(pd.DataFrame({"day": d, "segment_id": sid[:5], "y": 0.0}))
    ev = root / "interim" / "evaluation"
    ev.mkdir(parents=True)
    pd.concat(rows).to_parquet(ev / "table.parquet")
    pd.DataFrame({"segment_id": [], "image_time": []}).to_parquet(ev / "images.parquet")
    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(root))
    monkeypatch.setattr(cli, "repo_root", lambda: tmp_path / "repo")
    r = CliRunner().invoke(cli.app, ["evaluate-h34"])
    assert r.exit_code == 1 and "blocked" in r.output
    r = CliRunner().invoke(
        cli.app, ["evaluate-h34", "--peek", lk.PEEK_PHRASE], env={"COLUMNS": "200"}
    )
    assert r.exit_code == 0, r.output
    rec = json.loads((root / "_locks" / "peek_runs.jsonl").read_text().splitlines()[-1])
    assert rec["hypotheses"] == ["H3", "H4"]
    assert 0 < rec["h3_share"]["value"] < 0.1 and rec["h3_supported"]
    assert not rec["h4_supported"]  # night carries EF in proportion to distance here
    # the descriptive context path reads another physics folder and writes no lock record
    for d in days:
        src = root / "interim" / "cocip_domain" / "STRATUM" / d[:7] / d
        dst = root / "interim" / "cocip_domain24" / "B1" / d[:7] / d
        dst.mkdir(parents=True)
        for f in src.iterdir():
            (dst / f.name).write_bytes(f.read_bytes())
    n_lines = len((root / "_locks" / "peek_runs.jsonl").read_text().splitlines())
    r = CliRunner().invoke(cli.app, ["h34-context", "--scaling", "B1"], env={"COLUMNS": "200"})
    assert r.exit_code == 0, r.output
    ctx = json.loads((root / "reports" / "phase7_h34_context" / "B1.json").read_text())
    assert ctx["descriptive_only"] and ctx["h3"]["share"]["value"] == rec["h3_share"]["value"]
    assert len((root / "_locks" / "peek_runs.jsonl").read_text().splitlines()) == n_lines


def test_table3_has_every_field_and_a_confidence_note() -> None:
    from stratum.decide import report as drep
    from stratum.decide import run as dr

    f = _flight().assign(
        segment_id=[f"F1_{i:04d}" for i in range(40)],
        lat_mid=20.0,
        lon_mid=78.0,
        local_solar_time_h=22.0,
        commercial=True,
        typecode="A320",
    )
    cands = pd.DataFrame(
        {
            "portion_id": ["F1|p0"] * 2,
            "flight_id": "F1",
            "delta_ft": [2000, -2000],
            "feasible": [True, False],
            "reason": ["", "below FL250"],
            "extra_fuel_kg": [-5.0, np.nan],
            "first": 10,
            "last": 18,
            "crop_segments": 14,
        }
    )
    ef = pd.DataFrame(
        {"m0": [5e12, 1e12], "m1": [4e12, 0.5e12], "m2": [6e12, 2e12]},
        index=["F1|p0|0", "F1|p0|+2000"],
    )
    c = dr.summarise_candidates(cands, ef, np.array([0.42, 0.7, 1.0]))
    ranked = dr.rank(c)
    p = pd.Series(0.03, index=f["segment_id"])
    cells = pd.Series(dtype=float)
    tab = drep.table3(ranked, cands, f, p, cells, [(6.0, 15.0), (15.0, 25.0), (25.0, 37.0)], 50)
    row = tab.iloc[0]
    assert row["planned_fl"] == 360 and row["best_alternative_fl"] == 380
    assert (
        row["confidence_note"] == "extrapolating"
        and row["caveat"] == "ATC feasibility not modelled"
    )
    assert row["alert"] and "below FL250" in row["alternatives_rejected"]
    assert {"net_warming_avoided_h20_p05_kgCO2e", "extra_co2_kg", "start_ist"} <= set(tab.columns)


def test_portion_with_no_feasible_alternative_is_kept_but_not_flown() -> None:
    from stratum.decide import run as dr

    f = _flight(alt=40_500.0).assign(segment_id=[f"F1_{i:04d}" for i in range(40)])
    f["alt_ft_start"] = f["alt_ft_end"] = f["alt_ft_mid"] = 26_000.0
    f.loc[10:12, ["alt_ft_start", "alt_ft_end", "alt_ft_mid"]] = 26_500.0
    frames, cands = dr._variant_frames(f, {"F1_0011"}, [-4000, -2000])  # both below FL250
    assert frames.empty and len(cands) == 2 and not cands["feasible"].any()
    c = dr.summarise_candidates(cands, pd.DataFrame(columns=["m0"]), np.array([0.42]))
    r = dr.rank(c)
    assert len(r) == 1 and not r["alert"].iloc[0] and "below FL250" in r["rejected"].iloc[0]
    # a one-segment portion is cropped to ≥ 2 segments for CoCiP
    g = _flight().assign(segment_id=[f"F1_{i:04d}" for i in range(40)])
    frames, _ = dr._variant_frames(g, {"F1_0039"}, [2000])
    assert frames.groupby("flight_id").size().min() >= 2
