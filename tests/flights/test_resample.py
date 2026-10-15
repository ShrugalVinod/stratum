"""Phase 2 trajectory steps 3–7 on a synthetic flight with known answers (build prompt §2.1)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from stratum.flights import resample as rs
from stratum.flights.clean import assign_flights, basic_clean, cruise_cut, implausibility_filter
from stratum.io.adsb_schema import COLUMNS

T0 = pd.Timestamp("2026-01-01T00:00:00", tz="UTC")


def _track() -> pd.DataFrame:
    """One aircraft, reports every 10 s, flying east along 20°N at 450 kt and FL350.

    Injected: an altitude spike (00:10), a speed spike (00:12), a 5-min gap (00:20–00:25)
    with a 1,000 ft step across it, a 15-min gap (00:35–00:50), a ground report, and a
    callsign change at 01:05 (new flight) whose first 4 reports climb below FL250.
    """
    secs = np.arange(0, 3600 + 1, 10)
    secs = secs[~((secs > 20 * 60) & (secs < 25 * 60))]
    secs = secs[~((secs > 35 * 60) & (secs < 50 * 60))]
    rows = []
    for s in secs:
        alt = 35000.0 if s <= 20 * 60 else 36000.0
        rows.append(("IGO1", s, 20.0, 70.0 + s * 0.00347, alt, 450.0, False))
    # flight 2 climbs through FL250 at 1,800 ft/min: its first 4 reports are below FL250
    rows += [
        ("IGO2", 3900 + 10 * k, 20.0, 83.0 + 0.0347 * k, 24000.0 + 300 * k, 450.0, False)
        for k in range(31)
    ]
    df = pd.DataFrame(
        rows, columns=["callsign", "s", "lat", "lon", "baro_alt_ft", "gs_kt", "on_ground"]
    )
    df.loc[df["s"] == 600, "baro_alt_ft"] = 45000.0  # spike: ±60,000 ft/min
    df.loc[df["s"] == 720, "gs_kt"] = 900.0  # speed jump of 450 kt
    df.loc[df["s"] == 1500, "baro_alt_ft"] = 36000.0
    ground = df.iloc[[0]].assign(s=4500, on_ground=True)
    df = pd.concat([df, ground], ignore_index=True)
    out = pd.DataFrame(
        {
            "icao24": "800abc",
            "callsign": df["callsign"],
            "time": T0 + pd.to_timedelta(df["s"], unit="s"),
            "lat": df["lat"],
            "lon": df["lon"],
            "baro_alt_ft": df["baro_alt_ft"],
            "geo_alt_ft": np.nan,
            "gs_kt": df["gs_kt"],
            "track_deg": 90.0,
            "vrate_fpm": 0.0,
            "on_ground": df["on_ground"],
            "source": "adsbx",
            "typecode": "A20N",
            "registration": None,
        }
    )
    return out[list(COLUMNS)]


def _pipeline() -> tuple[pd.DataFrame, dict[str, int], int]:
    clean, _ = basic_clean(_track())
    flights = assign_flights(clean)
    filt, removed = implausibility_filter(flights)
    cruise, n_low = cruise_cut(filt)
    return cruise, removed, n_low


def test_spikes_and_low_points_removed_and_counted() -> None:
    cruise, removed, n_low = _pipeline()
    assert removed == {"pass_1": 2, "pass_2": 0, "pass_3": 0}
    assert n_low == 4
    assert not (cruise["baro_alt_ft"] > 40000).any() and not (cruise["gs_kt"] > 500).any()
    assert cruise["flight_id"].nunique() == 2  # callsign change → second flight


def test_resample_fill_and_split_exact() -> None:
    cruise, _, _ = _pipeline()
    wp = rs.resample_flights(cruise)
    f1 = wp[wp["flight_id"] == "800abc_20260101T0000"]
    assert [t.strftime("%H:%M") for t in f1["time"]] == [f"00:{m:02d}" for m in range(0, 36)]
    filled = f1[f1["filled"]]
    assert [t.minute for t in filled["time"]] == [21, 22, 23, 24]
    assert (filled["baro_alt_ft"] == 35000.0).all()  # altitude held from before the gap
    assert f1.loc[f1["time"].dt.minute == 25, "baro_alt_ft"].item() == 36000.0
    piece = wp[wp["flight_id"] == "800abc_20260101T0000.1"]  # after the 15-min gap
    assert piece["time"].min().strftime("%H:%M") == "00:50"
    assert piece["time"].max().strftime("%H:%M") == "01:00"
    f2 = wp[wp["flight_id"] == "800abc_20260101T0105"]
    assert f2["time"].min().strftime("%H:%M") == "01:06"  # cruise starts 01:05:40
    assert len(f2) == 5 and not f2["filled"].any()
    # positions stay on the 20°N great-circle track (equator-parallel at this length: tiny bulge)
    assert np.allclose(wp["lat"], 20.0, atol=0.02)


def test_segments_geometry() -> None:
    cruise, _, _ = _pipeline()
    seg = rs.make_segments(rs.resample_flights(cruise))
    f1 = seg[seg["flight_id"] == "800abc_20260101T0000"]
    assert len(f1) == 35 and f1["segment_id"].iloc[0] == "800abc_20260101T0000_0000"
    assert (f1["duration_s"] == 60).all()
    unfilled = f1[~f1["filled"]]
    assert np.allclose(unfilled["heading_deg"], 90.0, atol=0.5)
    # 0.00347°/s × 60 s of longitude at 20°N ≈ 21.7 km per minute ≈ 704 kt over ground
    assert np.allclose(unfilled["length_km"], 0.2082 * 111.195 * np.cos(np.radians(20)), rtol=0.01)
    assert f1["filled"].sum() == 5  # minutes 20→21 … 24→25 touch a filled waypoint


def test_slerp_endpoints_and_midpoint() -> None:
    lat, lon = rs.slerp(
        np.array([0.0]), np.array([0.0]), np.array([0.0]), np.array([90.0]), np.array([0.5])
    )
    assert np.allclose([lat[0], lon[0]], [0.0, 45.0])
    assert np.isclose(rs.haversine_km(0, 0, 0, 1), 111.195, rtol=1e-4)
