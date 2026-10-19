"""Export Phase 2 results to the static web app (build prompt §4.3; contract in ``schemas.py``).

Per month (``stratum export-web --month 2026-01``):

* **Every day with ERA5** gets contrail-condition grids: 8 flight levels × 24 hours of
  8-bit PNGs (``export.grids``).
* **Days with flights** (Phase 2 ``segments_met`` + CoCiP) also get ``flights.geojson`` and
  ``segments_flagged.json``. Only commercial airline flights of the corridor sample appear
  (privacy rule, build prompt §3.6). Tracks are simplified with Douglas–Peucker (200 m).
  Flight ids are salted SHA-256 hashes: the salt comes from ``STRATUM_ID_SALT`` (``.env`` or
  Colab Secrets) and is never written anywhere.
* ``manifest.json`` and ``corridor.geojson`` describe the build.

Size budget (build prompt §4.3): each day's folder ≤ 3 MB, or the export fails.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
import yaml

from stratum.export import grids
from stratum.export.schemas import (
    Coverage,
    DaySummary,
    FlaggedSegment,
    FlightLevelInfo,
    FlightProps,
    GridMeta,
    Manifest,
)

Array = npt.NDArray[np.float64]
DAY_BUDGET_BYTES = 3_000_000
SIMPLIFY_M = 200.0
EARTH_R_M = 6_371_000.0
EF_NOTE = (
    "Physics-only CoCiP (B1, raw ERA5). 5th–95th percentile from 100 Monte Carlo members; "
    "the 5th percentile is unstable (Phase 2 convergence check)."
)
CONFIDENCE_V0 = "Uncorrected physics prediction (v0). Satellite-corrected estimates: Phase 7."
CREDITS = [
    "Contains modified Copernicus Climate Change Service information 2026",
    "Meteosat-9 imagery © EUMETSAT 2026",
    "Flight data: ADS-B Exchange",
    "Aircraft metadata: OpenSky Network",
]


# ── identifiers, names, directions ───────────────────────────────────────────


def id_salt() -> str:
    salt = os.environ.get("STRATUM_ID_SALT", "")
    if len(salt) < 16:
        raise RuntimeError(
            "STRATUM_ID_SALT is missing or shorter than 16 characters. Put a long random "
            "string in .env (local) or Colab Secrets. It is never printed or exported."
        )
    return salt


def finite(obj: Any) -> Any:
    """NaN / ±inf → None, recursively (browsers reject NaN in JSON); numpy scalars → Python."""
    if isinstance(obj, dict):
        return {k: finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [finite(v) for v in obj]
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float) and not np.isfinite(obj):
        return None
    return obj


def web_json(obj: Any, **kw: Any) -> str:
    """Strict JSON for the website: non-finite numbers become null; NaN can never slip through."""
    return json.dumps(finite(obj), allow_nan=False, default=str, **kw)


def hash_id(raw: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}|{raw}".encode()).hexdigest()[:12]


def airline_names(path: Path) -> dict[str, str]:
    data = yaml.safe_load(path.read_text()) or {}
    out: dict[str, str] = {}
    for group in ("indian", "foreign"):
        out.update({str(k).upper(): str(v) for k, v in (data.get(group) or {}).items()})
    return out


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return float(np.degrees(np.arctan2(y, x)) % 360.0)


def direction(lat0: float, lon0: float, lat1: float, lon1: float, del_bom_bearing: float) -> str:
    """'DEL-BOM' / 'BOM-DEL' if the overall track is within 45° of that route's bearing."""
    b = _bearing(lat0, lon0, lat1, lon1)
    d = abs((b - del_bom_bearing + 180) % 360 - 180)
    if d <= 45:
        return "DEL-BOM"
    if d >= 135:
        return "BOM-DEL"
    return "other"


# ── geometry ──────────────────────────────────────────────────────────────────


