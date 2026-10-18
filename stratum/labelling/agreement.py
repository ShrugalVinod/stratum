"""How well do two sets of contrail lines agree? (paper §4.4; build prompt §5.4; open question 3).

What it does
------------
Written for two labellers per scene (paper §4.4). Since deviation D-003 each India scene has one
reviewer, so the same measures are used to compare labels with the detector and with the DLR
experts; inter-labeller agreement is not reported (stated in the Phase 5 gate report). When
two people label a scene, we must show they agree well enough; otherwise "ground truth" would
just be one person's opinion. Two pre-registered measures (Q3, settled
17 Oct 2026, before any label existed):

1. **Object-level F1.** Every contrail is a polyline. Two polylines from different labellers
   are the *same contrail* if, over the part where they run side by side (the overlap), their
   mean perpendicular distance is ≤ 2 px, the overlap covers ≥ 50 % of the shorter line, and
   their directions differ by ≤ 20°. Pairs are matched one-to-one with the Hungarian
   algorithm (the assignment with the smallest total distance). Symmetric F1 = 2·matched /
   (objects of A + objects of B): 1 = every contrail found by both, 0 = no overlap at all.
2. **Cohen's κ on a 16 × 16-px grid.** κ needs "both said no" cases, which objects don't have,
   so each 256-px scene is cut into 16 × 16 cells; a cell is *positive* for a labeller if any
   of their lines passes through it. κ = (observed agreement − chance agreement) /
   (1 − chance agreement), pooled over all cells of all scored scenes. 0 = no better than
   chance, 1 = perfect.

Both come with **95 % confidence intervals from a scene bootstrap**: scenes are resampled
with replacement 2,000 times (pre-registered seed), because cells and lines within a scene are
not independent.

Pre-registered scoring rules (labelling guide v0.1, ``preregistered.yaml: labelling_rules``):
lines shorter than 10 px are dropped; scenes either labeller marked *obscured* are excluded;
lines marked *uncertain* are scored separately (we report "sure only" and "sure + uncertain").

Coordinates: labels are compared in the package frame (north-up), the same frame for both
labellers, so no conversion is needed here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]

MAX_MEAN_DIST_PX = 2.0
MIN_OVERLAP = 0.5
MAX_ANGLE_DEG = 20.0
CELL_PX = 16
SCENE_PX = 256
MIN_LENGTH_PX = 10.0
STEP_PX = 0.5


# ── polyline geometry ───────────────────────────────────────────────────────


def length(poly: Array) -> float:
    p = np.asarray(poly, float)
    return float(np.sum(np.hypot(*np.diff(p, axis=0).T))) if len(p) > 1 else 0.0


def densify(poly: Array, step: float = STEP_PX) -> Array:
    """Points every ``step`` px along the polyline (rows = points, cols = (row, col))."""
    p = np.asarray(poly, float)
    if len(p) < 2:
        return p
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    t = np.linspace(0.0, s[-1], max(2, int(np.ceil(s[-1] / step)) + 1))
    return np.column_stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])])


def _project(points: Array, line: Array) -> tuple[Array, Array, npt.NDArray[np.bool_]]:
    """Nearest point on ``line`` for each point: (distance, arc position, interior flag)."""
    a, b = line[:-1], line[1:]
    ab = b - a
    L2 = np.maximum(np.sum(ab * ab, axis=1), 1e-12)
    ap = points[:, None, :] - a[None, :, :]
    t = np.clip(np.sum(ap * ab[None], axis=2) / L2[None], 0.0, 1.0)
    proj = a[None] + t[..., None] * ab[None]
    d = np.hypot(*(points[:, None, :] - proj).transpose(2, 0, 1))
    k = np.argmin(d, axis=1)
    seglen = np.sqrt(L2)
    cum = np.concatenate([[0.0], np.cumsum(seglen)])
    i = np.arange(len(points))
    arc = cum[k] + t[i, k] * seglen[k]
    interior = (arc > 1e-9) & (arc < cum[-1] - 1e-9)
    return d[i, k], arc, interior


def _direction(p: Array) -> float:
    v = p[-1] - p[0]
    return float(np.degrees(np.arctan2(v[0], v[1])) % 180.0)


def _angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def pair_match(
    a: Array,
    b: Array,
    max_dist: float = MAX_MEAN_DIST_PX,
    min_overlap: float = MIN_OVERLAP,
    max_angle: float = MAX_ANGLE_DEG,
) -> float | None:
    """Mean distance over the overlap if the two polylines are the same contrail, else None."""
    la, lb = length(a), length(b)
    if la == 0 or lb == 0:
        return None
    aa, bb = np.asarray(a, float), np.asarray(b, float)
    short, long_ = (aa, bb) if la <= lb else (bb, aa)
    pts, lp = densify(short), densify(long_)
    d, arc, interior = _project(pts, lp)
    # overlap = points of the shorter line whose nearest point on the longer one is not an end
    # point and lies within 3 × the tolerance (so "side by side", not just crossing)
    near = interior & (d <= 3 * max_dist)
    if near.mean() < min_overlap:
        return None
    mean_d = float(d[near].mean())
    if mean_d > max_dist:
        return None
    # direction of the overlapping piece of each line
    cum = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(lp, axis=0).T))])
    a0, a1 = float(arc[near].min()), float(arc[near].max())
    q = np.array([[np.interp(x, cum, lp[:, 0]), np.interp(x, cum, lp[:, 1])] for x in (a0, a1)])
    ov = pts[near]
    long_enough = np.hypot(*(q[1] - q[0])) > 1.0 and len(ov) >= 2
    if long_enough and _angle_diff(_direction(ov), _direction(q)) > max_angle:
        return None
    return mean_d


def match_objects(A: list[Array], B: list[Array], **kw: float) -> list[tuple[int, int, float]]:
    """One-to-one matches (i in A, j in B, mean distance) by Hungarian assignment."""
    from scipy.optimize import linear_sum_assignment

    if not A or not B:
        return []
    big = 1e6
    cost = np.full((len(A), len(B)), big)
    for i, a in enumerate(A):
        for j, b in enumerate(B):
            m = pair_match(a, b, **kw)
            if m is not None:
                cost[i, j] = m
    r, c = linear_sum_assignment(cost)
    pairs = zip(r, c, strict=True)
    return [(int(i), int(j), float(cost[i, j])) for i, j in pairs if cost[i, j] < big]


def cell_grid(
    polys: list[Array], cell: int = CELL_PX, size: int = SCENE_PX
) -> npt.NDArray[np.bool_]:
    """size/cell × size/cell boolean grid: True where any polyline passes through the cell."""
    n = size // cell
    g = np.zeros((n, n), dtype=bool)
    for p in polys:
        pts = densify(p, step=0.25)
        r = np.clip((pts[:, 0] // cell).astype(int), 0, n - 1)
        c = np.clip((pts[:, 1] // cell).astype(int), 0, n - 1)
        g[r, c] = True
    return g


def cohen_kappa(x: npt.ArrayLike, y: npt.ArrayLike) -> float:
    """Cohen's κ for two binary ratings of the same items (NaN if chance agreement is 1)."""
    a, b = np.asarray(x, bool).ravel(), np.asarray(y, bool).ravel()
    po = float(np.mean(a == b))
    pa, pb = float(a.mean()), float(b.mean())
    pe = pa * pb + (1 - pa) * (1 - pb)
    return float("nan") if pe >= 1 else (po - pe) / (1 - pe)


