"""Aircraft type, mass, fuel flow and propulsion efficiency (build prompt §2.1 step 8, §3.5).

What it does
------------
1. **Type.** ICAO24 → ICAO type designator from the OpenSky aircraft database snapshot
   (pre-registered source). If the snapshot has no type for that aircraft, ADS-B Exchange's own
   type field (``typecode`` in our schema) is used and the fallback is logged. When both exist
   and disagree, the database wins and the disagreement is logged.
2. **OpenAP type.** The designator itself if OpenAP models it; else the hand-checked
   ``configs/type_map.yaml`` (logged as a fallback); else unmapped — flagged, no guessing.
3. **Mass** = 0.80 × MTOW (pre-registered; 0.70 / 0.90 in sensitivity runs). Wingspan and the
   default engine come from OpenAP.
4. **Performance per segment** (needs true airspeed, added once ERA5 winds are attached):
   fuel flow from OpenAP ``FuelFlow.enroute``; thrust = drag + weight component of the climb;
   overall propulsion efficiency **η = thrust × TAS / (fuel flow × Q)**, clipped to 0.20–0.45
   with a flag (build prompt §3.5).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

from stratum.paths import repo_root

MASS_FRACTION = 0.80  # preregistered.yaml aircraft.mass_fraction_of_mtow
Q_FUEL = 43.2e6  # J/kg, preregistered.yaml sac.Q
ETA_CLIP = (0.20, 0.45)
G0 = 9.80665
KT = 0.514444  # m/s per knot
FT = 0.3048
TYPE_MAP_FILE = repo_root() / "configs" / "type_map.yaml"


@lru_cache(maxsize=1)
def openap_types() -> frozenset[str]:
    from openap import prop

    return frozenset(t.lower() for t in prop.available_aircraft())


@lru_cache(maxsize=1)
def type_map(path: Path = TYPE_MAP_FILE) -> dict[str, str]:
    data = yaml.safe_load(path.read_text()) or {}
    return {str(k).upper(): str(v).lower() for k, v in (data.get("map") or {}).items()}


def to_openap(typecode: str | None) -> tuple[str | None, str]:
    """(OpenAP type or None, how it was found: direct | type_map | unmapped | no_type)."""
    if not isinstance(typecode, str) or not typecode.strip():
        return None, "no_type"
    t = typecode.strip().upper()
    if t.lower() in openap_types():
        return t.lower(), "direct"
    mapped = type_map().get(t)
    if mapped and mapped in openap_types():
        return mapped, "type_map"
    return None, "unmapped"


@lru_cache(maxsize=128)
def props(openap_type: str) -> dict[str, Any]:
    """MTOW (kg), wingspan (m), engine count and default engine name from OpenAP."""
    from openap import prop

    a = prop.aircraft(openap_type)
    return {
        "mtow_kg": float(a["mtow"]),
        "wingspan_m": float(a["wing"]["span"]),
        "n_engines": int(a["engine"]["number"]),
        "engine_default": str(a["engine"]["default"]),
    }


@dataclass
class TypeLog:
    """Everything a run summary needs about type resolution."""

    flights: int = 0
    from_db: int = 0
    from_adsbx: int = 0
    no_type: int = 0
    db_adsbx_disagree: int = 0
    mapping: dict[str, int] = field(default_factory=dict)  # direct / type_map / unmapped / no_type
    unmapped_types: dict[str, int] = field(default_factory=dict)


def resolve_types(
    flights: pd.DataFrame, aircraft_db: pd.DataFrame, mass_fraction: float = MASS_FRACTION
) -> tuple[pd.DataFrame, TypeLog]:
    """One row per flight_id with type, OpenAP type, mass, wingspan and provenance.

    ``flights`` needs columns flight_id, icao24 and (optionally) typecode from the ADS-B source.
    """
    log = TypeLog()
    per = (
        flights.groupby("flight_id", sort=False)
        .agg(
            icao24=("icao24", "first"),
            typecode_adsbx=(
                "typecode",
                lambda s: s.dropna().mode().iloc[0] if s.notna().any() else None,
            ),
        )
        .reset_index()
    )
    db = aircraft_db.drop_duplicates("icao24").set_index("icao24")["typecode"]
    per["typecode_db"] = per["icao24"].map(db)
    rows = []
    for r in per.itertuples(index=False):
        db_t = r.typecode_db if isinstance(r.typecode_db, str) and r.typecode_db else None
        ax_t = r.typecode_adsbx if isinstance(r.typecode_adsbx, str) and r.typecode_adsbx else None
        if db_t:
            chosen, src = db_t, "opensky_db"
            log.from_db += 1
            if ax_t and ax_t.upper() != db_t.upper():
                log.db_adsbx_disagree += 1
        elif ax_t:
            chosen, src = ax_t, "adsbx_type_field"
            log.from_adsbx += 1
        else:
            chosen, src = None, "none"
            log.no_type += 1
        oa, how = to_openap(chosen)
        log.mapping[how] = log.mapping.get(how, 0) + 1
        if how == "unmapped" and chosen:
            log.unmapped_types[chosen] = log.unmapped_types.get(chosen, 0) + 1
        p = props(oa) if oa else {}
        rows.append(
            {
                "flight_id": r.flight_id,
                "typecode": chosen,
                "type_source": src,
                "openap_type": oa,
                "type_mapping": how,
                "mtow_kg": p.get("mtow_kg", np.nan),
                "aircraft_mass_kg": p.get("mtow_kg", np.nan) * mass_fraction,
                "wingspan_m": p.get("wingspan_m", np.nan),
                "n_engines": p.get("n_engines", pd.NA),
                "engine_default": p.get("engine_default"),
            }
        )
    log.flights = len(rows)
    return pd.DataFrame(rows), log


def performance(
    openap_type: str,
    mass_kg: np.ndarray,
    tas_ms: np.ndarray,
    alt_ft: np.ndarray,
    vs_fpm: np.ndarray,
) -> dict[str, np.ndarray]:
    """Fuel flow (kg/s), thrust (N) and clipped η for segments of one aircraft type."""
    from openap import Drag, FuelFlow

    tas_kt = np.asarray(tas_ms) / KT
    ff = np.asarray(
        FuelFlow(openap_type).enroute(mass=mass_kg, tas=tas_kt, alt=alt_ft, vs=vs_fpm), dtype=float
    )
    drag = np.asarray(
        Drag(openap_type).clean(mass=mass_kg, tas=tas_kt, alt=alt_ft, vs=vs_fpm), dtype=float
    )
    with np.errstate(invalid="ignore", divide="ignore"):
        climb = np.asarray(mass_kg) * G0 * (np.asarray(vs_fpm) * FT / 60.0) / np.asarray(tas_ms)
        thrust = drag + climb
        eta_raw = thrust * np.asarray(tas_ms) / (ff * Q_FUEL)
    lo, hi = ETA_CLIP
    clipped = (eta_raw < lo) | (eta_raw > hi)
    return {
        "fuel_flow_kg_s": ff,
        "thrust_n": thrust,
        "eta_raw": eta_raw,
        "engine_efficiency": np.clip(eta_raw, lo, hi),
        "eta_clipped": clipped,
    }
