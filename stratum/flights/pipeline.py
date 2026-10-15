"""Raw ADS-B day → cruise segments with aircraft info (build prompt §2.1, all steps).

``build_flight_segments`` chains the trajectory steps and returns the segment table, a
one-row-per-flight table and a log of how much every step removed (build prompt §2.1:
"each step logging how many points/flights it removed").

Corridor selection (``corridor`` given): a flight is kept if at least one of its cruise
segments has its midpoint inside the corridor polygon, and then the **whole** flight is kept
(CoCiP needs complete trajectories); ``in_corridor`` marks the segments inside.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import Polygon

from stratum.flights import aircraft as ac
from stratum.flights import resample as rs
from stratum.flights.classify import classify
from stratum.flights.clean import assign_flights, basic_clean, cruise_cut, implausibility_filter


def build_flight_segments(
    adsb: pd.DataFrame,
    aircraft_db: pd.DataFrame,
    corridor: Polygon | None = None,
    mass_fraction: float = ac.MASS_FRACTION,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    log: dict[str, Any] = {"reports_in": len(adsb)}
    clean, removed1 = basic_clean(adsb)
    log["step1_removed"] = removed1
    flights = assign_flights(clean)
    log["step2_flights"] = int(flights["flight_id"].nunique())
    filt, removed3 = implausibility_filter(flights)
    log["step3_removed"] = removed3
    cruise, n_low = cruise_cut(filt)
    log["step4_removed_below_FL250"] = n_low
    log["step4_flights_with_cruise"] = int(cruise["flight_id"].nunique())
    wp = rs.resample_flights(cruise)
    log["step5_waypoints"] = len(wp)
    log["step6_filled_waypoints"] = int(wp["filled"].sum()) if len(wp) else 0
    log["step6_pieces"] = int(wp["flight_id"].nunique()) if len(wp) else 0
    seg = rs.make_segments(wp)
    log["step7_segments"] = len(seg)

    if corridor is not None and len(seg):
        inside = shapely.contains_xy(corridor, seg["lon_mid"].to_numpy(), seg["lat_mid"].to_numpy())
        seg["in_corridor"] = inside
        base = seg["flight_id"].str.split(".").str[0]
        keep_base = set(base[inside])
        seg = seg[base.isin(keep_base)].reset_index(drop=True)
        log["corridor_flights"] = len(keep_base)
        log["corridor_segments_inside"] = int(seg["in_corridor"].sum())
    else:
        seg["in_corridor"] = False

    # aircraft type per flight piece (type looked up on the original flight's reports)
    src = cruise.assign(base_id=cruise["flight_id"])
    seg_base = seg["flight_id"].str.split(".").str[0]
    types_in = src[src["base_id"].isin(set(seg_base))][["base_id", "icao24", "typecode"]]
    per_base, tlog = ac.resolve_types(
        types_in.rename(columns={"base_id": "flight_id"}), aircraft_db, mass_fraction
    )
    log["step8_types"] = tlog.__dict__
    callsigns = seg.groupby("flight_id")["callsign"].first()
    per = pd.DataFrame({"flight_id": seg["flight_id"].unique()})
    per["base_id"] = per["flight_id"].str.split(".").str[0]
    per = per.merge(per_base.rename(columns={"flight_id": "base_id"}), on="base_id", how="left")
    per["callsign"] = per["flight_id"].map(callsigns)
    per["icao24"] = per["flight_id"].str.split("_").str[0]
    per = classify(per)
    log["step9_commercial_flights"] = int(per["commercial"].sum())
    log["step9_reasons"] = per["commercial_reason"].value_counts().to_dict()
    log["indian_registered_share"] = float(np.mean(per["indian_registered"])) if len(per) else None
    return seg, per, log
