"""Figures for STRATUM research protocol v1.2 (dark theme). Run from ~/code/stratum with uv."""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xarray as xr
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.patches import Polygon as MplPolygon

warnings.filterwarnings("ignore")
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
REPO = Path.cwd()

BG, FG, MUTED, GRID = "#000000", "#e8e8e8", "#9a9a9a", "#2a2a2a"
CYAN, AMBER, CORAL, GREEN, VIOLET = "#5ec8d8", "#e8b04b", "#ff7b72", "#7ee08a", "#b9a3ff"
plt.rcParams.update(
    {
        "figure.facecolor": BG,
        "axes.facecolor": BG,
        "savefig.facecolor": BG,
        "text.color": FG,
        "axes.labelcolor": FG,
        "axes.edgecolor": "#555",
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "grid.color": GRID,
        "font.family": "Helvetica Neue",
        "font.size": 9,
        "axes.titlesize": 10,
        "axes.titleweight": "bold",
        "legend.frameon": False,
        "mathtext.fontset": "dejavusans",
    }
)


def coast() -> list[np.ndarray]:
    gj = json.loads((REPO / "configs/geo/coastline_ne50m_padded.geojson").read_text())
    lines = []
    for f in gj["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        lines += [np.asarray(p) for p in parts]
    return lines


AIRPORTS = {
    "DEL": (77.103, 28.567),
    "BOM": (72.866, 19.090),
    "BLR": (77.707, 13.199),
    "MAA": (80.171, 12.994),
    "HYD": (78.429, 17.240),
    "CCU": (88.447, 22.655),
    "AMD": (72.635, 23.077),
    "GAU": (91.586, 26.106),
}


def save(fig: plt.Figure, name: str) -> None:
    fig.savefig(OUT / name, dpi=220, bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)


# ── Fig 1: study domain, corridor, 80°E split, VZA contours ────────────────────
def fig_domain() -> None:
    from stratum.config import corridor_polygon, load_domain

    poly = corridor_polygon(load_domain().corridor)
    g = xr.open_zarr(REPO / "data/drive_local/raw/meteosat/static_grid.zarr").load()
    fig, ax = plt.subplots(figsize=(6.4, 5.6))
    for ln in coast():
        ax.plot(ln[:, 0], ln[:, 1], color="#6f7f8a", lw=0.6)
    cs = ax.contour(
        g["lon"],
        g["lat"],
        g["vza_deg"],
        levels=[40, 50, 60],
        colors=[GREEN, AMBER, CORAL],
        linewidths=0.9,
        linestyles="--",
    )
    ax.clabel(cs, fmt=lambda v: f"VZA {v:.0f}°", fontsize=7)
    ax.add_patch(Rectangle((68, 6), 30, 31, fill=False, ec=FG, lw=1.4))
    ax.add_patch(Rectangle((66, 4), 34, 35, fill=False, ec=MUTED, lw=0.9, ls=":"))
    xy = np.asarray(poly.exterior.coords)
    ax.add_patch(MplPolygon(xy, closed=True, fc=CYAN, alpha=0.25, ec=CYAN, lw=1.0))
    ax.axvline(80, color=VIOLET, lw=1.0, ls="-.")
    ax.text(80.3, 36.0, "80°E split\n(train W / test E)", color=VIOLET, fontsize=7, va="top")
    for k, (lo, la) in AIRPORTS.items():
        ax.plot(lo, la, "o", ms=3.5, color=FG)
        ax.text(lo + 0.4, la + 0.3, k, fontsize=7, color=FG)
    ax.text(68.4, 36.3, "study domain 6–37°N, 68–98°E", fontsize=7.5, color=FG)
    ax.text(66.3, 4.4, "padded ERA5 / satellite box 4–39°N, 66–100°E", fontsize=7, color=MUTED)
    ax.text(74.0, 24.4, "DEL–BOM\ncorridor\n(±75 km)", fontsize=7, color=CYAN, ha="center")
    ax.set_xlim(65.5, 100.5)
    ax.set_ylim(3.5, 39.5)
    ax.set_aspect(1 / np.cos(np.radians(21)))
    ax.set_xlabel("longitude (°E)")
    ax.set_ylabel("latitude (°N)")
    ax.grid(True, lw=0.3)
    save(fig, "fig1_domain.png")


# ── Fig 2: Schmidt–Appleman diagram ───────────────────────────────────────────
def fig_sac() -> None:
    from stratum.physics import constants as c
    from stratum.physics.sac import SACConstants, mixing_line_slope, t_lc, t_lm
    from stratum.physics.thermo import e_sat_ice, e_sat_water, rhi_to_rhw

    k = SACConstants.from_preregistered()
    K = c.ZERO_CELSIUS
    G = float(mixing_line_slope(25000.0, 0.3, k))
    TLM = float(t_lm(G))
    T = np.linspace(-60, -36, 600) + K
    ew, ei = e_sat_water(T), e_sat_ice(T)
    fig, ax = plt.subplots(figsize=(6.4, 4.0))
    ax.fill_between(
        T - K,
        ei,
        ew,
        color=CYAN,
        alpha=0.13,
        lw=0,
        label="ice-supersaturated, below water saturation",
    )
    ax.plot(T - K, ew, color=FG, lw=1.6, label="saturation over liquid water $e_w(T)$")
    ax.plot(T - K, ei, color=CYAN, lw=1.6, ls="--", label="saturation over ice $e_i(T)$")
    ew_tlm = float(e_sat_water(TLM))
    ax.plot(
        T - K,
        ew_tlm + G * (T - TLM),
        color=AMBER,
        lw=1.8,
        label=f"threshold mixing line, G = {G:.4f} Pa K$^{{-1}}$",
    )
    ax.plot([TLM - K], [ew_tlm], "o", color=AMBER, ms=4)
    ax.annotate(
        f"$T_{{LM}}$ = {TLM - K:.3f} °C",
        (TLM - K, ew_tlm),
        (TLM - K - 6.5, ew_tlm + 4),
        color=AMBER,
        fontsize=8,
        arrowprops={"arrowstyle": "-", "color": AMBER, "lw": 0.6},
    )
    pts = {"A": (-52.0, 0.60, GREEN), "B": (-50.0, 1.12, CORAL), "C": (-38.0, 0.58, VIOLET)}
    for name, (tc, rhi, col) in pts.items():
        Tk = tc + K
        e = rhi * float(e_sat_ice(Tk))
        rhw = float(rhi_to_rhw(rhi, Tk))
        tlc = float(t_lc(TLM, rhw, G)) - K
        forms = tc + K <= tlc + K
        txt = f"{name}: {tc:.0f} °C, RHi {rhi:.0%}: " + (
            ("forms, persists" if rhi >= 1 else "forms, not persistent") if forms else "no contrail"
        )
        ax.plot(tc, e, "o", color=col, ms=5)
        off = {"A": (-59.5, 7.5), "B": (-59.5, 9.5), "C": (-44.5, 3.0)}[name]
        ax.annotate(
            txt,
            (tc, e),
            off,
            color=col,
            fontsize=7.5,
            arrowprops={"arrowstyle": "-", "color": col, "lw": 0.5},
        )
    ax.set_xlim(-60, -36)
    ax.set_ylim(0, 26)
    ax.set_xlabel("ambient temperature (°C)")
    ax.set_ylabel("water-vapour partial pressure (Pa)")
    ax.legend(fontsize=7, loc="upper left")
    ax.grid(True, lw=0.3)
    ax.set_title("250 hPa, η = 0.30 (Murphy–Koop 2005)", fontsize=9, loc="left", color=MUTED)
    save(fig, "fig2_sac.png")


# ── Fig 3: Meteosat-9 IR_108 and BTD with coastline ───────────────────────────
def fig_meteosat() -> None:
    from stratum.io.meteosat_plots import area_from_attrs, coastline_pixels

    ds = xr.open_zarr(REPO / "data/drive_local/raw/meteosat/l15_crop/2026-01-15/data.zarr")
    s = ds.sel(time="2026-01-15T00:00").load()
    area = area_from_attrs(ds)
    x0, y0, x1, y1 = area.area_extent
    fc, fr = x0 > x1, y0 > y1
    ir = s["IR_108"].values
    btd = (s["IR_108"] - s["IR_120"]).values
    ny, nx = ir.shape
    lines = coastline_pixels(area)
    fig, axes = plt.subplots(1, 2, figsize=(7.0, 3.1))
    for ax, img, cmap, lim, lab in (
        (axes[0], ir, "gray_r", np.nanpercentile(ir, [2, 98]), "$T_{10.8}$ (K)"),
        (axes[1], btd, "cividis", (-1.0, 4.0), "BTD = $T_{10.8}-T_{12.0}$ (K)"),
    ):
        im2 = img[::-1] if fr else img
        im2 = im2[:, ::-1] if fc else im2
        h = ax.imshow(im2, cmap=cmap, vmin=lim[0], vmax=lim[1], interpolation="nearest")
        for col, row in lines:
            ax.plot(
                (nx - 1 - col) if fc else col, (ny - 1 - row) if fr else row, color=CORAL, lw=0.45
            )
        ax.set_xlim(0, nx)
        ax.set_ylim(ny, 0)
        ax.set_xticks([])
        ax.set_yticks([])
        cb = fig.colorbar(h, ax=ax, shrink=0.75, pad=0.02)
        cb.set_label(lab, fontsize=7.5)
        cb.ax.tick_params(labelsize=7)
    axes[0].set_title("IR_108 + coastline (geolocation check)", fontsize=8.5)
    axes[1].set_title("split-window BTD (detector input)", fontsize=8.5)
    fig.text(
        0.01,
        -0.03,
        "Contains EUMETSAT Meteosat-9 (IODC) data, 2026. 15 Jan 2026 00:00 UTC, native grid shown north-up. Coastline: Natural Earth.",
        fontsize=6.5,
        color=MUTED,
    )
    save(fig, "fig3_meteosat.png")


# ── Fig 4: ERA5 at 250 hPa (development month) ────────────────────────────────
def fig_era5() -> None:
    from stratum.physics.thermo import rhi_from_q

    pl = xr.open_zarr(REPO / "data/drive_local/raw/era5/pl/2026-01_days-15-15/data.zarr")
    s = pl.sel(level=250.0, time="2026-01-15T06:00").load()
    T = s["air_temperature"].transpose("latitude", "longitude")
    q = s["specific_humidity"].transpose("latitude", "longitude")
    rhi = rhi_from_q(q.values, T.values, 25000.0)
    fig, axes = plt.subplots(1, 2, figsize=(7.0, 3.6), sharey=True)
    for ax, val, cmap, lim, lab in (
        (axes[0], T.values, "cividis", (215, 240), "air temperature (K)"),
        (axes[1], rhi, "viridis", (0, 1.2), "RHi (fraction)"),
    ):
        h = ax.pcolormesh(
            T.longitude, T.latitude, val, cmap=cmap, vmin=lim[0], vmax=lim[1], shading="auto"
        )
        for ln in coast():
            ax.plot(ln[:, 0], ln[:, 1], color=FG, lw=0.4)
        ax.add_patch(Rectangle((68, 6), 30, 31, fill=False, ec=FG, lw=0.8))
        if ax is axes[1]:
            ax.contour(T.longitude, T.latitude, rhi, levels=[1.0], colors=[CORAL], linewidths=0.9)
        cb = fig.colorbar(h, ax=ax, shrink=0.8, pad=0.02)
        cb.set_label(lab, fontsize=7.5)
        ax.set_xlim(66, 100)
        ax.set_ylim(4, 39)
        ax.set_xlabel("°E")
    axes[0].set_ylabel("°N")
    axes[0].set_title("ERA5 T, 250 hPa", fontsize=8.5)
    axes[1].set_title("ERA5 RHi, 250 hPa (red: RHi = 1)", fontsize=8.5)
    fig.text(
        0.01,
        -0.06,
        "15 Jan 2026 06:00 UTC (development month). Contains modified Copernicus Climate Change Service information 2026.",
        fontsize=6.5,
        color=MUTED,
    )
    save(fig, "fig4_era5.png")


# ── Fig 5: ADS-B cruise traffic density, 1 Jan 2026 ────────────────────────────
def fig_adsb() -> None:
    from stratum.config import corridor_polygon, load_domain
    from stratum.io.adsb_adsbx import read_day

    df = read_day(REPO / "data/dev_drive/raw/adsb/adsbx/2026-01-01")
    df = df[(df["baro_alt_ft"] >= 25000) & ~df["on_ground"]]
    H, xe, ye = np.histogram2d(
        df["lon"], df["lat"], bins=[np.arange(66, 100.01, 0.25), np.arange(4, 39.01, 0.25)]
    )
    fig, ax = plt.subplots(figsize=(6.0, 5.2))
    h = ax.pcolormesh(
        xe,
        ye,
        np.where(H.T > 0, H.T, np.nan),
        cmap="magma",
        norm=matplotlib.colors.LogNorm(vmin=10, vmax=H.max()),
    )
    for ln in coast():
        ax.plot(ln[:, 0], ln[:, 1], color="#6f7f8a", lw=0.5)
    xy = np.asarray(corridor_polygon(load_domain().corridor).exterior.coords)
    ax.add_patch(MplPolygon(xy, closed=True, fill=False, ec=CYAN, lw=1.1))
    ax.add_patch(Rectangle((68, 6), 30, 31, fill=False, ec=FG, lw=1.0))
    cb = fig.colorbar(h, ax=ax, shrink=0.8, pad=0.02)
    cb.set_label("position reports per 0.25° cell (≥ FL250, 24 h)", fontsize=7.5)
    ax.set_xlim(66, 100)
    ax.set_ylim(4, 39)
    ax.set_aspect(1 / np.cos(np.radians(21)))
    ax.set_xlabel("°E")
    ax.set_ylabel("°N")
    fig.text(
        0.01,
        -0.02,
        f"ADS-B Exchange free sample, 1 Jan 2026: {len(df):,} cruise reports ≥ FL250. Aggregated counts only; no individual tracks shown.",
        fontsize=6.5,
        color=MUTED,
    )
    save(fig, "fig5_adsb.png")


# ── Fig 6: pipeline schematic ─────────────────────────────────────────────────
def box(ax, x, y, w, h, title, sub, col):
    ax.add_patch(
        FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.012,rounding_size=0.02",
            fc="#0d0d0d",
            ec=col,
            lw=1.1,
        )
    )
    ax.text(
        x + w / 2,
        y + h * 0.66,
        title,
        ha="center",
        va="center",
        fontsize=8,
        fontweight="bold",
        color=FG,
    )
    ax.text(
        x + w / 2,
        y + h * 0.3,
        sub,
        ha="center",
        va="center",
        fontsize=6.6,
        color=MUTED,
        linespacing=1.25,
    )


