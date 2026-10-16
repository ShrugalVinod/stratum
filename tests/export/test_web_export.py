"""Web export: grids, track simplification, privacy (hashed ids, commercial only), contract."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from stratum.export import grids
from stratum.export.schemas import FlaggedSegment, json_schemas
from stratum.export.web_export import (
    direction,
    douglas_peucker,
    flights_and_segments,
    hash_id,
    id_salt,
)

SALT = "unit-test-salt-0123456789"


def _pl(temp_k: float, rhi_target: float) -> xr.Dataset:
    """Uniform ERA5-like day: given temperature, specific humidity giving RHi = rhi_target."""
    from stratum.physics.thermo import e_sat_ice

    levels = np.array([150.0, 200.0, 250.0, 300.0, 350.0])
    lat, lon = np.arange(6.0, 37.25, 0.25), np.arange(68.0, 98.25, 0.25)
    times = pd.date_range("2026-01-15", periods=25, freq="h").values
    p = levels[:, None, None] * 100.0
    e = rhi_target * e_sat_ice(np.full(p.shape, temp_k))
    q = 0.622 * e / (p - (1 - 0.622) * e)
    shape = (len(times), len(levels), len(lat), len(lon))
    return xr.Dataset(
        {
            "air_temperature": (("time", "level", "latitude", "longitude"), np.full(shape, temp_k)),
            "specific_humidity": (
                ("time", "level", "latitude", "longitude"),
                np.broadcast_to(q[None], shape).copy(),
            ),
        },
        coords={"time": times, "level": levels, "latitude": lat, "longitude": lon},
    )


@pytest.mark.parametrize(
    ("temp", "rhi", "expected"), [(215.0, 1.10, 1.0), (215.0, 0.80, 0.0), (250.0, 1.10, 0.0)]
)
def test_grid_fraction_physics(temp: float, rhi: float, expected: float) -> None:
    frac, lat, lon = grids.persistence_fraction(
        _pl(temp, rhi), 360, np.datetime64("2026-01-15"), ((6, 37), (68, 98))
    )
    assert frac.shape == (24, len(lat), len(lon))
    assert lat[0] > lat[-1]  # north-up
    assert np.allclose(frac, expected)


def test_level_weights_log_p() -> None:
    _i_up, _i_dn, w = grids._level_weights(np.array([200.0, 250.0, 300.0]), 25000.0)
    assert w in (0.0, 1.0)  # exactly on a level
    _, _, w = grids._level_weights(np.array([200.0, 300.0]), np.sqrt(200.0 * 300.0) * 100)
    assert abs(w - 0.5) < 1e-9  # geometric mean = half-way in ln p


def test_png_round_trip(tmp_path: Path) -> None:
    f = np.array([[0.0, 0.25, 0.5], [0.75, 1.0, np.nan]])
    grids.write_png(f, tmp_path / "g.png")
    back = grids.decode_png(tmp_path / "g.png")
    assert np.allclose(back, np.nan_to_num(f), atol=1 / 255)


def test_douglas_peucker() -> None:
    lat = np.linspace(19, 28, 50)
    lon = np.linspace(72.8, 77.1, 50)
    assert list(douglas_peucker(lat, lon)) == [0, 49]  # straight line → ends only
    lon2 = lon.copy()
    lon2[25] += 0.05  # ~5 km kink
    assert 25 in douglas_peucker(lat, lon2)


def test_direction() -> None:
    b = 213.0  # DEL → BOM is roughly south-west
    assert direction(28.5, 77.1, 19.1, 72.9, b) == "DEL-BOM"
    assert direction(19.1, 72.9, 28.5, 77.1, b) == "BOM-DEL"
    assert direction(20.0, 70.0, 20.0, 85.0, b) == "other"


def test_salt_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STRATUM_ID_SALT", raising=False)
    with pytest.raises(RuntimeError):
        id_salt()
    monkeypatch.setenv("STRATUM_ID_SALT", SALT)
    assert id_salt() == SALT


def _segments() -> tuple[pd.DataFrame, pd.DataFrame]:
    rows, coc = [], []
    t0 = pd.Timestamp("2026-01-01 06:00")
    for fid, cs, comm in [("800abc_0.1", "IGO123", True), ("800def_0.1", "VJT456", False)]:
        for i in range(10):
            sid = f"{fid}_{i:04d}"
            rows.append(
                {
                    "segment_id": sid, "flight_id": fid, "icao24": fid[:6], "callsign": cs,
                    "time_start": t0 + pd.Timedelta(minutes=i),
                    "time_end": t0 + pd.Timedelta(minutes=i + 1),
                    "time_mid": t0 + pd.Timedelta(seconds=60 * i + 30),
                    "lat_start": 28.5 - i * 0.1, "lon_start": 77.1 - i * 0.05,
                    "lat_end": 28.4 - i * 0.1, "lon_end": 77.05 - i * 0.05,
                    "alt_ft_mid": 36000.0, "in_corridor": True, "commercial": comm,
                    "typecode": "A20N",
                }
            )  # fmt: skip
            coc.append({"segment_id": sid, "ef": 1e12 if i in (3, 4) else 0.0,
                        "persistent_1": i in (3, 4), "contrail_age": 7200.0,
                        "ef_p05": 0.0, "ef_p50": 9e11, "ef_p95": 2e12})  # fmt: skip
    return pd.DataFrame(rows), pd.DataFrame(coc)


def test_flights_privacy_and_contract() -> None:
    seg, coc = _segments()
    fc, flagged, stats = flights_and_segments(
        seg, coc, SALT, {"IGO": "IndiGo"}, 213.0, date(2026, 1, 1)
    )
    text = json.dumps(fc) + json.dumps([f.model_dump() for f in flagged])
    assert "800abc" not in text and "800def" not in text  # no ICAO24 anywhere
    assert "VJT456" not in text  # business jet (not commercial) excluded
    assert stats["n_flights"] == 1 and stats["n_flagged"] == 2
    assert fc["features"][0]["properties"]["flight_id"] == hash_id("800abc_0.1", SALT)
    assert fc["features"][0]["properties"]["direction"] == "DEL-BOM"
    for f in flagged:
        FlaggedSegment.model_validate(f.model_dump())
        assert f.p_persistent is None and f.best_alternative_fl is None  # Phase 7: pending
        assert f.extra_co2_kg is None and f.net_warming_avoided_100y is None
        assert f.airline == "IndiGo" and f.fl == 360 and f.contrail_age_h == 2.0


def test_json_schemas_exist() -> None:
    s = json_schemas()
    assert set(s) == {"manifest", "day", "flight_props", "flagged_segment"}
    assert "p_persistent" in s["flagged_segment"]["properties"]
