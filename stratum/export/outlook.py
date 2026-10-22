"""Live contrail outlook and advisories from the ECMWF open-data forecast (experimental).

Every day (GitHub Action ``outlook.yml``) the latest 00 UTC run of the ECMWF IFS open-data
forecast (0.25°, CC BY 4.0) is turned into a small web-data build with the same contract as the
map's builds (``build_id = "outlook"``), for today and tomorrow (UTC):

* ``B1``: fraction of each hour with persistent-contrail conditions (Schmidt–Appleman and
  RHi ≥ 1) on the raw forecast humidity — the B1 physics of the study, on a forecast;
* ``B3``: the same with the published latitude-dependent humidity correction;
* ``SAC``: fraction of the hour in which any contrail forms (also short-lived ones).

STRATUM's learned model is **not** applied: it needs cloud ice and cloud cover on pressure levels,
which the open data do not carry. So this is physics only, and labelled so on the site.

``advisories`` turns the B1 layer into NOTAM-style text: for each 6-hour window, boxes (3° tiles,
merged along rows) where lasting contrails are likely at some level FL300–FL400, with the
flight-level range, the nearest city, and the nearby levels that are drier.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
import xarray as xr

from stratum.export import grids

Array = npt.NDArray[np.float64]
LEVELS_HPA = [400, 300, 250, 200, 150]  # brackets FL280–FL420
STEPS_H = list(range(0, 55, 3))  # the run day and the next, plus the 00 UTC after
FLS = [280, 300, 320, 340, 360, 380, 400, 420]
ADVISORY_FLS = [300, 320, 340, 360, 380, 400]
THRESHOLD = 0.5
TILE_DEG = 3.0
TILE_SHARE = 0.4
MAX_RUN_TILES = 3  # boxes at most 9° wide
MAX_PER_WINDOW = 5
CREDIT = "Forecast: ECMWF open data (IFS, CC BY 4.0), processed by STRATUM"
CITIES = {
    "Delhi": (28.61, 77.21), "Mumbai": (19.08, 72.88), "Kolkata": (22.57, 88.36),
    "Chennai": (13.08, 80.27), "Bengaluru": (12.97, 77.59), "Hyderabad": (17.39, 78.49),
    "Ahmedabad": (23.02, 72.57), "Nagpur": (21.15, 79.09), "Bhopal": (23.26, 77.41),
    "Lucknow": (26.85, 80.95), "Jaipur": (26.91, 75.79), "Varanasi": (25.32, 82.97),
    "Patna": (25.59, 85.14), "Bhubaneswar": (20.30, 85.82), "Visakhapatnam": (17.69, 83.22),
    "Goa": (15.38, 73.83), "Kochi": (9.93, 76.27), "Thiruvananthapuram": (8.52, 76.94),
    "Guwahati": (26.14, 91.74), "Srinagar": (34.08, 74.80), "Amritsar": (31.63, 74.87),
    "Raipur": (21.25, 81.63), "Ranchi": (23.34, 85.31), "Indore": (22.72, 75.86),
    "Pune": (18.52, 73.86), "Udaipur": (24.59, 73.71), "Port Blair": (11.62, 92.73),
}  # fmt: skip


def fetch(dest: Path) -> tuple[Path, datetime]:
    """Download the latest 00 UTC run (t, q on ``LEVELS_HPA``, ``STEPS_H``). Returns the GRIB
    file and the run time."""
    from ecmwf.opendata import Client

    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "ifs.grib2"
    r = Client(source="ecmwf", model="ifs", resol="0p25").retrieve(
        type="fc", time=0, step=STEPS_H, param=["t", "q"], levtype="pl",
        levelist=LEVELS_HPA, target=str(target),
    )  # fmt: skip
    return target, r.datetime.replace(tzinfo=UTC)


def load(grib: Path, bbox: tuple[tuple[float, float], tuple[float, float]]) -> xr.Dataset:
    """The forecast as the (time, level, latitude, longitude) cube ``grids`` expects."""
    ds = xr.open_dataset(grib, engine="cfgrib")
    (la0, la1), (lo0, lo1) = bbox
    ds = ds.sortby("latitude").sel(latitude=slice(la0, la1), longitude=slice(lo0, lo1))
    ds = ds.swap_dims({"step": "valid_time"}).drop_vars(["step", "time"], errors="ignore")
    ds = ds.rename(
        {"valid_time": "time", "isobaricInhPa": "level", "t": "air_temperature",
         "q": "specific_humidity"}
    )  # fmt: skip
    return ds[["air_temperature", "specific_humidity"]].transpose(
        "time", "level", "latitude", "longitude"
    )


def _fmt_lat(v: float) -> str:
    d = abs(v)
    return f"{int(d):02d}{round((d % 1) * 60):02d}{'N' if v >= 0 else 'S'}"


def _fmt_lon(v: float) -> str:
    d = abs(v)
    return f"{int(d):03d}{round((d % 1) * 60):02d}{'E' if v >= 0 else 'W'}"


def nearest_city(lat: float, lon: float) -> tuple[str, float]:
    best, dist = "", np.inf
    for name, (a, b) in CITIES.items():
        d = 111.2 * float(np.hypot(lat - a, (lon - b) * np.cos(np.radians(lat))))
        if d < dist:
            best, dist = name, d
    return best, dist


def _where(lat: float, lon: float, city: str, dist: float) -> str:
    """Plain-language place: near a city, over a sea, or a distance from the nearest city."""
    if dist < 200:
        return f"NEAR {city.upper()}"
    if dist > 300 and lat < 22 and lon < 76:
        return "OVER THE ARABIAN SEA"
    if dist > 300 and lat < 21 and lon > 81:
        return "OVER THE BAY OF BENGAL"
    return f"{round(dist, -1):.0f} KM FROM {city.upper()}"


def _band_text(band: list[int]) -> str:
    return f"FL{band[0]:03d}" if len(band) == 1 else f"FL{band[0]:03d}-FL{band[-1]:03d}"


def advisories(
    frac: dict[int, Array], lat: Array, lon: Array, day: str, start_no: int = 1
) -> list[dict[str, Any]]:
    """NOTAM-style advisories for one day. ``frac``: {fl: (24, rows, cols)} B1 fractions,
    north-up rows as ``lat``. The domain is cut into ``TILE_DEG`` tiles; a tile is advised at the
    levels where ≥ ``TILE_SHARE`` of its cells reach ``THRESHOLD`` within the 6-hour window, and
    neighbouring tiles of one row with the same levels are merged into one box."""
    fls = [fl for fl in ADVISORY_FLS if fl in frac]
    step = float(abs(lat[0] - lat[1])) if len(lat) > 1 else 0.25
    n = max(1, round(TILE_DEG / step))
    rows, cols = len(lat), len(lon)
    out: list[dict[str, Any]] = []
    no = start_no
    for w0 in range(0, 24, 6):
        win = {fl: np.nanmax(frac[fl][w0 : w0 + 6], axis=0) for fl in fls}
        boxes = []
        for r0 in range(0, rows, n):
            run: list[Any] = []
            for c0 in range(0, cols + n, n):
                band: list[int] = []
                if c0 < cols:
                    sl = (slice(r0, r0 + n), slice(c0, c0 + n))
                    band = [
                        fl
                        for fl in fls
                        if float(np.nanmean(win[fl][sl] >= THRESHOLD)) >= TILE_SHARE
                    ]
                if run and band == run[0][1] and len(run) < MAX_RUN_TILES:
                    run.append((c0, band))
                    continue
                if run:
                    boxes.append((r0, run[0][0], run[-1][0] + n, run[0][1]))
                run = [(c0, band)] if band else []
        found = []
        for r0, c0, c1, band in boxes:
            m = np.zeros((rows, cols), bool)
            m[r0 : r0 + n, c0:c1] = True
            score = float(np.mean([np.nanmean(win[fl][m]) for fl in band])) * m.sum()
            found.append((score, r0, c0, c1, band, m))
        found.sort(key=lambda x: -x[0])
        for _, r0, c0, c1, band, m in found[:MAX_PER_WINDOW]:
            r1 = min(r0 + n, rows) - 1
            la_s, la_n = float(lat[r1]) - step / 2, float(lat[r0]) + step / 2
            lo_w, lo_e = float(lon[c0]) - step / 2, float(lon[min(c1, cols) - 1]) + step / 2
            clat, clon = (la_s + la_n) / 2, (lo_w + lo_e) / 2
            peak = float(np.mean([np.nanmean(win[fl][m]) for fl in band]))
            drier = sorted(
                (fl for fl in FLS if fl in frac and fl not in band),
                key=lambda fl: (float(np.nanmean(np.nanmax(frac[fl][w0 : w0 + 6], 0)[m])), abs(fl - band[0])),
            )[:2]  # fmt: skip
            t0 = datetime.fromisoformat(day).replace(tzinfo=UTC) + timedelta(hours=w0)
            t1 = t0 + timedelta(hours=6)
            city, dist = nearest_city(clat, clon)
            near = (
                f"NEAR {city.upper()}"
                if dist < 200
                else f"{round(dist, -1):.0f} KM FROM {city.upper()}"
            )
            alt = " OR ".join(f"FL{fl:03d}" for fl in sorted(drier))
            text = (
                f"ICE-SUPERSATURATED LAYER: PERSISTENT CONTRAILS LIKELY {_band_text(band)} WI AREA "
                f"{_fmt_lat(la_s)}{_fmt_lon(lo_w)} - {_fmt_lat(la_n)}{_fmt_lon(lo_e)} ({near}). "
                + (f"DRIER LEVELS NEARBY: {alt}. " if alt else "")
                + "EXPERIMENTAL, NOT FOR OPERATIONAL USE."
            )
            out.append({
                "id": f"C{no:03d}/{t0:%y}", "valid_from": f"{t0:%Y-%m-%dT%H:%MZ}",
                "valid_to": f"{t1:%Y-%m-%dT%H:%MZ}", "b": f"{t0:%y%m%d%H%M}", "c": f"{t1:%y%m%d%H%M}",
                "fl_low": band[0], "fl_high": band[-1],
                "bbox": [round(la_s, 2), round(lo_w, 2), round(la_n, 2), round(lo_e, 2)],
                "centre": [round(clat, 2), round(clon, 2)], "near": city, "near_km": round(dist),
                "mean_fraction": round(peak, 2), "drier_fls": sorted(drier), "text": text,
            })  # fmt: skip
            no += 1
    return out


def build(ds: xr.Dataset, run: datetime, out: Path, git_commit: str = "unknown") -> dict[str, Any]:
    """Write the outlook build (manifest, days, layers, outlook.json) into ``out``."""
    from stratum.export.schemas import (
        Coverage,
        DaySummary,
        FlightLevelInfo,
        GridMeta,
        LayerInfo,
        Manifest,
        ModelInfo,
    )
    from stratum.physics.units import flight_level_to_pressure

    bbox = (
        (float(ds["latitude"].min()), float(ds["latitude"].max())),
        (float(ds["longitude"].min()), float(ds["longitude"].max())),
    )
    t_last = pd.Timestamp(ds["time"].values[-1])
    days = [run.date() + timedelta(days=k) for k in range(3)]
    days = [d for d in days if pd.Timestamp(d) + pd.Timedelta(hours=24) <= t_last]
    meta: dict[str, Any] = {}
    adv: list[dict[str, Any]] = []
    sizes = {}
    for d in days:
        day = d.isoformat()
        ddir = out / "days" / day
        b1: dict[int, Array] = {}
        lat = lon = np.zeros(0)
        for fl in FLS:
            for name, scaling, field in (("B1", None, "persists"), ("B3", "B3", "persists"),
                                         ("SAC", None, "forms")):  # fmt: skip
                frac, lat, lon = grids.persistence_fraction(
                    ds, fl, np.datetime64(day), bbox, scaling=scaling, field=field
                )
                grids.write_sprite(frac, ddir / f"layers/{name}_FL{fl}.png")
                if name == "B1":
                    b1[fl] = frac
        meta = grids.grid_meta(lat, lon)
        meta["encoding"] = "png_uint8_hour_sprite"
        adv += advisories(b1, lat, lon, day, start_no=len(adv) + 1)
        summ = DaySummary(date=day, has_flights=False, n_flights=None, n_segments=None,
                          n_flagged=None, ef_positive_J=None, ef_negative_J=None,
                          grid_files=len(list((ddir / "layers").glob("*.png"))), quality_flags=[],
                          layers=["B1", "B3", "SAC"], has_observability=False)  # fmt: skip
        (ddir / "day.json").write_text(summ.model_dump_json())
        sizes[day] = sum(f.stat().st_size for f in ddir.rglob("*") if f.is_file())
    run_s = f"{run:%Y-%m-%d %H} UTC"
    man = Manifest(
        build_id="outlook", created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        git_commit=git_commit, config_hash="n/a", pipeline_version="outlook-v1",
        model_version=f"ECMWF IFS open-data forecast, run {run_s}; physics only (experimental)",
        days=[d.isoformat() for d in days], days_with_flights=[],
        flight_levels=[FlightLevelInfo(fl=fl, pressure_hpa=round(float(flight_level_to_pressure(fl)) / 100, 1)) for fl in FLS],
        hours_utc=list(range(24)), grid=GridMeta(**meta), eta_for_grids=grids.ETA_MAP,
        coverage=Coverage(adsb_coverage_pct=None, note="Forecast only: no flights."),
        credits=[CREDIT],
        models=[
            ModelInfo(id="B1", label="Physics (raw forecast)", description="Schmidt–Appleman ∧ RHi ≥ 1 on the ECMWF IFS forecast humidity."),
            ModelInfo(id="B3", label="Published correction", description="The same with the latitude-dependent humidity correction of Teoh et al. (pycontrails)."),
        ],
        layers=[
            LayerInfo(id="B1", file="layers/B1_FL{fl}.png", per_flight_level=True, full_scale=1.0, meaning="fraction of the hour with persistent-contrail conditions, raw IFS forecast"),
            LayerInfo(id="B3", file="layers/B3_FL{fl}.png", per_flight_level=True, full_scale=1.0, meaning="same with the published humidity correction"),
            LayerInfo(id="SAC", file="layers/SAC_FL{fl}.png", per_flight_level=True, full_scale=1.0, meaning="fraction of the hour in which any contrail forms (also short-lived)"),
        ],
        results_file=None,
    )  # fmt: skip
    (out / "manifest.json").write_text(man.model_dump_json(indent=1))
    from stratum.config import corridor_geojson, load_domain
    from stratum.export.web_export import web_json

    (out / "corridor.geojson").write_text(web_json(corridor_geojson(load_domain().corridor)))
    info = {
        "run": f"{run:%Y-%m-%dT%H:%MZ}",
        "issued": datetime.now(UTC).strftime("%Y-%m-%dT%H:%MZ"),
        "days": man.days,
        "credit": CREDIT,
        "threshold": THRESHOLD,
        "note": "Experimental physics forecast (no STRATUM correction); not for operational use.",
        "advisories": adv,
    }
    (out / "outlook.json").write_text(json.dumps(info, indent=1))
    return {"run": info["run"], "days": man.days, "advisories": len(adv), "bytes": sizes}
