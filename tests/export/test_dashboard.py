"""Routes and airlines dashboard on a synthetic day (no network: airports given)."""

import numpy as np
import pandas as pd

from stratum.export import dashboard as db

AP = pd.DataFrame({"iata": ["DEL", "BOM"], "city": ["Delhi", "Mumbai"], "lat": [28.57, 19.09],
                   "lon": [77.10, 72.87], "type": "large_airport"})  # fmt: skip


def _flight(fid: str, cs: str, lat0: float, lon0: float, lat1: float, lon1: float, alt0: float,
            alt1: float, ef: float, n: int = 10, climb: float = 26000.0) -> pd.DataFrame:  # fmt: skip
    t0 = pd.Timestamp("2026-02-01 14:00", tz="UTC")
    la, lo = np.linspace(lat0, lat1, n + 1), np.linspace(lon0, lon1, n + 1)
    alt = np.full(n + 1, 36000.0)
    alt[0], alt[-1] = alt0, alt1
    alt[1], alt[-2] = (
        max(alt0, climb) if alt0 < 36000 else 36000.0,
        max(alt1, climb) if alt1 < 36000 else 36000.0,
    )
    return pd.DataFrame({
        "segment_id": [f"{fid}_{i}" for i in range(n)], "flight_id": fid, "callsign": cs,
        "typecode": "A20N", "alt_ft_mid": 36000.0, "alt_ft_start": alt[:-1], "alt_ft_end": alt[1:],
        "lat_start": la[:-1], "lon_start": lo[:-1], "lat_end": la[1:], "lon_end": lo[1:],
        "lat_mid": (la[:-1] + la[1:]) / 2, "lon_mid": (lo[:-1] + lo[1:]) / 2,
        "time_start": [t0 + pd.Timedelta(minutes=i) for i in range(n)],
        "time_mid": [t0 + pd.Timedelta(minutes=i, seconds=30) for i in range(n)],
        "length_km": 14.0, "ef_b1": ef, "ef_w": ef * 0.1, "day": "2026-02-01",
    })  # fmt: skip


def test_dashboard_groups_routes_airlines_and_hides_small_groups() -> None:
    seg = pd.concat(
        [
            _flight(f"a{i}", f"IGO{100 + i}", 28.6, 77.1, 19.1, 72.9, 3000, 2000, 1e9 * (i + 1))
            for i in range(4)
        ]
        + [
            _flight(f"b{i}", f"AIC{200 + i}", 19.1, 72.9, 28.6, 77.1, 2500, 2500, 0.0)
            for i in range(3)
        ]
        + [_flight("c0", "UAE300", 30.0, 70.0, 20.0, 90.0, 36000, 36000, 5e9)],  # an overflight
        ignore_index=True,
    )
    r = db.build(seg, AP, {"IGO": "IndiGo", "AIC": "Air India"})
    assert r["totals"]["flights"] == 8 and r["totals"]["flights_warming"] == 5
    al = {x["key"]: x for x in r["by_airline"]}
    assert al["IndiGo"]["flights"] == 4 and al["Air India"]["share_warm_w"] == 0.0
    assert "other" in al and al["other"]["flights"] == 1  # UAE: below 3 flights, pooled
    assert abs(sum(x["share_warm_w"] for x in r["by_airline"]) - 1) < 1e-6
    routes = {x["key"]: x["flights"] for x in r["by_route"]}
    assert routes["DEL–BOM"] == 4 and routes["BOM–DEL"] == 3  # the overflight has no route
    assert al["IndiGo"]["index_w"] > 1 > al["Air India"]["index_w"]
    assert r["by_hour_ist"][0]["key"] == "19"  # 14:00 UTC = 19:30 IST
    assert 0 < r["concentration"]["top_1pct_flights"] <= 1
    assert "flight_id" not in str(r) and "a0" not in str(r["by_route"])


def test_route_ends_are_the_airports_behind_and_ahead_of_the_cruise() -> None:
    # climbing out ~150 km after Delhi, descending ~150 km before Mumbai
    f = _flight("x", "IGO1", 27.6, 76.6, 20.1, 73.3, 25000, 25000, 1e9)
    assert db.routes(f, AP).iloc[0] == "DEL–BOM"
    # the same line flown level at FL360 (a piece that starts and ends in cruise): no route
    c = _flight("z", "IGO3", 27.6, 76.6, 20.1, 73.3, 36000, 36000, 1e9)
    assert db.routes(c, AP).iloc[0] == "en route–en route"
    # a track heading away from both airports has no route
    g = _flight("y", "IGO2", 25.0, 85.0, 26.0, 90.0, 36000, 36000, 1e9)
    assert db.routes(g, AP).iloc[0] == "en route–en route"


def test_an_empty_group_table_is_empty() -> None:
    seg = _flight("x", "IGO1", 27.6, 76.6, 20.1, 73.3, 36000, 36000, 1e9)
    d = seg.assign(ef_b1_pos=1.0, ef_w_pos=1.0)
    assert db.table(d.iloc[0:0], "callsign", {"km": 1.0, "warm_b1": 1.0, "warm_w": 1.0}) == []
