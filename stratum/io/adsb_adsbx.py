"""ADS-B Exchange adapter: stream free "readsb-hist" sample days into the normalised table.

What it does
------------
ADS-B Exchange publishes a snapshot of *every* aircraft it tracks worldwide every 5 seconds
("readsb-hist"), free for the 1st day of each month (build prompt §3.3). A day is 17,280
snapshots, each ~4.6 MB of JSON (~0.7 MB gzip-compressed on the wire), so ~12 GB per day.
We never hold a whole day in memory. For each snapshot we:

1. download it (gzip transfer encoding),
2. parse the JSON and keep only aircraft with a position inside the **padded study box**
   (4–39°N, 66–100°E) at or above **FL200** (``configs/domain.yaml``: a little below FL250
   so climbs into cruise survive; the FL250 cut happens in Phase 2),
3. convert to the normalised schema (:mod:`stratum.io.adsb_schema`).

Snapshots are grouped by UTC hour into one Parquet file per hour. An hour file is only
written once all its snapshots are processed (atomic rename), so an interrupted job resumes
at the first missing hour. When all 24 hours exist, the day gets a manifest and a
``_SUCCESS`` marker (:mod:`stratum.manifest`).

Field mapping (readsb JSON → schema):
``hex``→icao24 (addresses starting with "~" are non-ICAO/anonymised and are dropped and
counted), ``flight``→callsign (stripped), ``now − seen_pos``→time, ``alt_baro``→baro_alt_ft
("ground" → on_ground), ``alt_geom``→geo_alt_ft, ``gs``→gs_kt, ``track``→track_deg,
``baro_rate`` (else ``geom_rate``)→vrate_fpm, ``t``→typecode, ``r``→registration.
A position that hasn't been updated between snapshots appears again with the same fix
time; duplicates on (icao24, time) are removed.

Terms (checked 2026-10-14, docs/data_sources.md): free samples are for "testing and
evaluation"; ADS-B Exchange (JETNET) terms forbid redistributing data or derived data
without written permission. Raw ADS-B Exchange data are therefore never released.
"""

from __future__ import annotations

import gzip
import logging
import os
import time as _time
from collections.abc import Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import orjson
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from stratum.io.adsb_schema import COLUMNS, empty_frame, validate
from stratum.manifest import RunManifest, is_done, mark_success

log = logging.getLogger(__name__)

BASE_URL = "https://samples.adsbexchange.com/readsb-hist"
SNAPSHOT_INTERVAL_S = 5
SNAPSHOTS_PER_HOUR = 3600 // SNAPSHOT_INTERVAL_S  # 720
SANE_ALT_FT = (-2000.0, 70000.0)  # same limits as the schema
SANE_GS_KT = 1000.0


@dataclass(frozen=True)
class Filter:
    """Which aircraft to keep from each global snapshot."""

    lat: tuple[float, float]
    lon: tuple[float, float]
    min_baro_alt_ft: float

    @classmethod
    def from_domain(cls) -> Filter:
        """Padded study box and ingest floor from ``configs/domain.yaml``."""
        from stratum.config import load_domain

        d = load_domain()
        return cls(
            lat=tuple(d.padded_bbox.lat),  # type: ignore[arg-type]
            lon=tuple(d.padded_bbox.lon),  # type: ignore[arg-type]
            min_baro_alt_ft=d.flight_levels.ingest_min_fl * 100.0,
        )


@dataclass
class SnapshotStats:
    """Counters for one or more snapshots (summed over an hour or a day)."""

    snapshots_ok: int = 0
    snapshots_missing: int = 0
    aircraft_total: int = 0
    kept: int = 0
    dropped_non_icao: int = 0
    dropped_no_position: int = 0
    dropped_bad_altitude: int = 0
    blanked_values: int = 0  # impossible speeds/tracks set to missing (never crash)
    failed_names: list[str] = field(default_factory=list)

    def add(self, other: SnapshotStats) -> None:
        self.snapshots_ok += other.snapshots_ok
        self.snapshots_missing += other.snapshots_missing
        self.aircraft_total += other.aircraft_total
        self.kept += other.kept
        self.dropped_non_icao += other.dropped_non_icao
        self.dropped_no_position += other.dropped_no_position
        self.dropped_bad_altitude += other.dropped_bad_altitude
        self.blanked_values += other.blanked_values
        self.failed_names.extend(other.failed_names)


def snapshot_names(hour: int | None = None) -> list[str]:
    """File stems for every 5-second snapshot of a day (or of one UTC hour): 'HHMMSSZ'."""
    hours = range(24) if hour is None else [hour]
    return [f"{h:02d}{m:02d}{s:02d}Z" for h in hours for m in range(60) for s in range(0, 60, 5)]


