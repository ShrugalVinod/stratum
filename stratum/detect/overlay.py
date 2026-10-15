"""Overlay figures: CoCiP-predicted contrails vs detected lines on Meteosat BTD (build prompt §3.3).

For an image time ``t``:

1. **Predicted contrails.** CoCiP's evolution table (central run) holds every persistent
   contrail waypoint every 30 min (``dt_integration``) with longitude, latitude and altitude.
   Each waypoint's position is interpolated linearly in time to ``t``. A contrail exists only
   between its first and last table time. Neighbouring waypoints of one flight are joined into
   polylines where CoCiP marks them ``continuous``.
2. **Parallax.** Each point is moved to where the satellite sees it at its altitude
   (``stratum.match.geometry``), then converted to native pixels.
3. **Detected lines.** Detector objects at ``t`` with confidence ≥ the operating threshold.
4. **Figure.** Two panels, north-up: the plain BTD image (so viewers can see the contrails
   themselves) and the same image with predictions and detections drawn on it, coastline, the
   Delhi–Mumbai corridor outline, a timestamp (UTC and IST), a legend and the caption
   "Computational prediction vs satellite observation — illustration, not a result". By
   default the display shows BTD minus its 21-px median background, lightly smoothed
   (σ 0.7 px; −0.4 to 0.8 K), the enhancement the detector uses, so thin contrails are
   visible. EUMETSAT is credited.

These figures are illustrations for the brief, video and website. No scoring happens here.
"""

from __future__ import annotations

import shutil
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.ndimage import gaussian_filter

from stratum.detect.btd import background
from stratum.match.geometry import lonlat_to_pixel, point_to_pixel

Array = npt.NDArray[np.float64]
PRED_COLOUR = "#ff8c1a"  # orange: CoCiP prediction
DET_COLOUR = "#29d3ff"  # light blue: satellite detection (orange/blue is colour-blind safe)
CAPTION = "Computational prediction vs satellite observation — illustration, not a result"
CREDIT = "Meteosat-9 BTD: © EUMETSAT 2026 · Predictions: STRATUM (CoCiP/pycontrails, ERA5)"


def contrails_at(contrail: pd.DataFrame, t: pd.Timestamp) -> pd.DataFrame:
    """Positions of all CoCiP contrail waypoints alive at ``t`` (linear in time)."""
    cols = ["flight_id", "waypoint", "longitude", "latitude", "altitude", "continuous"]
    if contrail.empty:
        return pd.DataFrame(columns=cols)
    c = contrail.sort_values(["flight_id", "waypoint", "time"])
    tt = np.datetime64(pd.Timestamp(t).tz_localize(None), "ns").astype("int64")
    out = []
    for (fid, wp), g in c.groupby(["flight_id", "waypoint"], sort=False):
        ts = g["time"].to_numpy("datetime64[ns]").astype("int64")
        if tt < ts[0] or tt > ts[-1]:
            continue
        nearest = int(np.argmin(np.abs(ts - tt)))
        out.append(
            {
                "flight_id": fid,
                "waypoint": int(wp),
                "longitude": float(np.interp(tt, ts, g["longitude"].to_numpy(float))),
                "latitude": float(np.interp(tt, ts, g["latitude"].to_numpy(float))),
                "altitude": float(np.interp(tt, ts, g["altitude"].to_numpy(float))),
                "continuous": bool(g["continuous"].to_numpy()[nearest]),
            }
        )
    return pd.DataFrame(out, columns=cols)


def contrail_polylines(alive: pd.DataFrame) -> list[pd.DataFrame]:
    """Join consecutive, continuous waypoints of one flight into polylines (≥ 2 points)."""
    lines: list[pd.DataFrame] = []
    for _, g in alive.sort_values(["flight_id", "waypoint"]).groupby("flight_id", sort=False):
        wp = g["waypoint"].to_numpy()
        cont = g["continuous"].to_numpy()
        breaks = np.flatnonzero((np.diff(wp) != 1) | ~cont[:-1]) + 1
        for part in np.split(np.arange(len(g)), breaks):
            if len(part) >= 2:
                lines.append(g.iloc[part])
    return lines


def _display(row: Array, col: Array, shape: tuple[int, int]) -> tuple[Array, Array]:
    """Stored crops are south-up/east-left; figures are north-up/west-left."""
    return shape[0] - 1 - np.asarray(row), shape[1] - 1 - np.asarray(col)


