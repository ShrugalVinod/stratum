"""Reproduce paper Figure 1: the Schmidt–Appleman diagram at 250 hPa with η = 0.3.

What it does
------------
Draws, from STRATUM's own physics code (paper §2.1, Fig. 1; build prompt §1.4):

* the saturation curves over liquid water and over ice (Murphy & Koop 2005);
* the region between them, hatched: air supersaturated with respect to ice but not water,
  where a contrail can persist (an ice-supersaturated region, ISSR);
* the threshold mixing line with slope G, touching the water curve at T_LM ≈ −41.9 °C;
* points A (−52 °C, RHi 60 %), B (−50 °C, RHi 112 %) and C (−38 °C, RHi 58 %), with
  each point's verdict computed by :func:`stratum.physics.sac.schmidt_appleman`, and
  B's mixing line (dashed) crossing water saturation.

Every number on the figure is computed, not typed in. Run ``stratum figure-sac``.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.figure import Figure

from stratum.physics import constants as c
from stratum.physics.sac import SACConstants, mixing_line_slope, schmidt_appleman, t_lm
from stratum.physics.thermo import e_sat_ice, e_sat_water

INK = "#1b1f27"
ACCENT = "#2a4a8f"  # STRATUM blue (build prompt §4.4)
BROWN = "#8a4b16"
POINTS = {"A": (-52.0, 0.60), "B": (-50.0, 1.12), "C": (-38.0, 0.58)}


def make_figure(p_pa: float = 25000.0, eta: float = 0.3) -> tuple[Figure, dict[str, object]]:
    """Build the figure; also return the computed numbers shown on it."""
    k = SACConstants.from_preregistered()
    K = c.ZERO_CELSIUS
    G = float(mixing_line_slope(p_pa, eta, k))
    TLM = float(t_lm(G))
    T = np.linspace(-60.0, -36.0, 600) + K
    ew, ei = e_sat_water(T), e_sat_ice(T)

    fig, ax = plt.subplots(figsize=(7.2, 5.0), dpi=150)
    ax.fill_between(
        T - K, ei, ew, facecolor="none", edgecolor=ACCENT, hatch="///", lw=0, alpha=0.45
    )
    ax.plot(T - K, ew, color=INK, lw=1.8, label="saturation over water")
    ax.plot(T - K, ei, color=ACCENT, lw=1.8, label="saturation over ice")

    # Threshold mixing line: slope G through the tangent point (T_LM, e_w(T_LM)).
    ew_tlm = float(e_sat_water(TLM))
    ax.plot(T - K, ew_tlm + G * (T - TLM), color=BROWN, lw=2.0, label="threshold mixing line")
    ax.plot([TLM - K], [ew_tlm], "o", color=BROWN, ms=4)
    ax.annotate(
        f"$T_{{LM}}$ = {TLM - K:.1f} °C",
        (TLM - K, ew_tlm),
        xytext=(TLM - K - 6.5, ew_tlm + 4.0),
        color=BROWN,
        arrowprops={"arrowstyle": "-", "color": BROWN, "lw": 0.8},
    )

    verdicts: dict[str, object] = {}
    for name, (t_c, rhi) in POINTS.items():
        r = schmidt_appleman(t_c + K, rhi, p_pa, eta, k)
        e_amb = rhi * float(e_sat_ice(t_c + K))
        verdict = (
            "persistent contrail"
            if bool(r.persists)
            else ("short-lived contrail" if bool(r.forms) else "no contrail")
        )
        verdicts[name] = {
            "T_C": t_c,
            "RHi": rhi,
            "RHw": round(float(r.rhw), 3),
            "T_LC_C": round(float(r.T_LC) - K, 2),
            "verdict": verdict,
        }
        if name == "B":  # its mixing line crosses water saturation (paper Fig. 1 caption)
            tt = np.linspace(t_c, -36.0, 100) + K
            ax.plot(tt - K, e_amb + G * (tt - (t_c + K)), "--", color=BROWN, lw=1.2)
        ax.plot([t_c], [e_amb], "o", color=INK, ms=6, zorder=5)
        ax.annotate(
            f"{name}",
            (t_c, e_amb),
            xytext=(5, -12),
            textcoords="offset points",
            fontsize=11,
            weight="bold",
        )

    ax.text(-58.5, 6.2, "ice-supersaturated\n(hatched)", color=ACCENT, fontsize=9)
    ax.set_xlim(-60, -36)
    ax.set_ylim(0, 24)
    ax.set_xlabel("Ambient temperature (°C)")
    ax.set_ylabel("Water vapour partial pressure (Pa)")
    ax.set_title(
        f"Schmidt–Appleman diagram, {p_pa / 100:.0f} hPa, η = {eta}  (G = {G:.2f} Pa K⁻¹)",
        fontsize=10,
        loc="left",
    )
    ax.legend(loc="upper left", frameon=False, fontsize=8.5)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    fig.text(
        0.01,
        0.005,
        "STRATUM · computed with stratum.physics (Murphy & Koop 2005 saturation curves)",
        fontsize=6.5,
        color="#666",
    )
    fig.tight_layout()
    return fig, {"G_Pa_per_K": round(G, 4), "T_LM_C": round(TLM - K, 3), "points": verdicts}


def save_figure(out_dir: Path) -> dict[str, object]:
    """Write fig1_sac.png and fig1_sac.svg to ``out_dir``; return the computed numbers."""
    out_dir.mkdir(parents=True, exist_ok=True)
    fig, numbers = make_figure()
    fig.savefig(out_dir / "fig1_sac.png", dpi=200)
    fig.savefig(out_dir / "fig1_sac.svg")
    plt.close(fig)
    return numbers