# ── label files ──────────────────────────────────────────────────────────────


@dataclass
class SceneLabel:
    scene_id: str
    labeller: str
    status: str | None  # clear | partly_obscured | obscured (None = not set yet)
    sure: list[Array] = field(default_factory=list)
    uncertain: list[Array] = field(default_factory=list)
    unusable: bool = False
    complete: bool = True


def read_label(path: Path) -> SceneLabel:
    """A labeller-app export (schema in labeller/README.md) → SceneLabel (short lines dropped).

    A scene counts as labelled (``complete``) only if the labeller finished it in the app:
    status set and lines drawn or "no contrails" pressed, or marked unusable with a reason."""
    j = json.loads(Path(path).read_text())
    flags = j.get("flags") or {}
    status = j.get("scene_status")
    sure: list[Array] = []
    unc: list[Array] = []
    for o in j.get("objects", []):
        p = np.asarray(o["polyline_px"], float)
        if len(p) < 2 or length(p) < MIN_LENGTH_PX:
            continue
        (sure if o.get("confidence", "sure") == "sure" else unc).append(p)
    unusable = bool(flags.get("unusable"))
    n_obj = len(j.get("objects", []))
    complete = (unusable and bool(str(flags.get("unusable_reason", "")).strip())) or (
        status is not None and (n_obj > 0 or bool(flags.get("no_contrails")))
    )
    return SceneLabel(j["scene_id"], j["labeller"], status, sure, unc, unusable, complete)