def overlay_figure(
    btd: Array,
    t: pd.Timestamp,
    contrail: pd.DataFrame,
    detections: pd.DataFrame,
    area_attrs: dict[str, Any],
    out: Path,
    window: tuple[int, int, int, int] | None = None,
    corridor_lonlat: Sequence[tuple[float, float]] | None = None,
    coast_pixels: Sequence[tuple[Array, Array]] | None = None,
    threshold: float = 0.5,
    dpi: int = 200,
    enhance: bool = True,
) -> dict[str, Any]:
    """One overlay frame. ``window`` = (row0, row1, col0, col1) in *display* (north-up) pixels."""
    proj4, extent = area_attrs["area_proj4"], area_attrs["area_extent"]
    shape = btd.shape
    if enhance:  # local background removed (display only): thin contrails stand out
        btd = gaussian_filter(np.nan_to_num(btd - background(btd, 21)), 0.7)  # light denoise
        vmin, vmax = -0.4, 0.8
    img = np.flip(btd)
    r0, r1, c0, c1 = window or (0, shape[0], 0, shape[1])
    if not enhance:
        vmin, vmax = (float(v) for v in np.nanpercentile(img[r0:r1, c0:c1], [2, 99.7]))
    aspect = (r1 - r0) / max(c1 - c0, 1)
    fig, axes = plt.subplots(1, 2, figsize=(13, 6.5 * aspect + 1.1))
    for ax in axes:
        ax.imshow(img, cmap="gray", vmin=vmin, vmax=vmax, interpolation="nearest")
        ax.set_xlim(c0 - 0.5, c1 - 0.5)
        ax.set_ylim(r1 - 0.5, r0 - 0.5)
        ax.set_xticks([])
        ax.set_yticks([])
        if coast_pixels:
            for col, row in coast_pixels:
                dr, dc = _display(row, col, shape)
                ax.plot(dc, dr, color="#9aa0a6", lw=0.6, alpha=0.8)
    left, ax = axes
    what = "BTD 10.8 − 12.0 µm" + (", local background removed" if enhance else "")
    left.set_title(f"What the satellite sees ({what})", fontsize=10, loc="left")
    if corridor_lonlat:
        lon, lat = np.asarray(corridor_lonlat, float).T
        rr, cc = _display(*lonlat_to_pixel(lon, lat, proj4, extent, shape), shape)
        ax.plot(cc, rr, color="#c9a3ff", lw=1.0, ls="--")
    alive = contrails_at(contrail, t)
    n_pred = 0
    for line in contrail_polylines(alive):
        rr, cc = point_to_pixel(
            line["latitude"], line["longitude"], line["altitude"], proj4, extent, shape
        )
        dr, dc = _display(rr, cc, shape)
        ax.plot(dc, dr, color=PRED_COLOUR, lw=2.2, alpha=0.9, solid_capstyle="round")
        n_pred += 1
    det = detections[detections["confidence"] >= threshold] if len(detections) else detections
    for d in det.itertuples():
        dr, dc = _display(np.asarray(d.poly_row), np.asarray(d.poly_col), shape)
        ax.plot(dc, dr, color=DET_COLOUR, lw=1.1, alpha=0.95)
    ist = pd.Timestamp(t) + pd.Timedelta(hours=5, minutes=30)
    ax.set_title(
        f"{pd.Timestamp(t):%Y-%m-%d %H:%M} UTC ({ist:%H:%M} IST): prediction and detection",
        fontsize=10,
        loc="left",
    )
    ax.plot([], [], color=PRED_COLOUR, lw=2.2, label="Predicted persistent contrail (CoCiP, B1)")
    ax.plot([], [], color=DET_COLOUR, lw=1.1, label="Line detected in the satellite image")
    if corridor_lonlat:
        ax.plot([], [], color="#c9a3ff", lw=1.0, ls="--", label="Delhi–Mumbai corridor")
    ax.legend(loc="lower left", fontsize=7, framealpha=0.75)
    fig.text(0.01, 0.01, f"{CAPTION}\n{CREDIT}", fontsize=7, color="#444444", va="bottom")
    fig.tight_layout(rect=(0, 0.05, 1, 1))
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=dpi)
    plt.close(fig)
    return {"time": str(t), "predicted_lines": n_pred, "detected_lines": len(det), "png": str(out)}


