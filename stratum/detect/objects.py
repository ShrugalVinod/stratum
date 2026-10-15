"""From filter response to line objects (build prompt §3.1 step 4).

1. Ridge thinning (non-maximum suppression across the line, as in Canny edge detection): a
   pixel is kept only if its response is at least that of both neighbours perpendicular to
   its best filter angle. A line's response is several pixels wide; its ridge is one pixel.
2. Hysteresis threshold on the ridge pixels (above ``low``, and connected to a pixel above
   ``high``), within valid data and VZA ≤ max. Ridge pixels join into objects 8-connected.
   (Joining through a 3 × 3 dilation was tried: it glued the weak parallel side-ridges of a
   strong line, 2 px away, onto the line and made it fail the linearity test.)
3. Per component, a principal-axis frame: ``t`` along the object, ``s`` across. A quadratic
   ``s(t)`` allows slightly curved contrails. The ends are trimmed to where the normalised
   image itself (smoothed along the line) is ≥ ``trim_field_min``: the filter response runs
   about half a kernel length past a line's true end, the image does not.
4. Keep the component only if all hold: length ≥ ``min_length_px``; mean width (pixels /
   length) ≤ ``max_width_px``; RMS residual of the quadratic fit ≤ ``max_line_residual_px``;
   circular spread of the per-pixel filter angles ≤ ``max_orientation_spread_deg``; and at
   most ``coast_max_fraction`` of its pixels lie within ``coast_buffer_px`` of a coastline.
   Every rejection reason is counted, so the run summary says why candidates were dropped.
5. Polyline: points along the fitted curve, about one every 8 px (at least the 2 ends).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
from scipy.ndimage import label, map_coordinates

from stratum.detect.params import DetectorParams

Array = npt.NDArray[np.float64]
TRIM_SMOOTH = 7  # samples (0.5 px apart) in the running mean of the along-line profile


@dataclass
class LineObject:
    rows: Array
    cols: Array
    poly_row: Array
    poly_col: Array
    length_px: float
    width_px: float
    residual_px: float
    spread_deg: float
    mean_response: float


@dataclass
class ObjectLog:
    candidates: int = 0
    rejected: Counter[str] = field(default_factory=Counter)


def _circular_spread_deg(theta: Array) -> float:
    """Spread of axial angles (period 180°) in degrees: doubled-angle circular std / 2."""
    r = min(float(np.abs(np.mean(np.exp(2j * theta)))), 1.0)
    return float(np.degrees(np.sqrt(-2.0 * np.log(max(r, 1e-12))) / 2.0))


def ridges(response: Array, theta: Array) -> npt.NDArray[np.bool_]:
    """Non-maximum suppression across the line direction (nearest 8-neighbour)."""
    dr = np.rint(np.cos(theta)).astype(int)  # perpendicular to (dcol, drow) = (cos θ, sin θ)
    dc = np.rint(-np.sin(theta)).astype(int)
    ny, nx = response.shape
    r, c = np.mgrid[0:ny, 0:nx]
    a = response[np.clip(r + dr, 0, ny - 1), np.clip(c + dc, 0, nx - 1)]
    b = response[np.clip(r - dr, 0, ny - 1), np.clip(c - dc, 0, nx - 1)]
    out: npt.NDArray[np.bool_] = (response >= a) & (response >= b)
    return out


def hysteresis_objects(
    response: Array, ridge: npt.NDArray[np.bool_], valid: npt.NDArray[np.bool_],
    low: float, high: float,
) -> npt.NDArray[np.int32]:  # fmt: skip
    """Label ridge pixels ≥ low that connect (8-neighbour) to a ridge pixel ≥ high."""
    keep = ridge & valid & (response >= low)
    lab, _ = label(keep, structure=np.ones((3, 3), dtype=int))
    strong = np.unique(lab[keep & (response >= high)])
    lab = np.where(keep & np.isin(lab, strong[strong > 0]), lab, 0)
    out: npt.NDArray[np.int32] = lab.astype(np.int32)
    return out


def extract_objects(
    response: Array,
    field: Array,
    theta: Array,
    valid: npt.NDArray[np.bool_],
    coast: npt.NDArray[np.bool_] | None,
    p: DetectorParams,
) -> tuple[list[LineObject], ObjectLog]:
    lo, hi = p.hysteresis
    lab = hysteresis_objects(response, ridges(response, theta), valid, lo, hi)
    log = ObjectLog()
    out: list[LineObject] = []
    field_filled = np.nan_to_num(field, nan=0.0)
    ids = np.unique(lab[lab > 0])
    if ids.size == 0:
        return out, log
    flat_lab = lab.ravel()
    idx = np.argsort(flat_lab, kind="stable")
    sorted_lab = flat_lab[idx]
    for k in ids:
        flat = idx[np.searchsorted(sorted_lab, k) : np.searchsorted(sorted_lab, k, side="right")]
        log.candidates += 1
        if flat.size < 3:
            log.rejected["too_small"] += 1
            continue
        rows, cols = np.divmod(flat, lab.shape[1])
        rows_f, cols_f = rows.astype(float), cols.astype(float)
        mr, mc = rows_f.mean(), cols_f.mean()
        cov = np.cov(np.vstack([cols_f - mc, rows_f - mr]))
        w, v = np.linalg.eigh(cov)
        ax = v[:, np.argmax(w)]  # (dcol, drow) unit vector along the object
        t = (cols_f - mc) * ax[0] + (rows_f - mr) * ax[1]
        s = -(cols_f - mc) * ax[1] + (rows_f - mr) * ax[0]
        if t.max() - t.min() + 1.0 < p.min_length_px:
            log.rejected["too_short"] += 1
            continue
        coef = np.polyfit(t, s, 2 if flat.size >= 6 else 1)
        # Trim the ends: the filter response runs ~L/2 past a line's true end, the image does not.
        tt = np.arange(t.min(), t.max() + 0.25, 0.5)
        ss = np.polyval(coef, tt)
        prof = map_coordinates(
            field_filled, [mr + tt * ax[1] + ss * ax[0], mc + tt * ax[0] - ss * ax[1]], order=1
        )
        prof = np.convolve(prof, np.ones(TRIM_SMOOTH) / TRIM_SMOOTH, mode="same")
        above = np.flatnonzero(prof >= p.trim_field_min)
        if above.size == 0:
            log.rejected["faint"] += 1
            continue
        t_lo, t_hi = tt[above[0]], tt[above[-1]]
        sel = (t >= t_lo - 0.5) & (t <= t_hi + 0.5)
        rows, cols, rows_f, cols_f, t, s = (a[sel] for a in (rows, cols, rows_f, cols_f, t, s))
        length = float(t_hi - t_lo + 1.0)
        if length < p.min_length_px or sel.sum() < 3:
            log.rejected["too_short"] += 1
            continue
        width = sel.sum() / length
        if width > p.max_width_px:
            log.rejected["too_wide"] += 1
            continue
        coef = np.polyfit(t, s, 2 if sel.sum() >= 6 else 1)
        resid = float(np.sqrt(np.mean((s - np.polyval(coef, t)) ** 2)))
        if resid > p.max_line_residual_px:
            log.rejected["not_linear"] += 1
            continue
        spread = _circular_spread_deg(theta[rows, cols])
        if spread > p.max_orientation_spread_deg:
            log.rejected["orientation_inconsistent"] += 1
            continue
        if coast is not None and coast[rows, cols].mean() > p.coast_max_fraction:
            log.rejected["coastline"] += 1
            continue
        n_pts = max(2, round(length / 8.0) + 1)
        tt = np.linspace(t_lo, t_hi, n_pts)
        ss = np.polyval(coef, tt)
        out.append(
            LineObject(
                rows=rows_f,
                cols=cols_f,
                poly_row=mr + tt * ax[1] + ss * ax[0],
                poly_col=mc + tt * ax[0] - ss * ax[1],
                length_px=length,
                width_px=float(width),
                residual_px=resid,
                spread_deg=spread,
                mean_response=float(response[rows, cols].mean()),
            )
        )
    return out, log
