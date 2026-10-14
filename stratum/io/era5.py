"""ERA5 download: hourly weather over the padded study box, one Zarr per month and group.

What it does
------------
ERA5 is ECMWF's reanalysis: a best estimate of the atmosphere every hour on a 0.25° grid
(paper §3.2, Table 2). STRATUM needs three **groups** of fields (build prompt §3.2):

``pl``      pressure levels 100–500 hPa (12 levels): every variable CoCiP needs plus
            geopotential and cloud fraction (used by observability and features)
``sl``      single level: top-of-atmosphere net solar and thermal radiation (CoCiP)
``tropo_T`` temperature only at 50 and 70 hPa, because the tropical tropopause over India
            sits near 100 hPa and the WMO definition looks ~2 km above it

The variable list is **asked from pycontrails** (``Cocip.met_variables``,
``Cocip.optional_met_variables``, ``Cocip.rad_variables``), choosing for each the ERA5
option, so it can't drift from what CoCiP expects.

Two routes behind one interface (build prompt §1.1):

* **CDS** (primary): the Copernicus Climate Data Store crops to our box on its server, so a
  month is ~1 GB. pycontrails' own ``ERA5`` class cannot crop (it always fetches the
  globe), so this module requests the data itself, one (month, variable) per request
  (smaller requests queue faster), and then applies **exactly pycontrails'
  preprocessing**: ``valid_time``→``time``, ``pressure_level``→``level``, single-level data
  get ``level = −1``, variables renamed to pycontrails' standard names, and
  ``provider="ECMWF", dataset="ERA5", product="reanalysis"`` attributes. Those attributes
  are what make CoCiP shift the accumulated radiation fields by −30 min when it reads them
  (``pycontrails.models.cocip.cocip._process_rad``), so we must not shift them ourselves.
* **ARCO** (Google's analysis-ready ERA5 Zarr): stored in whole-globe chunks (one hour × 37
  levels × the whole Earth per chunk), so cropping still reads ~0.5 TB per month. Used only
  to check that it equals the CDS data on one day (build prompt §1.1.3), not for bulk.

Output: ``<drive>/raw/era5/<group>/YYYY-MM/data.zarr`` (consolidated metadata), plus a
manifest and ``_SUCCESS`` marker per month. Months already marked done are skipped.
Records whether each month is final ERA5 or preliminary ERA5T (``expver``).
"""

from __future__ import annotations

import calendar
import logging
import shutil
import time as _time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr

from stratum.manifest import RunManifest, is_done, mark_success

log = logging.getLogger(__name__)

PL_LEVELS_HPA = (100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500)
TROPO_LEVELS_HPA = (50, 70)


def _era5_choice(entry: Any, available: set[str]) -> Any:
    """Pick the ERA5 option from a pycontrails variable entry (a MetVariable or a tuple)."""
    options = entry if isinstance(entry, tuple | list) else (entry,)
    for v in options:
        if v.short_name in available:
            return v
    raise ValueError(f"no ERA5 option among {[v.short_name for v in options]}")


def cocip_variables() -> dict[str, list[Any]]:
    """MetVariables per group, derived from pycontrails' Cocip requirements."""
    from pycontrails.datalib.ecmwf.variables import PRESSURE_LEVEL_VARIABLES, SURFACE_VARIABLES
    from pycontrails.models.cocip import Cocip

    pl_avail = {v.short_name for v in PRESSURE_LEVEL_VARIABLES}
    sl_avail = {v.short_name for v in SURFACE_VARIABLES}
    pl = [_era5_choice(e, pl_avail) for e in (*Cocip.met_variables, *Cocip.optional_met_variables)]
    sl = [_era5_choice(e, sl_avail) for e in Cocip.rad_variables]
    temp = next(v for v in pl if v.short_name == "t")
    return {"pl": pl, "sl": sl, "tropo_T": [temp]}


@dataclass(frozen=True)
class Group:
    name: str
    dataset: str
    levels: tuple[int, ...] | None  # None = single level


GROUPS: dict[str, Group] = {
    "pl": Group("pl", "reanalysis-era5-pressure-levels", PL_LEVELS_HPA),
    "sl": Group("sl", "reanalysis-era5-single-levels", None),
    "tropo_T": Group("tropo_T", "reanalysis-era5-pressure-levels", TROPO_LEVELS_HPA),
}


@dataclass(frozen=True)
class Area:
    """Lat/lon box in degrees."""

    lat: tuple[float, float]
    lon: tuple[float, float]

    @classmethod
    def padded_domain(cls) -> Area:
        from stratum.config import load_domain

        d = load_domain().padded_bbox
        return cls(lat=(d.lat[0], d.lat[1]), lon=(d.lon[0], d.lon[1]))

    def cds(self) -> list[float]:
        """CDS order: [North, West, South, East]."""
        return [self.lat[1], self.lon[0], self.lat[0], self.lon[1]]


