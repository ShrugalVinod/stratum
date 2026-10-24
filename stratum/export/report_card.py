"""The daily forecast report card: was yesterday's contrail forecast right? (descriptive)

Every morning the `report` GitHub Action takes yesterday (UTC) and compares two independent
things:

* **the forecast** — the outlook build of that day (ECMWF open data, physics only, B1): for each
  hour, the 0.25° cells where *any* flight level FL280–FL420 has lasting-contrail air for at least
  half of the hour (``LASTING``);
* **what the satellite saw** — contrail lines found by the learned detector v3 (D-005) in the
  hourly Meteosat-9 images of that day, kept only where the sky could be checked (``observable``:
  viewing angle ≤ 60° and the cloud mask says clear, as in Phase 5).

Two scores, both simple enough to explain at the booth:

1. **Contrails explained** — the share of the seen contrail lines that lie in forecast
   lasting-contrail air (within one 0.25° cell, which also absorbs the parallax and wind drift of
   a contrail seen up to an hour after it formed), next to the **chance level**: the share of the
   checkable sky the forecast had marked at the hour of each line. A forecast that is no better
   than painting a random patch of the same size scores ×1.0.
2. **Notices confirmed** — the day's contrail advisories (boxes with a time window) in which the
   satellite saw at least one contrail; a box that was mostly cloudy or out of view in its window
   counts as "could not be checked", never as wrong.

Contrails need aircraft as well as the right air, so forecast air with no contrail is not counted
as a miss (traffic is not known here). This is a descriptive check of the experimental outlook,
not part of the pre-registered evaluation; the detector finds about 2 in 5 contrails, and about
1 in 3 of its lines is not a contrail (D-005 check scenes).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

Array = npt.NDArray[np.float64]
Mask = npt.NDArray[np.bool_]

LASTING = 0.5  # B1 fraction of the hour that counts as lasting-contrail air (as on the website)
FLS = (280, 300, 320, 340, 360, 380, 400, 420)
MAX_VZA_DEG = 60.0  # Phase 5 observability
MIN_CLEAR = 0.5  # a cell is checkable when at least half its satellite pixels are clear
MIN_BOX_CHECKABLE = 0.2  # a notice box needs this share of checkable cell-hours to be judged
MAX_MAP_LINES = 400


@dataclass(frozen=True)
class Grid:
    """The outlook's 0.25° grid (north-up rows)."""

    lat_north: float
    lon_west: float
    step: float
    rows: int
    cols: int

    @classmethod
    def from_manifest(cls, m: dict[str, Any]) -> Grid:
        g = m["grid"]
        return cls(g["lat_north"], g["lon_west"], g["step_deg"], g["rows"], g["cols"])

    def cell(
        self, lat: npt.ArrayLike, lon: npt.ArrayLike
    ) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64], Mask]:
        """Row, column and inside-the-grid flag of points."""
        la, lo = np.asarray(lat, float), np.asarray(lon, float)
        finite = np.isfinite(la) & np.isfinite(lo)  # pixels off the Earth's disk have no position
        r = np.rint((self.lat_north - np.where(finite, la, 1e9)) / self.step).astype(np.int64)
        c = np.rint((np.where(finite, lo, -1e9) - self.lon_west) / self.step).astype(np.int64)
        ok = (r >= 0) & (r < self.rows) & (c >= 0) & (c < self.cols)
        return r, c, ok


def forecast_mask(b1: dict[int, Array]) -> Mask:
    """(24, rows, cols): lasting-contrail air at any flight level in that hour."""
    out: Mask = np.zeros_like(next(iter(b1.values())), dtype=bool)
    for frames in b1.values():
        out |= np.nan_to_num(frames, nan=0.0) >= LASTING
    return out


def dilate(mask: Mask) -> Mask:
    """Each hour's mask grown by one cell (3 × 3), the matching tolerance."""
    from scipy.ndimage import binary_dilation

    st = np.zeros((3, 3, 3), dtype=bool)
    st[1] = True  # grow in space only, never across hours
    out: Mask = binary_dilation(mask, structure=st)
    return out


