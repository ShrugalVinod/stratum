"""One-minute flight waypoints and segments (paper §4.2; build prompt §2.1 steps 5–7).

What it does
------------
Takes cleaned cruise reports (after ``clean.py`` steps 1–4) and turns each flight into
waypoints exactly on whole UTC minutes, then into segments between consecutive waypoints.

5. **Resample to 1 minute.** For each whole minute between a flight's first and last report,
   the position is interpolated along the great circle between the two reports either side of
   it (time-weighted), and the altitude linearly.
6. **Gaps** (pre-registered). If the two reports either side are more than one resample step
   (60 s) apart, the minute lies in a *gap*:

   * gap ≤ 10 min → position still along the great circle, but altitude held at the report
     before the gap, and ``filled = True``;
   * gap > 10 min → no waypoints inside it, and the flight is split there. Pieces after the
     first get a suffix: ``<flight_id>.1``, ``<flight_id>.2`` …

   Treating any interval longer than one resample step as a gap is our reading of "gaps" for
   5-second ADS-B data (decision logged 2026-10-15).
7. **Segments.** Each pair of consecutive waypoints of one piece is a segment with start/end
   position, great-circle midpoint, initial heading, length (km), duration (s), mean altitude,
   ground speed from length/duration, ``filled`` (either end filled) and
   ``segment_id = "<flight_id>_<idx:04d>"``. True airspeed needs ERA5 winds and is added in
   ``stratum/met``.

All maths is vectorised per flight with NumPy; positions use a spherical Earth (R = 6371 km),
which is ample for 1-minute (~15 km) steps.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

EARTH_RADIUS_KM = 6371.0
STEP_S = 60  # preregistered.yaml trajectory.resample_min = 1
GAP_S = 60  # an interval longer than one step counts as a gap
MAX_FILL_S = 600  # preregistered.yaml trajectory.max_fill_gap_min = 10
MAX_IMPLIED_KT = 750.0  # an interval implying a faster ground speed is a position jump
JUMP_SLACK_KM = 3.0

WAYPOINT_COLUMNS = [
    "flight_id",
    "icao24",
    "callsign",
    "time",
    "lat",
    "lon",
    "baro_alt_ft",
    "filled",
]


def _xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def _latlon(v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1))), np.degrees(
        np.arctan2(v[..., 1], v[..., 0])
    )


def slerp(
    lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray, f: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Point a fraction ``f`` of the way along the great circle from point 1 to point 2."""
    a, b = _xyz(np.asarray(lat1), np.asarray(lon1)), _xyz(np.asarray(lat2), np.asarray(lon2))
    omega = np.arccos(np.clip(np.sum(a * b, axis=-1), -1.0, 1.0))
    f = np.asarray(f, dtype=float)
    with np.errstate(invalid="ignore", divide="ignore"):
        so = np.sin(omega)
        wa = np.where(so > 1e-12, np.sin((1 - f) * omega) / so, 1 - f)
        wb = np.where(so > 1e-12, np.sin(f * omega) / so, f)
    return _latlon(wa[..., None] * a + wb[..., None] * b)


def haversine_km(
    lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray
) -> np.ndarray:
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return np.asarray(2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(h, 0, 1))))


def initial_bearing_deg(
    lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray
) -> np.ndarray:
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(np.asarray(lon2) - np.asarray(lon1))
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return np.asarray(np.degrees(np.arctan2(y, x)) % 360.0)


