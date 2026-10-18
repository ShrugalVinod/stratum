"""Expert dataset (D-002): orientation, expert lines in the package frame, calibration sets."""

import json
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from PIL import Image

from stratum import phase5
from stratum.labelling import agreement as ag
from stratum.labelling import dlr


def _scene(path: Path, south_up: bool) -> None:
    n = 256
    rows = np.arange(n)
    # north-up: latitude falls down the rows; south-up: it rises
    lat_row = (32 + rows * 0.03) if south_up else (40 - rows * 0.03)
    lat = np.repeat(lat_row[:, None], n, axis=1)
    lon = np.repeat((-20 + np.arange(n) * 0.04)[None, :], n, axis=0)
    t108 = np.full((n, n), 240.0)
    t120 = t108 - 1.0
    t120[100, 50:150] -= 3.0  # a contrail along stored row 100
    fields = {
        "IR108": t108,
        "IR120": t120,
        "latitude": lat,
        "longitude": lon,
        "ground_truth": np.zeros((n, n)),
        "land_sea_mask": np.zeros((n, n)),
        "sat_elevation_angle": np.full((n, n), 50.0),
    }
    ds = xr.Dataset(
        {k: (("x", "y"), v.T) for k, v in fields.items()},  # the file stores (x, y)
        attrs={"timestamp": "2024-01-12 15:00:00", "daytime": "day"},
    )
    ds.to_netcdf(path)


def test_orientation_and_expert_lines_follow_the_flip(tmp_path: Path) -> None:
    # expert geojson is in the north-up picture frame = file rows flipped: file row 100 → y 155
    gj = tmp_path / "g.geojson"
    gj.write_text(
        json.dumps(
            {
                "features": [
                    {
                        "geometry": {"type": "LineString", "coordinates": [[50, 155], [149, 155]]},
                        "properties": {"type": "endpoint"},
                    }
                ]
            }
        )
    )
    for south_up in (False, True):
        nc = tmp_path / f"s{int(south_up)}.nc"
        _scene(nc, south_up)
        arrs = dlr.scene_arrays(nc)
        files, o = dlr.calibration_package("C001", arrs)
        assert o.flip_rows is south_up and o.flip_cols is False
        img = np.asarray(Image.open(BytesIO(files["btd.png"])))
        row_img = int(np.argmax(img.mean(axis=1)))
        (line,) = dlr.expert_polylines(gj, o)
        assert line[0] == (row_img, 50)  # expert line lands on the bright line in the image
        meta = json.loads(files["meta.json"])
        assert meta["corners_latlon"]["top_left"][0] > meta["corners_latlon"]["bottom_left"][0]


def test_expert_labels_read_like_app_exports(tmp_path: Path) -> None:
    j = dlr.expert_label_json("C004", [[(10.0, 10.0), (10.0, 60.0)]])
    p = tmp_path / "C004.json"
    p.write_text(json.dumps(j))
    lab = ag.read_label(p)
    assert lab.complete and lab.labeller == "experts" and len(lab.sure) == 1


def test_calibration_draw_is_fixed_and_from_evaluation_split() -> None:
    a = dlr.calibration_scenes(20261017)
    assert a == dlr.calibration_scenes(20261017) and len(a) == 20
    assert set(a) <= set(dlr.EVALUATION) and not set(a) & set(dlr.TRAINING)
    assert len(dlr.TRAINING) == 51 and len(dlr.EVALUATION) == 89


def test_test_zip_holds_only_heldout_scenes(tmp_path: Path) -> None:
    import zipfile

    sd = tmp_path / "labels" / "scenes"
    sd.mkdir(parents=True)
    pd.DataFrame(
        {
            "scene_id": ["S001", "S002", "S003"],
            "role": ["main", "main", "pilot"],
            "split": ["tuning", "heldout", "pilot"],
        }
    ).to_csv(sd / "scenes.csv", index=False)
    with zipfile.ZipFile(sd / "main.zip", "w") as z:
        for sid in ("S001", "S002"):
            z.writestr(f"{sid}/meta.json", "{}")
            z.writestr(f"{sid}/btd.png", b"x")
    res = phase5.make_test_zip(tmp_path, "# guide")
    names = zipfile.ZipFile(sd / "test.zip").namelist()
    assert res["scenes"] == 1
    assert sorted(names) == ["S002/btd.png", "S002/meta.json", "labelling_guide.md"]


def test_detector_objects_map_back_to_the_package_frame() -> None:
    from stratum.labelling.packages import package_to_native

    # a line drawn in the package, mapped to native, must come back where it was drawn
    r, c = package_to_native([40.0, 40.0], [20.0, 120.0], r0=512, c0=256)
    objs = pd.DataFrame({"poly_row": [list(r)], "poly_col": [list(c)]})
    (poly,) = phase5.detector_objects_in_scene(objs, 512, 256)
    assert np.allclose(poly, [[40, 20], [40, 120]])
    # an object outside the scene box is dropped
    far = pd.DataFrame({"poly_row": [[10.0, 10.0]], "poly_col": [[10.0, 90.0]]})
    assert phase5.detector_objects_in_scene(far, 512, 256) == []


def test_india_detector_check_end_to_end(tmp_path: Path) -> None:
    from stratum.labelling.packages import package_to_native

    sd = tmp_path / "labels" / "scenes"
    sd.mkdir(parents=True)
    pd.DataFrame(
        {
            "scene_id": ["S002", "S003", "S004"],
            "role": ["main"] * 3,
            "split": ["heldout"] * 3,
            "day": ["2026-01-15"] * 3,
            "time": ["2026-01-15 06:00:00"] * 3,
            "r0": [0, 256, 512],
            "c0": [0, 0, 0],
        }
    ).to_csv(sd / "scenes.csv", index=False)
    line = [[50.0, 20.0], [50.0, 120.0]]
    labs = {
        "S002": ("clear", [line]),  # detected → match
        "S003": ("partly_obscured", [line]),  # nothing detected → miss
        "S004": ("obscured", [line]),  # excluded
    }
    d = tmp_path / "labels" / "raw" / "aditya-review"
    d.mkdir(parents=True)
    for sid, (st, lines) in labs.items():
        (d / f"{sid}.json").write_text(
            json.dumps(
                {
                    "scene_id": sid,
                    "labeller": "aditya-review",
                    "scene_status": st,
                    "flags": {"no_contrails": False, "unusable": False},
                    "objects": [{"polyline_px": ln, "confidence": "sure"} for ln in lines],
                }
            )
        )
    (d / "_export.json").write_text(json.dumps({"labeller": "aditya-review", "scenes": 3}))
    r, c = package_to_native([50.0, 50.0], [20.0, 120.0], 0, 0)
    det = tmp_path / "interim" / "detections" / "2026-01-15"
    det.mkdir(parents=True)
    pd.DataFrame(
        {
            "image_time": [pd.Timestamp("2026-01-15 06:00")] * 2,
            "poly_row": [list(r), [600.0, 610.0]],
            "poly_col": [list(c), [5.0, 80.0]],  # second object: inside S004's box only
            "confidence": [0.9, 0.9],
        }
    ).to_parquet(det / "objects.parquet")
    rep = phase5.india_detector_check(tmp_path, threshold=0.15, seed=1)
    s = rep["sure_only"]
    assert rep["scenes_scored"] == 2 and rep["skipped"]["obscured_or_unusable"] == 1
    assert (s["detections"], s["label_lines"], s["matched"]) == (1, 2, 1)
    assert s["precision"] == 1.0 and s["recall"] == 0.5
