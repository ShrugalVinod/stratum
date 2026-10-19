"""Phase 8 web export end to end on a fake Drive root built around the local 15 Jan 2026 ERA5 day."""

import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

PL_15JAN = Path("data/drive_local/raw/era5/pl/2026-01_days-15-15/data.zarr")
DAY = "2026-01-15"


def _segments(n_flights: int = 6, n: int = 30) -> pd.DataFrame:
    rows = []
    t0 = pd.Timestamp(f"{DAY}T05:00", tz="UTC")
    for f in range(n_flights):
        lat0 = 34.0 + 0.5 * f
        lon = np.linspace(85.2, 87.8, n + 1)
        for i in range(n):
            ts, te = t0 + pd.Timedelta(minutes=i), t0 + pd.Timedelta(minutes=i + 1)
            rows.append({
                "flight_id": f"F{f}", "segment_id": f"F{f}_{i:04d}", "callsign": f"AIC{100 + f}",
                "typecode": "A20N", "commercial": True, "in_corridor": f < 2,
                "time_start": ts, "time_end": te, "time_mid": ts + pd.Timedelta(seconds=30),
                "lat_start": lat0, "lat_end": lat0, "lat_mid": lat0,
                "lon_start": lon[i], "lon_end": lon[i + 1], "lon_mid": (lon[i] + lon[i + 1]) / 2,
                "alt_ft_start": 36000.0, "alt_ft_end": 36000.0, "alt_ft_mid": 36000.0,
                "duration_s": 60.0, "rhi": 1.1, "local_solar_time_h": 11.0,
            })  # fmt: skip
    return pd.DataFrame(rows)


def fake_root(tmp_path: Path) -> tuple[Path, object]:
    """A fake Drive root around the local 15 Jan ERA5 day (also used by scripts/dev_build_v1.py)."""
    import xarray as xr

    from stratum import config as cfg
    from stratum.decide import run as dr
    from stratum.model import correction as co
    from stratum.model import run as mr

    sys.path.insert(0, str(Path(__file__).parents[1] / "model"))
    import test_model as tm  # synthetic year with the real feature columns

    root = tmp_path / "drive"
    pre = cfg.load_preregistered()
    # ERA5: the local day as January; tropopause temperatures from the same levels
    pl = xr.open_zarr(PL_15JAN).load()
    for grp, ds in (("pl", pl), ("tropo_T", pl[["air_temperature"]])):
        d = root / "raw" / "era5" / grp / "2026-01"
        d.mkdir(parents=True)
        ds.to_zarr(d / "data.zarr")
    # frozen models and the option-2 correction from the synthetic year
    t, _ = tm._year(seed=21, per_day=300)
    t["cocip_contrail"] = (t["rhi"] > 1.0).astype(float)
    t["detectable"] = 1.0
    mr.train_all(t, pre, mr.model_dir(root), n_trials=1, seed=3)
    co.fit_correction(
        t,
        [tuple(b) for b in pre.correction_model.latitude_bands_deg],
        root / "interim" / "correction",
        2,
        1,
        None,
    )
    # flights, context CoCiP and decisions for the day
    seg = _segments()
    sd = root / "interim" / "segments_met" / DAY[:7] / DAY
    sd.mkdir(parents=True)
    seg.to_parquet(sd / "segments_met.parquet")
    rng = np.random.default_rng(0)
    for model in ("B1", "B3"):
        cd = root / "interim" / "cocip_domain24" / model / DAY[:7] / DAY
        cd.mkdir(parents=True)
        ef = np.where(rng.random(len(seg)) < 0.3, rng.lognormal(26, 1, len(seg)), 0.0)
        pd.DataFrame(
            {
                "segment_id": seg["segment_id"],
                "ef": ef,
                "persistent_1": (ef > 0).astype(float),
                "contrail_age": pd.to_timedelta(rng.uniform(0, 5, len(seg)), unit="h"),
            }
        ).to_parquet(cd / "segments.parquet")
    frames, cands = dr._variant_frames(seg.assign(openap_type="a20n", aircraft_mass_kg=63200.0, fuel_flow_kg_s=0.7,
                                                  engine_efficiency=0.3, true_airspeed_ms=230.0),
                                       {f"F{f}_{i:04d}" for f in range(3) for i in range(10, 15)}, [-2000, 2000])  # fmt: skip
    ef = pd.DataFrame(rng.lognormal(27, 1, (frames["flight_id"].nunique(), 5)), index=sorted(frames["flight_id"].unique()),
                      columns=[f"m{i}" for i in range(5)])  # fmt: skip
    c = dr.summarise_candidates(cands, ef, np.linspace(0.42, 1, 5))
    ranked = dr.rank(c)
    from stratum.decide import report as drep

    tab = drep.table3(ranked, c, seg.assign(fuel_flow_kg_s=0.7), pd.Series(0.01, index=seg["segment_id"]),
                      pd.Series(dtype=float), [tuple(b) for b in pre.correction_model.latitude_bands_deg], 50)  # fmt: skip
    dd = root / "interim" / "decisions" / DAY[:7] / DAY
    dd.mkdir(parents=True)
    tab.to_parquet(dd / "table3.parquet")
    c.to_parquet(dd / "candidates.parquet")
    # logged runs for results.json
    (root / "_locks").mkdir()
    shutil.copy("_locks/final_runs.jsonl", root / "_locks" / "final_runs.jsonl")

    return root, pre