def arrow(ax, x0, y0, x1, y1, col=MUTED):
    ax.annotate("", (x1, y1), (x0, y0), arrowprops={"arrowstyle": "-|>", "color": col, "lw": 0.9})


def fig_pipeline() -> None:
    fig, ax = plt.subplots(figsize=(7.2, 3.9))
    ax.set_xlim(-0.01, 1.01)
    ax.set_ylim(0, 1)
    ax.axis("off")
    W, Hh = 0.2, 0.17
    cols = [0.01, 0.27, 0.53, 0.79]
    box(ax, cols[0], 0.74, W, Hh, "ADS-B tracks", "12 free days\n5-s snapshots", CYAN)
    box(ax, cols[0], 0.46, W, Hh, "ERA5", "hourly, 0.25°\n12 + 2 levels", CYAN)
    box(ax, cols[0], 0.18, W, Hh, "Meteosat-9 IODC", "15-min SEVIRI\nIR_108 / IR_120", AMBER)
    box(ax, cols[1], 0.74, W, Hh, "1-min segments", "clean, FL250, fill/split\ntype, mass, η", CYAN)
    box(ax, cols[1], 0.46, W, Hh, "Physics B1–B3", "SAC, RHi ≥ 1\nCoCiP EF (N = 20 MC)", CYAN)
    box(
        ax,
        cols[1],
        0.18,
        W,
        Hh,
        "Detector + labels",
        "BTD line filter\n200 scenes, 2 labellers",
        AMBER,
    )
    box(ax, cols[2], 0.46, W, Hh, "Match + observe", "advect, parallax\ny = 1 / 0 / missing", AMBER)
    box(
        ax,
        cols[2],
        0.74,
        W,
        Hh,
        "Correction model",
        "LightGBM, monotone\n18 locked features",
        GREEN,
    )
    box(ax, cols[3], 0.74, W, Hh, "Evaluation", "BSS vs B3, H1–H4\nseasonal folds", GREEN)
    box(
        ax,
        cols[3],
        0.46,
        W,
        Hh,
        "Altitude ranking",
        "±2,000 / ±4,000 ft\nlower-bound benefit",
        VIOLET,
    )
    box(ax, cols[3], 0.18, W, Hh, "Public outputs", "commercial only\nno raw data", VIOLET)
    for y in (0.825, 0.545):
        arrow(ax, cols[0] + W, y, cols[1], y)
    arrow(ax, cols[0] + W, 0.265, cols[1], 0.265)
    arrow(ax, cols[1] + W / 2, 0.74, cols[1] + W / 2, 0.63)
    arrow(ax, cols[1] + W, 0.545, cols[2], 0.545)
    arrow(ax, cols[1] + W, 0.265, cols[2], 0.50)
    arrow(ax, cols[2] + W / 2, 0.63, cols[2] + W / 2, 0.74)
    arrow(ax, cols[2] + W, 0.825, cols[3], 0.825)
    arrow(ax, cols[3] + W / 2, 0.74, cols[3] + W / 2, 0.63)
    arrow(ax, cols[3] + W / 2, 0.46, cols[3] + W / 2, 0.35)
    ax.text(
        0.5,
        0.03,
        "weather model ≠ satellite observation ≠ learned correction ≠ operational outcome",
        ha="center",
        fontsize=7,
        color=MUTED,
        style="italic",
    )
    save(fig, "fig6_pipeline.png")


