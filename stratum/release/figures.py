"""Every results figure from the released results.json (build prompt §8.3 "make reproduce-figures").

Needs only ``results.json`` (in the web build and in the release bundle), not the raw data, so
anyone can check that the figures follow from the logged numbers. Writes PNGs to ``out``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RED, BLUE, ORANGE, GREY, INK = "#c0392b", "#2c7fb8", "#e67e22", "#888888", "#13202f"


def _plt() -> Any:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    return plt


def _hyp(res: dict[str, Any], hid: str) -> dict[str, Any]:
    return next((h for h in res.get("hypotheses", []) if h.get("id") == hid), {})


def reproduce(results: Path, out: Path) -> list[Path]:
    res = json.loads(results.read_text())
    out.mkdir(parents=True, exist_ok=True)
    plt = _plt()
    files: list[Path] = []

    h1 = _hyp(res, "H1")
    if h1.get("estimate"):
        e = h1["estimate"]
        fig, ax = plt.subplots(figsize=(5.5, 1.8))
        ax.axvline(1, color=GREY, ls="--", lw=1)
        ax.plot([e["lo"], e["hi"]], [0, 0], color=INK, lw=3)
        ax.plot([e["value"]], [0], "o", color=RED, ms=9)
        ax.set_xscale("log")
        ax.set_yticks([])
        ax.set_xlabel(
            "B1-predicted / observed persistent contrails (log; 1 = physics matches the satellite)"
        )
        ax.set_title(
            f"H1: ratio {e['value']:.2f} (95 % CI {e['lo']:.2f}–{e['hi']:.2f}) — {h1['verdict']}",
            fontsize=10,
        )
        fig.tight_layout()
        files.append(_save(fig, out / "h1_ratio.png", plt))

    h2 = _hyp(res, "H2")
    if h2.get("estimate"):
        rows = [
            ("vs B3 (pre-registered)", h2.get("estimate")),
            ("vs climatology", h2.get("vs_B0")),
            ("vs humidity only", h2.get("vs_LOGIT")),
            ("vs constant rate", h2.get("vs_RATE")),
        ]
        rows_ok: list[tuple[str, dict[str, float]]] = [(k, v) for k, v in rows if v]
        fig, ax = plt.subplots(figsize=(5.5, 2.4))
        for i, (_k, v) in enumerate(rows_ok):
            ax.plot([max(v["lo"], -1.5), v["hi"]], [i, i], color=INK, lw=3)
            ax.plot([max(v["value"], -1.5)], [i], "o", color=RED, ms=8)
        ax.axvline(0, color=GREY, ls="--", lw=1)
        ax.set_yticks(range(len(rows_ok)), [k for k, _ in rows_ok], fontsize=8)
        ax.set_xlim(-1.5, 1)
        ax.set_xlabel("mean Brier skill score of STRATUM over held-out seasons")
        ax.set_title(f"H2 — {h2['verdict']}", fontsize=10)
        fig.tight_layout()
        files.append(_save(fig, out / "h2_skill.png", plt))

    curves = res.get("concentration_curves") or {}
    if any(curves.values()):
        fig, ax = plt.subplots(figsize=(5, 4.2))
        for (k, c), col in zip(curves.items(), (RED, BLUE, ORANGE), strict=False):
            if c:
                ax.plot(c["distance_share"], c["ef_share"], color=col, lw=1.8, label=k)
        ax.plot([0, 1], [0, 1], color=GREY, ls=":", lw=1)
        ax.axhline(0.8, color=INK, lw=0.6)
        ax.axvline(0.1, color=INK, lw=0.6, ls="--")
        ax.set_xscale("symlog", linthresh=1e-3)
        ax.set_xlabel("share of cruise distance (largest warming first)")
        ax.set_ylabel("share of positive energy forcing")
        ax.set_title("H3: concentration of contrail warming", fontsize=10)
        ax.legend(frameon=False, fontsize=7, loc="lower right")
        fig.tight_layout()
        files.append(_save(fig, out / "h3_concentration.png", plt))

    h4 = _hyp(res, "H4")
    if h4.get("details"):
        bars: list[tuple[str, dict[str, Any]]] = [
            ("logged (corrected)", h4["details"]),
            *[(f"{m} (descriptive)", c) for m, c in (h4.get("context") or {}).items() if c],
        ]
        fig, ax = plt.subplots(figsize=(5.5, 2.2))
        for i, (_k, d) in enumerate(bars):
            ax.barh(
                i + 0.18,
                d["night_share_positive_ef"],
                height=0.34,
                color=RED,
                label="night share of warming" if i == 0 else None,
            )
            ax.barh(
                i - 0.18,
                d["night_share_distance"],
                height=0.34,
                color=GREY,
                label="night share of distance" if i == 0 else None,
            )
        ax.set_yticks(range(len(bars)), [k for k, _ in bars], fontsize=8)
        ax.set_xlim(0, 1)
        ax.legend(frameon=False, fontsize=7)
        ax.set_title(f"H4 — {h4['verdict']} (logged run)", fontsize=10)
        fig.tight_layout()
        files.append(_save(fig, out / "h4_night.png", plt))

    rel = (res.get("reliability") or {}).get("phase7") or {}
    if rel:
        fig, ax = plt.subplots(figsize=(4.8, 4.4))
        top = 0.0
        for (m, bins), col in zip(rel.items(), (GREY, ORANGE, BLUE, RED), strict=False):
            x = [b["mean_forecast"] for b in bins]
            y = [b["observed"] for b in bins]
            top = max(top, *x, *y)
            ax.plot(x, y, marker="o", ms=3, color=col, label=m)
        ax.plot([0, top], [0, top], color=GREY, ls=":")
        ax.set_xlabel("forecast probability (bin mean)")
        ax.set_ylabel("observed frequency")
        ax.set_title("Reliability on held-out seasons", fontsize=10)
        ax.legend(frameon=False, fontsize=8)
        fig.tight_layout()
        files.append(_save(fig, out / "reliability_heldout.png", plt))
    return files


def _save(fig: Any, path: Path, plt: Any) -> Path:
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path
