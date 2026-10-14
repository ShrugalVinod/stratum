"""Coverage audit: how much of the Delhi–Mumbai traffic does each ADS-B source capture?

What it does
------------
Before modelling anything, the paper (§3.3) commits to a rule for choosing the flight-data
source. For a sample of days:

    fraction = (scheduled DEL↔BOM flights that we observe with a *continuous cruise track*)
               ÷ (scheduled DEL↔BOM flights that day)

A cruise track is **continuous** if, while the aircraft is inside the corridor polygon at
or above FL250, no two consecutive position reports are more than **10 minutes** apart
(``preregistered.yaml: coverage_rule.max_gap_min``). If OpenSky's fraction is
**≥ 0.50** → use OpenSky for every month; otherwise → use the 12 free ADS-B Exchange days
and say so in every result. The decision is applied **mechanically** by
:func:`decide_source`; nobody chooses.

Scheduled flights are ground truth only humans can provide, so they come from
``data/reference/scheduled_flights.csv`` (template:
``data/reference/scheduled_flights_template.csv``; build prompt §4.1).

How an observed track is matched to a scheduled flight
------------------------------------------------------
1. **By flight number.** The schedule gives an airline + number (e.g. IndiGo 6E 2134); the
   ADS-B callsign is ICAO airline code + number (IGO2134). Callsign numbers sometimes carry
   a letter suffix (IGO461H), so we compare airline + digits.
2. **By time** (fallback, for callsigns that don't follow the flight number): same airline,
   direction, and the track's first corridor report within ``time_window_min`` after
   scheduled departure. One track can match only one scheduled flight.

Direction comes from the track itself: moving south (latitude falling) inside the corridor =
DEL→BOM. Only commercial flights are expected in the schedule, so the airline codes used
are the human-reviewed ones in ``configs/airlines.yaml`` plus the IATA→ICAO table below.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import Polygon

from stratum.flights.clean import assign_flights, basic_clean

# IATA (schedules) → ICAO (callsigns) for carriers on the corridor. Extend with care.
IATA_TO_ICAO: dict[str, str] = {"6E": "IGO", "AI": "AIC", "IX": "AXB", "QP": "AKJ", "SG": "SEJ"}
DIRECTIONS = ("DEL-BOM", "BOM-DEL")
SCHEDULE_COLUMNS = (
    "date",
    "direction",
    "airline",
    "flight_number",
    "sched_dep_utc",
    "source_url",
    "checked_by",
)


@dataclass(frozen=True)
class AuditParams:
    max_gap_min: float = 10.0  # pre-registered (coverage_rule.max_gap_min)
    min_fraction: float = 0.50  # pre-registered (coverage_rule.min_fraction_continuous)
    cruise_fl: int = 250  # pre-registered (domain.min_flight_level)
    min_corridor_minutes: float = 20.0  # a real corridor flight spends ≥ 20 min in it
    time_window_min: float = 90.0  # first corridor report within 90 min of sched. departure

    @classmethod
    def from_preregistered(cls) -> AuditParams:
        from stratum.config import load_preregistered

        p = load_preregistered()
        return cls(
            max_gap_min=p.coverage_rule.max_gap_min,
            min_fraction=p.coverage_rule.min_fraction_continuous,
            cruise_fl=p.domain.min_flight_level,
        )


def _digits(s: str) -> str:
    m = re.search(r"(\d+)", s)
    return str(int(m.group(1))) if m else ""


def load_schedule(path: str | Any) -> pd.DataFrame:
    """Read and check the human-filled schedule CSV; adds icao airline and number columns."""
    df = pd.read_csv(path, dtype=str).fillna("")
    missing = [c for c in SCHEDULE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"schedule CSV is missing columns: {missing}")
    bad_dir = sorted(set(df["direction"]) - set(DIRECTIONS))
    if bad_dir:
        raise ValueError(f"direction must be DEL-BOM or BOM-DEL, got {bad_dir}")
    df["airline_icao"] = df["airline"].str.upper().map(lambda a: IATA_TO_ICAO.get(a, a))
    df["number"] = df["flight_number"].map(_digits)
    df["sched_dep_utc"] = pd.to_datetime(df["sched_dep_utc"], utc=True)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def corridor_tracks(adsb: pd.DataFrame, corridor: Polygon, p: AuditParams) -> pd.DataFrame:
    """One row per flight that cruises in the corridor: direction, timing and continuity."""
    clean, _ = basic_clean(adsb)
    flights = assign_flights(clean)
    inside = shapely.contains_xy(corridor, flights["lon"].to_numpy(), flights["lat"].to_numpy())
    cruise = flights[inside & (flights["baro_alt_ft"] >= p.cruise_fl * 100)]
    if cruise.empty:
        return pd.DataFrame(
            columns=[
                "flight_id",
                "callsign",
                "airline_icao",
                "number",
                "direction",
                "t_first",
                "t_last",
                "minutes_in_corridor",
                "max_gap_min",
                "n_reports",
                "continuous",
            ]
        )
    g = cruise.groupby("flight_id", sort=False)
    gaps = g["time"].diff().dt.total_seconds().div(60.0)
    out = pd.DataFrame(
        {
            "callsign": g["callsign"].agg(lambda s: s.dropna().iloc[0] if s.notna().any() else ""),
            "t_first": g["time"].min(),
            "t_last": g["time"].max(),
            "lat_first": g["lat"].first(),
            "lat_last": g["lat"].last(),
            "n_reports": g.size(),
            "max_gap_min": gaps.groupby(cruise["flight_id"]).max().fillna(0.0),
        }
    )
    out["minutes_in_corridor"] = (out["t_last"] - out["t_first"]).dt.total_seconds() / 60.0
    out["direction"] = np.where(out["lat_last"] < out["lat_first"], "DEL-BOM", "BOM-DEL")
    out["airline_icao"] = out["callsign"].str[:3]
    out["number"] = out["callsign"].map(lambda c: _digits(c[3:]) if c else "")
    out = out[out["minutes_in_corridor"] >= p.min_corridor_minutes]
    out["continuous"] = out["max_gap_min"] <= p.max_gap_min
    return out.reset_index().drop(columns=["lat_first", "lat_last"])


def match_schedule(sched: pd.DataFrame, tracks: pd.DataFrame, p: AuditParams) -> pd.DataFrame:
    """Attach the matched track (if any) to each scheduled flight; one track per flight."""
    out = sched.copy()
    out["flight_id"] = None
    out["match_method"] = None
    out["continuous"] = False
    used: set[str] = set()

    def take(i: Any, row: pd.Series, method: str) -> None:
        out.loc[i, "flight_id"] = row["flight_id"]
        out.loc[i, "match_method"] = method
        out.loc[i, "continuous"] = bool(row["continuous"])
        used.add(row["flight_id"])

    # Pass 1: airline + flight number + direction.
    for i, s in out.iterrows():
        c = tracks[
            (tracks["airline_icao"] == s["airline_icao"])
            & (tracks["number"] == s["number"])
            & (tracks["direction"] == s["direction"])
            & ~tracks["flight_id"].isin(used)
        ]
        if len(c):
            take(i, c.iloc[0], "flight_number")
    # Pass 2: airline + direction + time window, nearest in time.
    for i, s in out[out["flight_id"].isna()].iterrows():
        c = tracks[
            (tracks["airline_icao"] == s["airline_icao"])
            & (tracks["direction"] == s["direction"])
            & ~tracks["flight_id"].isin(used)
        ]
        dt = (c["t_first"] - s["sched_dep_utc"]).dt.total_seconds() / 60.0
        c = c[(dt >= 0) & (dt <= p.time_window_min)]
        if len(c):
            take(i, c.loc[dt[c.index].idxmin()], "time_window")
    return out


def audit_day(
    sched_day: pd.DataFrame, adsb_day: pd.DataFrame, source: str, corridor: Polygon, p: AuditParams
) -> tuple[list[dict[str, Any]], pd.DataFrame, pd.DataFrame]:
    """Audit one day for one source → (rows per direction, matched schedule, tracks)."""
    tracks = corridor_tracks(adsb_day, corridor, p)
    matched = match_schedule(sched_day, tracks, p)
    rows = []
    for d in DIRECTIONS:
        m = matched[matched["direction"] == d]
        n_sched = len(m)
        n_obs = int(m["flight_id"].notna().sum())
        n_cont = int(m["continuous"].sum())
        rows.append(
            {
                "date": str(sched_day["date"].iloc[0]) if len(sched_day) else None,
                "source": source,
                "direction": d,
                "scheduled": n_sched,
                "observed": n_obs,
                "continuous": n_cont,
                "fraction_continuous": round(n_cont / n_sched, 4) if n_sched else None,
                "matched_by_time_window": int((m["match_method"] == "time_window").sum()),
                "unscheduled_corridor_tracks": int(
                    (
                        ~tracks["flight_id"].isin(m["flight_id"].dropna())
                        & (tracks["direction"] == d)
                    ).sum()
                ),
            }
        )
    return rows, matched, tracks


def decide_source(results: pd.DataFrame, p: AuditParams) -> dict[str, Any]:
    """Apply the pre-registered rule mechanically to the pooled OpenSky result.

    Pooled fraction = Σ continuous ÷ Σ scheduled over all audited days and both directions.
    If OpenSky wasn't audited (no access), its fraction is treated as 0 → ADS-B Exchange.
    """

    def pooled(src: str) -> float | None:
        r = results[results["source"] == src]
        n = r["scheduled"].sum()
        return float(r["continuous"].sum() / n) if n else None

    f_os, f_ax = pooled("opensky"), pooled("adsbx")
    choice = "opensky" if (f_os is not None and f_os >= p.min_fraction) else "adsbx"
    reason = (
        f"OpenSky pooled fraction {f_os:.3f} {'≥' if choice == 'opensky' else '<'} {p.min_fraction}"
        if f_os is not None
        else "OpenSky not audited (no historical access) → treated as 0"
    )
    return {
        "chosen_source": choice,
        "opensky_fraction": f_os,
        "adsbx_fraction": f_ax,
        "rule": f"opensky if fraction ≥ {p.min_fraction} (max gap {p.max_gap_min} min) else adsbx",
        "reason": reason,
    }


# ── Full audit run: reports, figures, mechanical decision ────────────────────


def run_audit(
    schedule_path: Any,
    adsb_days: dict[tuple[str, str], pd.DataFrame],
    corridor: Polygon,
    out_dir: Any,
    p: AuditParams | None = None,
) -> dict[str, Any]:
    """Audit every (source, date) given → CSV + markdown + figures + decision.

    ``adsb_days`` maps (source, "YYYY-MM-DD") → that day's normalised ADS-B frame.
    Days in the schedule with no ADS-B data for a source are reported as "not available".
    """
    from pathlib import Path

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    p = p or AuditParams.from_preregistered()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sched = load_schedule(schedule_path)
    rows: list[dict[str, Any]] = []
    all_tracks: list[pd.DataFrame] = []
    all_points: list[pd.DataFrame] = []
    for (source, day), adsb in sorted(adsb_days.items()):
        s_day = sched[sched["date"].astype(str) == day]
        if s_day.empty:
            continue
        r, matched, tracks = audit_day(s_day, adsb, source, corridor, p)
        rows.extend(r)
        matched.assign(source=source).to_csv(out / f"matched_{source}_{day}.csv", index=False)
        all_tracks.append(tracks.assign(source=source, date=day))
        all_points.append(adsb[["lat", "lon"]].assign(source=source))
    results = pd.DataFrame(rows)
    if results.empty:
        raise ValueError("no audit day had both a schedule and ADS-B data")
    results.to_csv(out / "coverage_audit.csv", index=False)
    decision = decide_source(results, p)

    # Figures: track density per source; histogram of max in-corridor gaps.
    srcs = sorted({k[0] for k in adsb_days})
    fig, axes = plt.subplots(1, len(srcs), figsize=(5 * len(srcs), 5), squeeze=False)
    for ax, src in zip(axes[0], srcs, strict=True):
        mine = [a for a in all_points if a["source"].iloc[0] == src]
        pts = pd.concat(mine) if mine else None
        if pts is not None and len(pts):
            ax.hexbin(pts["lon"], pts["lat"], gridsize=80, bins="log", cmap="cividis", mincnt=1)
        ax.plot(*corridor.exterior.xy, color="#c0392b", lw=1)
        ax.set_title(f"{src}: position reports ≥ FL200 (log density)", fontsize=9)
        ax.set_xlabel("lon (°E)")
        ax.set_ylabel("lat (°N)")
    fig.tight_layout()
    fig.savefig(out / "track_density.png", dpi=150)
    plt.close(fig)
    tr = pd.concat(all_tracks) if all_tracks else pd.DataFrame()
    fig, ax = plt.subplots(figsize=(6, 4))
    for src in srcs:
        g = tr[tr["source"] == src]["max_gap_min"] if len(tr) else []
        ax.hist(g, bins=list(range(61)), alpha=0.6, label=src)
    ax.axvline(p.max_gap_min, color="#c0392b", ls="--", label=f"{p.max_gap_min:g}-min rule")
    ax.set_xlabel("largest gap between reports inside the corridor ≥ FL250 (min)")
    ax.set_ylabel("corridor flights")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out / "gap_histogram.png", dpi=150)
    plt.close(fig)

    lines = [
        "# Coverage audit — Delhi–Mumbai corridor",
        "",
        f"Rule (paper §3.3, pre-registered): {decision['rule']}.",
        "",
        f"**Decision (mechanical): `{decision['chosen_source']}`** — {decision['reason']}.",
        "",
        "| date | source | direction | scheduled | observed | continuous | fraction |",
        "|---|---|---|---|---|---|---|",
    ]
    for _, r in results.iterrows():
        frac = "—" if r["fraction_continuous"] is None else f"{r['fraction_continuous']:.2f}"
        lines.append(
            f"| {r['date']} | {r['source']} | {r['direction']} | {r['scheduled']} | "
            f"{r['observed']} | {r['continuous']} | {frac} |"
        )
    lines += ["", "![track density](track_density.png)", "", "![gaps](gap_histogram.png)", ""]
    (out / "coverage_audit.md").write_text("\n".join(lines) + "\n")
    return {"decision": decision, "rows": len(results), "out_dir": str(out)}