# ── Fig 7: observability gate and segment label ───────────────────────────────
def fig_labels() -> None:
    fig, ax = plt.subplots(figsize=(7.0, 2.7))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    box(
        ax,
        0.02,
        0.55,
        0.26,
        0.34,
        "SAC-forming segment",
        "advected with ERA5 winds\nparallax-projected, 20–120 min",
        CYAN,
    )
    box(
        ax,
        0.37,
        0.55,
        0.26,
        0.34,
        "Observable slot?",
        "high cloud < 0.5 · no opaque\ncloud (Q11) · VZA < 60°",
        AMBER,
    )
    box(
        ax,
        0.72,
        0.70,
        0.26,
        0.24,
        "y = 1",
        "matched (≤ 2 px, ≤ 20°)\nat any observable slot",
        GREEN,
    )
    box(ax, 0.72, 0.38, 0.26, 0.24, "y = 0", "≥ 2 observable slots,\nno match", FG)
    box(ax, 0.72, 0.06, 0.26, 0.24, "missing", "otherwise — never\ncoerced to zero", CORAL)
    arrow(ax, 0.28, 0.72, 0.37, 0.72)
    arrow(ax, 0.63, 0.78, 0.72, 0.82, GREEN)
    arrow(ax, 0.63, 0.70, 0.72, 0.50)
    arrow(ax, 0.63, 0.62, 0.72, 0.18, CORAL)
    ax.text(
        0.02,
        0.2,
        "y = 0 means not detected under eligible\nobservation conditions, not “no contrail”.",
        fontsize=7.5,
        color=MUTED,
    )
    save(fig, "fig7_labels.png")


