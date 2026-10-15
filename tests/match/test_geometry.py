"""Parallax correction and pixel mapping against independent pyproj / pyresample geometry."""

from __future__ import annotations

import numpy as np
from pyproj import Geod, Transformer

from stratum.match.geometry import apparent_position, lonlat_to_pixel, point_to_pixel

PROJ4 = (
    "+proj=geos +lon_0=45.5 +h=35785831 +x_0=0 +y_0=0 +a=6378169 +rf=295.488065897014 "
    "+units=m +no_defs +type=crs"
)
EXTENT = [4781142.5, 3779007.0, 1672725.0, 424556.5]  # stored crop (south-up, east-left)
SHAPE = (1118, 1036)
CITIES = {"Mumbai": (19.09, 72.87), "Delhi": (28.57, 77.10), "Kolkata": (22.65, 88.45)}


def _geos_xy_of_3d_point(lat: float, lon: float, alt: float) -> tuple[float, float]:
    """Proj 'geos' (sweep y) scan-angle coordinates of a point in the air, from first principles."""
    a, rf, h, lon0 = 6378169.0, 295.488065897014, 35785831.0, 45.5
    b = a * (1 - 1 / rf)
    e2 = 1 - (b / a) ** 2
    phi, lam = np.radians(lat), np.radians(lon - lon0)
    n = a / np.sqrt(1 - e2 * np.sin(phi) ** 2)
    vx = (n + alt) * np.cos(phi) * np.cos(lam)
    vy = (n + alt) * np.cos(phi) * np.sin(lam)
    vz = (n * (1 - e2) + alt) * np.sin(phi)
    tmp = (a + h) - vx
    return h * np.arctan(vy / tmp), h * np.arctan(vz / np.hypot(vy, tmp))


def test_zero_altitude_is_unchanged() -> None:
    for lat, lon in CITIES.values():
        la, lo = apparent_position(lat, lon, 0.0, PROJ4)
        assert abs(la - lat) < 1e-7 and abs(lo - lon) < 1e-7


def test_parallax_matches_independent_scan_angle_geometry() -> None:
    inv = Transformer.from_crs(PROJ4, "EPSG:4326", always_xy=True)
    for lat, lon in CITIES.values():
        x, y = _geos_xy_of_3d_point(lat, lon, 11000.0)
        lon_ref, lat_ref = inv.transform(x, y)
        la, lo = apparent_position(lat, lon, 11000.0, PROJ4)
        assert abs(la - lat_ref) < 1e-5 and abs(lo - lon_ref) < 1e-5


def test_shift_size_and_direction() -> None:
    geod = Geod(ellps="WGS84")
    expected = {"Mumbai": (8, 12), "Delhi": (10, 15), "Kolkata": (13, 19)}  # ≈ 11 km × tan(VZA)
    for name, (lat, lon) in CITIES.items():
        la, lo = apparent_position(lat, lon, 11000.0, PROJ4)
        az, _, dist = geod.inv(lon, lat, float(lo), float(la))
        az_sat, _, _ = geod.inv(lon, lat, 45.5, 0.0)
        lo_km, hi_km = expected[name]
        assert lo_km < dist / 1000 < hi_km, (name, dist)
        assert abs(((az - az_sat + 180) % 360) - 180) > 150  # shifted away from the satellite


def test_pixel_mapping_matches_pyresample() -> None:
    from pyresample.geometry import AreaDefinition

    area = AreaDefinition("crop", "crop", "geos", PROJ4, SHAPE[1], SHAPE[0], EXTENT)
    rows = np.array([10, 300, 600, 900, 1100])
    cols = np.array([500, 200, 800, 450, 700])
    lon, lat = np.array(
        [area.get_lonlat(int(r), int(c)) for r, c in zip(rows, cols, strict=True)]
    ).T
    r, c = lonlat_to_pixel(lon, lat, PROJ4, EXTENT, SHAPE)
    assert np.allclose(r, rows, atol=0.01) and np.allclose(c, cols, atol=0.01)


def test_parallax_moves_a_few_pixels() -> None:
    lat, lon = CITIES["Delhi"]
    r0, c0 = point_to_pixel(lat, lon, 11000.0, PROJ4, EXTENT, SHAPE, parallax=False)
    r1, c1 = point_to_pixel(lat, lon, 11000.0, PROJ4, EXTENT, SHAPE)
    assert 2.0 < float(np.hypot(r1 - r0, c1 - c0)) < 5.0