@pytest.mark.slow
@pytest.mark.skipif(not PL_15JAN.exists(), reason="needs the local 15 Jan 2026 ERA5 test day")
def test_export_web_v1_end_to_end(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from stratum.export import grids
    from stratum.export import web_v1 as wv
    from stratum.export.schemas import DaySummary, FlaggedSegment, Manifest

    monkeypatch.setenv("STRATUM_ID_SALT", "a-test-salt-that-is-long-enough")
    root, pre = fake_root(tmp_path)
    res = wv.export_web_v1(root, tmp_path / "out", "v1-test", [DAY], pre, demo_month=None)
    out = tmp_path / "out" / "v1-test"
    assert res["days"] == 1 and res["days_with_flights"] == [DAY]
    man = Manifest.model_validate_json((out / "manifest.json").read_text())
    assert [m.id for m in man.models or []] == [
        "B1",
        "B3",
        "STRATUM",
    ] and man.grid.encoding == "png_uint8_hour_sprite"
    day = DaySummary.model_validate_json((out / "days" / DAY / "day.json").read_text())
    assert (
        set(day.layers or []) == {"B1", "B3", "STRATUM", "STRATUM_spread"}
        and not day.has_observability
    )
    sprite = grids.decode_sprite(out / "days" / DAY / "layers" / "STRATUM_FL360.png", 24, wv.P_FULL)
    assert sprite.shape[0] == 24 and np.isfinite(sprite).all() and sprite.max() > 0
    b3 = grids.decode_sprite(out / "days" / DAY / "layers" / "B3_FL360.png")
    b1 = grids.decode_sprite(out / "days" / DAY / "layers" / "B1_FL360.png")
    assert not np.array_equal(b1, b3) and b1.max() <= 1 and b3.max() <= 1  # B3 rescales humidity
    s_list = [
        FlaggedSegment(**x)
        for x in json.loads((out / "days" / DAY / "segments_STRATUM.json").read_text())
    ]
    assert (
        s_list
        and s_list[0].alternatives
        and s_list[0].profile
        and len(s_list[0].profile.rhi_raw) == len(s_list[0].profile.pressure_hpa)
    )
    b1_list = json.loads((out / "days" / DAY / "segments_B1.json").read_text())
    assert b1_list and all(x["model"] == "B1" for x in b1_list)
    fc = json.loads((out / "days" / DAY / "flights.geojson").read_text())
    ids = {f["properties"]["flight_id"] for f in fc["features"]}
    assert all(len(i) == 12 and not i.startswith("F") for i in ids)  # hashed, never raw ids
    assert any(f["properties"]["alert"] is not None for f in fc["features"])
    results = json.loads((out / "results.json").read_text())
    assert [h["id"] for h in results["hypotheses"]] == [] or results["final_runs"]
    assert len(results["final_runs"]) == 3
