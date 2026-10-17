"""Corridor vs whole-domain scope of the segment builder (Phase 5 needs every flight)."""

import pandas as pd
from shapely.geometry import box

from stratum.flights.pipeline import select_corridor


def _seg() -> pd.DataFrame:
    # flight A crosses the box (one segment inside), flight B (two pieces) stays outside
    return pd.DataFrame(
        {
            "flight_id": ["A", "A", "B", "B.1"],
            "lon_mid": [72.0, 75.5, 90.0, 91.0],
            "lat_mid": [20.0, 22.5, 25.0, 26.0],
        }
    )


def test_corridor_scope_keeps_whole_corridor_flights_only() -> None:
    out, log = select_corridor(_seg(), box(75, 22, 76, 23))
    assert list(out["flight_id"]) == ["A", "A"]  # whole flight A, both segments
    assert list(out["in_corridor"]) == [False, True]
    assert log["corridor_flights"] == 1 and log["scope"] == "corridor"


def test_domain_scope_keeps_every_flight_and_flags_corridor() -> None:
    out, log = select_corridor(_seg(), box(75, 22, 76, 23), keep_all=True)
    assert len(out) == 4
    assert out["in_corridor"].tolist() == [False, True, False, False]
    assert log["corridor_segments_inside"] == 1 and log["scope"] == "domain"


def test_no_corridor_flags_nothing() -> None:
    out, log = select_corridor(_seg(), None)
    assert len(out) == 4 and not out["in_corridor"].any() and log == {}
