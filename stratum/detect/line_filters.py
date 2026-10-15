"""Oriented matched line filters (build prompt §3.1 step 3; Mannstein et al. 1999 lineage).

Each kernel is a straight segment of length L at angle θ: a narrow positive Gaussian core
with negative flanks either side, zero mean (flat backgrounds give 0) and unit L2 norm. With
unit norm, filtering pure noise of standard deviation 1 gives a response of standard
deviation 1, so the response is a signal-to-noise ratio and thresholds are in noise units.

Angles are in the image's pixel frame: θ = 0 is along +column, increasing toward +row.
"""

from __future__ import annotations

import cv2
import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]


def line_kernel(length_px: int, theta_rad: float, core_sigma: float, flank_px: float) -> Array:
    half = int(np.ceil(length_px / 2 + flank_px + 2 * core_sigma + 1))
    r, c = np.mgrid[-half : half + 1, -half : half + 1].astype(float)
    u = c * np.cos(theta_rad) + r * np.sin(theta_rad)  # along the line
    v = -c * np.sin(theta_rad) + r * np.cos(theta_rad)  # across the line

    def g(d: Array) -> Array:
        out: Array = np.exp(-0.5 * (d / core_sigma) ** 2)
        return out

    across = g(v) - 0.5 * (g(v - flank_px) + g(v + flank_px))
    along = np.clip(length_px / 2 + 0.5 - np.abs(u), 0.0, 1.0)  # box with 1-px soft ends
    k = across * along
    support = (along > 0) & (np.abs(v) <= flank_px + 2 * core_sigma)
    k = np.where(support, k - k[support].mean(), 0.0)
    out: Array = k / np.sqrt((k**2).sum())
    return out


def kernel_bank(
    orientations: int, lengths_px: list[int], core_sigma: float, flank_px: float
) -> list[tuple[float, int, Array]]:
    thetas = np.arange(orientations) * np.pi / orientations
    return [
        (float(t), length, line_kernel(length, float(t), core_sigma, flank_px))
        for length in lengths_px
        for t in thetas
    ]


def line_response(field: Array, bank: list[tuple[float, int, Array]]) -> tuple[Array, Array]:
    """Max response over the bank and the angle (rad, pixel frame) that gave it."""
    f = np.nan_to_num(field, nan=0.0).astype(np.float32)
    best = np.full(f.shape, -np.inf, dtype=np.float32)
    theta = np.zeros(f.shape, dtype=np.float32)
    for t, _length, k in bank:
        r = cv2.filter2D(f, -1, k.astype(np.float32), borderType=cv2.BORDER_REFLECT)
        better = r > best
        best = np.where(better, r, best)
        theta = np.where(better, np.float32(t), theta)
    best[~np.isfinite(field)] = 0.0
    return best.astype(np.float64), theta.astype(np.float64)
