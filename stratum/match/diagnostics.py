"""How much of the satellite signal is chance? Label-rule variants on real vs wrong-day runs.

Uses the stored per-image rows (``interim/matches`` and ``interim/matches_null``), so nothing is
re-detected. For each rule, y = 1 rate = y1 / (y1 + y0) on the real flights and on the
wrong-day null (flights matched against another day's images, where every match is chance):

* ``any_1``: the pre-registered rule (matched at ≥ 1 observable image);
* ``any_2``: matched at ≥ 2 observable images (a real contrail persists and drifts with the
  wind; a chance line rarely lines up twice). y = 0 rule unchanged (≥ 2 observable, no match).

``chance_share`` = null rate / real rate: the share of y = 1 labels expected by coincidence.
Exploratory (build prompt §5.5 step 8, sensitivity hooks); changing the primary rule would be a
deviation with team OK.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.manifest import is_done

COLS = ["segment_id", "observable", "matched"]


def _rates(per: pd.DataFrame, min_matched: int, min_obs: int = 2) -> dict[str, float]:
    g = per.assign(om=per["observable"] & per["matched"]).groupby("segment_id")
    n_obs, n_om = g["observable"].sum(), g["om"].sum()
    y1 = int((n_om >= min_matched).sum())
    y0 = int(((n_om == 0) & (n_obs >= min_obs)).sum())
    return {"y1": y1, "y0": y0, "rate": y1 / (y1 + y0) if y1 + y0 else float("nan")}


def _load(dirs: list[Path]) -> pd.DataFrame:
    parts = [pd.read_parquet(d / "per_slot.parquet", columns=COLS) for d in dirs]
    parts = [p.assign(segment_id=p["segment_id"] + f"@{i}") for i, p in enumerate(parts)]
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=COLS)


def label_variants(root: Path) -> dict[str, Any]:
    real_dirs = [d for d in sorted((root / "interim" / "matches").glob("*/*")) if is_done(d)]
    null_dirs = [
        d for d in sorted((root / "interim" / "matches_null").glob("*_on_*")) if is_done(d)
    ]
    if not real_dirs or not null_dirs:
        return {"status": "needs both match-year and its wrong-day null"}
    real, null = _load(real_dirs), _load(null_dirs)
    out: dict[str, Any] = {
        "status": "done",
        "real_days": len(real_dirs),
        "null_runs": len(null_dirs),
    }
    for name, k in (("any_1", 1), ("any_2", 2), ("any_3", 3)):
        r, n = _rates(real, k), _rates(null, k)
        share = n["rate"] / r["rate"] if r["rate"] and np.isfinite(r["rate"]) else float("nan")
        out[name] = {
            "real": r,
            "null": n,
            "chance_share": round(float(share), 3),
            "est_real_y1": round(r["y1"] * max(0.0, 1 - share)) if np.isfinite(share) else None,
        }
    return out
