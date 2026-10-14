"""Tests for the ADS-B Exchange adapter on a small synthetic snapshot (no network)."""

from __future__ import annotations

import gzip
from datetime import date
from pathlib import Path

import orjson
import pandas as pd
import pytest

from stratum.io import adsb_adsbx as ax
from stratum.io.adsb_schema import COLUMNS, validate

FLT = ax.Filter(lat=(4.0, 39.0), lon=(66.0, 100.0), min_baro_alt_ft=20000.0)
NOW = 1767225600.0  # 2026-01-01T00:00:00Z


def _snapshot(aircraft: list[dict[str, object]], now: float = NOW) -> bytes:
    return gzip.compress(orjson.dumps({"now": now, "messages": 1, "aircraft": aircraft}))


AIRCRAFT = [
    # kept: cruise over India, padded callsign, type/registration present
    {
        "hex": "800ABC",
        "flight": "IGO2134 ",
        "lat": 23.0,
        "lon": 75.0,
        "alt_baro": 35000,
        "alt_geom": 36500,
        "gs": 450.0,
        "track": 200.0,
        "baro_rate": -64,
        "seen_pos": 1.5,
        "t": "A20N",
        "r": "VT-ABC",
    },
    # kept: no callsign, geom_rate only
    {
        "hex": "8001aa",
        "lat": 19.5,
        "lon": 73.0,
        "alt_baro": 21000,
        "geom_rate": 1500,
        "seen_pos": 0,
    },
    # dropped: below FL200
    {
        "hex": "800002",
        "flight": "AIC101",
        "lat": 20.0,
        "lon": 75.0,
        "alt_baro": 15000,
        "seen_pos": 0,
    },
    # dropped: on the ground
    {"hex": "800003", "flight": "AIC102", "lat": 20.0, "lon": 75.0, "alt_baro": "ground"},
    # dropped: outside padded box (Europe)
    {"hex": "4ca123", "flight": "EIN1", "lat": 53.0, "lon": -6.0, "alt_baro": 37000, "seen_pos": 0},
    # dropped: non-ICAO / anonymised address
    {"hex": "~abc123", "lat": 21.0, "lon": 79.0, "alt_baro": 30000, "seen_pos": 0},
    # dropped: no position
    {"hex": "800004", "flight": "SEJ1", "alt_baro": 33000},
]


def test_parse_snapshot_filters_and_maps_fields() -> None:
    df, st = ax.parse_snapshot(_snapshot(AIRCRAFT), FLT)
    validate(df)
    assert list(df.columns) == list(COLUMNS)
    assert sorted(df["icao24"]) == ["8001aa", "800abc"]  # lower-cased
    r = df.set_index("icao24").loc["800abc"]
    assert r["callsign"] == "IGO2134" and r["typecode"] == "A20N" and r["registration"] == "VT-ABC"
    assert r["time"] == pd.Timestamp(NOW - 1.5, unit="s", tz="UTC")  # now − seen_pos
    assert r["baro_alt_ft"] == 35000 and r["geo_alt_ft"] == 36500 and r["vrate_fpm"] == -64
    r2 = df.set_index("icao24").loc["8001aa"]
    assert pd.isna(r2["callsign"]) and r2["vrate_fpm"] == 1500
    assert st.aircraft_total == 7 and st.kept == 2
    assert st.dropped_non_icao == 1 and st.dropped_no_position == 1


def test_plain_json_also_accepted() -> None:
    raw = orjson.dumps({"now": NOW, "aircraft": AIRCRAFT})
    df, _ = ax.parse_snapshot(raw, FLT)
    assert len(df) == 2


def test_empty_snapshot_keeps_schema() -> None:
    df, st = ax.parse_snapshot(_snapshot([]), FLT)
    validate(df)
    assert df.empty and st.snapshots_ok == 1


def test_dedupe_same_fix_in_two_snapshots() -> None:
    a = [
        {
            "hex": "800abc",
            "flight": "IGO1",
            "lat": 23.0,
            "lon": 75.0,
            "alt_baro": 35000,
            "seen_pos": 0,
        }
    ]
    b = [
        {
            "hex": "800abc",
            "flight": "IGO1",
            "lat": 23.0,
            "lon": 75.0,
            "alt_baro": 35000,
            "seen_pos": 5,
        }
    ]
    d1, _ = ax.parse_snapshot(_snapshot(a, NOW), FLT)
    d2, _ = ax.parse_snapshot(_snapshot(b, NOW + 5), FLT)  # stale: same fix 5 s later
    assert len(ax.dedupe(pd.concat([d1, d2]))) == 1


