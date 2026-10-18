"""Phase 7 validation figures (training rows only): reliability before/after isotonic
calibration, SHAP importance, and SHAP dependence for RHi, T − T_LM, distance to the tropopause
and local solar time (build prompt §7.3.4, §7.3.6)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from stratum.evaluate import metrics as mt

DEPENDENCE = [
    "rhi_at_level",
    "temp_minus_TLM",
    "distance_to_tropopause_wmo",
    "local_solar_time_sin",
]
GREY, RED, BLUE = "#888888", "#c0392b", "#2c7fb8"


def _plt() -> Any:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    return plt


def reliability(figs: dict[str, Any], out: Path) -> Path:
    plt = _plt()
    names = list(figs)
    ncol = min(3, len(names))
    nrow = -(-len(names) // ncol)
    fig, axes = plt.subplots(nrow, ncol, figsize=(3.4 * ncol, 3.2 * nrow), squeeze=False)
    axes = axes.ravel()
    for ax in axes[len(names) :]:
        ax.set_visible(False)
    for ax, n in zip(axes, names, strict=False):
        y = figs[n]["y"]
        top = 0.0
        for key, col, lab in (("raw", GREY, "before"), ("cal", RED, "after (cross-fitted)")):
            r = mt.reliability(y, figs[n]["oof"][key])
            ax.plot(
                r["mean_forecast"], r["observed"], marker="o", ms=3, lw=1.3, color=col, label=lab
            )
            top = max(top, float(r["observed"].max()), float(r["mean_forecast"].max()))
        lim = max(0.02, top * 1.15)
        ax.plot([0, lim], [0, lim], color="k", lw=0.8, ls=":")
        ax.set_xlim(0, lim)
        ax.set_ylim(0, lim)
        ax.set_title(n.replace("_", " "), fontsize=9)
        ax.set_xlabel("forecast (bin mean)", fontsize=8)
    for k in range(0, len(names), ncol):
        axes[k].set_ylabel("observed frequency", fontsize=8)
    axes[0].legend(frameon=False, fontsize=7)
    fig.suptitle(
        "Calibration on validation days (leave-one-day-out, training seasons only)", fontsize=10
    )
    fig.tight_layout()
    f = out / "reliability_validation.png"
    fig.savefig(f, dpi=150)
    plt.close(fig)
    return f


def shap_importance(res: dict[str, Any], out: Path) -> Path:
    plt = _plt()
    folds = list(res["folds"])
    names = res["features"]
    imp = np.array([[res["folds"][f]["shap_importance"][n] for n in names] for f in folds])
    mean = imp.mean(axis=0)
    order = np.argsort(mean)
    fig, ax = plt.subplots(figsize=(6.4, 5.2))
    for k in range(len(folds)):
        ax.scatter(
            imp[k, order],
            np.arange(len(names)),
            s=10,
            color=GREY,
            alpha=0.6,
            label="one outer fold" if k == 0 else None,
        )
    ax.barh(np.arange(len(names)), mean[order], color=RED, alpha=0.35, label="mean over folds")
    ax.set_yticks(np.arange(len(names)))
    ax.set_yticklabels([names[i] for i in order], fontsize=8)
    ax.set_xlabel("mean |SHAP value| (log-odds)")
    ax.legend(frameon=False, fontsize=8)
    ax.set_title("What the correction model uses (TreeSHAP, training rows)", fontsize=10)
    fig.tight_layout()
    f = out / "shap_importance.png"
    fig.savefig(f, dpi=150)
    plt.close(fig)
    return f


def shap_dependence(figs: dict[str, Any], names: list[str], out: Path, fold: str) -> Path:
    plt = _plt()
    s = figs[fold]["shap"]
    fig, axes = plt.subplots(1, len(DEPENDENCE), figsize=(3.3 * len(DEPENDENCE), 3.2))
    for ax, n in zip(axes, DEPENDENCE, strict=True):
        j = names.index(n)
        x, v = s["X"][:, j], s["shap"][:, j]
        ok = np.isfinite(x)
        ax.scatter(x[ok], v[ok], s=2, alpha=0.25, color=BLUE, rasterized=True)
        ax.axhline(0, color="k", lw=0.6)
        ax.set_xlabel(n, fontsize=8)
    axes[0].set_ylabel("SHAP value (log-odds)", fontsize=8)
    fig.suptitle(f"SHAP dependence, {fold.replace('_', ' ')} model (training rows)", fontsize=10)
    fig.tight_layout()
    f = out / f"shap_dependence_{fold}.png"
    fig.savefig(f, dpi=150)
    plt.close(fig)
    return f
