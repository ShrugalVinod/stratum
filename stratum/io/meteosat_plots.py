"""Quick-look figures for Meteosat slots: T10.8 and BTD with a coastline overlay.

What it does
------------
Two checks from build prompt §1.3.3:

* **Geolocation check.** On a clear night, land and sea have different temperatures, so the
  coastline is visible in the 10.8 µm image. Drawing the Natural Earth coastline on top (in
  the satellite's native pixel grid) shows whether our pixel ↔ lat/lon mapping is right: the
  line should sit exactly on the land/sea contrast, not shifted by a few pixels.
* **BTD image.** BTD = T10.8 − T12.0, the signal the contrail detector uses (paper §4.4).

The coastline comes from ``configs/geo/coastline_ne50m_padded.geojson`` (Natural Earth
1:50m, public domain, clipped to the padded box) and is projected with the stored area
definition, so the figures need no internet.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import xarray as xr

from stratum.paths import repo_root

COASTLINE = repo_root() / "configs" / "geo" / "coastline_ne50m_padded.geojson"


def area_from_attrs(ds: xr.Dataset) -> Any:
    """Rebuild the pyresample AreaDefinition saved in a stored day's attributes."""
    from pyresample.geometry import AreaDefinition

    ny, nx = ds.sizes["y"], ds.sizes["x"]
    return AreaDefinition(
        "crop", "STRATUM crop", "geos", ds.attrs["area_proj4"], nx, ny, ds.attrs["area_extent"]
    )


def coastline_pixels(area: Any) -> list[tuple[np.ndarray, np.ndarray]]:
    """Coastline polylines converted to (column, row) pixel coordinates of ``area``."""
    from pyproj import Transformer

    tr = Transformer.from_crs("EPSG:4326", area.crs, always_xy=True)
    x0, y0, x1, y1 = area.area_extent
    nx, ny = area.width, area.height
    lines = []
    for f in json.loads(COASTLINE.read_text())["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for part in parts:
            lon, lat = np.asarray(part, dtype=float).T
            x, y = tr.transform(lon, lat)
            col = (x - x0) / (x1 - x0) * nx - 0.5
            row = (y1 - y) / (y1 - y0) * ny - 0.5
            lines.append((col, row))
    return lines


def slot_figure(ds: xr.Dataset, t: Any, out: Path, what: str = "IR_108") -> Path:
    """Save one slot as PNG: ``what`` = 'IR_108' (geolocation check) or 'BTD'."""
    s = ds.sel(time=t, method="nearest")
    if what == "BTD":
        img = (s["IR_108"] - s["IR_120"]).values
        cmap, vmin, vmax, label = "cividis", -1.0, 4.0, "BTD = T10.8 − T12.0 (K)"
    else:
        img = s[what].values
        finite = img[np.isfinite(img)]
        vmin, vmax = np.percentile(finite, [2, 98])
        cmap, label = "gray_r", f"{what} brightness temperature (K)"
    area = area_from_attrs(ds)
    # IODC native files are stored rotated 180° (south at the top, east on the left). Data stay
    # in native order; only the picture is turned so north is up and east is right.
    x0, y0, x1, y1 = area.area_extent
    flip_cols, flip_rows = x0 > x1, y0 > y1
    ny, nx = img.shape
    if flip_rows:
        img = img[::-1, :]
    if flip_cols:
        img = img[:, ::-1]
    fig, ax = plt.subplots(figsize=(9, 9))
    im = ax.imshow(img, cmap=cmap, vmin=vmin, vmax=vmax, interpolation="nearest")
    for col, row in coastline_pixels(area):
        c = (nx - 1 - col) if flip_cols else col
        r = (ny - 1 - row) if flip_rows else row
        ax.plot(c, r, color="#e8590c", lw=0.7)
    ax.set_xlim(0, img.shape[1])
    ax.set_ylim(img.shape[0], 0)
    ax.set_title(
        f"Meteosat-9 IODC {what}, {str(s.time.values)[:16]} UTC (native grid, shown north-up)",
        fontsize=10,
    )
    fig.colorbar(im, ax=ax, shrink=0.7, label=label)
    fig.text(
        0.01,
        0.01,
        "Data: EUMETSAT. Coastline: Natural Earth. STRATUM quick-look.",
        fontsize=7,
        color="#555",
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=130, bbox_inches="tight")
    plt.close(fig)
    return out