def cds_request(
    group: Group, short_name: str, year: int, month: int, area: Area, days: list[int] | None = None
) -> dict[str, Any]:
    """The CDS API request dict for one variable of one group for one month (or some days)."""
    ndays = calendar.monthrange(year, month)[1]
    req: dict[str, Any] = {
        "product_type": ["reanalysis"],
        "variable": [short_name],
        "year": [f"{year}"],
        "month": [f"{month:02d}"],
        "day": [f"{d:02d}" for d in (days or range(1, ndays + 1))],
        "time": [f"{h:02d}:00" for h in range(24)],
        "area": area.cds(),
        "data_format": "netcdf",
        "download_format": "unarchived",
    }
    if group.levels is not None:
        req["pressure_level"] = [str(p) for p in group.levels]
    return req


def standardise(
    ds: xr.Dataset, group: Group, variables: list[Any]
) -> tuple[xr.Dataset, dict[str, Any]]:
    """Apply pycontrails' ERA5 preprocessing and our conventions; return (ds, info).

    Mirrors ``pycontrails.datalib.ecmwf.ERA5._preprocess_era5_dataset`` + ``set_metadata``.
    """
    info: dict[str, Any] = {}
    if "expver" in ds.coords or "expver" in ds.variables:
        vals = np.unique(np.asarray(ds["expver"].values).astype(str))
        info["expver"] = vals.tolist()  # "0001" = final ERA5, "0005" = ERA5T (preliminary)
        ds = ds.drop_vars("expver")
    if "number" in ds.coords:
        ds = ds.drop_vars("number")
    if "valid_time" in ds.dims or "valid_time" in ds.coords:
        ds = ds.rename(valid_time="time")
    if "pressure_level" in ds.dims or "pressure_level" in ds.coords:
        ds = ds.rename(pressure_level="level")
    if group.levels is None:
        ds = ds.expand_dims(level=[-1])
    rename = {v.short_name: v.standard_name for v in variables if v.short_name in ds}
    ds = ds.rename(rename)
    for v in variables:
        if v.standard_name in ds:
            ds[v.standard_name].attrs.setdefault("units", v.units)
            ds[v.standard_name].attrs["short_name"] = v.short_name
    ds = ds.assign_coords(level=ds["level"].astype("float64"))
    ds = ds.sortby(["latitude", "longitude", "level", "time"])  # ascending, as MetDataset wants
    ds = ds.transpose("longitude", "latitude", "level", "time")
    ds.attrs = {"provider": "ECMWF", "dataset": "ERA5", "product": "reanalysis"}
    for c in ("longitude", "latitude", "level", "time"):
        ds[c].encoding.pop("dtype", None)
    return ds, info


def month_dir(root: Path, group: str, year: int, month: int) -> Path:
    return root / group / f"{year:04d}-{month:02d}"


def download_month_cds(
    group_name: str,
    year: int,
    month: int,
    root: Path,
    *,
    area: Area | None = None,
    days: list[int] | None = None,
    client: Any = None,
    config_hash: str | None = None,
    parallel_requests: int = 4,
) -> dict[str, Any]:
    """Download one month (or ``days`` of it) of one group from CDS → Zarr (resumable).

    A partial-month request (``days``) is for tests: it writes to ``<YYYY-MM>_days-…``
    and is never marked as a complete month.
    """
    group = GROUPS[group_name]
    variables = cocip_variables()[group_name]
    area = area or Area.padded_domain()
    out_dir = month_dir(root, group_name, year, month)
    if days:
        out_dir = out_dir.with_name(f"{out_dir.name}_days-{days[0]:02d}-{days[-1]:02d}")
    if is_done(out_dir):
        return {"group": group_name, "month": f"{year}-{month:02d}", "status": "already done"}
    if client is None:
        import os

        import cdsapi

        client = cdsapi.Client(
            url=os.environ.get("CDSAPI_URL"),
            key=os.environ.get("CDSAPI_KEY"),
            quiet=True,
            progress=False,
        )
    t0 = _time.time()
    out_dir.mkdir(parents=True, exist_ok=True)
    infos: dict[str, Any] = {}
    # Each variable is downloaded to <month>/_parts/<var>.nc and kept until the month is
    # merged, so a Colab disconnect loses at most the requests still in flight.
    parts_dir = out_dir / "_parts"
    parts_dir.mkdir(exist_ok=True)

    def fetch(v: Any) -> Path:
        nc = parts_dir / f"{v.short_name}.nc"
        if nc.exists():
            return nc
        req = cds_request(group, v.short_name, year, month, area, days)
        log.info("CDS request %s %s %04d-%02d", group.dataset, v.short_name, year, month)
        tmp_nc = parts_dir / f"{v.short_name}.nc.part"
        client.retrieve(group.dataset, req, str(tmp_nc))
        tmp_nc.rename(nc)
        return nc

    with ThreadPoolExecutor(max_workers=min(parallel_requests, len(variables))) as pool:
        files = list(pool.map(fetch, variables))
    parts = []
    for v, nc in zip(variables, files, strict=True):
        with xr.open_dataset(nc) as raw:
            ds_v, info = standardise(raw, group, variables)
            infos[v.short_name] = info
            parts.append(ds_v.load())
    ds = xr.merge(parts, compat="override", join="exact")
    zpath = out_dir / "data.zarr"
    tmp_z = out_dir / "data.zarr.tmp"
    shutil.rmtree(tmp_z, ignore_errors=True)
    ds.to_zarr(tmp_z, mode="w", consolidated=True)
    shutil.rmtree(zpath, ignore_errors=True)
    tmp_z.rename(zpath)
    shutil.rmtree(parts_dir, ignore_errors=True)
    stats = summarise(ds)
    expvers = sorted({e for i in infos.values() for e in i.get("expver", [])})
    stats.update(expver=expvers, wall_time_s=round(_time.time() - t0, 1))
    if not days:
        m = RunManifest.start(
            "download-era5",
            unit=f"{group_name}/{year}-{month:02d}",
            config_hash=config_hash,
            params={
                "route": "cds",
                "dataset": group.dataset,
                "area": area.cds(),
                "levels": group.levels,
            },
        )
        m.stats = stats
        mark_success(out_dir, m)
    return {"group": group_name, "month": f"{year}-{month:02d}", "status": "downloaded", **stats}