def read_dir(d: Path) -> dict[str, SceneLabel]:
    """All scene labels in a folder; the app's export summary (``_export.json``) is skipped."""
    files = sorted(p for p in Path(d).glob("*.json") if not p.name.startswith("_"))
    return {lab.scene_id: lab for lab in (read_label(p) for p in files)}


# ── agreement report ────────────────────────────────────────────────────────


def _scene_stats(a: SceneLabel, b: SceneLabel, include_uncertain: bool) -> dict[str, Any]:
    A = a.sure + (a.uncertain if include_uncertain else [])
    B = b.sure + (b.uncertain if include_uncertain else [])
    m = match_objects(A, B)
    ga, gb = cell_grid(A), cell_grid(B)
    return {"nA": len(A), "nB": len(B), "tp": len(m), "ga": ga.ravel(), "gb": gb.ravel()}


def _pooled(stats: list[dict[str, Any]]) -> dict[str, float]:
    nA = sum(s["nA"] for s in stats)
    nB = sum(s["nB"] for s in stats)
    tp = sum(s["tp"] for s in stats)
    ga = np.concatenate([s["ga"] for s in stats]) if stats else np.zeros(0, bool)
    gb = np.concatenate([s["gb"] for s in stats]) if stats else np.zeros(0, bool)
    return {
        "object_f1": (2 * tp / (nA + nB)) if nA + nB else float("nan"),
        "precision_A_vs_B": tp / nA if nA else float("nan"),
        "recall_A_vs_B": tp / nB if nB else float("nan"),
        "kappa_cells": cohen_kappa(ga, gb) if len(ga) else float("nan"),
        "objects_A": nA,
        "objects_B": nB,
        "matched": tp,
    }


def agreement(
    labels_a: dict[str, SceneLabel],
    labels_b: dict[str, SceneLabel],
    seed: int,
    resamples: int = 2000,
    level: float = 0.95,
) -> dict[str, Any]:
    """Pooled F1 and κ with scene-bootstrap CIs, for "sure only" and "sure + uncertain"."""
    done_a = {k for k, v in labels_a.items() if v.complete}
    done_b = {k for k, v in labels_b.items() if v.complete}
    common = sorted(done_a & done_b)
    obscured = [s for s in common if "obscured" in (labels_a[s].status, labels_b[s].status)]
    unusable = [s for s in common if labels_a[s].unusable or labels_b[s].unusable]
    scored = [s for s in common if s not in obscured and s not in unusable]
    same = [labels_a[s].status == labels_b[s].status for s in common]
    status_agree = float(np.mean(same)) if same else float("nan")

    def who(d: dict[str, SceneLabel]) -> str | None:
        return next(iter(d.values())).labeller if d else None

    out: dict[str, Any] = {
        "labellers": [who(labels_a), who(labels_b)],
        "scenes_both": len(common),
        "scenes_excluded_obscured": len(obscured),
        "scenes_excluded_unusable": len([s for s in unusable if s not in obscured]),
        "scenes_incomplete_A": len(set(labels_a) - done_a),
        "scenes_incomplete_B": len(set(labels_b) - done_b),
        "scenes_scored": len(scored),
        "scene_status_agreement": status_agree,
        "only_in_A": sorted(done_a - done_b),
        "only_in_B": sorted(done_b - done_a),
    }
    rng = np.random.default_rng(seed)
    lo, hi = (1 - level) / 2, 1 - (1 - level) / 2
    for name, inc in (("sure_only", False), ("sure_and_uncertain", True)):
        per = [_scene_stats(labels_a[s], labels_b[s], inc) for s in scored]
        point = _pooled(per)
        boots: dict[str, list[float]] = {"object_f1": [], "kappa_cells": []}
        if per:
            for _ in range(resamples):
                pick = rng.integers(0, len(per), len(per))
                p = _pooled([per[i] for i in pick])
                for k in boots:
                    boots[k].append(p[k])
        ci = {}
        for k, v in boots.items():
            ok = bool(v) and not np.all(np.isnan(v))
            ci[k] = (
                [float(np.nanquantile(v, lo)), float(np.nanquantile(v, hi))] if ok else [np.nan] * 2
            )
        out[name] = {**point, "ci95": ci}
    return out


def disagreements(a: SceneLabel, b: SceneLabel) -> dict[str, list[int]]:
    """Which objects of A and B were not matched (for the disagreement gallery)."""
    A, B = a.sure + a.uncertain, b.sure + b.uncertain
    m = match_objects(A, B)
    return {
        "unmatched_A": [i for i in range(len(A)) if i not in {x[0] for x in m}],
        "unmatched_B": [j for j in range(len(B)) if j not in {x[1] for x in m}],
    }
