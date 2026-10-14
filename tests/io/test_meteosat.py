"""Offline tests for the Meteosat module (geometry, slot matching, clear-day choice)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from stratum.io import meteosat as ms


@pytest.mark.parametrize(
    ("city", "lat", "lon", "expected"),
    [  # build prompt §3.4: ~38° Mumbai, ~40° Bangalore, ~48° Delhi, ~55° Kolkata, ~59° Guwahati
        ("Mumbai", 19.08, 72.88, 38),
        ("Bangalore", 12.97, 77.59, 40),
        ("Delhi", 28.61, 77.21, 48),
        ("Kolkata", 22.57, 88.36, 55),
        ("Guwahati", 26.14, 91.74, 59),
    ],
)
def test_viewing_zenith_angle_matches_prompt(
    city: str, lat: float, lon: float, expected: float
) -> None:
    assert float(ms.viewing_zenith_angle(lat, lon)) == pytest.approx(expected, abs=1.0)


def test_vza_zero_below_satellite_and_vectorised() -> None:
    assert float(ms.viewing_zenith_angle(0.0, ms.SAT_LON)) == pytest.approx(0.0, abs=1e-6)
    lat, lon = np.meshgrid(np.linspace(5, 35, 4), np.linspace(70, 95, 3), indexing="ij")
    v = ms.viewing_zenith_angle(lat, lon)
    assert v.shape == (4, 3) and np.all((v > 0) & (v < 90))


def test_pixel_area_of_regular_grid() -> None:
    lat, lon = np.meshgrid(np.arange(0, 1.0, 0.25), np.arange(0, 1.0, 0.25), indexing="ij")
    a = ms.pixel_area_km2(lat, lon)
    assert a[1, 1] == pytest.approx((0.25 * 111.195) ** 2, rel=0.01)  # 0.25° cell at the equator


def test_uint16_roundtrip_and_missing() -> None:
    bt = np.array([[215.123, np.nan], [0.0, 300.0]])
    q = ms._to_uint16(bt)
    assert q.dtype == np.uint16 and q[0, 1] == 0 and q[1, 0] == 0
    assert q[0, 0] * ms.BT_SCALE == pytest.approx(215.12, abs=0.006)


@dataclass
class _P:
    sensing_start: datetime


def test_match_products_by_repeat_cycle() -> None:
    l15 = [_P(datetime(2026, 1, 15, 6, 0, 9)), _P(datetime(2026, 1, 15, 6, 15, 9))]
    clm = [_P(datetime(2026, 1, 15, 6, 0, 0))]
    slots = ms.match_products(l15, clm)
    assert list(slots) == [datetime(2026, 1, 15, 6, 0), datetime(2026, 1, 15, 6, 15)]
    assert set(slots[datetime(2026, 1, 15, 6, 0)]) == {"l15", "clm"}
    assert set(slots[datetime(2026, 1, 15, 6, 15)]) == {"l15"}


def test_day_window_extends_past_midnight() -> None:
    a, b = ms.day_window(date(2026, 1, 1), 2.0)
    assert a == datetime(2026, 1, 1) and b == datetime(2026, 1, 2, 2, 0)


def test_select_clear_days_is_objective() -> None:
    t = pd.date_range("2026-01-01", periods=4 * 24, freq="h")
    cc = np.zeros((len(t), 2, 3, 3))
    daily = {0: 0.9, 1: 0.1, 2: 0.5, 3: 0.05}  # day index → high-cloud fraction
    for i, ts in enumerate(t):
        cc[i] = daily[(ts - t[0]).days]
    pl = xr.Dataset(
        {"fraction_of_cloud_cover": (("time", "level", "latitude", "longitude"), cc)},
        coords={
            "time": t,
            "level": [250.0, 300.0],
            "latitude": [10.0, 20.0, 30.0],
            "longitude": [70.0, 80.0, 90.0],
        },
    )
    days = ms.select_clear_days(pl, 2, ["2026-01-04"], (6, 37), (68, 98))
    assert days == ["2026-01-02", "2026-01-03"]  # 01-04 is clearest but excluded


def test_area_roundtrip_from_attrs() -> None:
    from stratum.io.meteosat_plots import area_from_attrs

    proj = "+proj=geos +lon_0=45.5 +h=35785831 +a=6378169 +b=6356583.8 +units=m +no_defs"
    ds = xr.Dataset(
        {"IR_108": (("time", "y", "x"), np.zeros((1, 4, 5), np.uint16))},
        attrs={"area_proj4": proj, "area_extent": [4781142.0, 3779007.0, 1672725.0, 424556.0]},
    )
    a = area_from_attrs(ds)
    assert (a.height, a.width) == (4, 5)