# ── Fig 8: parallax vs viewing zenith angle ───────────────────────────────────
def fig_parallax() -> None:
    vza = np.linspace(0, 70, 300)
    fig, ax = plt.subplots(figsize=(5.8, 3.0))
    for h, col in ((9, MUTED), (11, AMBER), (12.5, CORAL)):
        ax.plot(vza, h * np.tan(np.radians(vza)), color=col, lw=1.4, label=f"contrail at {h:g} km")
    ax.axhspan(0, 2 * 3 / np.cos(np.radians(0)), color=CYAN, alpha=0.08)
    offs = {
        "Mumbai": (30, 14),
        "Bengaluru": (36.5, 16.5),
        "Delhi": (42, 19),
        "Kolkata": (47, 22),
        "Guwahati": (52, 25),
    }
    for name, z in (
        ("Mumbai", 38.3),
        ("Bengaluru", 39.9),
        ("Delhi", 48.1),
        ("Kolkata", 54.5),
        ("Guwahati", 59.1),
    ):
        d = 11 * np.tan(np.radians(z))
        ax.plot(z, d, "o", color=FG, ms=3)
        ax.annotate(
            f"{name} ({z:.0f}°, {d:.0f} km)",
            (z, d),
            offs[name],
            fontsize=6.8,
            color=FG,
            arrowprops={"arrowstyle": "-", "color": MUTED, "lw": 0.4},
        )
    ax.axvline(60, color=CORAL, lw=0.8, ls="--")
    ax.text(60.6, 3, "VZA 60° limit", fontsize=7, color=CORAL, rotation=90)
    ax.text(2, 6.4, "≈ 2 nadir pixels (6 km)", fontsize=7, color=CYAN)
    ax.set_xlabel("satellite viewing zenith angle (°)")
    ax.set_ylabel("apparent displacement (km)")
    ax.set_xlim(0, 70)
    ax.set_ylim(0, 30)
    ax.grid(True, lw=0.3)
    ax.legend(fontsize=7, loc="upper left")
    save(fig, "fig8_parallax.png")


