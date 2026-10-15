"""Synthetic Meteosat-like scenes with planted contrail lines (build prompt §3.1 tests)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]
NOISE_K = 0.12  # per-channel noise; BTD noise = √2 × this


@dataclass
class Truth:
    rows: Array  # dense points along the planted line
    cols: Array
    angle_rad: float  # pixel frame, period π


def scene(n: int = 256, seed: int = 0) -> tuple[Array, Array, np.random.Generator]:
    rng = np.random.default_rng(seed)
    r, c = np.mgrid[0:n, 0:n].astype(float)
    t108 = 285.0 + 4.0 * np.sin(r / 60.0) + 3.0 * np.cos(c / 45.0)  # smooth large-scale field
    t120 = t108 - 0.8 - 0.4 * np.sin((r + c) / 80.0)
    t108 = t108 + rng.normal(0, NOISE_K, (n, n))
    t120 = t120 + rng.normal(0, NOISE_K, (n, n))
    return t108, t120, rng


def plant_line(
    t108: Array,
    t120: Array,
    r0: float,
    c0: float,
    angle_rad: float,
    length: float,
    snr: float,
    curvature: float = 0.0,
    width_sigma: float = 0.7,
) -> Truth:
    """Add a contrail: BTD +snr×σ_BTD on its axis (T10.8 −0.5 A, T12.0 −1.5 A)."""
    amp = snr * NOISE_K * np.sqrt(2.0)
    t = np.linspace(-length / 2, length / 2, int(length * 4))
    s = curvature * (t**2) / length  # slight bow
    rows = r0 + t * np.sin(angle_rad) + s * np.cos(angle_rad)
    cols = c0 + t * np.cos(angle_rad) - s * np.sin(angle_rad)
    n = t108.shape[0]
    rr, cc = np.mgrid[0:n, 0:n].astype(float)
    d2 = np.full((n, n), np.inf)
    for pr, pc in zip(rows[::2], cols[::2], strict=True):
        d2 = np.minimum(d2, (rr - pr) ** 2 + (cc - pc) ** 2)
    prof = amp * np.exp(-0.5 * d2 / width_sigma**2)
    t108 -= 0.5 * prof
    t120 -= 1.5 * prof
    return Truth(rows, cols, angle_rad % np.pi)


def plant_blob(t108: Array, t120: Array, r0: float, c0: float, radius: float, amp: float) -> None:
    """Cirrus-like patch: broad, irregular BTD bump (should not be detected)."""
    n = t108.shape[0]
    rr, cc = np.mgrid[0:n, 0:n].astype(float)
    g = np.exp(-0.5 * (((rr - r0) / radius) ** 2 + ((cc - c0) / (1.4 * radius)) ** 2))
    t108 -= 1.0 * amp * g
    t120 -= 2.0 * amp * g


def grid(n: int = 256) -> tuple[Array, Array, Array]:
    r, c = np.mgrid[0:n, 0:n].astype(float)
    lat = 20.0 - r * 0.03
    lon = 75.0 + c * 0.03
    return lat, lon, np.full((n, n), 40.0)


def matches(truth: Truth, poly_row: Array, poly_col: Array, tol_px: float = 2.0) -> bool:
    """Same rule as the Phase 5 matching test: within 2 px and 20° of the true line."""
    pr, pc = np.asarray(poly_row), np.asarray(poly_col)
    dense_r = np.interp(np.linspace(0, len(pr) - 1, 50), np.arange(len(pr)), pr)
    dense_c = np.interp(np.linspace(0, len(pc) - 1, 50), np.arange(len(pc)), pc)
    d = np.sqrt(
        (dense_r[:, None] - truth.rows[None, :]) ** 2
        + (dense_c[:, None] - truth.cols[None, :]) ** 2
    ).min(axis=1)
    ang = np.arctan2(pr[-1] - pr[0], pc[-1] - pc[0]) % np.pi
    dang = abs((ang - truth.angle_rad + np.pi / 2) % np.pi - np.pi / 2)
    return bool(np.median(d) <= tol_px and np.degrees(dang) <= 20.0)
