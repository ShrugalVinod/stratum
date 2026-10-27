"""Helpers shared by the live and schedule snapshots (standard library only).

- Aircraft type by ICAO24 address, from the Mictronics aircraft database (via tar1090-db). The
  address is used only to look the type up; it is never written out.
- A flight's route by callsign, from adsb.lol's route database (ODbL): every airport of the
  route in order, with its position.
- Airport positions by ICAO code, from OurAirports (public domain).
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import os
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

TYPES_URL = "https://github.com/wiedehopf/tar1090-db/raw/refs/heads/csv/aircraft.csv.gz"
ROUTE_URL = "https://vrs-standing-data.adsb.lol/routes/{p}/{cs}.json"
AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
UA = "STRATUM-research/1.0 (+https://stratum.aerospaceonyx.workers.dev/contact)"
INDIA = ("VA", "VE", "VI", "VO")  # ICAO airport prefixes of India

Stop = list  # [code (IATA, else ICAO), lat, lon, city]


def _get(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout
    ) as r:
        return bytes(r.read())


def _cached(url: str, path: str | None) -> bytes:
    if path and os.path.exists(path):
        with open(path, "rb") as fh:
            return fh.read()
    data = _get(url, 180)
    if path:
        with open(path, "wb") as fh:
            fh.write(data)
    return data


def load_types(path: str | None = None) -> dict[str, str]:
    """ICAO24 (lower case) → ICAO type code."""
    out: dict[str, str] = {}
    text = gzip.decompress(_cached(TYPES_URL, path)).decode("utf-8", "replace")
    for line in text.splitlines():
        f = line.split(";")
        if len(f) > 2 and f[2]:
            out[f[0].lower()] = f[2]
    return out


def load_airports(path: str | None = None) -> dict[str, Stop]:
    """ICAO code → [IATA (else ICAO), lat, lon, city] of airports with an IATA code or airlines."""
    out: dict[str, Stop] = {}
    for r in csv.DictReader(io.StringIO(_cached(AIRPORTS_URL, path).decode("utf-8", "replace"))):
        code = r.get("ident") or ""
        if len(code) == 4 and (r.get("iata_code") or r.get("scheduled_service") == "yes"):
            out[code] = [
                r.get("iata_code") or code,
                round(float(r["latitude_deg"]), 4),
                round(float(r["longitude_deg"]), 4),
                r.get("municipality") or r.get("name") or "",
            ]
    return out


def route(cs: str) -> list[Stop] | None:
    """The route flown under this callsign (every stop in order), or None if unknown."""
    try:
        d = json.loads(_get(ROUTE_URL.format(p=cs[:2], cs=cs), 20))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None
    stops = [
        [
            a.get("iata") or a.get("icao"),
            round(float(a["lat"]), 4),
            round(float(a["lon"]), 4),
            a.get("location") or a.get("name") or "",
        ]
        for a in d.get("_airports") or []
        if a.get("lat") is not None
    ]
    return stops if len(stops) >= 2 else None


def routes(callsigns: list[str], cache_path: str | None = None) -> dict[str, list[Stop] | None]:
    """Routes for many callsigns (16 at a time), kept in a JSON cache file between calls."""
    cache: dict[str, list[Stop] | None] = {}
    if cache_path and os.path.exists(cache_path):
        with open(cache_path) as fh:
            cache = json.load(fh)
    todo = sorted({c for c in callsigns if c not in cache})
    with ThreadPoolExecutor(16) as ex:
        for i, r in enumerate(ex.map(route, todo)):
            cache[todo[i]] = r
    if cache_path:
        with open(cache_path, "w") as fh:
            json.dump(cache, fh, separators=(",", ":"))
    return {c: cache.get(c) for c in callsigns}
