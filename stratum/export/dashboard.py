"""Routes and airlines dashboard for the website: where India's contrail warming comes from.

From every commercial cruise segment of the 12 held-out flight days (Colab 12a's
``interim/weighted/<day>/segments.parquet``: raw-physics CoCiP EF and STRATUM-weighted EF of
D-006, joined to ``segments_met`` for callsign, aircraft type, level, position and time), sums by
airline, route, aircraft type, hour of day (IST), flight level and month: flights, cruise
distance, warming (positive EF), and the warming share divided by the distance share (an index:
1 = an average share of warming for the distance flown).

Routes are not in the flight data, and the tracks start high (the segments begin in the climb,
100–300 km from the airport) and are often broken into pieces where coverage drops. A flight
piece gets an origin only if it starts in a climb below ``END_FT``: the airline airport
(OurAirports, public domain: large airports, or medium ones with scheduled service) behind it
along the first segment's heading, within ``RAY_KM`` and ``RAY_OFF_KM`` of that line, a large
airport before a medium one. The destination likewise needs a descent at the end. Pieces that
start or end in cruise are "en route". Descriptive; modelled warming, not
measured. Rows with fewer than ``MIN_FLIGHTS`` flights are pooled as "other" (no single flight
can be singled out). Commercial airlines only; no flight ids are written.
"""

from __future__ import annotations

import io
import math
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

AIRPORTS_CSV = "https://davidmegginson.github.io/ourairports-data/airports.csv"
RAY_KM = 350.0
RAY_OFF_KM = 40.0
END_FT = 30_000.0  # a route end must be climbing (start) or descending (end) below this
KM_PER_FT = 0.005  # a ~3.5° climb or descent: FL250 is ~125 km from the airport
MEDIUM_PENALTY_KM = 30.0  # a medium airport must sit this much closer to the line to win
MIN_FLIGHTS = 3
TOP = 15
FL_BANDS = [(0, 280), (280, 320), (320, 340), (340, 360), (360, 380), (380, 400), (400, 500)]
SEG_COLS = ["segment_id", "flight_id", "callsign", "typecode", "alt_ft_mid", "alt_ft_start",
            "alt_ft_end", "lat_start", "lon_start", "lat_end", "lon_end", "lat_mid", "lon_mid",
            "time_start", "time_mid"]  # fmt: skip


def load_airports(bbox: tuple[tuple[float, float], tuple[float, float]]) -> pd.DataFrame:
    """Large and medium airports with an IATA code inside (a margin around) the study box."""
    with urllib.request.urlopen(AIRPORTS_CSV, timeout=60) as r:
        a = pd.read_csv(io.BytesIO(r.read()), low_memory=False)
    (la0, la1), (lo0, lo1) = bbox
    airline = (a["type"] == "large_airport") | (
        (a["type"] == "medium_airport") & (a["scheduled_service"] == "yes")
    )
    a = a[airline & a["iata_code"].notna()].copy()
    a["municipality"] = a["municipality"].fillna(a["name"])
    a = a[
        a["latitude_deg"].between(la0 - 3, la1 + 3) & a["longitude_deg"].between(lo0 - 3, lo1 + 3)
    ]
    return a.rename(
        columns={
            "iata_code": "iata",
            "municipality": "city",
            "latitude_deg": "lat",
            "longitude_deg": "lon",
        }
    )[["iata", "city", "lat", "lon", "type"]].reset_index(drop=True)


