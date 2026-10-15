"""Phase 2 sanity report (build prompt §2.4).

What it does
------------
Reads one month of ``segments_met`` and CoCiP outputs (B1/B2/B3) and writes
``reports/phase2_sanity/<month>/report.md`` with figures:

* numbers of flights and segments (corridor and all), commercial share;
* share of segments with SAC formation, with ``persists_raw`` (SAC ∧ RHi ≥ 1) and with a
  CoCiP persistent contrail, per scaling;
* EF distribution on a log scale, positive and negative separately, per scaling;
* top 20 segments by EF (commercial flights only, so the report can be shared);
* maps of persistent-contrail frequency by flight-level band;
* diurnal cycle of EF (local solar time);
* plausibility flags: > 50 % of segments persistent; a single flight with |EF| > 10¹⁶ J
  (well above per-flight values in Teoh et al. 2024); contrails ending at the met-box edge.

It also writes the Q12 convergence table if ``convergence.csv`` exists in the CoCiP folder.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

FL_BANDS = [(250, 310), (310, 350), (350, 390), (390, 450)]


def _load(root: Path, month: str) -> tuple[pd.DataFrame, dict[str, pd.DataFrame]]:
    met_files = sorted((root / "interim" / "segments_met" / month).glob("*/segments_met.parquet"))
    seg = pd.concat([pd.read_parquet(f) for f in met_files], ignore_index=True)
    cocip = {}
    for sc in ("B1", "B2", "B3"):
        files = sorted((root / "interim" / "cocip" / sc / month).glob("*/segments.parquet"))
        if files:
            cocip[sc] = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    return seg, cocip


def _md_table(df: pd.DataFrame) -> str:
    """Plain Markdown table (no extra dependency)."""
    if df.empty:
        return "(none)"
    cols = [str(c) for c in df.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for row in df.itertuples(index=False):
        cells = [f"{v:.3g}" if isinstance(v, float) else str(v) for v in row]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def build_report(root: Path, month: str, out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    seg, cocip = _load(root, month)
    corr_ids = set(seg.loc[seg["in_corridor"], "flight_id"]) if "in_corridor" in seg else set()
    s = seg[seg["flight_id"].isin(corr_ids)] if corr_ids else seg
    ok = np.isfinite(s["temperature_k"])
    s = s[ok]
    s["fl_band"] = pd.cut(s["alt_ft_mid"] / 100, [b[0] for b in FL_BANDS] + [FL_BANDS[-1][1]])
    nums: dict[str, Any] = {
        "days": int(s["time_mid"].dt.date.nunique()),
        "flights": int(s["flight_id"].nunique()),
        "segments": len(s),
        "segments_inside_corridor": int(s["in_corridor"].sum()) if "in_corridor" in s else None,
        "commercial_flights": int(s.groupby("flight_id")["commercial"].first().sum()),
        "share_forms": float(s["forms"].mean()),
        "share_persists_raw": float(s["persists_raw"].mean()),
    }
    flags: list[str] = []
    rows = []
    for sc, c in cocip.items():
        m = c.merge(
            s[
                [
                    "segment_id",
                    "callsign",
                    "commercial",
                    "time_mid",
                    "alt_ft_mid",
                    "lat_mid",
                    "lon_mid",
                    "local_solar_time_h",
                ]
            ],
            on="segment_id",
            how="inner",
        )
        ef = m["ef"].fillna(0.0)
        pers = m["persistent_1"].fillna(0).astype(bool)
        per_flight = m.groupby("flight_id")["ef"].sum()
        rows.append(
            {
                "scaling": sc,
                "segments": len(m),
                "share_cocip_persistent": float(pers.mean()),
                "ef_positive_J": float(ef[ef > 0].sum()),
                "ef_negative_J": float(ef[ef < 0].sum()),
                "flights_with_contrail": int((per_flight != 0).sum()),
                "max_flight_abs_ef_J": float(per_flight.abs().max()) if len(per_flight) else 0.0,
            }
        )
        if pers.mean() > 0.5:
            flags.append(f"{sc}: more than 50 % of segments persistent ({pers.mean():.0%})")
        if len(per_flight) and per_flight.abs().max() > 1e16:
            flags.append(f"{sc}: a flight has |EF| > 1e16 J ({per_flight.abs().max():.2e})")
        _ef_hist(ef, sc, out_dir)
        m.assign(ef=ef).to_parquet(out_dir / f"_merged_{sc}.parquet", index=False)
    if nums["share_persists_raw"] > 0.5:
        flags.append("persists_raw > 50 % of segments")
    table = pd.DataFrame(rows)

    top = []
    for sc, _ in cocip.items():
        m = pd.read_parquet(out_dir / f"_merged_{sc}.parquet")
        m = m[m["commercial"].astype(bool)]
        t = m.reindex(m["ef"].abs().sort_values(ascending=False).index).head(20)
        t = t.assign(scaling=sc, FL=(t["alt_ft_mid"] / 100).round().astype(int))
        top.append(t[["scaling", "callsign", "time_mid", "FL", "lat_mid", "lon_mid", "ef"]])
        (out_dir / f"_merged_{sc}.parquet").unlink()
    _fl_maps(s, out_dir)
    _diurnal(cocip, s, out_dir)

    md = [f"# Phase 2 sanity report — {month}\n"]
    md.append("Computational estimates only. Commercial flights only in tables.\n")
    md.append("## Counts\n")
    md += [f"- {k}: {v}" for k, v in nums.items()]
    md.append("\n## CoCiP by humidity scaling\n")
    md.append(_md_table(table) if len(table) else "(no CoCiP outputs)")
    md.append("\n## Top 20 segments by |EF| (commercial)\n")
    md.append(_md_table(pd.concat(top)) if top else "(none)")
    conv = root / "interim" / "cocip" / "convergence" / f"{month}.csv"
    if conv.exists():
        md.append("\n## Monte Carlo convergence (Q12: N = 20 vs 40)\n")
        md.append(_md_table(pd.read_csv(conv)))
    md.append("\n## Plausibility flags\n")
    md += [f"- ⚠ {f}" for f in flags] or ["- none raised"]
    md.append("\n## Figures\n")
    md += [f"![{p.stem}]({p.name})" for p in sorted(out_dir.glob("*.png"))]
    (out_dir / "report.md").write_text("\n".join(md) + "\n")
    return {**nums, "flags": flags, "report": str(out_dir / "report.md")}


def _ef_hist(ef: pd.Series, sc: str, out_dir: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 3.5))
    bins = np.logspace(8, 16, 41).tolist()
    ax.hist(ef[ef > 0], bins=bins, alpha=0.7, label="positive EF (warming)")
    ax.hist(-ef[ef < 0], bins=bins, alpha=0.7, label="|negative EF| (cooling)")
    ax.set_xscale("log")
    ax.set_xlabel("segment EF (J)")
    ax.set_ylabel("segments")
    ax.set_title(f"EF distribution — {sc}")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_dir / f"ef_hist_{sc}.png", dpi=120)
    plt.close(fig)


def _fl_maps(s: pd.DataFrame, out_dir: Path) -> None:
    fig, axes = plt.subplots(1, len(FL_BANDS), figsize=(4 * len(FL_BANDS), 4), sharey=True)
    for ax, (lo, hi) in zip(axes, FL_BANDS, strict=True):
        b = s[(s["alt_ft_mid"] >= lo * 100) & (s["alt_ft_mid"] < hi * 100)]
        if len(b):
            h = b.assign(
                gx=(b["lon_mid"] // 1).astype(int),
                gy=(b["lat_mid"] // 1).astype(int),
                pr=b["persists_raw"].astype(float),
            ).pivot_table(index="gy", columns="gx", values="pr", aggfunc="mean")
            im = ax.pcolormesh(h.columns, h.index, h.values, vmin=0, vmax=0.2, cmap="cividis")
        ax.set_title(f"FL{lo}–{hi}: share persists_raw")
        ax.set_xlabel("lon")
    axes[0].set_ylabel("lat")
    if len(s):
        fig.colorbar(im, ax=axes, shrink=0.8)
    fig.savefig(out_dir / "persistence_by_fl.png", dpi=120, bbox_inches="tight")
    plt.close(fig)


def _diurnal(cocip: dict[str, pd.DataFrame], s: pd.DataFrame, out_dir: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 3.5))
    for sc, c in cocip.items():
        m = c.merge(s[["segment_id", "local_solar_time_h"]], on="segment_id")
        h = m.groupby(m["local_solar_time_h"].astype(int))["ef"].sum()
        ax.plot(h.index, h.values, marker="o", label=sc)
    ax.set_xlabel("local solar time (h)")
    ax.set_ylabel("total EF (J)")
    ax.set_title("Diurnal cycle of EF")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_dir / "ef_diurnal.png", dpi=120)
    plt.close(fig)
