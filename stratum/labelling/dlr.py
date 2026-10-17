"""The DLR expert-labelled MSG/SEVIRI contrail dataset (deviation D-002).

What it is
----------
Santos Gabriel et al. (2026), *A manually labeled contrail dataset from MSG/SEVIRI*, ESSD 18,
2397–2412; data on Zenodo (doi:10.5281/zenodo.17669443, v3, **CC BY-NC 4.0**, "Contains modified
EUMETSAT Meteosat data"). 140 scenes of 256 × 256 SEVIRI pixels over Europe and the North
Atlantic (2013–2018, 2023–2024), each labelled by three experts; the ground truth is their
majority vote. The scenes come with all SEVIRI channels, so our own detector can run on exactly
the images the experts labelled: same instrument, same pixel size as Meteosat-9.

How STRATUM uses it (preregistered.yaml: detection.detector_tuning / labeller_calibration):
* **Detector tuning.** Confidence weights and the operating threshold are fitted on the
  dataset's own *training* scenes and checked on its *evaluation* scenes (lists in the dataset
  README, reproduced below).
* **Labeller calibration.** 20 evaluation scenes, drawn with seed 20261017, are packaged for the
  labelling app (BTD + T10.8, one time only: the dataset has no neighbouring slots). Each team
  labeller labels them; their agreement with the expert ground truth is reported.

Coordinates. The expert polylines (``geojson/scene_xxx.geojson``, features of type
``endpoint``) are given as [x, y] = [column, row] of the 256 × 256 scene. Packages are shown
north-up / west-left; ``to_north_up`` decides the flips from the latitude/longitude grids, and
the same flips are applied to the expert lines, so labellers and experts share one frame.
"""

from __future__ import annotations

import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from stratum.labelling.packages import BTD_RANGE_K, T108_RANGE_K, _png, encode_linear

DOI = "10.5281/zenodo.17669443"
CREDIT = (
    "Santos Gabriel et al. (2026), ESSD 18, 2397–2412, doi:10.5194/essd-18-2397-2026; "
    "data CC BY-NC 4.0 (Contains modified EUMETSAT Meteosat data)"
)
SIZE = 256

# Dataset README (v3): scenes used by the authors for training and for evaluation.
TRAINING = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 25, 26, 27, 28, 29, 34, 35, 36, 37, 38, 39,
            40, 41, 42, 43, 44, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 72, 90, 91, 92,
            93, 94, 95, 96, 97, 127]  # fmt: skip
EVALUATION = sorted(set(range(140)) - set(TRAINING))


def calibration_scenes(seed: int, n: int = 20) -> list[int]:
    """The n evaluation scenes every team labeller labels (pre-registered seed)."""
    rng = np.random.default_rng(seed)
    return sorted(int(x) for x in rng.choice(EVALUATION, size=n, replace=False))


@dataclass
class Orientation:
    flip_rows: bool
    flip_cols: bool


def orientation(lat: npt.NDArray[Any], lon: npt.NDArray[Any]) -> Orientation:
    """Flips that make row 0 the northern edge and column 0 the western edge."""
    flip_rows = bool(np.nanmean(lat[0, :]) < np.nanmean(lat[-1, :]))
    flip_cols = bool(np.nanmean(lon[:, 0]) > np.nanmean(lon[:, -1]))
    return Orientation(flip_rows, flip_cols)


def to_north_up(a: npt.NDArray[Any], o: Orientation) -> npt.NDArray[Any]:
    if o.flip_rows:
        a = a[::-1, :]
    if o.flip_cols:
        a = a[:, ::-1]
    return a


def point_to_package(
    row: float, col: float, o: Orientation, size: int = SIZE
) -> tuple[float, float]:
    return (size - 1 - row if o.flip_rows else row, size - 1 - col if o.flip_cols else col)