def window_around(
    contrail: pd.DataFrame,
    area_attrs: dict[str, Any],
    shape: tuple[int, int],
    margin_px: int = 40,
    min_size_px: int = 256,
) -> tuple[int, int, int, int]:
    """Display-pixel window (row0, row1, col0, col1) holding every predicted contrail point."""
    rr, cc = point_to_pixel(
        contrail["latitude"], contrail["longitude"], contrail["altitude"],
        area_attrs["area_proj4"], area_attrs["area_extent"], shape,
    )  # fmt: skip
    dr, dc = _display(rr, cc, shape)
    ok = np.isfinite(dr) & np.isfinite(dc)
    r0, r1 = np.nanmin(dr[ok]) - margin_px, np.nanmax(dr[ok]) + margin_px
    c0, c1 = np.nanmin(dc[ok]) - margin_px, np.nanmax(dc[ok]) + margin_px
    if r1 - r0 < min_size_px:
        mid = (r0 + r1) / 2
        r0, r1 = mid - min_size_px / 2, mid + min_size_px / 2
    if c1 - c0 < min_size_px:
        mid = (c0 + c1) / 2
        c0, c1 = mid - min_size_px / 2, mid + min_size_px / 2
    return (
        max(0, int(r0)),
        min(shape[0], int(r1)),
        max(0, int(c0)),
        min(shape[1], int(c1)),
    )


def slot_scores(
    contrail: pd.DataFrame,
    times: Sequence[pd.Timestamp],
    area_attrs: dict[str, Any],
    shape: tuple[int, int],
    vza: Array,
    cloud_mask: Any = None,
) -> pd.DataFrame:
    """Rank image times for overlays: predicted contrail points visible and in clear sky.

    A point counts if VZA < 60° at its parallax-corrected pixel and (when a cloud mask is
    given for that time) the 5 × 5 px box around it is not mostly "cloudy" (category 2).
    """
    rows = []
    for t in times:
        alive = contrails_at(contrail, t)
        n, clear = len(alive), 0
        if n:
            rr, cc = point_to_pixel(
                alive["latitude"], alive["longitude"], alive["altitude"],
                area_attrs["area_proj4"], area_attrs["area_extent"], shape,
            )  # fmt: skip
            ri = np.clip(np.rint(rr).astype(int), 2, shape[0] - 3)
            ci = np.clip(np.rint(cc).astype(int), 2, shape[1] - 3)
            ok = vza[ri, ci] < 60.0
            if cloud_mask is not None and t in cloud_mask:
                cm = cloud_mask[t]
                cloudy = np.array(
                    [
                        (cm[r - 2 : r + 3, c - 2 : c + 3] == 2).mean()
                        for r, c in zip(ri, ci, strict=True)
                    ]
                )
                ok &= cloudy < 0.5
            clear = int(ok.sum())
        rows.append({"time": t, "alive_points": n, "visible_clear_points": clear})
    return pd.DataFrame(rows).sort_values("visible_clear_points", ascending=False)


def time_lapse(frames: Sequence[Path], out_stem: Path, fps: float = 2.0) -> Path:
    """Animated GIF always; MP4 (H.264) too when the ffmpeg program exists (Colab has it).

    Returns the MP4 path if it was made, otherwise the GIF path.
    """
    import subprocess
    import tempfile

    import imageio.v2 as imageio

    raw: list[Any] = [imageio.imread(f) for f in frames]
    h = min(i.shape[0] for i in raw)
    w = min(i.shape[1] for i in raw)
    images: list[Any] = [i[:h, :w] for i in raw]
    gif = out_stem.with_suffix(".gif")
    imageio.mimsave(gif, images, duration=1.0 / fps, loop=0)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return gif
    mp4 = out_stem.with_suffix(".mp4")
    with tempfile.TemporaryDirectory() as tmp:
        for k, im in enumerate(images):
            imageio.imwrite(Path(tmp) / f"{k:04d}.png", im[: h - h % 2, : w - w % 2, :3])
        cmd = [
            ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps),
            "-i", str(Path(tmp) / "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", str(mp4),
        ]  # fmt: skip
        ok = subprocess.run(cmd, check=False).returncode == 0
    if ok and mp4.exists() and mp4.stat().st_size > 1000:
        return mp4
    mp4.unlink(missing_ok=True)
    return gif