def snapshot_url(day: date, name: str) -> str:
    """URL of one snapshot, e.g. .../readsb-hist/2026/01/01/000005Z.json.gz"""
    return f"{BASE_URL}/{day:%Y/%m/%d}/{name}.json.gz"


def _num(v: Any) -> float:
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else np.nan


def _str_or_none(v: Any) -> str | None:
    if isinstance(v, str):
        s = v.strip()
        return s or None
    return None


def parse_snapshot(raw: bytes, flt: Filter) -> tuple[pd.DataFrame, SnapshotStats]:
    """Parse one readsb-hist snapshot (gzip or plain JSON bytes) into schema rows."""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    d = orjson.loads(raw)
    now = float(d["now"])
    stats = SnapshotStats(snapshots_ok=1)
    aircraft = d.get("aircraft", [])
    stats.aircraft_total = len(aircraft)
    lat0, lat1 = flt.lat
    lon0, lon1 = flt.lon
    rows: list[dict[str, Any]] = []
    for a in aircraft:
        lat, lon = a.get("lat"), a.get("lon")
        if lat is None or lon is None:
            stats.dropped_no_position += 1
            continue
        if not (lat0 <= lat <= lat1 and lon0 <= lon <= lon1):
            continue
        alt = a.get("alt_baro")
        on_ground = alt == "ground"
        alt_ft = 0.0 if on_ground else _num(alt)
        if not (alt_ft >= flt.min_baro_alt_ft):  # also drops NaN altitude
            continue
        hex_ = str(a.get("hex", "")).lower()
        if hex_.startswith("~") or len(hex_) != 6:
            stats.dropped_non_icao += 1
            continue
        seen_pos = a.get("seen_pos", a.get("seen", 0.0)) or 0.0
        vrate = a.get("baro_rate", a.get("geom_rate"))
        rows.append(
            {
                "icao24": hex_,
                "callsign": _str_or_none(a.get("flight")),
                "time": now - float(seen_pos),
                "lat": float(lat),
                "lon": float(lon),
                "baro_alt_ft": alt_ft,
                "geo_alt_ft": _num(a.get("alt_geom")),
                "gs_kt": _num(a.get("gs")),
                "track_deg": _num(a.get("track")),
                "vrate_fpm": _num(vrate),
                "on_ground": bool(on_ground),
                "source": "adsbx",
                "typecode": _str_or_none(a.get("t")),
                "registration": _str_or_none(a.get("r")),
            }
        )
    stats.kept = len(rows)
    # Broadcast glitches happen (e.g. 1,152 kt seen on 2026-01-01). Physically impossible
    # values are blanked (speed, track) or the report dropped (altitude, which is required),
    # and counted. Real implausibility filtering of tracks is Phase 2, step 3.
    clean_rows = []
    for r in rows:
        if not (SANE_ALT_FT[0] <= r["baro_alt_ft"] <= SANE_ALT_FT[1]):
            stats.dropped_bad_altitude += 1
            continue
        if not (0.0 <= r["gs_kt"] <= SANE_GS_KT):  # NaN fails the test too
            if r["gs_kt"] == r["gs_kt"]:  # count only real (non-NaN) values
                stats.blanked_values += 1
            r["gs_kt"] = np.nan
        if not (0.0 <= r["track_deg"] <= 360.0):
            if r["track_deg"] == r["track_deg"]:
                stats.blanked_values += 1
            r["track_deg"] = np.nan
        clean_rows.append(r)
    rows = clean_rows
    stats.kept = len(rows)
    return _to_frame(rows), stats


def _to_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return empty_frame()
    df = pd.DataFrame.from_records(rows)
    # Fix times to 0.1 s so the same fix seen in two snapshots dedupes exactly.
    df["time"] = pd.to_datetime(np.round(df["time"].to_numpy(), 1), unit="s", utc=True).astype(
        "datetime64[ns, UTC]"
    )
    for col in ("callsign", "typecode", "registration"):
        df[col] = df[col].astype("str")  # None → missing (NaN), never the text "None"
    return df[list(COLUMNS)]


def _session(pool: int) -> requests.Session:
    s = requests.Session()
    retry = Retry(total=5, backoff_factor=1.0, status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=pool, pool_maxsize=pool))
    s.headers["Accept-Encoding"] = "gzip"
    s.headers["User-Agent"] = "STRATUM student research (github.com/ShrugalVinod/stratum)"
    return s


