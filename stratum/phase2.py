"""Phase 2 jobs: segments + met + SAC per day, and CoCiP per day and scaling (build prompt §2.4).

Both jobs are resumable per **day** (one ``_SUCCESS`` unit each) and write to the Drive
layout of build prompt §2.3:

* ``interim/segments_met/YYYY-MM/YYYY-MM-DD/segments_met.parquet`` + ``per_flight.parquet``
* ``interim/cocip/<B1|B2|B3>/YYYY-MM/YYYY-MM-DD/segments.parquet`` + ``contrail.parquet``

Each unit's manifest stores the step-by-step removal log and the run summary.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import xarray as xr

from stratum.manifest import RunManifest, UnitLock, UnitLockedError, is_done, mark_success


def era5_window(root: Path, group: str, start: pd.Timestamp, end: pd.Timestamp) -> xr.Dataset:
    """ERA5 ``group`` for [start, end] (UTC, naive), across month boundaries if needed."""
    months = pd.period_range(start.to_period("M"), end.to_period("M"), freq="M")
    parts = []
    for m in months:
        path = root / "raw" / "era5" / group / f"{m.year:04d}-{m.month:02d}" / "data.zarr"
        if path.exists():
            parts.append(xr.open_zarr(path))
    if not parts:
        raise FileNotFoundError(f"no ERA5 {group} for {start}..{end} under {root}")
    ds = xr.concat(parts, dim="time") if len(parts) > 1 else parts[0]
    out: xr.Dataset = ds.sel(time=slice(start, end))
    return out


def _day_dir(root: Path, kind: str, day: date) -> Path:
    return root / "interim" / kind / f"{day:%Y-%m}" / f"{day:%Y-%m-%d}"


def build_segments_day(
    root: Path,
    day: date,
    source: str = "adsbx",
    corridor: Any = None,
    aircraft_db_snapshot: str = "2025-08",
    config_hash: str | None = None,
) -> dict[str, Any]:
    """Raw ADS-B day → segments_met for that day (flights, met features, η, SAC flags)."""
    from stratum.flights.pipeline import build_flight_segments
    from stratum.io import aircraft_db
    from stratum.io.adsb_adsbx import read_day
    from stratum.met.features import PL_VARS, build_segments_met, tropopause_grid
    from stratum.met.interp import MetGrid

    out_dir = _day_dir(root, "segments_met", day)
    if is_done(out_dir):
        return {"day": str(day), "status": "already done"}
    adsb_dir = root / "raw" / "adsb" / source / f"{day:%Y-%m-%d}"
    if not is_done(adsb_dir):
        return {"day": str(day), "status": f"no complete ADS-B day in {adsb_dir}"}
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        lock = UnitLock(out_dir)
        lock.acquire()
    except UnitLockedError:
        return {"day": str(day), "status": "locked by another run"}
    try:
        man = RunManifest.start(
            "build-segments", unit=str(day), config_hash=config_hash, params={"source": source}
        )
        adsb = read_day(adsb_dir)
        db = aircraft_db.load(root / "raw" / "aircraft_db", aircraft_db_snapshot)
        seg, per, log = build_flight_segments(adsb, db, corridor)
        t0 = pd.Timestamp(day)
        pl = era5_window(root, "pl", t0, t0 + pd.Timedelta(hours=25)).load()
        tt = era5_window(root, "tropo_T", t0, t0 + pd.Timedelta(hours=25)).load()
        s, summ = build_segments_met(
            seg, per, MetGrid.from_dataset(pl, PL_VARS), tropopause_grid(pl, tt)
        )
        f1, f2 = out_dir / "segments_met.parquet", out_dir / "per_flight.parquet"
        s.to_parquet(f1, index=False)
        per.to_parquet(f2, index=False)
        man.stats = {"steps": log, "met": summ}
        man.add_outputs([f1, f2])
        mark_success(out_dir, man)
    finally:
        lock.release()
    return {"day": str(day), "status": "built", **summ, "steps": json.dumps(log, default=str)}


def cocip_day(
    root: Path,
    day: date,
    scaling: str,
    members: int = 20,
    max_age_h: float = 24.0,
    seed: int = 20261013,
    corridor_only: bool = True,
    config_hash: str | None = None,
) -> dict[str, Any]:
    """CoCiP for one day's flights with one humidity scaling (needs build_segments_day)."""
    from pycontrails import MetDataset

    from stratum.physics import cocip_runner as cr

    src = _day_dir(root, "segments_met", day)
    out_dir = _day_dir(root, f"cocip/{scaling}", day)
    if is_done(out_dir):
        return {"day": str(day), "scaling": scaling, "status": "already done"}
    if not is_done(src):
        return {"day": str(day), "scaling": scaling, "status": "segments_met missing"}
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        lock = UnitLock(out_dir)
        lock.acquire()
    except UnitLockedError:
        return {"day": str(day), "scaling": scaling, "status": "locked by another run"}
    try:
        man = RunManifest.start(
            "run-cocip",
            unit=f"{scaling}/{day}",
            config_hash=config_hash,
            params={"members": members, "max_age_h": max_age_h, "seed": seed},
        )
        s = pd.read_parquet(src / "segments_met.parquet")
        if corridor_only and "in_corridor" in s:
            s = s[s["flight_id"].isin(set(s.loc[s["in_corridor"], "flight_id"]))]
        flights = cr.segments_to_flights(s)
        t0 = pd.Timestamp(day)
        t1 = t0 + pd.Timedelta(hours=24 + max_age_h + 1)
        pl = era5_window(root, "pl", t0, t1).load()
        sl = era5_window(root, "sl", t0, t1).load()
        res = cr.run(flights, MetDataset(pl), MetDataset(sl), scaling, members, seed, max_age_h)
        f1, f2 = out_dir / "segments.parquet", out_dir / "contrail.parquet"
        res.segments.to_parquet(f1, index=False)
        contrail = res.contrail.copy()
        contrail.attrs = {}
        contrail.to_parquet(f2, index=False)
        man.stats = {**res.summary, "flights": len(flights)}
        man.add_outputs([f1, f2])
        mark_success(out_dir, man)
    finally:
        lock.release()
    return {"day": str(day), "scaling": scaling, "status": "done", **res.summary}


