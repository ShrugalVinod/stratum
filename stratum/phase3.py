"""Phase 3 jobs: overlay figures and a time-lapse for a flight day (build prompt §3.3).

Needs, on Drive: the Meteosat day (``raw/meteosat/l15_crop`` + ``clm``), the detector output
(``interim/detections/<day>``, from ``stratum detect``) and the CoCiP evolution table of the
central run (``interim/cocip/<scaling>/<month>/<day>/contrail.parquet``, from Phase 2).

Writes ``reports/phase3_overlays/<day>/``:

* ``slot_scores.csv``: every image time ranked by how many predicted contrail points are
  visible (VZA < 60°) and not under cloud (cloud mask);
* ``overlay_<HHMM>.png``: the top candidate times (≥ 1 h apart), high resolution;
* ``timelapse.mp4`` (or ``.gif``): every 15-min slot over a window around the best time;
* ``summary.json``.

The team picks the figures for the brief, video and website from these candidates.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr


def overlays_day(
    root: Path,
    day: date,
    scaling: str = "B1",
    top_n: int = 3,
    lapse_hours: float = 4.0,
    dpi: int = 200,
) -> dict[str, Any]:
    from stratum.config import corridor_polygon, load_domain
    from stratum.detect.overlay import overlay_figure, slot_scores, time_lapse, window_around
    from stratum.detect.params import load_detector_params
    from stratum.io.meteosat_plots import area_from_attrs, coastline_pixels

    d = f"{day:%Y-%m-%d}"
    out_dir = root / "reports" / "phase3_overlays" / d
    out_dir.mkdir(parents=True, exist_ok=True)
    con_path = root / "interim" / "cocip" / scaling / f"{day:%Y-%m}" / d / "contrail.parquet"
    det_path = root / "interim" / "detections" / d / "objects.parquet"
    l15 = root / "raw" / "meteosat" / "l15_crop" / d / "data.zarr"
    for need in (con_path, det_path, l15):
        if not need.exists():
            return {"day": d, "status": f"missing {need}"}
    contrail = pd.read_parquet(con_path)
    det = pd.read_parquet(det_path)
    ds = xr.open_zarr(l15)
    attrs = dict(ds.attrs)
    grid = xr.open_zarr(root / "raw" / "meteosat" / "static_grid.zarr").load()
    vza = grid["vza_deg"].values.astype(float)
    shape = vza.shape
    times = [pd.Timestamp(t) for t in ds["time"].values]
    clm_path = root / "raw" / "meteosat" / "clm" / d / "data.zarr"
    cloud: dict[pd.Timestamp, Any] = {}
    if clm_path.exists():
        cm = xr.open_zarr(clm_path)["cloud_mask"].load()
        cloud = {pd.Timestamp(t): cm.sel(time=t).values for t in cm["time"].values}
    scores = slot_scores(contrail, times, attrs, shape, vza, cloud)
    scores.to_csv(out_dir / "slot_scores.csv", index=False)

    picked: list[pd.Timestamp] = []
    for t in scores[scores["visible_clear_points"] > 0]["time"]:
        if all(abs(t - p) >= pd.Timedelta(hours=1) for p in picked):
            picked.append(t)
        if len(picked) == top_n:
            break
    area = area_from_attrs(ds)
    coast = coastline_pixels(area)
    corridor = list(corridor_polygon(load_domain().corridor).exterior.coords)
    thr = load_detector_params().operating_threshold
    figures = []
    for t in picked:
        near = contrail[(contrail["time"] - t).abs() <= pd.Timedelta(hours=2)]
        win = window_around(near if len(near) else contrail, attrs, shape)
        btd = _btd(ds, t)
        figures.append(
            overlay_figure(
                btd,
                t,
                contrail,
                det[det["image_time"] == t],
                attrs,
                out_dir / f"overlay_{t:%H%M}.png",
                win,
                corridor,
                coast,
                thr,
                dpi,
            )
        )
    lapse = None
    if picked:
        best = picked[0]
        half = pd.Timedelta(hours=lapse_hours / 2)
        frames_t = [t for t in times if abs(t - best) <= half]
        near = contrail[(contrail["time"] >= best - half) & (contrail["time"] <= best + half)]
        win = window_around(near if len(near) else contrail, attrs, shape)
        frames = []
        for t in frames_t:
            f = out_dir / "frames" / f"{t:%H%M}.png"
            overlay_figure(
                _btd(ds, t), t, contrail, det[det["image_time"] == t], attrs, f, win,
                corridor, coast, thr, dpi=110,
            )  # fmt: skip
            frames.append(f)
        lapse = str(time_lapse(frames, out_dir / "timelapse"))
    summary = {
        "day": d,
        "status": "done",
        "scaling": scaling,
        "contrail_points_in_table": len(contrail),
        "contrail_flights": int(contrail["flight_id"].nunique()) if len(contrail) else 0,
        "slots": len(times),
        "slots_with_visible_clear_predictions": int((scores["visible_clear_points"] > 0).sum()),
        "picked_times": [str(t) for t in picked],
        "figures": figures,
        "timelapse": lapse,
        "detections_above_threshold": int((det["confidence"] >= thr).sum()),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    return summary


def showcase_day(root: Path, day: date, per_day: int = 2, dpi: int = 200) -> dict[str, Any]:
    """Detector-only figures for a satellite day without flights (e.g. 13/14 Jan 2026).

    Picks the ``per_day`` image times (≥ 2 h apart) holding the strongest isolated long lines:
    confidence ≥ 0.8, VZA < 60°, length ≥ 30 px, flank asymmetry < 0.5 (not a cloud edge),
    ranked by length × confidence. The team checks that they look like contrails.
    """
    from stratum.detect.overlay import overlay_figure, showcase_window
    from stratum.io.meteosat_plots import area_from_attrs, coastline_pixels

    d = f"{day:%Y-%m-%d}"
    det_path = root / "interim" / "detections" / d / "objects.parquet"
    l15 = root / "raw" / "meteosat" / "l15_crop" / d / "data.zarr"
    if not det_path.exists() or not l15.exists():
        return {"day": d, "status": "missing detections or Meteosat day"}
    det = pd.read_parquet(det_path)
    strong = det[
        (det["confidence"] >= 0.8)
        & (det["vza_deg"] < 60)
        & (det["length_px"] >= 30)
        & (det["flank_asymmetry"] < 0.5)
    ]
    strong = strong.assign(score=strong["length_px"] * strong["confidence"])
    ds = xr.open_zarr(l15)
    attrs = dict(ds.attrs)
    coast = coastline_pixels(area_from_attrs(ds))
    out_dir = root / "reports" / "phase3_overlays" / "showcase"
    picked: list[pd.Timestamp] = []
    figures = []
    for t in strong.sort_values("score", ascending=False)["image_time"]:
        t = pd.Timestamp(t)
        if any(abs(t - p) < pd.Timedelta(hours=2) for p in picked):
            continue
        picked.append(t)
        at_t = det[det["image_time"] == t]
        win = showcase_window(strong[strong["image_time"] == t], (len(ds["y"]), len(ds["x"])))
        figures.append(
            overlay_figure(
                _btd(ds, t),
                t,
                pd.DataFrame(),
                at_t,
                attrs,
                out_dir / f"{t:%Y-%m-%d_%H%M}.png",
                win,
                None,
                coast,
                0.5,
                dpi,
                showcase=True,
            )
        )
        if len(picked) == per_day:
            break
    return {"day": d, "status": "done", "strong_lines": len(strong), "figures": figures}


def _btd(ds: xr.Dataset, t: pd.Timestamp) -> np.ndarray[Any, np.dtype[np.float64]]:
    s = ds.sel(time=np.datetime64(t.tz_localize(None)))[["IR_108", "IR_120"]].load()
    out: np.ndarray[Any, np.dtype[np.float64]] = (s["IR_108"] - s["IR_120"]).values.astype(float)
    return out
