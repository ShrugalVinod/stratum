"""Aircraft type resolution, performance/η and commercial classification (build prompt §3.5–3.6)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from stratum.flights import aircraft as ac
from stratum.flights.classify import classify


def test_type_resolution_prefers_db_and_logs_fallbacks() -> None:
    flights = pd.DataFrame(
        {
            "flight_id": ["f1", "f1", "f2", "f3", "f4"],
            "icao24": ["800001", "800001", "800002", "800003", "4b0001"],
            "typecode": ["A20N", "A20N", "B738", None, "A35K"],
        }
    )
    db = pd.DataFrame({"icao24": ["800001", "800002"], "typecode": ["A20N", "A21N"]})
    per, log = ac.resolve_types(flights, db)
    per = per.set_index("flight_id")
    assert per.loc["f1", "openap_type"] == "a20n" and per.loc["f1", "type_source"] == "opensky_db"
    assert per.loc["f2", "typecode"] == "A21N"  # database wins over the ADS-B field …
    assert log.db_adsbx_disagree == 1  # … and the disagreement is counted
    assert per.loc["f3", "type_source"] == "none" and pd.isna(per.loc["f3", "openap_type"])
    assert per.loc["f4", "type_source"] == "adsbx_type_field"
    assert per.loc["f4", "openap_type"] == "a359" and per.loc["f4", "type_mapping"] == "type_map"
    assert np.isclose(per.loc["f1", "aircraft_mass_kg"], 0.80 * per.loc["f1", "mtow_kg"])
    assert log.mapping == {"direct": 2, "no_type": 1, "type_map": 1}


def test_eta_plausible_and_clipped() -> None:
    p = ac.performance(
        "a20n",
        mass_kg=np.array([63200.0, 63200.0]),
        tas_ms=np.array([231.5, 231.5]),
        alt_ft=np.array([35000.0, 35000.0]),
        vs_fpm=np.array([0.0, 0.0]),
    )
    assert np.all((p["fuel_flow_kg_s"] > 0.2) & (p["fuel_flow_kg_s"] < 1.0))
    assert np.all((p["engine_efficiency"] >= 0.20) & (p["engine_efficiency"] <= 0.45))


def test_commercial_classification() -> None:
    per = pd.DataFrame(
        {
            "callsign": ["IGO2134", "N123AB", "XYZ123", "AIC101", "VTABC", None],
            "icao24": ["800001", "a00001", "800002", "800003", "800004", "800005"],
            "openap_type": ["a20n", "c56x", "a320", "glf6", "a320", "a320"],
        }
    )
    out = classify(per)
    assert out["commercial"].tolist() == [True, False, False, False, False, False]
    assert out["commercial_reason"].tolist() == [
        "commercial",
        "callsign_not_airline_pattern",
        "prefix_not_in_allowlist",
        "not_transport_type",
        "callsign_not_airline_pattern",
        "callsign_not_airline_pattern",
    ]
    assert out["indian_registered"].tolist() == [True, False, True, True, True, True]
