"""Scene packages: encoding, north-up orientation and its inverse, no bias-inducing fields."""

import io
import json
import zipfile

import numpy as np
import pandas as pd
import xarray as xr
from PIL import Image

from stratum.labelling import packages as pk


def _day(n: int = 300) -> xr.Dataset:
    t = pd.date_range("2026-01-01 06:00", periods=3, freq="15min")
    rng = np.random.default_rng(0)
    t108 = 250 + rng.normal(0, 1, (3, n, n))
    t120 = t108 - 1.0
    t120[:, 40, 30:200] -= 3.0  # a "contrail": BTD +4 K along row 40 of the stored crop
    return xr.Dataset(
        {"IR_108": (("time", "y", "x"), t108), "IR_120": (("time", "y", "x"), t120)},
        coords={"time": t},
    )


def test_encode_decode_btd_roundtrip() -> None:
    x = np.array([-4.0, 0.0, 2.5, 8.0, 20.0, np.nan])
    back = pk.decode_btd(pk.encode_linear(x, *pk.BTD_RANGE_K))
    assert np.allclose(back[:4], x[:4], atol=12 / 255) and back[4] == 8.0 and back[5] == -4.0


def test_images_north_up_and_point_maps_back_to_native() -> None:
    day = _day()
    files = pk.scene_images(day, pd.Timestamp("2026-01-01 06:15"), r0=10, c0=20)
    assert sorted(files) == sorted(
        ["btd.png", "btd_m15.png", "btd_p15.png", "t108.png", "t108_m15.png", "t108_p15.png"]
    )
    img = np.asarray(Image.open(io.BytesIO(files["btd.png"])))
    assert img.shape == (256, 256)
    # the bright line is at stored row 40 → package row 255 - (40 - 10) = 225
    rows = np.argsort(img.mean(axis=1))[-1]
    assert rows == 225
    nr, nc = pk.package_to_native(225, 100, r0=10, c0=20)
    assert nr == 40 and nc == 20 + 255 - 100


def test_meta_has_no_predictions_or_split() -> None:
    lat = np.linspace(4, 39, 300)[:, None] * np.ones((1, 300))
    lon = np.ones((300, 1)) * np.linspace(100, 66, 300)[None, :]
    scene = pd.Series(
        {
            "scene_id": "S007",
            "time": pd.Timestamp("2026-01-01 06:15"),
            "r0": 10,
            "c0": 20,
            "split": "tuning",
            "density": 9,
        }
    )
    m = pk.scene_meta(scene, lat, lon)
    text = json.dumps(m)
    for banned in ("split", "tuning", "density", "flight", "pred", "detect"):
        assert banned not in text
    # north-up: top edge is further north than the bottom edge, west is left
    assert m["corners_latlon"]["top_left"][0] > m["corners_latlon"]["bottom_left"][0]
    assert m["corners_latlon"]["top_left"][1] < m["corners_latlon"]["top_right"][1]


def test_zip_layout(tmp_path) -> None:  # type: ignore[no-untyped-def]
    p = tmp_path / "pilot.zip"
    pk.write_zip(p, {"S002": {"btd.png": b"x", "meta.json": b"{}"}}, guide_md="# guide")
    names = zipfile.ZipFile(p).namelist()
    assert names == ["S002/btd.png", "S002/meta.json", "labelling_guide.md"]