def _dist_bearing(
    lat: float, lon: float, lats: np.ndarray, lons: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    p1, p2 = math.radians(lat), np.radians(lats)
    dl = np.radians(lons - lon)
    h = np.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    d = 2 * 6371.0 * np.arcsin(np.sqrt(np.minimum(1.0, h)))
    y = np.sin(dl) * np.cos(p2)
    x = math.cos(p1) * np.sin(p2) - math.sin(p1) * np.cos(p2) * np.cos(dl)
    return d, (np.degrees(np.arctan2(y, x)) + 360) % 360


def airport_on_ray(
    lat: float, lon: float, bearing: float, ap: pd.DataFrame, alt_ft: float = math.nan
) -> str | None:
    """The airport along the ray from (lat, lon) at ``bearing`` (within RAY_KM ahead and
    RAY_OFF_KM of the line) that best fits: close to the line, at about the distance a climb or
    descent from that airport covers to reach ``alt_ft`` (KM_PER_FT), large before medium."""
    if ap.empty or not all(map(math.isfinite, (lat, lon, bearing))):
        return None
    d, b = _dist_bearing(lat, lon, ap["lat"].to_numpy(float), ap["lon"].to_numpy(float))
    rel = np.radians((b - bearing + 540) % 360 - 180)
    along, cross = d * np.cos(rel), np.abs(d * np.sin(rel))
    ok = (
        (along > -20.0) & (d <= RAY_KM) & (cross <= RAY_OFF_KM)
    )  # also a track that starts at the airport
    if not ok.any():
        return None
    # the airport closest to the line of flight, nearer ones first; a large airport before a medium one
    big = (ap["type"] == "large_airport").to_numpy() if "type" in ap else np.ones(len(ap), bool)
    expect = alt_ft * KM_PER_FT if math.isfinite(alt_ft) else 0.0
    score = cross + 0.5 * np.abs(along - expect) + np.where(big, 0.0, MEDIUM_PENALTY_KM)
    i = int(np.argmin(np.where(ok, score, np.inf)))
    return str(ap["iata"].iloc[i])


def routes(seg: pd.DataFrame, ap: pd.DataFrame) -> pd.Series:
    """Route label per flight piece, e.g. "DEL–BOM", "DEL–en route" (index: flight_id)."""
    s = seg.sort_values(["flight_id", "time_start"])
    first = s.groupby("flight_id").first()
    last = s.groupby("flight_id").last()

    def heading(r: Any) -> float:
        _, b = _dist_bearing(r.lat_start, r.lon_start, np.array([r.lat_end]), np.array([r.lon_end]))
        return float(b[0])

    def climbing(r: Any) -> bool:  # the piece starts in the climb out of an airport
        return bool(r.alt_ft_start < END_FT and r.alt_ft_end - r.alt_ft_start > 100)

    def descending(r: Any) -> bool:  # the piece ends in the descent to an airport
        return bool(r.alt_ft_end < END_FT and r.alt_ft_start - r.alt_ft_end > 100)

    o = [
        (
            airport_on_ray(r.lat_start, r.lon_start, (heading(r) + 180) % 360, ap)
            if climbing(r)
            else None
        )
        or "en route"
        for r in first.itertuples()
    ]
    d = [
        (airport_on_ray(r.lat_end, r.lon_end, heading(r), ap) if descending(r) else None)
        or "en route"
        for r in last.itertuples()
    ]
    return pd.Series(
        [f"{a}–{b}" for a, b in zip(o, d, strict=True)], index=first.index, name="route"
    )


def fl_band(alt_ft: pd.Series) -> pd.Series:
    fl = alt_ft.to_numpy(float) / 100.0
    out = np.full(len(fl), "", dtype=object)
    for lo, hi in FL_BANDS:
        out[(fl >= lo) & (fl < hi)] = f"FL{lo}–{hi}" if lo else f"below FL{hi}"
    return pd.Series(out, index=alt_ft.index)


def table(d: pd.DataFrame, key: str, tot: dict[str, float], min_flights: int = MIN_FLIGHTS,
          top: int | None = TOP) -> list[dict[str, Any]]:  # fmt: skip
    """Rows by ``key``: flights, km, warming (raw physics and STRATUM-weighted), shares, index."""
    if d.empty:
        return []
    g = d.groupby(key)
    warm_ids = d.loc[d["ef_b1_pos"] > 0].groupby(key)["flight_id"].nunique()
    t = pd.DataFrame({
        "flights": g["flight_id"].nunique(),
        "km": g["length_km"].sum(),
        "warm_b1": g["ef_b1_pos"].sum(),
        "warm_w": g["ef_w_pos"].sum(),
        "flights_warming": warm_ids,
    })  # fmt: skip
    t["flights_warming"] = t["flights_warming"].fillna(0)
    small = t["flights"] < min_flights
    if small.any() and min_flights > 1:
        other = t[small].sum(numeric_only=True)
        t = pd.concat([t[~small], pd.DataFrame([other], index=["other"])])
    t["share_km"] = t["km"] / tot["km"]
    t["share_warm_b1"] = t["warm_b1"] / tot["warm_b1"]
    t["share_warm_w"] = t["warm_w"] / tot["warm_w"]
    with np.errstate(divide="ignore", invalid="ignore"):
        t["index_w"] = t["share_warm_w"] / t["share_km"]
    other = t.loc[["other"]] if "other" in t.index else t.iloc[0:0]
    t = t.drop(index="other", errors="ignore").sort_values("warm_w", ascending=False)
    if top is not None:
        t = t.head(top)
    t = pd.concat([t, other])  # the pooled small groups go last
    rows = []
    for k, r in t.iterrows():
        rows.append({
            "key": str(k), "flights": int(r["flights"]), "km": round(float(r["km"])),
            "flights_warming": int(r["flights_warming"]),
            "share_km": round(float(r["share_km"]), 5),
            "share_warm_b1": round(float(r["share_warm_b1"]), 5),
            "share_warm_w": round(float(r["share_warm_w"]), 5),
            "index_w": round(float(r["index_w"]), 3) if np.isfinite(r["index_w"]) else None,
        })  # fmt: skip
    return rows


def heat(d: pd.DataFrame, step: float = 1.0) -> list[list[float]]:
    """[lat, lon, share of weighted warming, share of distance] per ``step``° cell with warming."""
    la = np.floor(d["lat_mid"].to_numpy(float) / step) * step + step / 2
    lo = np.floor(d["lon_mid"].to_numpy(float) / step) * step + step / 2
    g = (
        pd.DataFrame({"la": la, "lo": lo, "w": d["ef_w_pos"], "km": d["length_km"]})
        .groupby(["la", "lo"])
        .sum()
    )
    g = g[g["w"] > 0]
    tw, tk = float(d["ef_w_pos"].sum()), float(d["length_km"].sum())
    return [[float(a), float(b), round(float(r.w) / tw, 5), round(float(r.km) / tk, 5)]
            for (a, b), r in g.iterrows()]  # fmt: skip


def build(seg: pd.DataFrame, ap: pd.DataFrame, names: dict[str, str]) -> dict[str, Any]:
    """``seg``: commercial cruise segments of all days with ef_b1, ef_w and the SEG_COLS."""
    d = seg.copy()
    d["ef_b1_pos"] = d["ef_b1"].clip(lower=0).fillna(0.0)
    d["ef_w_pos"] = d["ef_w"].clip(lower=0).fillna(0.0)
    d["airline"] = d["callsign"].astype(str).str[:3].map(lambda c: names.get(c, c))
    d["aircraft"] = d["typecode"].fillna("unknown").astype(str)
    t = pd.to_datetime(d["time_mid"], utc=True)
    d["hour_ist"] = (
        ((t.dt.hour * 60 + t.dt.minute + 330) // 60 % 24).astype(int).map(lambda h: f"{h:02d}")
    )
    d["month"] = t.dt.strftime("%Y-%m")
    d["fl_band"] = fl_band(d["alt_ft_mid"])
    d = d.merge(routes(d, ap), left_on="flight_id", right_index=True, how="left")
    d["origin"] = d["route"].str.split("–").str[0]
    d["dest"] = d["route"].str.split("–").str[1]
    tot = {"km": float(d["length_km"].sum()), "warm_b1": float(d["ef_b1_pos"].sum()),
           "warm_w": float(d["ef_w_pos"].sum())}  # fmt: skip
    # concentration: share of weighted warming from the top 1 % / 10 % of flights
    per_flight = d.groupby("flight_id")["ef_w_pos"].sum().sort_values(ascending=False)
    cum = per_flight.cumsum() / max(per_flight.sum(), 1e-30)
    conc = {f"top_{p}pct_flights": round(float(cum.iloc[max(0, math.ceil(len(cum) * p / 100) - 1)]), 4)
            for p in (1, 5, 10)}  # fmt: skip
    route_known = d.drop_duplicates("flight_id")["route"].map(lambda r: "en route" not in r).mean()
    return {
        "days": sorted(d["day"].unique().tolist()) if "day" in d else [],
        "totals": {
            "flights": int(d["flight_id"].nunique()),
            "km": round(tot["km"]),
            "flights_warming": int(d.loc[d["ef_b1_pos"] > 0, "flight_id"].nunique()),
            "route_known_share": round(float(route_known), 3),
        },
        "concentration": conc,
        "by_airline": table(d, "airline", tot),
        "by_route": table(d[~d["route"].eq("en route–en route")], "route", tot),
        # most tracks are pieces with only one airport end in view: departures and arrivals apart
        "by_departure": table(d[~d["origin"].eq("en route")], "origin", tot),
        "by_arrival": table(d[~d["dest"].eq("en route")], "dest", tot),
        "by_aircraft": table(d, "aircraft", tot),
        "by_hour_ist": sorted(
            table(d, "hour_ist", tot, min_flights=1, top=None), key=lambda r: r["key"]
        ),
        "by_fl_band": table(d, "fl_band", tot, min_flights=1, top=None),
        "by_month": sorted(table(d, "month", tot, min_flights=1, top=None), key=lambda r: r["key"]),
        "heat": heat(d),
        "airports": {r.iata: [r.city, round(r.lat, 3), round(r.lon, 3)] for r in ap.itertuples()},
        "note": (
            "Modelled warming (CoCiP energy forcing, raw ERA5; 'weighted' = STRATUM-weighted, "
            "D-006) on 12 first-of-month days, commercial airlines only. Routes inferred from "
            "track ends. Descriptive: an airline's share reflects where and when it flies."
        ),
    }


def export(
    root: Path, days: list[str], out: Path, bbox: Any, names: dict[str, str]
) -> dict[str, Any]:
    from stratum.decide.weighted import day_dir

    parts = []
    for day in days:
        w = pd.read_parquet(day_dir(root, day) / "segments.parquet",
                            columns=["segment_id", "commercial", "length_km", "ef_b1", "ef_w"])  # fmt: skip
        sm = pd.read_parquet(
            root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
        )
        sm = sm[[c for c in SEG_COLS if c in sm]]
        m = w[w["commercial"].fillna(False).astype(bool)].merge(sm, on="segment_id", how="inner")
        parts.append(m.assign(day=day))
    seg = pd.concat(parts, ignore_index=True)
    res = build(seg, load_airports(bbox), names)
    out.mkdir(parents=True, exist_ok=True)
    from stratum.export.web_export import web_json  # strict: NaN would break the page

    (out / "summary.json").write_text(web_json(res, separators=(",", ":")))
    return {"flights": res["totals"]["flights"], "routes_known": res["totals"]["route_known_share"],
            "top_airline": res["by_airline"][0]["key"] if res["by_airline"] else None,
            "kb": round((out / "summary.json").stat().st_size / 1024)}  # fmt: skip
