"""The normalised ADS-B table that every flight-data source is converted into.

What it does
------------
OpenSky and ADS-B Exchange describe the same thing (where each aircraft was, when, how high
and how fast) with different field names and units. Each source gets an *adapter* that
converts its raw records to this one table, so everything downstream (cleaning, coverage
audit, segments) works the same whichever source the coverage audit picks
(paper §3.3; build prompt §3.3).

Columns (build prompt §3.3), one row per position report:

=============  =====================  ===============================================
column         type                   meaning
=============  =====================  ===============================================
icao24         str, 6 lower-case hex  aircraft's 24-bit transponder address
callsign       str or missing (NaN)   flight callsign, spaces stripped (e.g. "IGO2134")
time           datetime64[ns, UTC]    time of the position fix
lat, lon       float, degrees         position (WGS84)
baro_alt_ft    float, ft              barometric (pressure) altitude
geo_alt_ft     float or null, ft      GNSS altitude, if reported
gs_kt          float or null, kt      ground speed
track_deg      float or null, °       track over ground, 0–360 from true north
vrate_fpm      float or null, ft/min  vertical rate
on_ground      bool                   aircraft reports being on the ground
source         "opensky" | "adsbx"    which adapter produced the row
typecode       str or null            ICAO type designator if the source carries it (extra)
registration   str or null            registration if the source carries it (extra)
=============  =====================  ===============================================

``typecode`` and ``registration`` are extras: ADS-B Exchange includes them, OpenSky does
not. The authoritative type still comes from the dated aircraft-database snapshot.
"""

from __future__ import annotations

import pandas as pd
import pandera.pandas as pa

ICAO24_PATTERN = r"^[0-9a-f]{6}$"
SOURCES = ("opensky", "adsbx")

COLUMNS: tuple[str, ...] = (
    "icao24",
    "callsign",
    "time",
    "lat",
    "lon",
    "baro_alt_ft",
    "geo_alt_ft",
    "gs_kt",
    "track_deg",
    "vrate_fpm",
    "on_ground",
    "source",
    "typecode",
    "registration",
)

ADSB_SCHEMA = pa.DataFrameSchema(
    {
        "icao24": pa.Column(str, pa.Check.str_matches(ICAO24_PATTERN)),
        "callsign": pa.Column(str, nullable=True),
        "time": pa.Column(pd.DatetimeTZDtype(unit="ns", tz="UTC")),
        "lat": pa.Column(float, pa.Check.in_range(-90.0, 90.0)),
        "lon": pa.Column(float, pa.Check.in_range(-180.0, 180.0)),
        "baro_alt_ft": pa.Column(float, pa.Check.in_range(-2000.0, 70000.0)),
        "geo_alt_ft": pa.Column(float, nullable=True),
        "gs_kt": pa.Column(float, pa.Check.in_range(0.0, 1000.0), nullable=True),
        "track_deg": pa.Column(float, pa.Check.in_range(0.0, 360.0), nullable=True),
        "vrate_fpm": pa.Column(float, nullable=True),
        "on_ground": pa.Column(bool),
        "source": pa.Column(str, pa.Check.isin(SOURCES)),
        "typecode": pa.Column(str, nullable=True),
        "registration": pa.Column(str, nullable=True),
    },
    strict=True,
    ordered=True,
    coerce=False,
)


def empty_frame() -> pd.DataFrame:
    """A zero-row frame with exactly the dtypes a real adapter produces.

    Built by trimming a one-row template, so pandas makes the same dtype choices (e.g. its
    string storage) as for real data; constructing empty columns directly can differ.
    """
    row = {
        "icao24": "000000",
        "callsign": "X",
        "time": pd.Timestamp(0, unit="s", tz="UTC"),
        "lat": 0.0,
        "lon": 0.0,
        "baro_alt_ft": 0.0,
        "geo_alt_ft": 0.0,
        "gs_kt": 0.0,
        "track_deg": 0.0,
        "vrate_fpm": 0.0,
        "on_ground": False,
        "source": "adsbx",
        "typecode": "X",
        "registration": "X",
    }
    df = pd.DataFrame.from_records([row])
    for col in ("callsign", "typecode", "registration"):
        df[col] = df[col].astype("str")  # pandas string dtype; missing = NaN
    df["time"] = df["time"].astype("datetime64[ns, UTC]")
    return df[list(COLUMNS)].iloc[:0].reset_index(drop=True)


def validate(df: pd.DataFrame) -> pd.DataFrame:
    """Validate ``df`` against the schema (raises ``pandera.errors.SchemaError`` if wrong)."""
    return ADSB_SCHEMA.validate(df, lazy=True)
