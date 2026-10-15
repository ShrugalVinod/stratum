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

3. **Implausibility filter** (pre-registered): a report is dropped when the vertical rate
   from the previous report exceeds **6,000 ft/min** or the ground speed jumps by more than
   **100 kt**. Rates are recomputed after each pass, at most **3 passes**. A point is blamed
   when *both* of its transitions break a limit (a one-point spike); a lone bad transition
   blames whichever end is further from the track's running median. Pairs closer than 2 s
   are not rate-checked (altitude is quantised to 25 ft, so a 1-s pair can look like a
   1,500 ft/min climb).
4. **Cruise cut**: keep barometric altitude ≥ FL250 (pre-registered).

Every step returns how many rows it removed, so each run can log it (build prompt §2.1).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

FLIGHT_SPLIT_GAP_MIN = 30.0  # build prompt §2.1 step 2 / §1.5 step 2
MAX_VRATE_FPM = 6000.0  # preregistered.yaml trajectory.max_vertical_rate_fpm
MAX_GS_JUMP_KT = 100.0  # preregistered.yaml trajectory.max_groundspeed_jump_kt
MAX_PASSES = 3
MIN_RATE_DT_S = 2.0
CRUISE_MIN_FT = 25000.0  # FL250


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


def _bad_transitions(g: pd.DataFrame, max_vrate: float, max_gs_jump: float) -> np.ndarray:
    """Boolean per row: the transition *into* this row (from the previous row) breaks a limit."""
    dt = g["time"].diff().dt.total_seconds().to_numpy()
    dalt = g["baro_alt_ft"].diff().to_numpy()
    with np.errstate(invalid="ignore", divide="ignore"):
        vrate = np.abs(dalt) / (dt / 60.0)
    vbad = (dt >= MIN_RATE_DT_S) & (vrate > max_vrate)
    gs_jump = np.abs(g["gs_kt"].astype(float).diff().to_numpy())
    gbad = gs_jump > max_gs_jump  # NaN (blanked speed) compares False
    bad = vbad | gbad
    bad[0] = False
    return np.asarray(bad, dtype=bool)


def _deviation(g: pd.DataFrame, window: int = 9) -> np.ndarray:
    """How far each report sits from the running median of its track (unitless)."""
    alt = g["baro_alt_ft"].astype(float)
    gs = g["gs_kt"].astype(float)
    alt_dev = (alt - alt.rolling(window, center=True, min_periods=1).median()).abs() / 1000.0
    gs_dev = (gs - gs.rolling(window, center=True, min_periods=1).median()).abs() / 50.0
    return np.asarray(np.fmax(alt_dev.to_numpy(), gs_dev.fillna(0).to_numpy()))


def implausibility_filter(
    df: pd.DataFrame,
    max_vrate_fpm: float = MAX_VRATE_FPM,
    max_gs_jump_kt: float = MAX_GS_JUMP_KT,
    max_passes: int = MAX_PASSES,
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Step 3: drop spikes, flight by flight, re-checking up to ``max_passes`` times."""
    if df.empty:
        return df, {f"pass_{i + 1}": 0 for i in range(max_passes)}
    keep_parts: list[pd.DataFrame] = []
    removed = dict.fromkeys((f"pass_{i + 1}" for i in range(max_passes)), 0)
    for _, g in df.groupby("flight_id", sort=False):
        g = g.sort_values("time")
        for i in range(max_passes):
            into = _bad_transitions(g, max_vrate_fpm, max_gs_jump_kt)
            if not into.any():
                break
            out_of = np.append(into[1:], False)
            spike = into & out_of
            # A bad transition not explained by a spike blames whichever end sits further
            # from the track's running median (altitude in 1,000 ft, speed in 50 kt units).
            explained = spike | np.append(False, spike[:-1])
            lone = np.flatnonzero(into & ~explained)
            dev = _deviation(g)
            drop = spike.copy()
            for j in lone:
                drop[j if dev[j] >= dev[j - 1] else j - 1] = True
            removed[f"pass_{i + 1}"] += int(drop.sum())
            g = g[~drop]
        keep_parts.append(g)
    return pd.concat(keep_parts, ignore_index=True), removed


def cruise_cut(df: pd.DataFrame, min_ft: float = CRUISE_MIN_FT) -> tuple[pd.DataFrame, int]:
    """Step 4: keep reports at or above FL250 (barometric)."""
    out = df[df["baro_alt_ft"] >= min_ft].reset_index(drop=True)
    return out, len(df) - len(out)


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