def resample_flight(
    g: pd.DataFrame,
    step_s: int = STEP_S,
    gap_s: int = GAP_S,
    max_fill_s: int = MAX_FILL_S,
    max_implied_kt: float = MAX_IMPLIED_KT,
) -> pd.DataFrame:
    """Steps 5–6 for one flight (rows sorted by time, one ``flight_id``)."""
    g = g.sort_values("time")
    t = g["time"].dt.as_unit("s").astype("int64").to_numpy()  # epoch seconds (any unit in)
    if len(t) < 2:
        return pd.DataFrame(columns=WAYPOINT_COLUMNS)
    lat, lon = g["lat"].to_numpy(float), g["lon"].to_numpy(float)
    alt = g["baro_alt_ft"].to_numpy(float)
    grid = np.arange(-(-t[0] // step_s) * step_s, t[-1] + 1, step_s)  # whole minutes
    if grid.size == 0:
        return pd.DataFrame(columns=WAYPOINT_COLUMNS)
    nxt = np.clip(np.searchsorted(t, grid, side="left"), 1, len(t) - 1)
    exact = t[nxt] == grid
    prv = np.where(exact, nxt, nxt - 1)
    span = (t[nxt] - t[prv]).astype(float)
    in_gap = span > gap_s
    dt_rep = np.diff(t).astype(float)
    # A jump: further than 750 kt could carry the aircraft, plus 3 km for position noise
    # (reports ~1 s apart with ~0.3 km jitter would otherwise look supersonic).
    dist_km = haversine_km(lat[:-1], lon[:-1], lat[1:], lon[1:])
    jump = dist_km > max_implied_kt * 1.852 / 3600.0 * dt_rep + JUMP_SLACK_KM
    breaks = (dt_rep > max_fill_s) | jump  # interval index i = between report i and i+1
    keep = (span <= max_fill_s) & ~np.where(
        prv < nxt, breaks[np.minimum(prv, len(breaks) - 1)], False
    )
    with np.errstate(invalid="ignore", divide="ignore"):
        f = np.where(span > 0, (grid - t[prv]) / span, 0.0)
    wlat, wlon = slerp(lat[prv], lon[prv], lat[nxt], lon[nxt], f)
    walt = np.where(in_gap, alt[prv], alt[prv] + f * (alt[nxt] - alt[prv]))
    # A new piece starts after every unfilled (> max_fill_s) gap.
    piece_of_report = np.concatenate([[0], np.cumsum(breaks)])
    piece = piece_of_report[prv]
    base = str(g["flight_id"].iloc[0])
    ids = np.array([base if k == 0 else f"{base}.{k}" for k in piece], dtype=object)
    out = pd.DataFrame(
        {
            "flight_id": ids,
            "icao24": g["icao24"].iloc[0],
            "callsign": g["callsign"].dropna().mode().iloc[0]
            if g["callsign"].notna().any()
            else None,
            "time": pd.to_datetime(grid, unit="s", utc=True),
            "lat": wlat,
            "lon": wlon,
            "baro_alt_ft": walt,
            "filled": in_gap & ~exact,
        }
    )
    return out[keep].reset_index(drop=True)


def resample_flights(df: pd.DataFrame, **kw: Any) -> pd.DataFrame:
    """Steps 5–6 for every flight in ``df`` (needs ``flight_id``)."""
    parts = [resample_flight(g, **kw) for _, g in df.groupby("flight_id", sort=False)]
    parts = [p for p in parts if len(p)]
    if not parts:
        return pd.DataFrame(columns=WAYPOINT_COLUMNS)
    return pd.concat(parts, ignore_index=True)


def make_segments(wp: pd.DataFrame) -> pd.DataFrame:
    """Step 7: one row per pair of consecutive waypoints of the same piece."""
    wp = wp.sort_values(["flight_id", "time"]).reset_index(drop=True)
    same = wp["flight_id"].eq(wp["flight_id"].shift(-1)).to_numpy()
    a = wp[same].reset_index(drop=True)
    b = wp.shift(-1)[same].reset_index(drop=True)
    idx = a.groupby("flight_id", sort=False).cumcount()
    mid_lat, mid_lon = slerp(
        a["lat"].to_numpy(),
        a["lon"].to_numpy(),
        b["lat"].to_numpy(),
        b["lon"].to_numpy(),
        np.asarray(0.5),
    )
    length = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
    duration = (b["time"] - a["time"]).dt.total_seconds().to_numpy()
    seg = pd.DataFrame(
        {
            "segment_id": a["flight_id"] + "_" + idx.map("{:04d}".format),
            "flight_id": a["flight_id"],
            "icao24": a["icao24"],
            "callsign": a["callsign"],
            "time_start": a["time"],
            "time_end": b["time"],
            "time_mid": a["time"] + (b["time"] - a["time"]) / 2,
            "lat_start": a["lat"],
            "lon_start": a["lon"],
            "lat_end": b["lat"].astype(float),
            "lon_end": b["lon"].astype(float),
            "lat_mid": mid_lat,
            "lon_mid": mid_lon,
            "alt_ft_start": a["baro_alt_ft"],
            "alt_ft_end": b["baro_alt_ft"].astype(float),
            "alt_ft_mid": (a["baro_alt_ft"] + b["baro_alt_ft"].astype(float)) / 2,
            "heading_deg": initial_bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"]),
            "length_km": length,
            "duration_s": duration,
            "gs_kt_seg": length / np.where(duration > 0, duration, np.nan) * 3600 / 1.852,
            "filled": a["filled"].astype(bool) | b["filled"].astype(bool),
        }
    )
    return seg
