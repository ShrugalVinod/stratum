"""Baseline B0: climatology of persistent-contrail conditions (paper §6.1; build §6.3).

What it does
------------
B0 answers "how often, in this place and at this height, are conditions right for a lasting
contrail?" without looking at the day itself. Two steps:

1. **Monthly grids** (``monthly_frequency``): for every ERA5 hour of one month, cell (0.25°)
   and native pressure level, the Schmidt–Appleman criterion (η = 0.30, the typical airliner
   used for the website grids) ∧ RHi ≥ 1 on raw ERA5. The month's grid is the fraction of
   hours that persist. Stored as ``interim/climatology/<YYYY-MM>.nc``.
2. **Prediction** (``predict``): for a segment, the mean of the monthly grids of the
   **training months only** (pre-registered: ``baselines.B0: climatology_monthly_cell_level``,
   "from training months only"), at the nearest cell and interpolated linearly in ln p between
   the two levels around the segment. The test season's own months are never used, so B0 is a
   probability from other seasons' weather: a deliberately simple reference.

Not pre-registered (decisions.md): η = 0.30 for the grids, and averaging the training months
with equal weight (there is no second year of the same calendar month).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd
import xarray as xr

from stratum.physics.sac import schmidt_appleman
from stratum.physics.thermo import rhi_from_q

Array = npt.NDArray[np.float64]
ETA_CLIM = 0.30
CHUNK_H = 48


def monthly_frequency(pl: xr.Dataset, eta: float = ETA_CLIM) -> xr.DataArray:
    """Fraction of hours with SAC ∧ RHi ≥ 1, per (level, latitude, longitude)."""
    p = pl["level"].values.astype(float) * 100.0
    n_t = pl.sizes["time"]
    acc = np.zeros((pl.sizes["level"], pl.sizes["latitude"], pl.sizes["longitude"]))
    count = np.zeros_like(acc)
    for i in range(0, n_t, CHUNK_H):
        s = pl.isel(time=slice(i, i + CHUNK_H))
        T = s["air_temperature"].transpose("time", "level", "latitude", "longitude").values
        q = s["specific_humidity"].transpose("time", "level", "latitude", "longitude").values
        pp = p[None, :, None, None]
        rhi = rhi_from_q(q, T, pp)
        res = schmidt_appleman(T, rhi, pp, eta)
        ok = np.isfinite(T) & np.isfinite(q)
        acc += np.where(ok, res.persists, 0).sum(axis=0)
        count += ok.sum(axis=0)
    freq = np.where(count > 0, acc / np.maximum(count, 1), np.nan)
    return xr.DataArray(
        freq,
        dims=("level", "latitude", "longitude"),
        coords={k: pl[k].values for k in ("level", "latitude", "longitude")},
        name="persistence_frequency",
        attrs={"eta": eta, "hours": int(n_t), "definition": "SAC and RHi >= 1, raw ERA5"},
    )


def climatology_dir(root: Path) -> Path:
    return root / "interim" / "climatology"


def build_month(root: Path, month: str, force: bool = False) -> dict[str, object]:
    out = climatology_dir(root) / f"{month}.nc"
    if out.exists() and not force:
        return {"month": month, "status": "already done"}
    src = root / "raw" / "era5" / "pl" / month / "data.zarr"
    if not src.exists():
        return {"month": month, "status": f"no ERA5 pl for {month}"}
    pl = xr.open_zarr(src)[["air_temperature", "specific_humidity"]]
    fr = monthly_frequency(pl)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.nc")
    fr.to_netcdf(tmp)
    tmp.replace(out)
    return {
        "month": month,
        "status": "done",
        "hours": fr.attrs["hours"],
        "mean_frequency": round(float(np.nanmean(fr.values)), 4),
    }


def load_mean(root: Path, months: list[str]) -> xr.DataArray:
    """Equal-weight mean of the monthly grids of ``months`` (training months of a fold)."""
    grids = []
    for m in months:
        with xr.open_dataarray(climatology_dir(root) / f"{m}.nc") as da:
            grids.append(da.load())
    if not grids:
        raise ValueError("no training months for B0")
    return xr.concat(grids, dim="month").mean("month")


def predict(clim: xr.DataArray, lat: Array, lon: Array, p_pa: Array) -> Array:
    """B0 probability at points: nearest cell, linear in ln p between levels (clipped)."""
    la = clim["latitude"].values
    lo = clim["longitude"].values
    lev = clim["level"].values.astype(float) * 100.0
    order = np.argsort(lev)
    lev_s = lev[order]
    vals = clim.values[order]  # (level sorted by pressure, lat, lon)
    ia = np.abs(la[None, :] - np.asarray(lat, float)[:, None]).argmin(axis=1)
    io = np.abs(lo[None, :] - np.asarray(lon, float)[:, None]).argmin(axis=1)
    lnp = np.log(np.clip(np.asarray(p_pa, float), lev_s[0], lev_s[-1]))
    lnl = np.log(lev_s)
    j = np.clip(np.searchsorted(lnl, lnp), 1, len(lnl) - 1)
    w = (lnp - lnl[j - 1]) / (lnl[j] - lnl[j - 1])
    a = vals[j - 1, ia, io]
    b = vals[j, ia, io]
    out: Array = (1 - w) * a + w * b
    bad = ~np.isfinite(np.asarray(lat, float)) | ~np.isfinite(np.asarray(p_pa, float))
    return np.where(bad, np.nan, out)


def months_of(days: pd.Series) -> list[str]:
    return sorted({pd.Timestamp(d).strftime("%Y-%m") for d in days})
