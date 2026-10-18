"""Year summary of the segment labels (build prompt §5.6–5.7).

* **Label counts** (``reports/phase5/label_counts.csv``): candidates, y = 1, y = 0, missing and
  the observable fraction, overall and by month, season, west/east of 80°E, VZA band (median
  VZA of the segment's slots) and day/night (most of its slots at night or not).
* **Minimum-sample check** (pre-registered ``min_labels.matched_observed_contrails: 300``).
  One contrail is usually several one-minute segments, so y = 1 *segments* overstate the number
  of observed contrails. We count **contrail events**: runs of consecutive y = 1 segments of the
  same flight piece. The check is applied to events (the conservative count); y = 1 segments
  and flights are reported too. If events < 300 the result is **escalate**: stop and report
  to the team (label more scenes / extend the period / add a second satellite).
* **Parallax before/after figure**: distance from the predicted midpoint to the nearest
  detected object, with and without the parallax correction, over observable slots. If the
  correction is right, real matches pile up near 0 px only with it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.manifest import is_done

LAB_COLS = [
    "n_matched_observable",
    "segment_id",
    "flight_id",
    "time_mid",
    "lon_mid",
    "y",
    "n_observable",
    "n_slots",
    "season",
    "west_of_80e",
    "night_fraction",
    "persists_raw",
    "commercial",
]
PER_COLS = [
    "segment_id",
    "observable",
    "matched",
    "vza_deg",
    "nearest_px",
    "nearest_px_no_parallax",
]


def match_days(root: Path) -> list[Path]:
    return [d for d in sorted((root / "interim" / "matches").glob("*/*")) if is_done(d)]


def contrail_events(lab: pd.DataFrame) -> int:
    """Runs of consecutive y = 1 segments within one flight piece (segment_id = flight_NNNN)."""
    pos = lab[lab["y"] == 1].copy()
    if pos.empty:
        return 0
    pos["k"] = pd.to_numeric(pos["segment_id"].str.rsplit("_", n=1).str[-1], errors="coerce")
    pos = pos.sort_values(["flight_id", "k"])
    new = (pos["flight_id"] != pos["flight_id"].shift()) | (pos["k"].diff() != 1)
    return int(new.sum())


def _counts(g: pd.DataFrame) -> dict[str, Any]:
    n = len(g)
    return {
        "candidates": n,
        "y1": int((g["y"] == 1).sum()),
        "y0": int((g["y"] == 0).sum()),
        "missing": int(g["y"].isna().sum()),
        "known_fraction": round(float(g["y"].notna().mean()), 4) if n else None,
        "y1_events": contrail_events(g),
    }


def count_table(lab: pd.DataFrame) -> pd.DataFrame:
    month = pd.to_datetime(lab["time_mid"], utc=True).dt.strftime("%Y-%m")
    vza_band = pd.cut(lab["vza_median"], [0, 30, 45, 60, 90], right=False).astype(str)
    dn = np.where(
        lab["night_fraction"] > 0.5,
        "night",
        np.where(lab["night_fraction"].notna(), "day", "no_slot"),
    )
    groups = {
        "all": pd.Series("all", index=lab.index),
        "month": month,
        "season": lab["season"],
        "west_east": np.where(lab["west_of_80e"], "west", "east"),
        "vza_band": vza_band,
        "day_night": dn,
    }
    rows = []
    for name, key in groups.items():
        for k, g in lab.groupby(pd.Series(key, index=lab.index)):
            rows.append({"by": name, "group": str(k), **_counts(g)})
    return pd.DataFrame(rows)


def parallax_figure(per: pd.DataFrame, out: Path) -> dict[str, Any]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    o = per[per["observable"]]
    bins = [float(b) for b in np.arange(0, 10.25, 0.25)]
    with_p = o["nearest_px"].dropna().to_numpy()
    no_p = o["nearest_px_no_parallax"].dropna().to_numpy()
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.hist(
        no_p[no_p < 10],
        bins=bins,
        histtype="step",
        lw=1.8,
        color="#888888",
        label="without parallax correction",
    )
    ax.hist(
        with_p[with_p < 10],
        bins=bins,
        histtype="step",
        lw=1.8,
        color="#c0392b",
        label="with parallax correction",
    )
    ax.axvline(2, color="k", ls=":", lw=1)
    ax.text(2.1, ax.get_ylim()[1] * 0.92, "2 px match tolerance", fontsize=8)
    ax.set_xlabel("distance from predicted contrail to nearest detected object (px)")
    ax.set_ylabel("observable segment × image pairs")
    ax.set_title("Parallax correction: before / after")
    ax.legend(frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(out, dpi=160)
    plt.close(fig)
    n = max(len(o), 1)
    return {
        "observable_pairs": len(o),
        "within_2px_with_parallax": int((with_p <= 2).sum()),
        "within_2px_without_parallax": int((no_p <= 2).sum()),
        "share_within_2px_with": round(float((with_p <= 2).sum()) / n, 5),
        "share_within_2px_without": round(float((no_p <= 2).sum()) / n, 5),
    }


def year_summary(root: Path, min_events: int = 300) -> dict[str, Any]:
    days = match_days(root)
    if not days:
        return {"status": "no matched day yet (run match-year)"}
    labs, pers = [], []
    for d in days:
        lab = pd.read_parquet(d / "labels.parquet", columns=LAB_COLS)
        per = pd.read_parquet(d / "per_slot.parquet", columns=PER_COLS)
        vm = per.groupby("segment_id")["vza_deg"].median().rename("vza_median")
        labs.append(lab.merge(vm, on="segment_id", how="left"))
        pers.append(per[per["observable"]])
    lab = pd.concat(labs, ignore_index=True)
    per = pd.concat(pers, ignore_index=True)
    out = root / "reports" / "phase5"
    out.mkdir(parents=True, exist_ok=True)
    table = count_table(lab)
    table.to_csv(out / "label_counts.csv", index=False)
    par = parallax_figure(per, out / "parallax_before_after.png")
    events = contrail_events(lab)
    summary = {
        "days": [d.name for d in days],
        **{k: v for k, v in _counts(lab).items()},
        "y1_flights": int(lab.loc[lab["y"] == 1, "flight_id"].nunique()),
        "min_labels_check": {
            "rule": f"y = 1 contrail events ≥ {min_events}"
            " (pre-registered min_labels.matched_observed_contrails)",
            "events": events,
            "y1_segments": int((lab["y"] == 1).sum()),
            "result": "passed" if events >= min_events else "escalate",
        },
        "parallax": par,
    }
    summary["sensitivity_min_matched_slots"] = rule_variants(lab)
    summary["wrong_day_null"] = null_summary(root, summary)
    (out / "labels_summary.json").write_text(json.dumps(summary, indent=1, default=str))
    return {"status": "done", **summary}


def null_summary(root: Path, real: dict[str, Any] | None = None) -> dict[str, Any]:
    """Chance-match rate from the wrong-day null runs (``interim/matches_null``)."""
    runs = [d for d in sorted((root / "interim" / "matches_null").glob("*_on_*")) if is_done(d)]
    if not runs:
        return {"status": "no null run"}
    rows = []
    for d in runs:
        y = pd.read_parquet(d / "labels.parquet", columns=["y"])["y"]
        rows.append({"run": d.name, "y1": int((y == 1).sum()), "y0": int((y == 0).sum())})
    t = pd.DataFrame(rows)
    y1, y0 = int(t["y1"].sum()), int(t["y0"].sum())
    out: dict[str, Any] = {
        "runs": rows,
        "chance_y1_rate": round(y1 / (y1 + y0), 5) if y1 + y0 else None,
    }
    if real and (real.get("y1", 0) + real.get("y0", 0)):
        r = real["y1"] / (real["y1"] + real["y0"])
        out["real_y1_rate"] = round(r, 5)
        out["share_of_y1_explained_by_chance"] = (
            round(out["chance_y1_rate"] / r, 3) if r and out["chance_y1_rate"] is not None else None
        )
    return out


def rule_variants(lab: pd.DataFrame, min_observable: int = 2) -> dict[str, Any]:
    """y = 1 / y = 0 / contrail events if y = 1 needed k = 1, 2, 3 matched observable images
    (D-004: k = 2 is primary; k = 1 is the original pre-registered rule)."""
    out: dict[str, Any] = {}
    for k in (1, 2, 3):
        y = np.where(
            lab["n_matched_observable"] >= k,
            1.0,
            np.where(
                (lab["n_matched_observable"] == 0) & (lab["n_observable"] >= min_observable),
                0.0,
                np.nan,
            ),
        )
        v = lab.assign(y=y)
        out[f"k{k}"] = {
            "y1": int((y == 1).sum()),
            "y0": int((y == 0).sum()),
            "y1_events": contrail_events(v),
        }
    return out
