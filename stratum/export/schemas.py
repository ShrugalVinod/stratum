"""Web data contract v1 (build prompt §4.3): pydantic models → JSON Schema → zod in the web app.

Files under ``web/public/data/<build_id>/``::

    manifest.json                       Manifest
    corridor.geojson                    the 75-km Delhi–Mumbai polygon
    days/<YYYY-MM-DD>/day.json          DaySummary
    days/<YYYY-MM-DD>/flights.geojson   FeatureCollection of FlightFeature (commercial only)
    days/<YYYY-MM-DD>/segments_flagged.json   list[FlaggedSegment]
    days/<YYYY-MM-DD>/grids/FL{nnn}_{HH}.png   8-bit fraction-of-hour grids

Rules: values that do not exist yet are ``null`` (the app shows "— (Phase 7)"), never a
placeholder number. Flight ids are salted hashes, never ICAO24 addresses. Only commercial
airline flights appear (build prompt §3.6).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0.0"


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FlightLevelInfo(_M):
    fl: int
    pressure_hpa: float


class GridMeta(_M):
    lat_north: float
    lat_south: float
    lon_west: float
    lon_east: float
    rows: int
    cols: int
    step_deg: float
    encoding: Literal["png_uint8_fraction_of_hour"]


class Coverage(_M):
    adsb_coverage_pct: float | None = Field(
        description="Share of scheduled corridor flights with continuous tracks (audit); "
        "null = pending"
    )
    note: str


class Manifest(_M):
    contract_version: str = CONTRACT_VERSION
    build_id: str
    created_at: str
    git_commit: str
    config_hash: str
    pipeline_version: str
    model_version: str = Field(description='e.g. "B1-physics-v0"')
    days: list[str]
    days_with_flights: list[str]
    flight_levels: list[FlightLevelInfo]
    hours_utc: list[int]
    grid: GridMeta
    eta_for_grids: float
    coverage: Coverage
    credits: list[str]


class DaySummary(_M):
    date: str
    has_flights: bool
    n_flights: int | None
    n_segments: int | None
    n_flagged: int | None
    ef_positive_J: float | None
    ef_negative_J: float | None
    grid_files: int
    quality_flags: list[str]


class FlightProps(_M):
    flight_id: str = Field(description="salted hash, 12 hex characters")
    callsign: str
    airline: str | None
    aircraft_type: str | None
    direction: Literal["DEL-BOM", "BOM-DEL", "other"]
    t_start: str
    t_end: str
    minutes: list[int] = Field(description="minutes after 00 UTC for each coordinate")
    flagged: bool


class FlaggedSegment(_M):
    segment_id: str
    flight_id: str
    callsign: str
    airline: str | None
    direction: Literal["DEL-BOM", "BOM-DEL", "other"]
    time_utc: str
    fl: int
    lat: float
    lon: float
    lat_start: float
    lon_start: float
    lat_end: float
    lon_end: float
    night: bool = Field(description="local solar time 18–06 h")
    ef_J: float | None = Field(description="CoCiP central run, B1")
    ef_p05_J: float | None
    ef_p50_J: float | None
    ef_p95_J: float | None
    ef_note: str
    contrail_age_h: float | None
    # Phase 7 fields: always null in v0 (the app shows "— (Phase 7)")
    p_persistent: float | None = None
    best_alternative_fl: int | None = None
    extra_fuel_kg: float | None = None
    extra_co2_kg: float | None = None
    net_warming_avoided_20y: float | None = None
    net_warming_avoided_100y: float | None = None
    confidence_note: str


def json_schemas() -> dict[str, dict[str, object]]:
    """JSON Schemas of every file type (written to web/schemas/ for the TypeScript side)."""
    return {
        "manifest": Manifest.model_json_schema(),
        "day": DaySummary.model_json_schema(),
        "flight_props": FlightProps.model_json_schema(),
        "flagged_segment": FlaggedSegment.model_json_schema(),
    }