def scene_arrays(nc_path: Path) -> dict[str, Any]:
    """IR10.8, IR12.0, lat/lon (as [row, col] arrays), ground truth and metadata of one scene."""
    import xarray as xr

    ds = xr.open_dataset(nc_path)
    out: dict[str, Any] = {}
    for k in (
        "IR108",
        "IR120",
        "latitude",
        "longitude",
        "ground_truth",
        "land_sea_mask",
        "sat_elevation_angle",
    ):
        v = ds[k]
        dims = v.dims
        arr = np.asarray(v.values, float)
        # arrays are (x, y) in the file; we want [row = y, col = x]
        out[k] = arr.T if dims[:2] == ("x", "y") else arr
    out["timestamp"] = str(ds.attrs.get("timestamp", ""))
    out["daytime"] = str(ds.attrs.get("daytime", ""))
    ds.close()
    return out


def expert_polylines(geojson_path: Path, o: Orientation) -> list[list[tuple[float, float]]]:
    """Expert contrails as [row, col] polylines in the package (north-up) frame."""
    g = json.loads(Path(geojson_path).read_text())
    lines = []
    for f in g["features"]:
        if f["properties"].get("type") != "endpoint" or f["geometry"]["type"] != "LineString":
            continue
        pts = [point_to_package(float(y), float(x), o) for x, y in f["geometry"]["coordinates"]]
        lines.append(pts)
    return lines


def calibration_package(sid: str, arrs: dict[str, Any]) -> tuple[dict[str, bytes], Orientation]:
    """btd.png, t108.png and meta.json for one expert scene (single time)."""
    o = orientation(arrs["latitude"], arrs["longitude"])
    t108 = to_north_up(arrs["IR108"], o)
    t120 = to_north_up(arrs["IR120"], o)
    la = to_north_up(arrs["latitude"], o)
    lo = to_north_up(arrs["longitude"], o)
    files = {
        "btd.png": _png(encode_linear(t108 - t120, *BTD_RANGE_K)),
        "t108.png": _png(encode_linear(t108, *T108_RANGE_K, invert=True)),
    }

    def corner(i: int, j: int) -> list[float]:
        return [round(float(la[i, j]), 3), round(float(lo[i, j]), 3)]

    ts = arrs["timestamp"].replace(" ", "T")
    meta = {
        "scene_id": sid,
        "package_version": "1.0-expert",
        "time_utc": f"{ts}Z" if ts else "",
        "times_utc": {"t": f"{ts}Z" if ts else ""},
        "size_px": SIZE,
        "orientation": "north_up",
        "corners_latlon": {
            "top_left": corner(0, 0),
            "top_right": corner(0, SIZE - 1),
            "bottom_left": corner(SIZE - 1, 0),
            "bottom_right": corner(SIZE - 1, SIZE - 1),
        },
        "encoding": {
            "btd_k": {"min": BTD_RANGE_K[0], "max": BTD_RANGE_K[1], "invert": False},
            "t108_k": {"min": T108_RANGE_K[0], "max": T108_RANGE_K[1], "invert": True},
        },
        "source": f"Expert-labelled MSG/SEVIRI scene ({CREDIT}). Single time: no ±15 min frames.",
    }
    files["meta.json"] = json.dumps(meta, indent=1).encode()
    return files, o


def expert_label_json(sid: str, lines: list[list[tuple[float, float]]]) -> dict[str, Any]:
    """The expert ground truth in the labelling-app export format (labeller = "experts")."""
    return {
        "scene_id": sid,
        "labeller": "experts",
        "app_version": "dlr-v3",
        "package_version": "1.0-expert",
        "scene_status": "clear",
        "flags": {"no_contrails": not lines, "unusable": False, "unusable_reason": ""},
        "objects": [
            {"id": f"e{i}", "polyline_px": [list(p) for p in ln], "confidence": "sure"}
            for i, ln in enumerate(lines)
        ],
    }


def zip_bytes(files: dict[str, bytes]) -> bytes:
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as z:
        for k, v in files.items():
            z.writestr(k, v)
    return buf.getvalue()
