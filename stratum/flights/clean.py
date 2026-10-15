"""Trajectory cleaning, step by step (paper §4.2; build prompt §2.1).

What it does (so far)
---------------------
Phase 1 needs only the first two cleaning steps, used by the data reports and the coverage
audit. Phase 2 adds the rest (implausibility filter, FL250 cut, 1-minute resampling, gap
filling) in this module.

1. **Basic cleaning**: drop on-ground reports, rows with missing time/position/altitude, and
   exact duplicates; sort by (icao24, time).
2. **Flight reconstruction**: one aircraft (icao24) flies many flights a day. A new flight
   starts when the gap since the aircraft's previous report is **> 30 minutes** or the
   **callsign changes**. Reports with no callsign take the callsign of the aircraft's nearest
   report in the same track, so a missing callsign alone never splits a flight. Each flight
   gets ``flight_id = "<icao24>_<YYYYmmddTHHMM of first report>"``.

   *Callsign flicker.* ADS-B Exchange merges many receivers, and some aircraft alternate
   between two callsigns every few seconds (seen: ETH606 ↔ ETH873, KQA204 ↔ KQA205). On
   2025-03-01 00–12 UTC there were ~4,500 such A→B→A flips, which split flights into fragments
   of a minute or less. So a callsign change counts only when it is **final within the
   track**: the flight is cut between two reports only if no callsign seen before the cut
   appears again after it (before the next > 30 min gap). Alternating callsigns therefore stay
   one flight; a real change (A … A, then B … B) still splits. Decision logged 2026-10-15.

Every step returns how many rows it removed, so each run can log it (build prompt §2.1).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

FLIGHT_SPLIT_GAP_MIN = 30.0  # build prompt §2.1 step 2 / §1.5 step 2


def basic_clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Step 1: remove ground, incomplete and duplicate reports; sort. Returns (df, removed)."""
    removed: dict[str, int] = {}
    n0 = len(df)
    out = df[~df["on_ground"]]
    removed["on_ground"] = n0 - len(out)
    n1 = len(out)
    out = out.dropna(subset=["time", "lat", "lon", "baro_alt_ft"])
    removed["missing_time_pos_alt"] = n1 - len(out)
    n2 = len(out)
    out = out.drop_duplicates(subset=["icao24", "time", "lat", "lon", "baro_alt_ft"])
    removed["duplicates"] = n2 - len(out)
    out = out.sort_values(["icao24", "time"], kind="stable").reset_index(drop=True)
    return out, removed


def assign_flights(df: pd.DataFrame, max_gap_min: float = FLIGHT_SPLIT_GAP_MIN) -> pd.DataFrame:
    """Step 2: add a ``flight_id`` column. Input must be sorted by (icao24, time)."""
    if df.empty:
        return df.assign(flight_id=pd.Series(dtype=str))
    out = df.copy().reset_index(drop=True)
    same_ac = out["icao24"].eq(out["icao24"].shift())
    gap = out["time"].diff().dt.total_seconds().div(60.0)
    new_track = ~same_ac | (gap > max_gap_min)
    track = new_track.cumsum()
    # Missing callsigns take the nearest known one in the same track (never across tracks).
    cs = out.groupby(track, sort=False)["callsign"].transform(lambda s: s.ffill().bfill())
    pos = pd.Series(np.arange(len(out)), index=out.index)
    # Last row at which each (track, callsign) occurs; a track with no callsign at all is one
    # flight. Cut after row i when every callsign seen up to i is finished by i.
    last = pos.groupby([track, cs.fillna("")], sort=False).transform("max")
    reach = last.groupby(track, sort=False).cummax()
    cut_before = (reach.shift() == pos.shift()) & ~new_track
    new_flight = new_track | cut_before
    flight_no = new_flight.cumsum()
    first_time = out["time"].groupby(flight_no).transform("min")
    out["flight_id"] = out["icao24"] + "_" + first_time.dt.strftime("%Y%m%dT%H%M")
    return out


def daily_summary(df: pd.DataFrame, cruise_fl: int = 250) -> dict[str, Any]:
    """Per-day report numbers (build prompt §1.2.3).

    messages, unique ICAO24, unique callsigns, flights (after reconstruction) reaching
    ≥ ``cruise_fl``, and the median interval between consecutive reports of one aircraft.
    """
    clean, removed = basic_clean(df)
    flights = assign_flights(clean)
    reaches = flights.groupby("flight_id")["baro_alt_ft"].max() >= cruise_fl * 100
    dt = flights.groupby("icao24")["time"].diff().dt.total_seconds().dropna()
    return {
        "messages": len(df),
        "unique_icao24": int(df["icao24"].nunique()),
        "unique_callsigns": int(df["callsign"].dropna().nunique()),
        "flights": int(flights["flight_id"].nunique()) if len(flights) else 0,
        f"flights_reaching_FL{cruise_fl}": int(reaches.sum()),
        "median_report_interval_s": float(np.median(dt)) if len(dt) else None,
        "removed_in_basic_clean": removed,
    }
