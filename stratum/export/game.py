"""Rounds for the "Beat STRATUM" booth game (website; descriptive, no test).

Each round is one held-out commercial flight segment. The player sees the weather at the
aircraft (ERA5: humidity relative to ice at, above and below the level, temperature, the
Schmidt–Appleman margin, natural cirrus, time of day) and guesses whether the satellite saw a
persistent contrail. Then the Meteosat picture is shown with the track and the predicted drift,
next to three answers: STRATUM (its held-out probability from the H2 final run), the physics
baseline (CoCiP B1 "persistent contrail formed") and the truth.

Truth = the learned detector v3's label (D-005), taken only where the satellite gives a clear
answer: "seen" needs ≥ 2 matched observable images, "not seen" ≥ 3 observable images with no
match. The pool is balanced (``N_POS`` seen, ``N_NEG`` not seen); half of the "not seen" rounds
are ones where the physics expected a contrail, half where it did not (disclosed on the page).
On a balanced pool STRATUM answers "yes" for its top half: p ≥ the pool's median p.

Output: ``<out>/index.json`` (rounds) + ``<out>/img/<round>.png``. Commercial flights only,
salted-hash ids, rendered 8-bit pictures with the EUMETSAT credit (no numerical satellite data).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.export.contrail_viewer import CREDIT, Scene

N_POS = 20
N_NEG = 20
TARGET_AGE_MIN = 45.0
WX = {
    "rhi": "rhi",
    "rhi_above": "rhi_level_above",
    "rhi_below": "rhi_level_below",
    "temp_k": "temperature_k",
    "sac_margin_k": "temp_minus_TLM",
    "cloud_ice": "cloud_ice_water_content",
    "high_cloud": "high_cloud_fraction",
}
SEG_COLS = [
    "segment_id", "flight_id", "time_mid", "lat_start", "lon_start", "lat_end", "lon_end",
    "lat_mid", "lon_mid", "alt_ft_mid", "callsign", "typecode", "local_solar_time_h", *WX.values(),
]  # fmt: skip


def _one_per_flight(d: pd.DataFrame, seed: int) -> pd.DataFrame:
    return d.sample(frac=1.0, random_state=seed).drop_duplicates("flight_id")


def pick(t: pd.DataFrame, seed: int, n_pos: int = N_POS, n_neg: int = N_NEG) -> pd.DataFrame:
    """The balanced pool. ``t``: evaluation-table rows with STRATUM and B1_cocip columns."""
    ok = t["commercial"].fillna(False).astype(bool) & np.isfinite(t["STRATUM"].to_numpy(float))
    t = t[ok & t["B1_cocip"].notna()]
    pos = _one_per_flight(t[(t["y"] == 1) & (t["n_matched_observable"] >= 2)], seed)
    neg = _one_per_flight(t[(t["y"] == 0) & (t["n_observable"] >= 3)], seed)
    neg = neg[~neg["flight_id"].isin(set(pos["flight_id"]))]
    half = n_neg // 2
    phys_yes, phys_no = neg[neg["B1_cocip"] == 1], neg[neg["B1_cocip"] == 0]
    a = phys_yes.head(half)
    b = phys_no.head(n_neg - len(a))
    a = pd.concat([a, phys_yes.iloc[len(a) :].head(n_neg - len(a) - len(b))])
    return pd.concat([pos.head(n_pos), a, b], ignore_index=True)


def round_id(segment_id: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}|game|{segment_id}".encode()).hexdigest()[:12]


def _slot_rows(per: pd.DataFrame, seen: bool) -> pd.DataFrame:
    """The image to show: observable (and matched, if seen), contrail age nearest 45 min."""
    q = per[per["observable"] & (per["matched"] if seen else True)]
    if q.empty:
        return q
    best = (q["age_min"] - TARGET_AGE_MIN).abs().idxmin()
    return q[q["image_time"] == q.loc[best, "image_time"]]


def _num(v: Any, nd: int = 4) -> float | None:
    v = float(v)
    return round(v, nd) if np.isfinite(v) else None


def export(
    root: Path,
    out: Path,
    salt: str,
    track: str = "nn3",
    seed: int = 2026,
    n_pos: int = N_POS,
    n_neg: int = N_NEG,
) -> dict[str, Any]:
    from stratum.config import configs_dir
    from stratum.export.web_export import airline_names

    names = airline_names(configs_dir() / "airlines.yaml")
    sfx = "" if track == "line" else f"_{track}"
    t = pd.read_parquet(root / "interim" / f"evaluation{sfx}" / "table.parquet")
    pr = pd.read_parquet(
        root / "interim" / "model_predictions" / "heldout.parquet",
        columns=["segment_id", "STRATUM"],
    )
    t = t.drop(columns=[c for c in ("STRATUM",) if c in t]).merge(pr, on="segment_id", how="left")
    pool = pick(t, seed, n_pos, n_neg)
    thr = float(pool["STRATUM"].median())
    (out / "img").mkdir(parents=True, exist_ok=True)
    rounds: list[dict[str, Any]] = []
    for day, g in pool.groupby("day"):
        day = str(day)
        sm = pd.read_parquet(
            root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
        )
        seg = sm[[c for c in SEG_COLS if c in sm]].set_index("segment_id")
        md = root / "interim" / f"matches{sfx}" / day[:7] / day
        per = pd.read_parquet(md / "per_slot.parquet")
        per = per[per["segment_id"].isin(set(g["segment_id"]))]
        per["image_time"] = pd.to_datetime(per["image_time"])
        sc = Scene(root, day, track)
        for r in g.itertuples():
            s = seg.loc[r.segment_id]
            seen = bool(r.y == 1)
            q = _slot_rows(per[per["segment_id"] == r.segment_id], seen)
            if q.empty:
                continue
            rid = round_id(str(r.segment_id), salt)
            ends = ("lat_start", "lon_start", "lat_end", "lon_end", "alt_ft_mid")
            tr = sc.track_px(pd.DataFrame({k: [float(s[k])] for k in ends}))
            slot = sc.slot(q, q["image_time"].iloc[0], tr, out / "img" / f"{rid}.png")
            if slot is None:
                continue
            cs = str(s.get("callsign") or "")
            tm = pd.Timestamp(s["time_mid"])
            rounds.append(
                {
                    "id": rid,
                    "day": day,
                    "t": f"{tm:%Y-%m-%dT%H:%M}Z",
                    "lst_h": _num(s.get("local_solar_time_h", np.nan), 1),
                    "fl": round(float(s["alt_ft_mid"]) / 100),
                    "lat": _num(s["lat_mid"], 2),
                    "lon": _num(s["lon_mid"], 2),
                    "airline": names.get(cs[:3]) if cs else None,
                    "aircraft_type": str(s["typecode"]) if pd.notna(s.get("typecode")) else None,
                    "wx": {k: _num(s.get(c, np.nan)) for k, c in WX.items()},
                    "seen": seen,
                    "stratum_p": _num(r.STRATUM, 5),
                    "stratum_says": bool(thr <= r.STRATUM),
                    "physics_says": bool(r.B1_cocip == 1),
                    "slot": slot,
                }
            )
    rng = np.random.default_rng(seed)
    rounds = [rounds[i] for i in rng.permutation(len(rounds))]
    index = {
        "track": track,
        "rounds": rounds,
        "stratum_threshold": round(thr, 5),
        "n_seen": sum(r["seen"] for r in rounds),
        "credit": CREDIT,
        "note": (
            "Held-out flight segments; truth = learned detector v3 (D-005) where the satellite "
            "is clear. Half of the 'not seen' rounds are ones the physics expected a contrail. "
            "STRATUM says yes for its top half (p ≥ the pool median)."
        ),
    }
    (out / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    return {
        "rounds": len(rounds),
        "seen": index["n_seen"],
        "threshold": index["stratum_threshold"],
        "stratum_correct": sum(r["stratum_says"] == r["seen"] for r in rounds),
        "physics_correct": sum(r["physics_says"] == r["seen"] for r in rounds),
    }
