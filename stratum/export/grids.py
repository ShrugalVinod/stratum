"""Persistent-contrail condition grids for the web map (build prompt §4.2, physics-only v0).

For one ERA5 day and one flight level the map shows, per 0.25° cell and UTC hour, the
**fraction of the hour** in which baseline B1 says a contrail would form *and* persist
(Schmidt–Appleman ∧ RHi ≥ 1, raw ERA5 humidity, no scaling):

1. The flight level is converted to pressure with the ICAO standard atmosphere (what an
   aircraft flying that level experiences).
2. T and q are interpolated **linearly in ln p** between the two ERA5 levels around it
   (pre-registered rule, paper §4.3) and **linearly in time** to 4 sub-steps per hour
   (:00, :15, :30, :45).
3. The SAC is applied with η = 0.30 (``preregistered.yaml`` aircraft.eta_default; the map is
   for "a typical airliner", not a specific type) and persistence needs RHi ≥ 1.
4. The fraction of the 4 sub-steps that persist (0, ¼, ½, ¾ or 1) is the cell value.

Grids are cropped to the study domain (6–37°N, 68–98°E), flipped north-up and written as
8-bit grey PNGs (value = round(fraction × 255)); the web app colours them with a viridis
segment (blue → teal → green, distinct from the orange of predicted contrails).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import xarray as xr

from stratum.physics.sac import schmidt_appleman
from stratum.physics.thermo import rhi_from_q
from stratum.physics.units import flight_level_to_pressure

Array = npt.NDArray[np.float64]
log = logging.getLogger(__name__)
SUBSTEPS = 4
ETA_MAP = 0.30


def _level_weights(levels_hpa: Array, p_pa: float) -> tuple[int, int, float]:
    """Indices of the ERA5 levels around ``p_pa`` and the ln-p weight of the upper one."""
    lev = np.asarray(levels_hpa, float) * 100.0
    order = np.argsort(lev)
    lev_s = lev[order]
    if not lev_s[0] <= p_pa <= lev_s[-1]:
        raise ValueError(f"{p_pa:.0f} Pa outside ERA5 levels {lev_s[0]:.0f}–{lev_s[-1]:.0f} Pa")
    j = int(np.clip(np.searchsorted(lev_s, p_pa), 1, len(lev_s) - 1))
    lo, hi = lev_s[j - 1], lev_s[j]  # lo = lower pressure (higher up)
    w = (np.log(hi) - np.log(p_pa)) / (np.log(hi) - np.log(lo))
    return int(order[j - 1]), int(order[j]), float(w)


def persistence_fraction(
    pl: xr.Dataset,
    fl: int,
    day_start: np.datetime64,
    bbox: tuple[tuple[float, float], tuple[float, float]],
    eta: float = ETA_MAP,
    scaling: str | None = None,
) -> tuple[Array, Array, Array]:
    """Fraction-of-hour grids (24, lat, lon), north-up, with the lat and lon axes.

    ``scaling`` "B3" applies the published latitude-dependent humidity correction (pycontrails,
    pressure levels) before the SAC, as the B3 baseline does; None = raw ERA5 (B1).

    ``pl`` needs air_temperature and specific_humidity on (time, level, latitude, longitude)
    in any dimension order, covering ``day_start`` … ``day_start`` + 24 h (hourly; include the
    next day's 00 UTC, otherwise the last hour's sub-steps hold 23 UTC and a warning is logged).
    """
    (la0, la1), (lo0, lo1) = bbox
    sub = pl[["air_temperature", "specific_humidity"]].sel(
        latitude=slice(la0, la1), longitude=slice(lo0, lo1)
    )
    sub = sub.transpose("time", "level", "latitude", "longitude").load()
    if sub["latitude"].values[0] < sub["latitude"].values[-1]:
        sub = sub.isel(latitude=slice(None, None, -1))  # north-up
    p = float(flight_level_to_pressure(fl))
    i_up, i_dn, w = _level_weights(sub["level"].values, p)
    times = sub["time"].values.astype("datetime64[s]").astype("int64")
    T = (
        w * sub["air_temperature"].values[:, i_up]
        + (1 - w) * sub["air_temperature"].values[:, i_dn]
    )
    q = (
        w * sub["specific_humidity"].values[:, i_up]
        + (1 - w) * sub["specific_humidity"].values[:, i_dn]
    )
    t0 = np.datetime64(day_start, "s").astype("int64")
    out = np.zeros((24, *T.shape[1:]), dtype=np.float64)
    scaler = None
    if scaling is not None:
        from stratum.physics.cocip_runner import humidity_scaling

        scaler = humidity_scaling(scaling)
        lat2d = np.broadcast_to(sub["latitude"].values[:, None], T.shape[1:]).astype(float)
    held = 0
    for h in range(24):
        for k in range(SUBSTEPS):
            ts = t0 + h * 3600 + k * 3600 // SUBSTEPS
            if ts < times[0]:
                raise ValueError("ERA5 times do not cover the requested day")
            if ts >= times[-1]:  # next hour missing (end of available data): hold the last
                Tk, qk = T[-1], q[-1]
                held += int(ts > times[-1])
            else:
                j = int(np.searchsorted(times, ts, side="right") - 1)
                a = (ts - times[j]) / (times[j + 1] - times[j])
                Tk = (1 - a) * T[j] + a * T[j + 1]
                qk = (1 - a) * q[j] + a * q[j + 1]
            if scaler is not None:
                qk, rhi_k = scaler.scale(qk, Tk, np.full_like(Tk, p), latitude=lat2d,
                                         q_method=None, level_type="pressure")  # fmt: skip
                rhi_k = np.asarray(rhi_k, float)
            else:
                rhi_k = rhi_from_q(qk, Tk, p)
            res = schmidt_appleman(Tk, rhi_k, p, eta)
            out[h] += res.persists
        out[h] /= SUBSTEPS
    if held:
        log.warning("FL%d: %d sub-steps held the last ERA5 hour (next day not loaded)", fl, held)
    return out, sub["latitude"].values.astype(float), sub["longitude"].values.astype(float)


def write_png(fraction: Array, path: Path) -> int:
    """8-bit grey PNG (0–255 = fraction 0–1). Returns the file size in bytes."""
    import imageio.v2 as imageio

    path.parent.mkdir(parents=True, exist_ok=True)
    u8 = np.rint(np.clip(np.nan_to_num(fraction, nan=0.0), 0, 1) * 255).astype(np.uint8)
    imageio.imwrite(path, u8, format="png", optimize=True)
    return path.stat().st_size


def write_sprite(frames: Array, path: Path, full_scale: float = 1.0) -> int:
    """24 hourly frames (24, rows, cols) side by side in one 8-bit grey PNG (rows, 24 × cols):
    hour h occupies columns h × cols … (h + 1) × cols − 1. Value = round(min(x / full_scale, 1)
    × 255), so ``full_scale`` 0.255 stores probabilities to 0.001."""
    import imageio.v2 as imageio

    path.parent.mkdir(parents=True, exist_ok=True)
    x = np.clip(np.nan_to_num(np.asarray(frames, float), nan=0.0) / full_scale, 0, 1)
    u8 = np.rint(np.concatenate(list(x), axis=1) * 255).astype(np.uint8)
    imageio.imwrite(path, u8, format="png", optimize=True)
    return path.stat().st_size


def decode_sprite(path: Path, hours: int = 24, full_scale: float = 1.0) -> Array:
    """Inverse of :func:`write_sprite`: (hours, rows, cols)."""
    import imageio.v2 as imageio

    a = np.asarray(imageio.imread(path), dtype=np.float64) / 255.0 * full_scale
    cols = a.shape[1] // hours
    out: Array = np.stack([a[:, h * cols : (h + 1) * cols] for h in range(hours)])
    return out


def decode_png(path: Path) -> Array:
    """Inverse of :func:`write_png` (for tests and checks)."""
    import imageio.v2 as imageio

    out: Array = np.asarray(imageio.imread(path), dtype=np.float64) / 255.0
    return out


def grid_meta(lat: Array, lon: Array) -> dict[str, Any]:
    """Georeferencing for the manifest: cell-centre extents and spacing (degrees)."""
    return {
        "lat_north": float(lat[0]),
        "lat_south": float(lat[-1]),
        "lon_west": float(lon[0]),
        "lon_east": float(lon[-1]),
        "rows": len(lat),
        "cols": len(lon),
        "step_deg": float(abs(lon[1] - lon[0])),
        "encoding": "png_uint8_fraction_of_hour",
    }
