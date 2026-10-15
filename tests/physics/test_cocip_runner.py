"""Humidity scalings change RHi in the intended direction; CoCiP runs on our flights."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from stratum.physics import cocip_runner as cr
from stratum.physics.thermo import rhi_from_q

PL_15JAN = Path("data/drive_local/raw/era5/pl/2026-01_days-15-15/data.zarr")


def test_scalings_direction_and_magnitude() -> None:
    T = np.full(4, 220.0)
    p = np.full(4, 25000.0)
    lat = np.array([10.0, 20.0, 30.0, 37.0])
    b3 = cr.humidity_scaling("B3")
    for q0, supersat in ((4.5e-5, False), (7.4e-5, True)):  # RHi ≈ 0.68 and ≈ 1.12
        q = np.full(4, q0)
        rhi0 = rhi_from_q(q, T, p)
        _, r1 = cr.humidity_scaling("B1").scale(q, T, p)
        _, r2 = cr.humidity_scaling("B2").scale(q, T, p)
        _, r3 = b3.scale(q, T, p, latitude=lat, q_method=None, level_type="pressure")
        # pycontrails uses Sonntag ice saturation; we use Murphy–Koop (≤ 0.16 % apart)
        assert np.allclose(r1, rhi0, rtol=2e-3)
        assert np.allclose(r2 / r1, 1 / 0.95, rtol=1e-9)  # B2 *divides* RHi by 0.95 (+5.26 %)
        if supersat:
            assert np.all(r3 > r1)  # B3's exponent boosts ice-supersaturated air
        else:
            assert np.allclose(r3, r1, rtol=0.03)  # and barely moves sub-saturated air here


def test_unknown_scaling_rejected() -> None:
    with pytest.raises(ValueError):
        cr.humidity_scaling("B9")


@pytest.mark.slow
@pytest.mark.skipif(not PL_15JAN.exists(), reason="needs the local 15 Jan 2026 ERA5 test day")
def test_cocip_runs_on_issr_crossing() -> None:
    """A flight through the 15 Jan ISSR (Phase 1 test 2) gives a contrail with EF ranges."""
    import pandas as pd
    import xarray as xr
    from pycontrails import MetDataset

    pl_ds = xr.open_zarr(PL_15JAN).load()
    sl_ds = xr.open_zarr(str(PL_15JAN).replace("/pl/", "/sl/")).load()
    n = 40
    t = pd.date_range("2026-01-15T05:40", periods=n + 1, freq="1min", tz="UTC")
    lon = np.linspace(85.5, 87.5, n + 1)
    seg = pd.DataFrame(
        {
            "flight_id": "TEST",
            "time_start": t[:-1],
            "time_end": t[1:],
            "lon_start": lon[:-1],
            "lon_end": lon[1:],
            "lat_start": 38.9,
            "lat_end": 38.9,
            "alt_ft_start": 34000.0,
            "alt_ft_end": 34000.0,
            "fuel_flow_kg_s": 0.7,
            "engine_efficiency": 0.35,
            "aircraft_mass_kg": 63200.0,
            "openap_type": "a20n",
            "typecode": "A20N",
            "wingspan_m": 35.8,
        }
    )
    flights = cr.segments_to_flights(seg)
    res = cr.run(flights, MetDataset(pl_ds), MetDataset(sl_ds), "B1", members=3, max_age_h=6)
    assert len(res.segments) == n
    assert res.segments["segment_id"].iloc[0] == "TEST_0000"
    assert res.summary["share_sac"] > 0.5
    assert {"ef_p05", "ef_p50", "ef_p95"} <= set(res.segments.columns)
