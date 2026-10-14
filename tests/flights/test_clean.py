"""Tests for basic cleaning and flight reconstruction (build prompt §2.1 steps 1–2)."""

from __future__ import annotations

import pandas as pd

from stratum.flights.clean import assign_flights, basic_clean, daily_summary
from stratum.io.adsb_schema import COLUMNS


def _rows(spec: list[tuple[str, str | None, str, float, bool]]) -> pd.DataFrame:
    """spec: (icao24, callsign, ISO time, baro_alt_ft, on_ground)."""
    recs = []
    for icao, cs, t, alt, gnd in spec:
        recs.append(
            {
                "icao24": icao,
                "callsign": cs,
                "time": pd.Timestamp(t, tz="UTC"),
                "lat": 20.0,
                "lon": 75.0,
                "baro_alt_ft": alt,
                "geo_alt_ft": None,
                "gs_kt": 450.0,
                "track_deg": 10.0,
                "vrate_fpm": 0.0,
                "on_ground": gnd,
                "source": "adsbx",
                "typecode": None,
                "registration": None,
            }
        )
    return pd.DataFrame.from_records(recs)[list(COLUMNS)]


def test_basic_clean_counts_removals() -> None:
    df = _rows(
        [
            ("800001", "IGO1", "2026-01-01T00:00:00", 35000, False),
            ("800001", "IGO1", "2026-01-01T00:00:00", 35000, False),  # duplicate
            ("800001", "IGO1", "2026-01-01T00:01:00", 0, True),  # ground
        ]
    )
    out, removed = basic_clean(df)
    assert len(out) == 1
    assert removed == {"on_ground": 1, "missing_time_pos_alt": 0, "duplicates": 1}


def test_split_on_gap_and_callsign_change_but_not_missing_callsign() -> None:
    df = _rows(
        [
            ("800001", "IGO1", "2026-01-01T00:00:00", 35000, False),
            ("800001", None, "2026-01-01T00:10:00", 35000, False),  # missing callsign: same flight
            ("800001", "IGO1", "2026-01-01T00:40:00", 35000, False),  # 30 min gap exactly: same
            ("800001", "IGO1", "2026-01-01T01:11:00", 35000, False),  # 31 min gap: new flight
            ("800001", "IGO2", "2026-01-01T01:12:00", 35000, False),  # callsign change: new flight
            ("800002", "AIC5", "2026-01-01T01:12:00", 36000, False),  # other aircraft
        ]
    )
    out = assign_flights(basic_clean(df)[0])
    ids = out["flight_id"].tolist()
    assert ids[:3] == ["800001_20260101T0000"] * 3
    assert ids[3] == "800001_20260101T0111"
    assert ids[4] == "800001_20260101T0112"
    assert ids[5] == "800002_20260101T0112"


def test_daily_summary() -> None:
    df = _rows(
        [
            ("800001", "IGO1", "2026-01-01T00:00:00", 24000, False),
            ("800001", "IGO1", "2026-01-01T00:00:10", 26000, False),
            ("800002", "AIC5", "2026-01-01T00:00:00", 22000, False),
        ]
    )
    s = daily_summary(df)
    assert s["messages"] == 3 and s["unique_icao24"] == 2 and s["unique_callsigns"] == 2
    assert s["flights"] == 2 and s["flights_reaching_FL250"] == 1
    assert s["median_report_interval_s"] == 10.0