def douglas_peucker(lat: Array, lon: Array, tol_m: float = SIMPLIFY_M) -> npt.NDArray[np.int64]:
    """Indices of the points kept by Douglas–Peucker (local equirectangular metres)."""
    n = len(lat)
    if n <= 2:
        return np.arange(n)
    k = np.cos(np.radians(np.mean(lat)))
    x = np.radians(lon) * EARTH_R_M * k
    y = np.radians(lat) * EARTH_R_M
    keep = np.zeros(n, dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dx, dy = x[j] - x[i], y[j] - y[i]
        seg = np.hypot(dx, dy)
        px, py = x[i + 1 : j] - x[i], y[i + 1 : j] - y[i]
        d = np.hypot(px, py) if seg == 0 else np.abs(dx * py - dy * px) / seg
        m = int(np.argmax(d))
        if d[m] > tol_m:
            keep[i + 1 + m] = True
            stack += [(i, i + 1 + m), (i + 1 + m, j)]
    return np.flatnonzero(keep)


# ── per day ───────────────────────────────────────────────────────────────────


def flights_and_segments(
    seg: pd.DataFrame,
    cocip: pd.DataFrame | None,
    salt: str,
    names: dict[str, str],
    del_bom_bearing: float,
    day: date,
) -> tuple[dict[str, Any], list[FlaggedSegment], dict[str, Any]]:
    """GeoJSON of commercial corridor flights + their CoCiP-flagged segments (B1)."""
    s = seg
    if "in_corridor" in s:
        s = s[s["flight_id"].isin(set(s.loc[s["in_corridor"], "flight_id"]))]
    s = s[s["commercial"].astype(bool)].copy()
    for c in ("time_start", "time_end", "time_mid"):  # stored tz-aware UTC → naive UTC
        s[c] = pd.to_datetime(s[c], utc=True).dt.tz_convert(None)
    if cocip is not None and len(cocip):
        cols = [c for c in ("segment_id", "ef", "persistent_1", "contrail_age",
                            "ef_p05", "ef_p50", "ef_p95") if c in cocip]  # fmt: skip
        s = s.merge(cocip[cols], on="segment_id", how="left")
    else:
        s["ef"], s["persistent_1"] = np.nan, False
    s["flagged"] = s["persistent_1"].fillna(0).astype(bool) & (s["ef"].fillna(0) != 0)
    midnight = pd.Timestamp(day)
    feats: list[dict[str, Any]] = []
    flagged: list[FlaggedSegment] = []
    for fid, g in s.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        lat = np.r_[g["lat_start"].to_numpy(float), g["lat_end"].to_numpy(float)[-1]]
        lon = np.r_[g["lon_start"].to_numpy(float), g["lon_end"].to_numpy(float)[-1]]
        t = pd.to_datetime(np.r_[g["time_start"].to_numpy(), g["time_end"].to_numpy()[-1]])
        minutes = ((t - midnight).total_seconds() // 60).astype(int)
        keep = douglas_peucker(lat, lon)
        callsign = str(g["callsign"].iloc[0])
        airline = names.get(callsign[:3])
        hid = hash_id(str(fid), salt)
        dirn = direction(lat[0], lon[0], lat[-1], lon[-1], del_bom_bearing)
        props = FlightProps(
            flight_id=hid,
            callsign=callsign,
            airline=airline,
            aircraft_type=g["typecode"].iloc[0]
            if "typecode" in g and pd.notna(g["typecode"].iloc[0])
            else None,
            direction=dirn,
            t_start=f"{t[0]:%Y-%m-%dT%H:%M:%S}Z",
            t_end=f"{t[-1]:%Y-%m-%dT%H:%M:%S}Z",
            minutes=[int(m) for m in minutes[keep]],
            flagged=bool(g["flagged"].any()),
        )
        feats.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(float(lon[i]), 4), round(float(lat[i]), 4)] for i in keep
                    ],
                },
                "properties": props.model_dump(),
            }
        )
        for k, r in enumerate(g[g["flagged"]].itertuples()):
            lst = (r.time_mid.hour + r.time_mid.minute / 60 + r.lon_start / 15) % 24
            flagged.append(
                FlaggedSegment(
                    segment_id=f"{hid}_{k:03d}",
                    flight_id=hid,
                    callsign=callsign,
                    airline=airline,
                    direction=dirn,
                    time_utc=f"{pd.Timestamp(r.time_mid):%Y-%m-%dT%H:%M:%S}Z",
                    fl=round(float(r.alt_ft_mid) / 100),
                    lat=round((r.lat_start + r.lat_end) / 2, 4),
                    lon=round((r.lon_start + r.lon_end) / 2, 4),
                    lat_start=round(float(r.lat_start), 4),
                    lon_start=round(float(r.lon_start), 4),
                    lat_end=round(float(r.lat_end), 4),
                    lon_end=round(float(r.lon_end), 4),
                    night=bool(lst >= 18 or lst < 6),
                    ef_J=_num(getattr(r, "ef", None)),
                    ef_p05_J=_num(getattr(r, "ef_p05", None)),
                    ef_p50_J=_num(getattr(r, "ef_p50", None)),
                    ef_p95_J=_num(getattr(r, "ef_p95", None)),
                    ef_note=EF_NOTE,
                    contrail_age_h=_hours(getattr(r, "contrail_age", None)),
                    confidence_note=CONFIDENCE_V0,
                )
            )
    flagged.sort(key=lambda f: -(f.ef_J or 0.0))
    ef = s["ef"].fillna(0.0)
    stats = {
        "n_flights": len(feats),
        "n_segments": len(s),
        "n_flagged": len(flagged),
        "ef_positive_J": float(ef[ef > 0].sum()),
        "ef_negative_J": float(ef[ef < 0].sum()),
    }
    return {"type": "FeatureCollection", "features": feats}, flagged, stats


