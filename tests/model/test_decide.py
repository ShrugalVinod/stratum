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