def summarise(ds: xr.Dataset) -> dict[str, Any]:
    """Sanity numbers for a run summary: variables, shape, NaN fraction, min/max, bytes."""
    out: dict[str, Any] = {
        "variables": sorted(map(str, ds.data_vars)),
        "dims": {str(k): int(v) for k, v in ds.sizes.items()},
        "time_range": [str(ds.time.values[0])[:16], str(ds.time.values[-1])[:16]],
        "bytes_uncompressed": int(ds.nbytes),
    }
    for name, da in ds.data_vars.items():
        a = np.asarray(da.values, dtype=np.float64)
        out[f"{name}:nan_frac"] = round(float(np.isnan(a).mean()), 6)
        out[f"{name}:min"] = float(np.nanmin(a)) if np.isfinite(a).any() else None
        out[f"{name}:max"] = float(np.nanmax(a)) if np.isfinite(a).any() else None
    return out


def open_month(root: Path, group: str, year: int, month: int) -> xr.Dataset:
    """Open one stored month (lazily)."""
    ds: xr.Dataset = xr.open_zarr(month_dir(root, group, year, month) / "data.zarr")
    return ds


# ── ARCO route (equivalence check only) ───────────────────────────────────────

ARCO_PATH = "gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3"


def open_arco_subset(
    group_name: str, times: list[np.datetime64] | slice, area: Area | None = None
) -> xr.Dataset:
    """Read the same fields from Google's ARCO-ERA5 Zarr (anonymous) and standardise them.

    ARCO uses long variable names (``temperature``) and descending latitude; this maps them
    onto the same layout as the CDS route so the two can be compared value by value.
    """
    group = GROUPS[group_name]
    variables = cocip_variables()[group_name]
    area = area or Area.padded_domain()
    full = xr.open_zarr(ARCO_PATH, chunks=None, storage_options={"token": "anon"})
    names = {v.standard_name: _arco_name(v) for v in variables}
    sub = full[list(names.values())].sel(
        time=times,
        latitude=slice(area.lat[1], area.lat[0]),
        longitude=slice(area.lon[0], area.lon[1]),
    )
    if group.levels is not None:
        sub = sub.sel(level=list(group.levels))
    sub = sub.rename({arco: std for std, arco in names.items()})
    if group.levels is None:
        sub = sub.expand_dims(level=[-1])
    sub = sub.assign_coords(level=sub["level"].astype("float64"))
    sub = sub.sortby(["latitude", "longitude", "level", "time"]).transpose(
        "longitude", "latitude", "level", "time"
    )
    sub.attrs = {"provider": "ECMWF", "dataset": "ERA5", "product": "reanalysis", "route": "arco"}
    out: xr.Dataset = sub
    return out


# ARCO names = ECMWF parameter long names in snake case.
_ARCO_NAMES = {
    "t": "temperature",
    "q": "specific_humidity",
    "u": "u_component_of_wind",
    "v": "v_component_of_wind",
    "w": "vertical_velocity",
    "ciwc": "specific_cloud_ice_water_content",
    "z": "geopotential",
    "cc": "fraction_of_cloud_cover",
    "tsr": "top_net_solar_radiation",
    "ttr": "top_net_thermal_radiation",
}


def _arco_name(v: Any) -> str:
    return _ARCO_NAMES[v.short_name]
