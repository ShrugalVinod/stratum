"""OpenSky aircraft database: ICAO24 address → registration, type, operator, owner.

What it does
------------
Every ADS-B transponder has a 24-bit address (``icao24``). OpenSky publishes a public table
linking each address to the aircraft's registration, ICAO type designator (e.g. A20N),
operator and owner (build prompt §3.3). We need it to:

* get each aircraft's type → engine, efficiency η and fuel flow from OpenAP (Phase 2);
* decide which flights are commercial airline flights (privacy rule, build prompt §3.6).

The database changes over time, so we store one **dated snapshot** in
``<drive>/raw/aircraft_db/`` together with a JSON record of where and when it came from and
its SHA-256 (reproducibility, build prompt rule 6). Snapshots are named
``aircraft-database-complete-YYYY-MM.csv`` on OpenSky's public S3 bucket; the newest found
on 2026-10-14 is 2025-08. The CSV quotes text with single quotes (').

Only the columns STRATUM uses are kept, as Parquet (~15× smaller than the CSV).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from stratum.manifest import file_sha256, utc_now

BASE_URL = "https://s3.opensky-network.org/data-samples/metadata"
KEEP_COLUMNS: tuple[str, ...] = (
    "icao24",
    "registration",
    "typecode",
    "icaoAircraftClass",
    "manufacturerIcao",
    "model",
    "operator",
    "operatorCallsign",
    "operatorIcao",
    "owner",
    "country",
    "built",
    "categoryDescription",
)


def snapshot_url(snapshot: str) -> str:
    """URL of the complete database for ``snapshot`` = 'YYYY-MM'."""
    return f"{BASE_URL}/aircraft-database-complete-{snapshot}.csv"


def parquet_path(root: Path, snapshot: str) -> Path:
    return root / f"aircraft_db_{snapshot}.parquet"


def parse_csv(path: Path) -> pd.DataFrame:
    """Read the OpenSky CSV (single-quoted fields) and keep the columns STRATUM uses."""
    df = pd.read_csv(
        path,
        quotechar="'",
        usecols=list(KEEP_COLUMNS),
        dtype="str",
        keep_default_na=False,
        na_values=[""],
        on_bad_lines="warn",
    )
    df = df[list(KEEP_COLUMNS)]  # usecols keeps file order; use ours
    df["icao24"] = df["icao24"].str.strip().str.lower()
    df = df[df["icao24"].str.fullmatch(r"[0-9a-f]{6}", na=False)]
    for col in ("typecode", "operatorIcao", "registration", "icaoAircraftClass"):
        df[col] = df[col].str.strip().str.upper()
    # Keep one row per address (the file occasionally repeats one; keep the first).
    return df.drop_duplicates("icao24", keep="first").reset_index(drop=True)


def ingest(snapshot: str, root: Path, *, keep_csv: bool = False) -> dict[str, Any]:
    """Download snapshot ``YYYY-MM`` (if not already stored) and write Parquet + provenance."""
    root.mkdir(parents=True, exist_ok=True)
    out = parquet_path(root, snapshot)
    meta_path = out.with_suffix(".json")
    if out.exists() and meta_path.exists():
        meta: dict[str, Any] = json.loads(meta_path.read_text())
        meta["status"] = "already stored"
        return meta
    url = snapshot_url(snapshot)
    csv_path = root / f"aircraft-database-complete-{snapshot}.csv"
    tmp = csv_path.with_suffix(".csv.tmp")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        last_modified = r.headers.get("Last-Modified")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    os.replace(tmp, csv_path)
    df = parse_csv(csv_path)
    df.to_parquet(out, index=False, compression="zstd")
    meta = {
        "snapshot": snapshot,
        "url": url,
        "server_last_modified": last_modified,
        "downloaded_at": utc_now(),
        "csv_sha256": file_sha256(csv_path),
        "csv_bytes": csv_path.stat().st_size,
        "rows": len(df),
        "with_typecode": int(df["typecode"].notna().sum()),
        "parquet": out.name,
        "licence_note": "OpenSky Network aircraft database; cite Schäfer et al. 2014",
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    if not keep_csv:
        csv_path.unlink()
    meta["status"] = "downloaded"
    return meta


def load(root: Path, snapshot: str) -> pd.DataFrame:
    """Load a stored snapshot (one row per icao24)."""
    return pd.read_parquet(parquet_path(root, snapshot))