def _num(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None


def _hours(v: Any) -> float | None:
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    if isinstance(v, (pd.Timedelta, np.timedelta64)):
        return round(float(pd.Timedelta(v).total_seconds()) / 3600, 2)
    f = _num(v)
    return None if f is None else round(f / 3600, 2)  # pycontrails stores seconds


def dir_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


# ── month ─────────────────────────────────────────────────────────────────────


def export_web(
    root: Path,
    month: str,
    out_root: Path,
    build_id: str,
    git_commit: str = "unknown",
    config_hash: str = "unknown",
    scaling: str = "B1",
    days: list[date] | None = None,
) -> dict[str, Any]:
    """Write one build of the web data for ``month`` (YYYY-MM) under ``out_root/build_id``."""
    from stratum.config import corridor_geojson, load_domain
    from stratum.paths import repo_root
    from stratum.phase2 import era5_window
    from stratum.physics.units import flight_level_to_pressure

    salt = id_salt()
    dom = load_domain()
    out = out_root / build_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "corridor.geojson").write_text(web_json(corridor_geojson(dom.corridor)))
    names = airline_names(repo_root() / "configs" / "airlines.yaml")
    ap = dom.corridor.airports
    del_bom = _bearing(ap["VIDP"].lat, ap["VIDP"].lon, ap["VABB"].lat, ap["VABB"].lon)
    lo, hi = dom.flight_levels.dashboard_fl_range
    fls = list(range(lo, hi + 1, dom.flight_levels.dashboard_fl_step))
    bbox = (tuple(dom.study_bbox.lat), tuple(dom.study_bbox.lon))
    y, m = (int(v) for v in month.split("-"))
    if days is None:
        days, d = [], date(y, m, 1)
        while d.month == m:
            days.append(d)
            d += timedelta(days=1)
    grid_meta: dict[str, Any] | None = None
    done, with_flights, summaries = [], [], {}
    for d in days:
        t0 = pd.Timestamp(d)
        try:
            # only T and q are needed: reading all 8 variables from Drive was ~4× slower
            pl = era5_window(root, "pl", t0, t0 + pd.Timedelta(hours=24))[
                ["air_temperature", "specific_humidity"]
            ].load()
        except FileNotFoundError:
            summaries[str(d)] = "no ERA5"
            continue
        ddir = out / "days" / f"{d:%Y-%m-%d}"
        n_png = 0
        for fl in fls:
            frac, lat, lon = grids.persistence_fraction(pl, fl, np.datetime64(t0), bbox)  # type: ignore[arg-type]
            grid_meta = grid_meta or grids.grid_meta(lat, lon)
            for h in range(24):
                grids.write_png(frac[h], ddir / "grids" / f"FL{fl:03d}_{h:02d}.png")
                n_png += 1
        flags: list[str] = []
        stats: dict[str, Any] = {}
        src = root / "interim" / "segments_met" / f"{d:%Y-%m}" / f"{d:%Y-%m-%d}"
        has = (src / "segments_met.parquet").exists()
        if has:
            seg = pd.read_parquet(src / "segments_met.parquet")
            per = pd.read_parquet(src / "per_flight.parquet")
            if "typecode" not in seg and "typecode" in per:
                seg = seg.merge(per[["flight_id", "typecode"]], on="flight_id", how="left")
            cp = (
                root
                / "interim"
                / "cocip"
                / scaling
                / f"{d:%Y-%m}"
                / f"{d:%Y-%m-%d}"
                / "segments.parquet"
            )
            cocip = pd.read_parquet(cp) if cp.exists() else None
            if cocip is None:
                flags.append(f"no CoCiP {scaling} output")
            fc, flagged, stats = flights_and_segments(seg, cocip, salt, names, del_bom, d)
            (ddir / "flights.geojson").write_text(web_json(fc, separators=(",", ":")))
            (ddir / "segments_flagged.json").write_text(
                web_json([f.model_dump() for f in flagged], separators=(",", ":"))
            )
            with_flights.append(str(d))
        summ = DaySummary(
            date=str(d),
            has_flights=has,
            n_flights=stats.get("n_flights"),
            n_segments=stats.get("n_segments"),
            n_flagged=stats.get("n_flagged"),
            ef_positive_J=stats.get("ef_positive_J"),
            ef_negative_J=stats.get("ef_negative_J"),
            grid_files=n_png,
            quality_flags=flags,
        )
        (ddir / "day.json").write_text(summ.model_dump_json())
        size = dir_size(ddir)
        if size > DAY_BUDGET_BYTES:
            raise RuntimeError(f"{d}: {size / 1e6:.2f} MB exceeds the 3 MB per-day budget")
        summaries[str(d)] = f"{size / 1e6:.2f} MB" + (" + flights" if has else "")
        done.append(str(d))
    if grid_meta is None:
        raise RuntimeError(f"no ERA5 found for {month}")
    man = Manifest(
        build_id=build_id,
        created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        git_commit=git_commit,
        config_hash=config_hash,
        pipeline_version="phase4-v0",
        model_version=f"{scaling}-physics-v0",
        days=done,
        days_with_flights=with_flights,
        flight_levels=[
            FlightLevelInfo(fl=fl, pressure_hpa=round(float(flight_level_to_pressure(fl)) / 100, 1))
            for fl in fls
        ],
        hours_utc=list(range(24)),
        grid=GridMeta(**grid_meta),
        eta_for_grids=grids.ETA_MAP,
        coverage=Coverage(
            adsb_coverage_pct=None,
            note="Coverage audit on 2 and 5 Nov 2026 (build prompt Phase 1); pending.",
        ),
        credits=CREDITS,
    )
    (out / "manifest.json").write_text(man.model_dump_json(indent=1))
    return {"build_id": build_id, "days": len(done), "days_with_flights": with_flights,
            "sizes": summaries, "total_MB": round(dir_size(out) / 1e6, 2)}  # fmt: skip
