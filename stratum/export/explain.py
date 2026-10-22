""" "Why this prediction?" for the website: per-card TreeSHAP of the STRATUM model (descriptive).

For each card on the map (the B1, B3 and STRATUM lists of a held-out flight day, and the
probability-weighted list of D-006 when it exists), the segment of the card's portion with the
highest STRATUM probability is explained with LightGBM's exact TreeSHAP (``pred_contrib``) on
the model of the seasonal fold that holds the day out — the model whose held-out predictions
H2 scored. Contributions are in the boosted model's raw score (log-odds, before the isotonic
calibration): base value + contributions = that raw score. Feature values are ERA5 at the
segment and the flight's position and time (no labels, no detector output).

Output per day ``<out>/days/<day>.json``::

    {"day", "fold", "features": [...], "base": float,
     "items": {card id: {"t": iso time, "fl": int, "p": calibrated, "score": log-odds,
                          "x": [feature values], "phi": [contributions]}}}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.model import features as fe

ROUND = 4


def _sig(v: float) -> float | None:
    return float(f"{v:.{ROUND}g}") if np.isfinite(v) else None


def explain_parts(
    model: Any, names: list[str], parts: list[tuple[str, pd.DataFrame]]
) -> tuple[float, dict[str, dict[str, Any]]]:
    """TreeSHAP of the highest-probability segment of each (card id, portion rows) pair.
    Returns the base value and the per-card explanations (cards without ERA5 are left out)."""
    cols = fe.columns(names)
    rows, ids = [], []
    for cid, part in parts:
        ok = part[np.isfinite(part["rhi"].to_numpy(float))]
        if ok.empty:
            continue
        p = model.predict(ok[cols].to_numpy(float))
        rows.append(ok.iloc[int(np.argmax(p))])
        ids.append(cid)
    if not rows:
        return float("nan"), {}
    top = pd.DataFrame(rows)
    X = top[cols].to_numpy(float)
    contrib = np.asarray(model.booster.predict(X, pred_contrib=True), float)
    p_cal = model.predict(X)
    base = float(contrib[0, -1])
    items: dict[str, dict[str, Any]] = {}
    for i, cid in enumerate(ids):
        r = top.iloc[i]
        items[cid] = {
            "t": f"{pd.Timestamp(r['time_mid']):%Y-%m-%dT%H:%M}Z",
            "fl": round(float(r["alt_ft_mid"]) / 100),
            "p": _sig(float(p_cal[i])),
            "score": _sig(float(contrib[i].sum())),
            "x": [_sig(float(v)) for v in X[i]],
            "phi": [_sig(float(v)) for v in contrib[i, :-1]],
        }
    return base, items


def card_parts(
    root: Path, day: str, seg: pd.DataFrame, salt: str
) -> list[tuple[str, pd.DataFrame]]:
    """(card id, portion rows) of the B1, B3 and STRATUM lists exactly as the web export
    builds them (same order, so the same ids)."""
    from stratum.export import web_v1 as w1
    from stratum.export.web_export import hash_id

    out: list[tuple[str, pd.DataFrame]] = []

    def hid(part: pd.DataFrame) -> str:
        return hash_id(str(part["flight_id"].iloc[0]), salt)

    for model in ("B1", "B3"):
        f = root / "interim" / "cocip_domain24" / model / day[:7] / day / "segments.parquet"
        if f.exists():
            parts = w1.physics_parts(seg, pd.read_parquet(f))
            out += [(f"{hid(p)}_{model}_{k:03d}", p) for k, p in enumerate(parts)]
    ddec = root / "interim" / "decisions" / day[:7] / day
    if (ddec / "table3.parquet").exists() and (ddec / "candidates.parquet").exists():
        tab = pd.read_parquet(ddec / "table3.parquet")
        cands = pd.read_parquet(ddec / "candidates.parquet")
        sp = w1.stratum_parts(seg, tab, cands)
        out += [(f"{hid(p)}_STRATUM_{k:03d}", p) for k, (_, _, p) in enumerate(sp)]
    return out


def load_segments(root: Path, day: str) -> pd.DataFrame:
    seg = pd.read_parquet(
        root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
    )
    for c in ("time_start", "time_end", "time_mid"):
        seg[c] = pd.to_datetime(seg[c], utc=True).dt.tz_convert(None)
    return seg


def explain_day(
    root: Path,
    day: str,
    pre: Any,
    out: Path,
    salt: str,
    extra: list[tuple[str, pd.DataFrame]] | None = None,
) -> dict[str, Any]:
    from stratum.decide.humidity import fold_for_day
    from stratum.model import run as mr

    names = list(pre.correction_model.features)
    fold = fold_for_day(day)
    model, _ = mr.load(mr.model_dir(root) / fold)
    seg = load_segments(root, day)
    parts = card_parts(root, day, seg, salt) + (extra or [])
    base, items = explain_parts(model, names, parts)
    res = {"day": day, "fold": fold, "features": names, "base": _sig(base), "items": items}
    (out / "days").mkdir(parents=True, exist_ok=True)
    (out / "days" / f"{day}.json").write_text(json.dumps(res, separators=(",", ":")))
    return {"day": day, "cards": len(parts), "explained": len(items)}
