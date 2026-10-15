"""WMO lapse-rate tropopause from ERA5 temperature profiles (build prompt §4.4).

What it does
------------
The tropopause is the lowest level at which the lapse rate Γ = −dT/dz falls to **≤ 2 K/km**,
provided the average lapse rate between that level and every point within the next **2 km**
above also stays ≤ 2 K/km (WMO 1957). Only levels at or above 500 hPa are searched.

Inputs are temperatures on pressure levels (ERA5 100–500 hPa plus the T-only 50 and 70 hPa
levels). Heights come from the hypsometric equation, integrated upward from the lowest level
(so heights are relative; the distance from a flight to the tropopause uses the same
integration, which cancels the offset). As in Reichler et al. (2003) for gridded data, the
crossing of Γ = 2 K/km is located by linear interpolation of Γ between the half-levels around
it, so the answer is not snapped to a coarse pressure level. Pressure at the tropopause is
interpolated linearly in log-pressure.

Everything is vectorised over any number of profiles: arrays have shape (..., n_levels).
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

R_D = 287.05  # J kg⁻¹ K⁻¹
G0 = 9.80665
GAMMA_MAX = 2.0  # K/km
DEPTH_KM = 2.0
P_MAX_PA = 500e2


def heights_m(p_pa: npt.ArrayLike, T: npt.ArrayLike) -> np.ndarray:
    """Hypsometric heights (m) of each level above the highest-pressure level.

    ``p_pa`` (n_levels,) must be sorted by decreasing pressure (upward); ``T`` (..., n_levels).
    """
    p = np.asarray(p_pa, dtype=float)
    t = np.asarray(T, dtype=float)
    tbar = 0.5 * (t[..., 1:] + t[..., :-1])
    dz = R_D * tbar / G0 * np.log(p[:-1] / p[1:])
    z0 = np.zeros((*t.shape[:-1], 1))
    return np.concatenate([z0, np.cumsum(dz, axis=-1)], axis=-1)


def _interp_along(z: np.ndarray, y: np.ndarray, zq: np.ndarray) -> np.ndarray:
    """Linear interpolation of y(z) at zq, per profile (z increasing along the last axis)."""
    n = z.shape[-1]
    idx = np.clip(np.sum(z <= zq[..., None], axis=-1) - 1, 0, n - 2)
    z0 = np.take_along_axis(z, idx[..., None], -1)[..., 0]
    z1 = np.take_along_axis(z, idx[..., None] + 1, -1)[..., 0]
    y0 = np.take_along_axis(y, idx[..., None], -1)[..., 0]
    y1 = np.take_along_axis(y, idx[..., None] + 1, -1)[..., 0]
    w = np.where(z1 > z0, (zq - z0) / (z1 - z0), 0.0)
    return np.asarray(y0 + w * (y1 - y0))


def wmo_tropopause(
    p_pa: npt.ArrayLike, T: npt.ArrayLike
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tropopause (pressure Pa, height m on the ``heights_m`` scale, level heights m).

    NaN where no level satisfies the definition. ``p_pa`` is any order; it is sorted upward.
    """
    p = np.asarray(p_pa, dtype=float)
    t = np.asarray(T, dtype=float)
    order = np.argsort(-p)  # decreasing pressure = upward
    p, t = p[order], t[..., order]
    z = heights_m(p, t)
    zh = 0.5 * (z[..., 1:] + z[..., :-1])  # half-level heights
    gamma = -(t[..., 1:] - t[..., :-1]) / ((z[..., 1:] - z[..., :-1]) / 1000.0)  # K/km
    shape = t.shape[:-1]
    z_tp = np.full(shape, np.nan)
    found = np.zeros(shape, dtype=bool)
    usable = 0.5 * (p[1:] + p[:-1]) <= P_MAX_PA
    for k in range(gamma.shape[-1]):
        if not usable[k]:
            continue
        cand = (~found) & (gamma[..., k] <= GAMMA_MAX)
        if not cand.any():
            continue
        # where Γ crossed 2 K/km between half-levels k−1 and k, locate the crossing
        if k > 0:
            g0, g1 = gamma[..., k - 1], gamma[..., k]
            with np.errstate(invalid="ignore", divide="ignore"):
                w = np.where(g0 > GAMMA_MAX, (g0 - GAMMA_MAX) / (g0 - g1), 1.0)
            zc = zh[..., k - 1] + np.clip(w, 0, 1) * (zh[..., k] - zh[..., k - 1])
        else:
            zc = zh[..., 0]
        # The 2-km test starts at the bottom of the first layer with Γ ≤ 2 K/km (level k):
        # starting at the interpolated crossing would put it inside a mixed layer whose
        # linear lapse rate is still > 2 K/km. The reported height is the crossing.
        zb, tb = z[..., k], t[..., k]
        tc = tb
        ok = cand.copy()
        top = zb + DEPTH_KM * 1000.0
        for j in range(z.shape[-1]):
            inside = (z[..., j] > zb) & (z[..., j] <= top)
            with np.errstate(invalid="ignore", divide="ignore"):
                avg = (tc - t[..., j]) / ((z[..., j] - zb) / 1000.0)
            ok &= ~inside | (avg <= GAMMA_MAX)
        t_top = _interp_along(z, t, np.minimum(top, z[..., -1]))
        reach = top <= z[..., -1]
        ok &= reach & ((tc - t_top) / DEPTH_KM <= GAMMA_MAX)
        z_tp = np.where(ok, zc, z_tp)
        found |= ok
    lnp = np.broadcast_to(np.log(p), z.shape)
    p_tp = np.where(found, np.exp(_interp_along(z, lnp, np.nan_to_num(z_tp))), np.nan)
    return p_tp, z_tp, z
