"""Which flights are "commercial airline" flights (build prompt §3.6; privacy rule).

A flight is commercial when all three hold:

1. its callsign looks like an airline flight: ``^[A-Z]{3}\\d{1,4}[A-Z]{0,2}$``;
2. the 3-letter prefix is in the human-reviewed allowlist ``configs/airlines.yaml``;
3. its aircraft type is a transport-category type: modelled by OpenAP (directly or via the
   type map) and not a business jet.

Everything else stays in private research tables only and is never exported or released.
India's ICAO24 block 0x800000–0x83FFFF is reported (share of Indian-registered aircraft), never
used as a filter.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import pandas as pd
import yaml

from stratum.paths import repo_root

AIRLINES_FILE = repo_root() / "configs" / "airlines.yaml"
CALLSIGN_RE = re.compile(r"^[A-Z]{3}\d{1,4}[A-Z]{0,2}$")
BUSINESS_JETS = frozenset({"c25a", "c525", "c550", "c56x", "gl5t", "glf5", "glf6", "lj45", "pc24"})
INDIA_ICAO24 = (0x800000, 0x83FFFF)


@lru_cache(maxsize=1)
def airline_prefixes(path: Path = AIRLINES_FILE) -> frozenset[str]:
    data = yaml.safe_load(path.read_text()) or {}
    codes: set[str] = set()
    for group in ("indian", "foreign"):
        codes.update(str(k).upper() for k in (data.get(group) or {}))
    return frozenset(codes)


def is_indian_registered(icao24: pd.Series) -> pd.Series:
    v = icao24.map(lambda h: int(h, 16) if isinstance(h, str) else -1)
    return (v >= INDIA_ICAO24[0]) & (v <= INDIA_ICAO24[1])


def classify(per_flight: pd.DataFrame) -> pd.DataFrame:
    """Add ``commercial`` (bool) and ``commercial_reason`` to a one-row-per-flight table.

    Needs columns callsign, icao24 and openap_type.
    """
    cs = per_flight["callsign"].fillna("").astype(str).str.upper()
    pattern = cs.map(lambda c: bool(CALLSIGN_RE.match(c)))
    allow = cs.str[:3].isin(airline_prefixes())
    oa = per_flight["openap_type"]
    transport = oa.notna() & ~oa.fillna("").isin(BUSINESS_JETS)
    reason = pd.Series("commercial", index=per_flight.index)
    reason[~transport] = "not_transport_type"
    reason[~allow] = "prefix_not_in_allowlist"
    reason[~pattern] = "callsign_not_airline_pattern"
    out = per_flight.copy()
    out["commercial"] = pattern & allow & transport
    out["commercial_reason"] = reason
    out["indian_registered"] = is_indian_registered(per_flight["icao24"])
    return out
