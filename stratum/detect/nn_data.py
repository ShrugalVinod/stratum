"""Training data for the learned contrail detector (deviation D-005).

Three input channels, computed the same way for every source so one network works on all of
them (brightness temperatures in K):

* ``btd``  = T10.8 − T12.0: contrails are thin ice and stand out as a positive difference;
* ``t108`` = T10.8: cold, high clouds;
* ``d87``  = T8.7 − T10.8: separates ice from water cloud and clear surface.

Sources:

* **OpenContrails** (GOES-16 ABI, 2 km at nadir; CC BY 4.0): bands 8.4 / 11.2 / 12.3 µm stand in
  for SEVIRI's 8.7 / 10.8 / 12.0 µm. Pre-training only. Streamed from the public bucket
  (``tfrecord.py``); only the three bands at the labelled time and the human mask are kept.
* **DLR expert scenes** (Meteosat SEVIRI, the instrument of Meteosat-9; CC BY-NC 4.0): the
  dataset's own split is kept. The **51 training scenes** fine-tune the network and choose its
  threshold; the **89 evaluation scenes** are touched once, for the final check.
* **Meteosat-9 over India** (our own slots): inference only, through ``detect_slot``.

Shards are written as ``npz`` (x: float16 [N, 3, H, W], y: uint8 [N, H, W]).
"""

from __future__ import annotations

import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from stratum.detect import tfrecord as tr

Array = npt.NDArray[np.float32]
OC_BUCKET = "https://storage.googleapis.com/goes_contrails_dataset/20250305/tfrecords"
OC_BANDS = ("cloud_top", "data_11um", "data_12um")  # ≈ SEVIRI IR087, IR108, IR120
OC_SHARDS = 100
CREDIT_OC = (
    "OpenContrails (Ng et al. 2024, IEEE TGRS 62), Google Research, CC BY 4.0; "
    "GOES-16 ABI data, NOAA (no restrictions)"
)
# affine scalings to ≈ unit range; fixed constants, not fitted
BTD_OFF, BTD_SCALE = 1.0, 3.0
T108_OFF, T108_SCALE = 260.0, 25.0
D87_OFF, D87_SCALE = -1.5, 3.0


def channels(t087: npt.ArrayLike, t108: npt.ArrayLike, t120: npt.ArrayLike) -> Array:
    """(3, H, W) float32 network input; missing pixels become 0 (the scaled mean)."""
    a87, a108, a120 = (np.asarray(x, np.float32) for x in (t087, t108, t120))
    x = np.stack(
        [
            (a108 - a120 - BTD_OFF) / BTD_SCALE,
            (a108 - T108_OFF) / T108_SCALE,
            (a87 - a108 - D87_OFF) / D87_SCALE,
        ]
    )
    return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)


def oc_url(split: str, k: int) -> str:
    return f"{OC_BUCKET}/{split}.tfrecords-{k:05d}-of-{OC_SHARDS:05d}"


def oc_samples(url: str) -> Iterator[tuple[Array, npt.NDArray[np.uint8], int]]:
    """Stream one OpenContrails shard: (x, mask, timestamp) per example."""
    with urllib.request.urlopen(url, timeout=120) as f:
        for rec in tr.records(f):
            s = tr.sample(rec, OC_BANDS)
            x = channels(s["cloud_top"], s["data_11um"], s["data_12um"])
            yield x, s["mask"], s["timestamp"]


def write_shard(path: Path, xs: list[Array], ys: list[npt.NDArray[np.uint8]], **meta: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.npz")
    arrays: dict[str, Any] = {k: np.asarray(v) for k, v in meta.items()}
    arrays["x"] = np.stack(xs).astype(np.float16)
    arrays["y"] = np.stack(ys).astype(np.uint8)
    np.savez_compressed(tmp, **arrays)
    tmp.replace(path)


def oc_shard(split: str, k: int, out_dir: Path) -> dict[str, Any]:
    """One OpenContrails shard → ``out_dir/oc_<split>_<k>.npz`` (skipped if it exists)."""
    path = out_dir / f"oc_{split}_{k:03d}.npz"
    path.with_suffix(".tmp.npz").unlink(missing_ok=True)  # left over from a stopped run
    if path.exists():
        with np.load(path) as z:
            return {"path": str(path), "n": int(z["y"].shape[0]), "skipped": True}
    xs, ys, ts = [], [], []
    for x, y, t in oc_samples(oc_url(split, k)):
        xs.append(x)
        ys.append(y)
        ts.append(t)
    write_shard(path, xs, ys, timestamp=ts)
    pos = float(np.mean([y.any() for y in ys])) if ys else 0.0
    return {"path": str(path), "n": len(xs), "with_contrail": round(pos, 3), "skipped": False}


def dlr_scene(dlr_dir: Path, k: int) -> tuple[Array, npt.NDArray[np.uint8], dict[str, Any]]:
    """One DLR scene in the file frame (rows = y, cols = x), with the experts' majority mask."""
    import xarray as xr

    with xr.open_dataset(dlr_dir / "data" / f"scene_{k:03d}.nc") as ds:

        def arr(name: str) -> npt.NDArray[np.float64]:
            v = ds[name]
            a = np.asarray(v.values, float)
            return a.T if v.dims[:2] == ("x", "y") else a

        x = channels(arr("IR087"), arr("IR108"), arr("IR120"))
        y = (np.nan_to_num(arr("ground_truth")) > 0.5).astype(np.uint8)
        meta = {k: str(ds.attrs.get(k, "")) for k in ("timestamp", "daytime")}
    return x, y, meta


def dlr_shard(dlr_dir: Path, scenes: list[int], path: Path) -> dict[str, Any]:
    xs, ys = [], []
    for k in scenes:
        x, y, _ = dlr_scene(dlr_dir, k)
        xs.append(x)
        ys.append(y)
    write_shard(path, xs, ys, scene=scenes)
    return {"path": str(path), "n": len(xs), "contrail_px_share": round(float(np.mean(ys)), 4)}
