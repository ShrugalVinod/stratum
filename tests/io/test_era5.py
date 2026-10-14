"""Offline tests for the ERA5 module: variable list, CDS requests, pycontrails-style layout."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from stratum.io import era5


def test_variables_come_from_cocip() -> None:
    v = era5.cocip_variables()
    assert [x.short_name for x in v["pl"]] == ["t", "q", "u", "v", "w", "ciwc", "z", "cc"]
    assert [x.short_name for x in v["sl"]] == ["tsr", "ttr"]
    assert [x.short_name for x in v["tropo_T"]] == ["t"]


def test_cds_request_shape() -> None:
    area = era5.Area(lat=(4.0, 39.0), lon=(66.0, 100.0))
    r = era5.cds_request(era5.GROUPS["pl"], "t", 2026, 2, area)
    assert r["area"] == [39.0, 66.0, 4.0, 100.0]  # N, W, S, E
    assert len(r["day"]) == 28 and len(r["time"]) == 24
    assert r["pressure_level"][0] == "100" and r["pressure_level"][-1] == "500"
    assert "pressure_level" not in era5.cds_request(era5.GROUPS["sl"], "tsr", 2026, 1, area, [15])


def _fake_cds_nc(short: str, levels: list[int] | None) -> xr.Dataset:
    """Mimic the layout the new CDS returns (valid_time, pressure_level, lat descending)."""
    t = pd.date_range("2026-01-15", periods=3, freq="h")
    lat = np.array([39.0, 38.75, 38.5])  # descending, as CDS delivers
    lon = np.array([66.0, 66.25])
    dims: tuple[str, ...]
    if levels:
        shape: tuple[int, ...] = (3, len(levels), 3, 2)
        dims = ("valid_time", "pressure_level", "latitude", "longitude")
        coords: dict[str, Any] = {
            "valid_time": t,
            "pressure_level": levels,
            "latitude": lat,
            "longitude": lon,
        }
    else:
        shape = (3, 3, 2)
        dims = ("valid_time", "latitude", "longitude")
        coords = {"valid_time": t, "latitude": lat, "longitude": lon}
    data = np.arange(np.prod(shape), dtype="float32").reshape(shape)
    ds = xr.Dataset({short: (dims, data)}, coords=coords)
    ds = ds.assign_coords(expver=("valid_time", ["0001", "0001", "0005"]), number=0)
    return ds


def test_standardise_matches_pycontrails_conventions() -> None:
    g = era5.GROUPS["pl"]
    variables = era5.cocip_variables()["pl"]
    ds, info = era5.standardise(_fake_cds_nc("t", [500, 250]), g, variables)
    assert ds["air_temperature"].dims == ("longitude", "latitude", "level", "time")
    assert "air_temperature" in ds and "t" not in ds
    assert ds["latitude"].values.tolist() == [38.5, 38.75, 39.0]  # ascending
    assert ds["level"].values.tolist() == [250.0, 500.0]
    assert ds.attrs == {"provider": "ECMWF", "dataset": "ERA5", "product": "reanalysis"}
    assert info["expver"] == ["0001", "0005"]  # ERA5 final + ERA5T recorded
    # values moved with their coordinates (no silent reordering bugs)
    raw = _fake_cds_nc("t", [500, 250])["t"].sel(latitude=38.5, longitude=66.25, pressure_level=250)
    new = ds["air_temperature"].sel(latitude=38.5, longitude=66.25, level=250.0)
    assert np.array_equal(raw.values, new.values)


def test_standardise_single_level_gets_level_minus_one() -> None:
    ds, _ = era5.standardise(
        _fake_cds_nc("tsr", None), era5.GROUPS["sl"], era5.cocip_variables()["sl"]
    )
    assert ds["level"].values.tolist() == [-1.0]
    assert "top_net_solar_radiation" in ds
    assert ds["top_net_solar_radiation"].attrs["units"] == "J m**-2"


def test_pycontrails_metdataset_accepts_output() -> None:
    """The stored layout must load straight into pycontrails' MetDataset."""
    from pycontrails import MetDataset

    ds, _ = era5.standardise(
        _fake_cds_nc("t", [500, 250]), era5.GROUPS["pl"], era5.cocip_variables()["pl"]
    )
    met = MetDataset(ds)
    assert met.provider_attr == "ECMWF" and met.dataset_attr == "ERA5"


class _FakeClient:
    """Stands in for cdsapi.Client: writes a fake CDS NetCDF for each request."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []

    def retrieve(self, dataset: str, req: dict[str, Any], target: str) -> None:
        self.requests.append((dataset, req))
        levels = [int(x) for x in req["pressure_level"]] if "pressure_level" in req else None
        _fake_cds_nc(req["variable"][0], levels).to_netcdf(target)


def test_download_month_writes_zarr_and_marks_done(tmp_path: Path) -> None:
    client = _FakeClient()
    area = era5.Area(lat=(38.5, 39.0), lon=(66.0, 66.25))
    res = era5.download_month_cds("tropo_T", 2026, 1, tmp_path, area=area, client=client)
    assert res["status"] == "downloaded" and len(client.requests) == 1
    ds = era5.open_month(tmp_path, "tropo_T", 2026, 1)
    assert "air_temperature" in ds and ds.attrs["dataset"] == "ERA5"
    again = era5.download_month_cds("tropo_T", 2026, 1, tmp_path, area=area, client=client)
    assert again["status"] == "already done" and len(client.requests) == 1  # resumable


@pytest.mark.network
def test_arco_opens() -> None:  # pragma: no cover - needs internet
    ds = era5.open_arco_subset("sl", slice("2026-01-15T00", "2026-01-15T00"))
    assert "top_net_solar_radiation" in ds
