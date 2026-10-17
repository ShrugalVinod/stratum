"""Scene packages for the labelling app (build prompt §5.1, last bullet).

What it does
------------
For every sampled scene this writes a small folder the labellers open in the labelling app:

* ``btd_m15.png``, ``btd.png``, ``btd_p15.png``: the brightness-temperature difference
  BTD = T10.8 − T12.0 (paper §4.4; contrails are thin bright lines in it) at t − 15 min, t and
  t + 15 min. Labellers flip between them, because a contrail moves and spreads slowly while
  surface features stay put.
* ``t108_m15.png``, ``t108.png``, ``t108_p15.png``: the 10.8 µm brightness temperature (cold =
  bright, the usual infrared look). Guide rule 3: a line that is also sharp in T10.8 is often a
  cloud edge or coastline, not a contrail.
* ``meta.json``: scene id, the three UTC times, corner coordinates, encoding ranges.

**No predictions, flight tracks or detector output** are ever written into a package (guide
rule 6, pre-registered ``labellers_blind_to_tracks_and_predictions``), and the scene id says
nothing about the stratum or the tuning/held-out split.

Encoding. PNGs are 8-bit. BTD is stored linearly over −4 … +8 K (0.047 K per step); the app
shows a fixed default window and lets the labeller adjust contrast. T10.8 is stored over
180 … 310 K, inverted (cold cloud tops white).

Orientation. The stored crops are in the satellite's scan order (south at the top, east on the
left). Packages are rotated 180° so north is up and west is left, as on a map. A labelled
point (row, col) in a package maps back to the stored crop with
``native = (r0 + 255 − row, c0 + 255 − col)`` (see ``package_to_native``), which is what the
agreement code and the detector check use.

Licence: EUMETSAT General Licence. Packages are derived images for the team's internal
labelling only, kept on the team Drive, never published.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.labelling.sampling import SCENE_PX

BTD_RANGE_K = (-4.0, 8.0)
T108_RANGE_K = (180.0, 310.0)
PACKAGE_VERSION = "1.0"
OFFSETS = {"m15": -15, "": 0, "p15": 15}


def encode_linear(
    x: npt.ArrayLike, lo: float, hi: float, invert: bool = False
) -> npt.NDArray[np.uint8]:
    """Map [lo, hi] → 0…255 (clipped; NaN → 0)."""
    a = (np.asarray(x, float) - lo) / (hi - lo)
    if invert:
        a = 1.0 - a
    a = np.where(np.isfinite(a), np.clip(a, 0.0, 1.0), 0.0)
    return np.round(a * 255.0).astype(np.uint8)


def decode_btd(v: npt.ArrayLike) -> npt.NDArray[np.float64]:
    lo, hi = BTD_RANGE_K
    out: npt.NDArray[np.float64] = lo + np.asarray(v, float) / 255.0 * (hi - lo)
    return out


def north_up(a: npt.NDArray[Any]) -> npt.NDArray[Any]:
    """Stored crop (south-up, east-left) → map orientation (north-up, west-left)."""
    return a[::-1, ::-1]


def package_to_native(
    row: npt.ArrayLike, col: npt.ArrayLike, r0: int, c0: int, size: int = SCENE_PX
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """A point drawn in a package (fractional px) → (row, col) in the stored crop."""
    return (
        r0 + (size - 1) - np.asarray(row, float),
        c0 + (size - 1) - np.asarray(col, float),
    )


def _png(a: npt.NDArray[np.uint8]) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(a, mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def scene_images(
    day_ds: Any, t: pd.Timestamp, r0: int, c0: int, size: int = SCENE_PX
) -> dict[str, bytes]:
    """The six PNGs of one scene from an opened Meteosat day (BT in K)."""
    out: dict[str, bytes] = {}
    for suffix, dm in OFFSETS.items():
        tt = t + pd.Timedelta(minutes=dm)
        sl = day_ds.sel(time=tt).isel(y=slice(r0, r0 + size), x=slice(c0, c0 + size))
        t108 = np.asarray(sl["IR_108"].values, float)
        t120 = np.asarray(sl["IR_120"].values, float)
        tag = f"_{suffix}" if suffix else ""
        out[f"btd{tag}.png"] = _png(north_up(encode_linear(t108 - t120, *BTD_RANGE_K)))
        out[f"t108{tag}.png"] = _png(north_up(encode_linear(t108, *T108_RANGE_K, invert=True)))
    return out


def scene_meta(
    scene: pd.Series, lat: npt.NDArray[Any], lon: npt.NDArray[Any], size: int = SCENE_PX
) -> dict[str, Any]:
    """What the labeller app needs to show, and nothing that could bias the labeller."""
    r0, c0 = int(scene["r0"]), int(scene["c0"])
    la = north_up(lat[r0 : r0 + size, c0 : c0 + size])
    lo = north_up(lon[r0 : r0 + size, c0 : c0 + size])
    t = pd.Timestamp(scene["time"])

    def corner(i: int, j: int) -> list[float]:
        return [round(float(la[i, j]), 3), round(float(lo[i, j]), 3)]

    return {
        "scene_id": scene["scene_id"],
        "package_version": PACKAGE_VERSION,
        "time_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "times_utc": {
            k or "t": (t + pd.Timedelta(minutes=dm)).strftime("%Y-%m-%dT%H:%M:%SZ")
            for k, dm in OFFSETS.items()
        },
        "size_px": size,
        "orientation": "north_up",
        "corners_latlon": {
            "top_left": corner(0, 0),
            "top_right": corner(0, size - 1),
            "bottom_left": corner(size - 1, 0),
            "bottom_right": corner(size - 1, size - 1),
        },
        "encoding": {
            "btd_k": {"min": BTD_RANGE_K[0], "max": BTD_RANGE_K[1], "invert": False},
            "t108_k": {"min": T108_RANGE_K[0], "max": T108_RANGE_K[1], "invert": True},
        },
        "source": "Meteosat-9 IODC (SEVIRI) © EUMETSAT 2026, team-internal use only",
    }


def write_zip(
    path: Path, packages: dict[str, dict[str, bytes]], guide_md: str | None = None
) -> None:
    """One zip with a folder per scene (``S123/btd.png`` …) and the labelling guide."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as z:
        for sid, files in sorted(packages.items()):
            for name, data in files.items():
                z.writestr(f"{sid}/{name}", data)
        if guide_md is not None:
            z.writestr("labelling_guide.md", guide_md)


def meta_bytes(meta: dict[str, Any]) -> bytes:
    return json.dumps(meta, indent=1).encode()