# ── Fig 9: Phase-1 acquisition calendar ───────────────────────────────────────
def fig_calendar() -> None:
    months = pd.period_range("2025-03", "2026-02", freq="M")
    seasons = {
        3: "pre",
        4: "pre",
        5: "pre",
        6: "mon",
        7: "mon",
        8: "mon",
        9: "mon",
        10: "post",
        11: "post",
        12: "win",
        1: "win",
        2: "win",
    }
    scol = {"pre": AMBER, "mon": CYAN, "post": VIOLET, "win": FG}
    fig, ax = plt.subplots(figsize=(7.0, 2.3))
    for i, m in enumerate(months):
        ax.add_patch(Rectangle((i, 2.15), 0.92, 0.6, color=scol[seasons[m.month]], alpha=0.25))
        ax.text(
            i + 0.46, 2.45, m.strftime("%b\n%y"), ha="center", va="center", fontsize=6.6, color=FG
        )
        ax.add_patch(Rectangle((i, 1.25), 0.92, 0.6, color=CYAN, alpha=0.75))
        ax.plot(i + 0.08, 0.55, "o", color=AMBER, ms=5)
        ax.plot(i + 0.08, -0.15, "s", color=GREEN, ms=4.5)
    ax.plot(10 + 12 / 31, -0.15, "s", color=GREEN, ms=4.5)
    ax.plot(10 + 13 / 31, -0.15, "s", color=GREEN, ms=4.5)
    for y, lab in (
        (2.45, "season"),
        (1.55, "ERA5 (all hours)"),
        (0.55, "ADS-B (1st of month)"),
        (-0.15, "Meteosat-9 days"),
    ):
        ax.text(-0.25, y, lab, ha="right", va="center", fontsize=7.5, color=FG)
    ax.text(12.1, 1.55, "36/36 blocks", fontsize=7, color=MUTED, va="center")
    ax.text(12.1, 0.55, "12/12 days", fontsize=7, color=MUTED, va="center")
    ax.text(12.1, -0.15, "14 days, 1,451/1,456 slots", fontsize=7, color=MUTED, va="center")
    ax.set_xlim(-3.6, 14.6)
    ax.set_ylim(-0.6, 2.9)
    ax.axis("off")
    save(fig, "fig9_calendar.png")


if __name__ == "__main__":
    for f in (
        fig_domain,
        fig_sac,
        fig_meteosat,
        fig_era5,
        fig_adsb,
        fig_pipeline,
        fig_labels,
        fig_parallax,
        fig_calendar,
    ):
        f()
        print("ok", f.__name__)
