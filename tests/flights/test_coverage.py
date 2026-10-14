"""Tests for the coverage audit (paper §3.3 decision rule) on synthetic flights."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from stratum.config import corridor_polygon, great_circle, load_domain
from stratum.flights import coverage as cv
from stratum.io.adsb_schema import COLUMNS

P = cv.AuditParams()
CORR = load_domain().corridor
POLY = corridor_polygon(CORR)


def _track(
    icao: str,
    callsign: str,
    start: str,
    southbound: bool,
    every_min: float,
    drop_minutes: tuple[float, float] | None = None,
) -> pd.DataFrame:
    """A flight along the VIDP–VABB great circle at FL350, ~90 min long."""
    line = np.asarray(great_circle(CORR).coords)  # lon, lat from VIDP to VABB
    if not southbound:
        line = line[::-1]
    n = int(90 / every_min) + 1
    idx = np.linspace(0, len(line) - 1, n)
    lon = np.interp(idx, np.arange(len(line)), line[:, 0])
    lat = np.interp(idx, np.arange(len(line)), line[:, 1])
    t = pd.Timestamp(start, tz="UTC") + pd.to_timedelta(np.arange(n) * every_min, unit="min")
    df = pd.DataFrame(
        {
            "icao24": icao,
            "callsign": callsign,
            "time": t.astype("datetime64[ns, UTC]"),
            "lat": lat,
            "lon": lon,
            "baro_alt_ft": 35000.0,
            "geo_alt_ft": np.nan,
            "gs_kt": 450.0,
            "track_deg": 200.0,
            "vrate_fpm": 0.0,
            "on_ground": False,
            "source": "adsbx",
            "typecode": "A20N",
            "registration": "VT-X",
        }
    )[list(COLUMNS)]
    if drop_minutes:
        m = (t - t[0]).total_seconds() / 60
        df = df[~((m > drop_minutes[0]) & (m < drop_minutes[1]))]
    return df


def _schedule(tmp_path: Path) -> pd.DataFrame:
    rows = [
        "date,direction,airline,flight_number,sched_dep_utc,source_url,checked_by",
        "2026-01-01,DEL-BOM,6E,2134,2026-01-01T02:30:00Z,x,test",  # observed, continuous
        "2026-01-01,DEL-BOM,AI,887,2026-01-01T04:00:00Z,x,test",  # observed with 15-min gap
        "2026-01-01,BOM-DEL,QP,1101,2026-01-01T06:00:00Z,x,test",  # callsign differs: time match
        "2026-01-01,BOM-DEL,SG,8701,2026-01-01T08:00:00Z,x,test",  # not observed
    ]
    p = tmp_path / "s.csv"
    p.write_text("\n".join(rows) + "\n")
    return cv.load_schedule(p)


def _adsb() -> pd.DataFrame:
    return pd.concat(
        [
            _track("800001", "IGO2134", "2026-01-01T02:50", True, 1.0),
            _track("800002", "AIC887", "2026-01-01T04:20", True, 1.0, drop_minutes=(30, 46)),
            _track("800003", "AKJ71X", "2026-01-01T06:25", False, 0.5),
            _track("800004", "IGO999", "2026-01-01T10:00", True, 1.0),  # not in the schedule
        ],
        ignore_index=True,
    )


def test_audit_day_counts(tmp_path: Path) -> None:
    rows, _matched, tracks = cv.audit_day(_schedule(tmp_path), _adsb(), "adsbx", POLY, P)
    by = {r["direction"]: r for r in rows}
    assert by["DEL-BOM"]["scheduled"] == 2 and by["DEL-BOM"]["observed"] == 2
    assert by["DEL-BOM"]["continuous"] == 1  # the 15-min gap breaks continuity
    assert by["BOM-DEL"]["scheduled"] == 2 and by["BOM-DEL"]["observed"] == 1
    assert by["BOM-DEL"]["matched_by_time_window"] == 1
    assert by["DEL-BOM"]["unscheduled_corridor_tracks"] == 1
    assert set(tracks["direction"]) == {"DEL-BOM", "BOM-DEL"}


def test_decide_source_is_mechanical() -> None:
    def res(src: str, cont: int, sched: int) -> dict[str, object]:
        return {"source": src, "continuous": cont, "scheduled": sched}

    yes = cv.decide_source(pd.DataFrame([res("opensky", 50, 100), res("adsbx", 90, 100)]), P)
    assert yes["chosen_source"] == "opensky"  # exactly 0.50 counts as "at least half"
    no = cv.decide_source(pd.DataFrame([res("opensky", 49, 100), res("adsbx", 90, 100)]), P)
    assert no["chosen_source"] == "adsbx"
    none = cv.decide_source(pd.DataFrame([res("adsbx", 90, 100)]), P)
    assert none["chosen_source"] == "adsbx" and none["opensky_fraction"] is None


def test_schedule_rejects_bad_direction(tmp_path: Path) -> None:
    p = tmp_path / "bad.csv"
    p.write_text(
        "date,direction,airline,flight_number,sched_dep_utc,source_url,checked_by\n"
        "2026-01-01,DEL-MAA,6E,1,2026-01-01T00:00:00Z,x,y\n"
    )
    try:
        cv.load_schedule(p)
    except ValueError as e:
        assert "direction" in str(e)
    else:
        raise AssertionError("bad direction accepted")


def test_run_audit_writes_reports(tmp_path: Path) -> None:
    sched_path = tmp_path / "s.csv"
    _schedule(tmp_path)  # writes tmp_path / "s.csv"
    res = cv.run_audit(sched_path, {("adsbx", "2026-01-01"): _adsb()}, POLY, tmp_path / "out", P)
    assert res["decision"]["chosen_source"] == "adsbx"  # OpenSky not audited
    for f in ["coverage_audit.csv", "coverage_audit.md", "track_density.png", "gap_histogram.png"]:
        assert (tmp_path / "out" / f).exists()