def _fetch_and_parse(
    session: requests.Session, day: date, name: str, flt: Filter
) -> tuple[pd.DataFrame, SnapshotStats]:
    try:
        r = session.get(snapshot_url(day, name), timeout=60)
        if r.status_code == 404:
            return empty_frame(), SnapshotStats(snapshots_missing=1, failed_names=[name])
        r.raise_for_status()
        return parse_snapshot(r.content, flt)
    except (requests.RequestException, orjson.JSONDecodeError, KeyError) as e:
        log.warning("snapshot %s %s failed: %s", day, name, e)
        return empty_frame(), SnapshotStats(snapshots_missing=1, failed_names=[name])


def dedupe(df: pd.DataFrame) -> pd.DataFrame:
    """Drop repeated fixes (same aircraft, same fix time) and sort by (icao24, time)."""
    out = df.drop_duplicates(subset=["icao24", "time"], keep="first")
    return out.sort_values(["icao24", "time"], kind="stable").reset_index(drop=True)


def ingest_snapshots(
    day: date, names: Sequence[str], flt: Filter, workers: int = 16
) -> tuple[pd.DataFrame, SnapshotStats]:
    """Download + parse ``names`` in parallel; return one deduplicated, validated frame."""
    stats = SnapshotStats()
    frames: list[pd.DataFrame] = []
    with _session(workers) as s, ThreadPoolExecutor(workers) as pool:
        for df, st in pool.map(lambda n: _fetch_and_parse(s, day, n, flt), names):
            stats.add(st)
            if len(df):
                frames.append(df)
    out = dedupe(pd.concat(frames, ignore_index=True)) if frames else empty_frame()
    return validate(out), stats


def hour_path(day_dir: Path, hour: int) -> Path:
    return day_dir / f"hour={hour:02d}.parquet"


def ingest_day(
    day: date,
    out_root: Path,
    *,
    hours: Iterable[int] = range(24),
    flt: Filter | None = None,
    workers: int = 16,
    max_snapshots_per_hour: int | None = None,
    config_hash: str | None = None,
) -> dict[str, Any]:
    """Ingest one free sample day into ``out_root/YYYY-MM-DD/hour=HH.parquet`` (resumable).

    ``max_snapshots_per_hour`` limits each hour to its first N snapshots, for quick local
    tests only; such a run never marks the day complete.
    """
    flt = flt or Filter.from_domain()
    day_dir = out_root / f"{day:%Y-%m-%d}"
    day_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, Any] = {"day": str(day), "hours_done": [], "hours_skipped": []}
    total = SnapshotStats()
    t0 = _time.time()
    for h in hours:
        target = hour_path(day_dir, h)
        if target.exists() and max_snapshots_per_hour is None:
            summary["hours_skipped"].append(h)
            continue
        names = snapshot_names(h)[:max_snapshots_per_hour]
        try:
            df, st = ingest_snapshots(day, names, flt, workers)
        except Exception as e:  # one bad hour must not kill the day; it is listed and retried
            log.error("%s hour %02d failed: %s", day, h, e)
            summary.setdefault("hours_failed", {})[h] = f"{type(e).__name__}: {str(e)[:200]}"
            continue
        total.add(st)
        tmp = target.with_suffix(".parquet.tmp")
        df.to_parquet(tmp, index=False, compression="zstd")
        os.replace(tmp, target)
        summary["hours_done"].append(h)
        log.info(
            "%s hour %02d: %d rows, %d snapshots missing", day, h, len(df), st.snapshots_missing
        )
    complete = all(hour_path(day_dir, h).exists() for h in range(24))
    summary.update(
        snapshots_ok=total.snapshots_ok,
        snapshots_missing=total.snapshots_missing,
        rows_kept=total.kept,
        dropped_non_icao=total.dropped_non_icao,
        dropped_bad_altitude=total.dropped_bad_altitude,
        blanked_values=total.blanked_values,
        wall_time_s=round(_time.time() - t0, 1),
        day_complete=complete and max_snapshots_per_hour is None,
    )
    if summary["day_complete"] and not is_done(day_dir):
        m = RunManifest.start(
            "ingest-adsb-adsbx",
            unit=str(day),
            config_hash=config_hash,
            params={"filter": vars(flt)},
        )
        m.stats = {k: v for k, v in summary.items() if k not in ("hours_done", "hours_skipped")}
        m.add_outputs(sorted(day_dir.glob("hour=*.parquet")))
        mark_success(day_dir, m)
    return summary


def read_day(day_dir: Path) -> pd.DataFrame:
    """Read all hour files of one ingested day into one frame (validated)."""
    files = sorted(day_dir.glob("hour=*.parquet"))
    if not files:
        return empty_frame()
    # A stale fix can repeat across an hour boundary, so dedupe again over the whole day.
    return validate(dedupe(pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)))
