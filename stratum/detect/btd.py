"""Background removal and noise normalisation of BTD and T12.0 (build prompt §3.1 step 2).

A contrail is a narrow line that is a few tenths of a kelvin brighter in BTD = T10.8 − T12.0
and colder in T12.0 than the air around it. Large-scale structure (land/sea, deserts, cloud
fields) varies over tens of pixels, so we subtract a local median background and divide by a
local robust noise estimate. The result is in "noise units": 3 means 3 times the local noise.

The median is taken on a 3× downsampled image and upsampled again. That is ~50× faster than a
full-resolution median and makes no difference to features 1–3 px wide.
"""

from __future__ import annotations

import cv2
import numpy as np
import numpy.typing as npt
from scipy.ndimage import median_filter

Array = npt.NDArray[np.float64]
MAD_TO_STD = 1.2533  # mean |x| → std for a Gaussian
DOWN = 3


def background(field: Array, window_px: int) -> Array:
    """Local median background; NaNs are filled with the image median first."""
    f = np.where(np.isfinite(field), field, np.nanmedian(field)).astype(np.float32)
    ny, nx = f.shape
    small = cv2.resize(f, (nx // DOWN, ny // DOWN), interpolation=cv2.INTER_AREA)
    k = max(3, (window_px // DOWN) | 1)
    bg_small = median_filter(small, size=k, mode="nearest")
    out: Array = np.asarray(
        cv2.resize(bg_small, (nx, ny), interpolation=cv2.INTER_LINEAR), dtype=np.float64
    )
    return out


def local_noise(anomaly: Array, window_px: int) -> Array:
    """Robust local standard deviation: box mean of |anomaly| × 1.2533 (floored)."""
    a = np.where(np.isfinite(anomaly), np.abs(anomaly), 0.0).astype(np.float32)
    s = cv2.blur(a, (window_px, window_px), borderType=cv2.BORDER_REFLECT) * MAD_TO_STD
    floor = max(float(np.nanmedian(s)) * 0.25, 1e-3)
    return np.maximum(s.astype(np.float64), floor)


def normalise(field: Array, bg_px: int, noise_px: int) -> tuple[Array, Array]:
    """Return (anomaly in field units, anomaly in noise units). NaN stays NaN."""
    anomaly = field - background(field, bg_px)
    return anomaly, anomaly / local_noise(anomaly, noise_px)


def contrail_field(
    t108: Array, t120: Array, bg_px: int, noise_px: int, t120_weight: float
) -> dict[str, Array]:
    """Normalised BTD plus the (weighted) cold T12.0 anomaly, re-normalised to noise units."""
    btd = t108 - t120
    btd_anom, n_btd = normalise(btd, bg_px, noise_px)
    t120_anom, n_t120 = normalise(t120, bg_px, noise_px)
    t108_anom = t108 - background(t108, bg_px)
    combined = n_btd + t120_weight * (-n_t120)  # contrails are colder in T12.0
    _, n_combined = normalise(combined, bg_px, noise_px)
    return {
        "btd": btd,
        "btd_anomaly": btd_anom,
        "t108_anomaly": t108_anom,
        "t120_anomaly": t120_anom,
        "field": n_combined,
    }
