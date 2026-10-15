"""Satellite geometry: parallax correction and lat/lon ↔ pixel (build prompt §5.5 step 3, §3.3).

Why parallax matters
--------------------
Meteosat-9 looks at India from 45.5°E at an angle. Its navigation assigns each pixel the point
on the Earth's surface (the ellipsoid) seen along that line of sight. A contrail at 11 km is
not on the surface: the satellite sees it in front of a surface point further away from the
sub-satellite point. That *apparent* position is shifted by about altitude × tan(VZA):
≈ 10 km at Mumbai (VZA ≈ 38°), ≈ 12 km at Delhi (≈ 48°), i.e. 3–4 pixels. A matching tolerance
of 2 px is meaningless without this correction.

Method: the satellite and the contrail point are placed in Earth-centred (ECEF) coordinates on
the satellite's own ellipsoid (from the stored ``area_proj4``). The ray from the satellite
through the point is extended until it meets the ellipsoid; that surface point is the apparent
position. It is then turned into native pixel coordinates with the stored area extent (rows
run south→north and columns east→west in the stored crops).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]


def _proj_params(area_proj4: str) -> dict[str, float]:
    kv = dict(t.lstrip("+").split("=", 1) for t in area_proj4.split() if "=" in t)
    a = float(kv["a"])
    b = float(kv["b"]) if "b" in kv else a * (1.0 - 1.0 / float(kv["rf"]))
    return {"a": a, "b": b, "h": float(kv["h"]), "lon_0": float(kv.get("lon_0", 0.0))}


def _ecef(lat: Array, lon: Array, alt: Array, a: float, b: float) -> tuple[Array, Array, Array]:
    e2 = 1.0 - (b / a) ** 2
    phi, lam = np.radians(lat), np.radians(lon)
    n = a / np.sqrt(1.0 - e2 * np.sin(phi) ** 2)
    x = (n + alt) * np.cos(phi) * np.cos(lam)
    y = (n + alt) * np.cos(phi) * np.sin(lam)
    z = (n * (1.0 - e2) + alt) * np.sin(phi)
    return x, y, z


def apparent_position(
    lat: npt.ArrayLike, lon: npt.ArrayLike, alt_m: npt.ArrayLike, area_proj4: str
) -> tuple[Array, Array]:
    """Where the satellite *sees* a point at (lat, lon, alt): the surface point on its sight line.

    Returns (apparent_lat, apparent_lon) in degrees. ``alt_m`` = 0 returns the input.
    """
    pp = _proj_params(area_proj4)
    a, b = pp["a"], pp["b"]
    lat_a, lon_a, alt_a = np.broadcast_arrays(
        np.asarray(lat, float), np.asarray(lon, float), np.asarray(alt_m, float)
    )
    px, py, pz = _ecef(lat_a, lon_a, alt_a, a, b)
    rs = a + pp["h"]
    sl = np.radians(pp["lon_0"])
    sx, sy, sz = rs * np.cos(sl), rs * np.sin(sl), 0.0
    dx, dy, dz = px - sx, py - sy, pz - sz
    # |S + t d| on the ellipsoid: (x² + y²)/a² + z²/b² = 1 → A t² + B t + C = 0
    qa = (dx**2 + dy**2) / a**2 + dz**2 / b**2
    qb = 2.0 * ((sx * dx + sy * dy) / a**2 + sz * dz / b**2)
    qc = (sx**2 + sy**2) / a**2 + sz**2 / b**2 - 1.0
    disc = qb**2 - 4.0 * qa * qc
    t = (-qb - np.sqrt(np.where(disc >= 0, disc, np.nan))) / (2.0 * qa)  # first hit from S
    gx, gy, gz = sx + t * dx, sy + t * dy, sz + t * dz
    e2 = 1.0 - (b / a) ** 2
    app_lon = np.degrees(np.arctan2(gy, gx))
    app_lat = np.degrees(np.arctan2(gz, (1.0 - e2) * np.hypot(gx, gy)))
    return app_lat, app_lon


@lru_cache(maxsize=8)
def _transformer(area_proj4: str) -> Any:
    from pyproj import Transformer

    return Transformer.from_crs("EPSG:4326", area_proj4, always_xy=True)


def lonlat_to_pixel(
    lon: npt.ArrayLike,
    lat: npt.ArrayLike,
    area_proj4: str,
    area_extent: tuple[float, float, float, float] | list[float],
    shape: tuple[int, int],
) -> tuple[Array, Array]:
    """Surface lon/lat → fractional (row, col) of the stored crop (pixel centres are integers)."""
    x, y = _transformer(area_proj4).transform(np.asarray(lon, float), np.asarray(lat, float))
    x0, y0, x1, y1 = (float(v) for v in area_extent)
    ny, nx = shape
    col = (np.asarray(x) - x0) / (x1 - x0) * nx - 0.5
    row = (y1 - np.asarray(y)) / (y1 - y0) * ny - 0.5
    return np.asarray(row, float), np.asarray(col, float)


def point_to_pixel(
    lat: npt.ArrayLike,
    lon: npt.ArrayLike,
    alt_m: npt.ArrayLike,
    area_proj4: str,
    area_extent: tuple[float, float, float, float] | list[float],
    shape: tuple[int, int],
    parallax: bool = True,
) -> tuple[Array, Array]:
    """A point in the air → the pixel where the satellite shows it (parallax-corrected)."""
    if parallax:
        lat, lon = apparent_position(lat, lon, alt_m, area_proj4)
    return lonlat_to_pixel(lon, lat, area_proj4, area_extent, shape)