def test_snapshot_names() -> None:
    names = ax.snapshot_names()
    assert len(names) == 17280 and names[0] == "000000Z" and names[-1] == "235955Z"
    assert len(ax.snapshot_names(13)) == ax.SNAPSHOTS_PER_HOUR
    assert ax.snapshot_url(date(2026, 1, 1), "000005Z").endswith(
        "/readsb-hist/2026/01/01/000005Z.json.gz"
    )


def test_ingest_day_offline_is_resumable(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Fake the network: every snapshot returns the same aircraft set."""
    calls: list[str] = []

    def fake(
        session: object, day: date, name: str, flt: ax.Filter
    ) -> tuple[pd.DataFrame, ax.SnapshotStats]:
        calls.append(name)
        return ax.parse_snapshot(_snapshot(AIRCRAFT), flt)

    monkeypatch.setattr(ax, "_fetch_and_parse", fake)
    s1 = ax.ingest_day(date(2026, 1, 1), tmp_path, hours=[0, 1], flt=FLT, workers=2)
    assert s1["hours_done"] == [0, 1] and not s1["day_complete"]
    n_calls = len(calls)
    s2 = ax.ingest_day(date(2026, 1, 1), tmp_path, hours=[0, 1, 2], flt=FLT, workers=2)
    assert s2["hours_skipped"] == [0, 1] and s2["hours_done"] == [2]  # resumed
    assert len(calls) == n_calls + ax.SNAPSHOTS_PER_HOUR
    df = ax.read_day(tmp_path / "2026-01-01")
    assert len(df) == 2  # the same two fixes in every snapshot and hour collapse to 2 rows


def test_glitched_values_are_blanked_not_fatal() -> None:
    """Real case 2026-01-01: an aircraft reported 1,152 kt. Must not crash the hour."""
    glitch = [
        {
            "hex": "800aaa",
            "flight": "IGO9",
            "lat": 22.0,
            "lon": 76.0,
            "alt_baro": 35000,
            "gs": 1152.1,
            "track": 361.0,
            "seen_pos": 0,
        },
        {
            "hex": "800bbb",
            "flight": "IGO8",
            "lat": 22.0,
            "lon": 77.0,
            "alt_baro": 99999,
            "gs": 450.0,
            "seen_pos": 0,
        },
    ]
    df, st = ax.parse_snapshot(_snapshot(glitch), FLT)
    validate(df)
    assert list(df["icao24"]) == ["800aaa"]  # impossible altitude → report dropped
    assert pd.isna(df.loc[0, "gs_kt"]) and pd.isna(df.loc[0, "track_deg"])
    assert st.blanked_values == 2 and st.dropped_bad_altitude == 1


def test_failed_hour_does_not_kill_the_day(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def boom(
        day: date, names: list[str], flt: ax.Filter, workers: int
    ) -> tuple[pd.DataFrame, ax.SnapshotStats]:
        if names[0].startswith("01"):
            raise RuntimeError("simulated failure")
        return ax.parse_snapshot(_snapshot(AIRCRAFT), flt)[0], ax.SnapshotStats(snapshots_ok=1)

    monkeypatch.setattr(ax, "ingest_snapshots", boom)
    s = ax.ingest_day(date(2026, 1, 1), tmp_path, hours=[0, 1, 2], flt=FLT, workers=1)
    assert s["hours_done"] == [0, 2] and 1 in s["hours_failed"] and not s["day_complete"]


def test_dropped_connection_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    import requests

    calls = {"n": 0}

    class Resp:
        status_code = 200
        content = _snapshot(AIRCRAFT)

        def raise_for_status(self) -> None:
            return None

    class Sess:
        def get(self, url: str, timeout: int) -> Resp:
            calls["n"] += 1
            if calls["n"] == 1:
                raise requests.exceptions.ChunkedEncodingError("Connection broken: IncompleteRead")
            return Resp()

    monkeypatch.setattr(ax._time, "sleep", lambda s: None)
    df, st = ax._fetch_and_parse(Sess(), date(2026, 1, 1), "000000Z", FLT)  # type: ignore[arg-type]
    assert calls["n"] == 2 and len(df) == 2 and st.snapshots_ok == 1
