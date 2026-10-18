"""Did the satellite see the predicted contrail? (paper §4.5; build prompt §5.5, steps 3–6).

What it does
------------
For one flight segment and one satellite image taken 20–120 min after it was flown:

1. **Where should the contrail be?** Both end points are carried with the wind
   (``advect.py``), then moved to where the satellite *sees* them at the segment's altitude
   (parallax correction, ``geometry.point_to_pixel``). Result: a short line in image pixels.
2. **Is a detected line there?** It is a *match* if a detected object above the detector's
   operating threshold comes within **2 px** of that line and runs within **20°** of its
   direction (pre-registered ``matching.max_distance_px`` / ``max_angle_deg``). Direction is
   compared locally: the piece of the detected polyline closest to the predicted line.
3. **Could the satellite have seen it at all?** (``observable``) Only if ERA5 high cloud at and
   above the segment's level is < 0.5, the EUMETSAT cloud mask is not "opaque" there (more than
   half of a 15 × 15-px box around the predicted midpoint cloudy; open question 11) and the
   viewing angle is < 60°. Otherwise this image says nothing about the segment.
4. **One label per segment** (open question 2, pre-registered rule):
   * y = 1 if matched at **≥ 2 observable** images in the window (deviation D-004; the
     pre-registered "any 1 image" is kept as a sensitivity rule: ``min_matched_slots=1``);
   * y = 0 if observable in **at least 2** images and matched in none;
   * y = **missing** otherwise. Missing is never turned into 0 (build prompt rule 3): a
     contrail hidden by cloud is not evidence that there was no contrail.

Labels do not depend on any prediction (rule 5): every segment that meets the Schmidt–Appleman
*formation* criterion is a candidate, persistent or not.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import pandas as pd

Array = npt.NDArray[np.float64]


@dataclass(frozen=True)
class MatchRules:
    max_distance_px: float = 2.0
    max_angle_deg: float = 20.0
    min_matched_slots: int = 2  # D-004 (was 1: any observable match)
    min_observable_slots: int = 2
    max_high_cloud_fraction: float = 0.5
    max_cloudy_fraction: float = 0.5
    box_px: int = 15
    max_vza_deg: float = 60.0


# Pre-registered values (preregistered.yaml: matching, observability); tests use these too.
DEFAULT_RULES = MatchRules()


def rules_from_preregistered() -> MatchRules:
    """The MatchRules read from ``configs/preregistered.yaml`` (a test checks = DEFAULT_RULES)."""
    from stratum.config import load_preregistered

    pre = load_preregistered()
    m, o = pre.matching, pre.observability
    oc = o.opaque_cloud_mask_classes
    assert oc is not None, "open question 11 must be settled before matching"
    return MatchRules(
        max_distance_px=m.max_distance_px,
        max_angle_deg=m.max_angle_deg,
        min_observable_slots=m.segment_label_rule.min_observable_slots,
        min_matched_slots=m.segment_label_rule.min_matched_slots,
        max_high_cloud_fraction=o.max_high_cloud_fraction,
        max_cloudy_fraction=oc.max_cloudy_fraction,
        box_px=oc.box_px,
        max_vza_deg=o.max_viewing_zenith_deg,
    )


def _seg_dist(pr: Array, pc: Array, a: tuple[float, float], b: tuple[float, float]) -> Array:
    """Distance (px) from points to the finite line a–b."""
    ar, ac = a
    dr, dc = b[0] - ar, b[1] - ac
    L2 = dr * dr + dc * dc or 1e-12
    t = np.clip(((pr - ar) * dr + (pc - ac) * dc) / L2, 0.0, 1.0)
    out: Array = np.hypot(pr - (ar + t * dr), pc - (ac + t * dc))
    return out


def _axial_diff_deg(a: float, b: float) -> float:
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def matches_line(
    a: tuple[float, float],
    b: tuple[float, float],
    objects: list[tuple[Array, Array]],
    rules: MatchRules = DEFAULT_RULES,
) -> bool:
    """True if any detected polyline (rows, cols) is within the distance and angle tolerance."""
    if not all(np.isfinite([*a, *b])):
        return False
    seg_dir = float(np.degrees(np.arctan2(b[0] - a[0], b[1] - a[1])) % 180.0)
    for rows, cols in objects:
        r, c = np.asarray(rows, float), np.asarray(cols, float)
        if len(r) < 2:
            continue
        # densify to ≤ 0.5 px so "any part within 2 px" is checked along the whole object
        seg = np.hypot(np.diff(r), np.diff(c))
        s = np.concatenate([[0.0], np.cumsum(seg)])
        t = np.linspace(0, s[-1], max(2, int(s[-1] / 0.5) + 1))
        rr, cc = np.interp(t, s, r), np.interp(t, s, c)
        d = _seg_dist(rr, cc, a, b)
        k = int(np.argmin(d))
        if d[k] > rules.max_distance_px:
            continue
        lo, hi = max(0, k - 6), min(len(rr) - 1, k + 6)  # ~3 px either side
        obj_dir = float(np.degrees(np.arctan2(rr[hi] - rr[lo], cc[hi] - cc[lo])) % 180.0)
        if _axial_diff_deg(seg_dir, obj_dir) <= rules.max_angle_deg:
            return True
    return False


def box_fraction(
    mask: npt.NDArray[np.bool_], rows: npt.ArrayLike, cols: npt.ArrayLike, box: int
) -> Array:
    """Fraction of True pixels in a box × box window centred on each (row, col); NaN off-image.

    Uses a summed-area table, so millions of look-ups stay cheap."""
    m = np.asarray(mask, bool)
    S = np.zeros((m.shape[0] + 1, m.shape[1] + 1))
    S[1:, 1:] = np.cumsum(np.cumsum(m, axis=0), axis=1)
    r = np.floor(np.asarray(rows, float) + 0.5)
    c = np.floor(np.asarray(cols, float) + 0.5)
    h = box // 2
    ok = (
        np.isfinite(r)
        & np.isfinite(c)
        & (r - h >= 0)
        & (c - h >= 0)
        & (r + h < m.shape[0])
        & (c + h < m.shape[1])
    )
    r0 = np.where(ok, r - h, 0).astype(int)
    c0 = np.where(ok, c - h, 0).astype(int)
    r1, c1 = r0 + box, c0 + box
    tot = S[r1, c1] - S[r0, c1] - S[r1, c0] + S[r0, c0]
    out: Array = np.where(ok, tot / (box * box), np.nan)
    return out


def high_cloud_at_and_above(
    grid: object, t_s: npt.ArrayLike, lat: npt.ArrayLike, lon: npt.ArrayLike, p_pa: npt.ArrayLike
) -> Array:
    """Max ERA5 cloud fraction at the segment's pressure and on every native level above it
    (pre-registered ``observability.high_cloud_levels: at_and_above_segment_level``)."""
    from stratum.met.interp import MetGrid, at_level, interp_points

    assert isinstance(grid, MetGrid)
    t, la, lo, p = (np.asarray(x, float) for x in (t_s, lat, lon, p_pa))
    vals, _ = interp_points(grid, ["fraction_of_cloud_cover"], t, la, lo, p)
    best = vals["fraction_of_cloud_cover"].copy()
    for k, lev_p in enumerate(grid.levels_pa):
        above = lev_p <= p  # lower pressure = higher up
        if not above.any():
            continue
        v = at_level(grid, "fraction_of_cloud_cover", t, la, lo, np.full(t.shape, k))
        best = np.where(above, np.fmax(best, v), best)
    out: Array = best
    return out


def observable(
    high_cloud: npt.ArrayLike,
    cloudy_fraction: npt.ArrayLike,
    vza_deg: npt.ArrayLike,
    rules: MatchRules = DEFAULT_RULES,
) -> npt.NDArray[np.bool_]:
    """All three observability conditions; any NaN input → not observable."""
    hc, cf, vz = (np.asarray(x, float) for x in (high_cloud, cloudy_fraction, vza_deg))
    with np.errstate(invalid="ignore"):
        ok = (
            (hc < rules.max_high_cloud_fraction)
            & (cf <= rules.max_cloudy_fraction)
            & (vz < rules.max_vza_deg)
        )
    out: npt.NDArray[np.bool_] = ok & np.isfinite(hc) & np.isfinite(cf) & np.isfinite(vz)
    return out


def segment_labels(per_slot: pd.DataFrame, rules: MatchRules = DEFAULT_RULES) -> pd.DataFrame:
    """Per-(segment, image) rows → one label per segment (the pre-registered rule).

    ``per_slot`` needs: segment_id, observable (bool), matched (bool). Extra key columns that
    are constant per segment (flight_id, …) are carried through for the leakage-safe splitter."""
    g = per_slot.assign(obs_match=per_slot["observable"] & per_slot["matched"]).groupby(
        "segment_id", sort=False
    )
    out = pd.DataFrame(
        {
            "n_slots": g.size(),
            "n_observable": g["observable"].sum().astype(int),
            "n_matched_observable": g["obs_match"].sum().astype(int),
            "n_matched_unobservable": (g["matched"].sum() - g["obs_match"].sum()).astype(int),
        }
    )
    y = np.where(
        out["n_matched_observable"] >= rules.min_matched_slots,
        1.0,
        np.where(out["n_observable"] >= rules.min_observable_slots, 0.0, np.nan),
    )
    out["y"] = y
    keys = [c for c in ("flight_id", "image_time_first") if c in per_slot.columns]
    for k in keys:
        out[k] = g[k].first()
    return out.reset_index()


def trainable(labels: pd.DataFrame) -> pd.DataFrame:
    """Rows that may enter training or scoring: label known (0 or 1). Missing stays out."""
    return labels[labels["y"].notna()].copy()