def observable(
    cloud_mask: npt.NDArray[np.integer[Any]],
    lat: Array,
    lon: Array,
    vza: Array,
    hours: list[int],
    grid: Grid,
) -> Mask:
    """(24, rows, cols): cells whose satellite pixels were mostly clear and in view that hour.

    ``cloud_mask``: (slots, y, x) EUMETSAT CLM (0 clear sea, 1 clear land, 2 cloud, 3 no data)
    for the slots at ``hours``; lat / lon / vza on the same native pixel grid."""
    r, c, ok = grid.cell(lat, lon)
    ok &= np.isfinite(vza) & (vza <= MAX_VZA_DEG)
    idx = (r * grid.cols + c)[ok]
    out: Mask = np.zeros((24, grid.rows, grid.cols), dtype=bool)
    total = np.bincount(idx, minlength=grid.rows * grid.cols)
    for k, h in enumerate(hours):
        clear = np.bincount(
            idx, weights=(cloud_mask[k][ok] <= 1).astype(float), minlength=grid.rows * grid.cols
        )
        with np.errstate(invalid="ignore", divide="ignore"):
            frac = np.where(total > 0, clear / total, 0.0)
        out[h] = (frac >= MIN_CLEAR).reshape(grid.rows, grid.cols)
    return out


def score_day(
    day: date,
    objs: pd.DataFrame,
    fc: Mask,
    obs: Mask,
    grid: Grid,
    advisories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Both scores for one day. ``objs``: detected lines (image_time, poly_lat, poly_lon);
    ``fc``: forecast mask (24, rows, cols); ``obs``: checkable cells (24, rows, cols)."""
    near = dilate(fc)
    # chance level per hour: the share of the checkable sky inside (tolerance-grown) forecast air
    n_obs = obs.sum(axis=(1, 2))
    with np.errstate(invalid="ignore", divide="ignore"):
        share = np.where(n_obs > 0, (near & obs).sum(axis=(1, 2)) / n_obs, np.nan)

    lines: list[dict[str, Any]] = []
    for row in objs.itertuples(index=False):
        t = pd.Timestamp(row.image_time)
        if t.date() != day:
            continue  # the day's extension past midnight belongs to the next report
        h = t.hour
        r, c, ok = grid.cell(row.poly_lat, row.poly_lon)
        if not ok.any():
            continue
        r, c = r[ok], c[ok]
        if not obs[h, r, c].any():
            continue  # seen where the sky does not count as checkable (cloud edge, steep view)
        lines.append({
            "h": h,
            "hit": bool(near[h, r, c].any()),
            "lat": np.round(np.asarray(row.poly_lat, float), 2).tolist(),
            "lon": np.round(np.asarray(row.poly_lon, float), 2).tolist(),
            "clat": float(np.mean(row.poly_lat)),
            "clon": float(np.mean(row.poly_lon)),
        })  # fmt: skip

    n = len(lines)
    hits = sum(x["hit"] for x in lines)
    chance = float(np.nanmean([share[x["h"]] for x in lines])) if n else None
    rate = hits / n if n else None
    lift = (rate / chance) if (rate is not None and chance) else None

    notices = [_notice(a, day, lines, obs, grid) for a in (advisories or [])]
    checked = [x for x in notices if x["status"] != "not checkable"]
    by_hour = [
        {
            "h": h,
            "lines": sum(1 for x in lines if x["h"] == h),
            "hits": sum(1 for x in lines if x["h"] == h and x["hit"]),
            "chance": None if np.isnan(share[h]) else round(float(share[h]), 4),
        }
        for h in range(24)
    ]
    fc_any = fc.any(axis=0)
    rr, cc = np.nonzero(fc_any)
    keep = sorted(lines, key=lambda x: -len(x["lat"]))[:MAX_MAP_LINES]
    return {
        "date": day.isoformat(),
        "contrails_seen": n,
        "contrails_in_forecast_air": hits,
        "hit_rate": None if rate is None else round(rate, 4),
        "chance": None if chance is None else round(chance, 4),
        "lift": None if lift is None else round(lift, 3),
        "notices": len(notices),
        "notices_checked": len(checked),
        "notices_confirmed": sum(1 for x in checked if x["status"] == "confirmed"),
        "notice_results": notices,
        "checkable_share": round(float(obs.any(axis=0).mean()), 4),
        "by_hour": by_hour,
        "grid": {"lat_north": grid.lat_north, "lon_west": grid.lon_west, "step": grid.step},
        "forecast_cells": [[int(a), int(b)] for a, b in zip(rr, cc, strict=True)],
        "lines": [{k: x[k] for k in ("h", "hit", "lat", "lon")} for x in keep],
    }


def _notice(
    a: dict[str, Any], day: date, lines: list[dict[str, Any]], obs: Mask, grid: Grid
) -> dict[str, Any]:
    """Was an advisory box (lat_s, lon_w, lat_n, lon_e) confirmed in its time window?"""
    s, w, n, e = a["bbox"]
    t0 = datetime.fromisoformat(a["valid_from"].replace("Z", "+00:00"))
    t1 = datetime.fromisoformat(a["valid_to"].replace("Z", "+00:00"))
    hours = [
        h
        for h in range(24)
        if t0.date() == day and t0.hour <= h < (t1.hour if t1.date() == day else 24)
    ]
    rn, cw, _ = grid.cell(n, w)
    rs, ce, _ = grid.cell(s, e)
    r0, r1 = int(np.clip(rn, 0, grid.rows - 1)), int(np.clip(rs, 0, grid.rows - 1))
    c0, c1 = int(np.clip(cw, 0, grid.cols - 1)), int(np.clip(ce, 0, grid.cols - 1))
    box = obs[hours, r0 : r1 + 1, c0 : c1 + 1] if hours else np.zeros((0, 1, 1), bool)
    checkable = float(box.mean()) if box.size else 0.0
    seen = sum(1 for x in lines if x["h"] in hours and s <= x["clat"] <= n and w <= x["clon"] <= e)
    status = (
        "confirmed" if seen else ("not checkable" if checkable < MIN_BOX_CHECKABLE else "not seen")
    )
    return {"id": a["id"], "contrails": seen, "checkable": round(checkable, 3), "status": status}


def update_index(index_path: Path, card: dict[str, Any]) -> dict[str, Any]:
    """Add (or replace) the day's summary in the running record, newest first, with totals."""
    keys = ("date", "contrails_seen", "contrails_in_forecast_air", "hit_rate", "chance", "lift",
            "notices", "notices_checked", "notices_confirmed", "checkable_share", "forecast_run",
            "detector")  # fmt: skip
    days = []
    if index_path.exists():
        days = [
            d
            for d in json.loads(index_path.read_text()).get("days", [])
            if d["date"] != card["date"]
        ]
    days.append({k: card.get(k) for k in keys})
    days.sort(key=lambda d: d["date"], reverse=True)
    seen = sum(d["contrails_seen"] or 0 for d in days)
    hits = sum(d["contrails_in_forecast_air"] or 0 for d in days)
    # pooled chance level: each day's chance weighted by its number of contrails
    chance_w = sum((d["chance"] or 0) * (d["contrails_seen"] or 0) for d in days)
    out = {
        "updated": card["date"],
        "totals": {
            "days": len(days),
            "contrails_seen": seen,
            "contrails_in_forecast_air": hits,
            "hit_rate": round(hits / seen, 4) if seen else None,
            "chance": round(chance_w / seen, 4) if seen else None,
            "lift": round((hits / seen) / (chance_w / seen), 3) if seen and chance_w else None,
            "notices_checked": sum(d["notices_checked"] or 0 for d in days),
            "notices_confirmed": sum(d["notices_confirmed"] or 0 for d in days),
        },
        "days": days,
    }
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(out, indent=1))
    return out