def days_with_adsb(root: Path, month: str, source: str = "adsbx") -> list[date]:
    """Complete ADS-B days available in ``month`` (YYYY-MM)."""
    y, m = (int(x) for x in month.split("-"))
    d, out = date(y, m, 1), []
    while d.month == m:
        if is_done(root / "raw" / "adsb" / source / f"{d:%Y-%m-%d}"):
            out.append(d)
        d += timedelta(days=1)
    return out


def cocip_convergence(
    root: Path,
    day: date,
    scaling: str = "B1",
    n_small: int = 20,
    n_large: int = 40,
    max_age_h: float = 24.0,
    seed: int = 20261013,
) -> dict[str, Any]:
    """Q12 check: do EF percentiles change between N = 20 and N = 40 Monte Carlo members?"""
    from pycontrails import MetDataset

    from stratum.physics import cocip_runner as cr

    s = pd.read_parquet(_day_dir(root, "segments_met", day) / "segments_met.parquet")
    if "in_corridor" in s:
        s = s[s["flight_id"].isin(set(s.loc[s["in_corridor"], "flight_id"]))]
    flights = cr.segments_to_flights(s)
    t0 = pd.Timestamp(day)
    t1 = t0 + pd.Timedelta(hours=24 + max_age_h + 1)
    met = MetDataset(era5_window(root, "pl", t0, t1).load())
    rad = MetDataset(era5_window(root, "sl", t0, t1).load())
    a = cr.run(flights, met, rad, scaling, n_small, seed, max_age_h).segments
    b = cr.run(flights, met, rad, scaling, n_large, seed, max_age_h).segments
    m = a.merge(b, on="segment_id", suffixes=("_n20", "_n40"))
    m = m[(m["ef_p50_n40"].abs() > 0) | (m["ef_p95_n40"].abs() > 0)]
    rows = {"day": str(day), "scaling": scaling, "segments_with_ef": len(m)}
    for q in ("p05", "p50", "p95"):
        tot20, tot40 = m[f"ef_{q}_n20"].sum(), m[f"ef_{q}_n40"].sum()
        rows[f"sum_ef_{q}_n20"] = float(tot20)
        rows[f"sum_ef_{q}_n40"] = float(tot40)
        rows[f"rel_change_{q}"] = float(abs(tot20 - tot40) / abs(tot40)) if tot40 else None
    out = root / "interim" / "cocip" / "convergence"
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([rows]).to_csv(out / f"{day:%Y-%m}.csv", index=False)
    return rows
