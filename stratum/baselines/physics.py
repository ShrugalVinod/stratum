"""Baselines B1–B3: will a segment make a persistent contrail? (paper §6.1; build §6.3).

All three are the Schmidt–Appleman criterion followed by RHi ≥ 1, on the segment's own ERA5
values (``segments_met``: T, p, RHi, η per aircraft type). They differ only in how ERA5's
humidity is corrected first:

* **B1 raw ERA5**: no correction (``rhi``) → the stored ``persists_raw`` flag.
* **B2 constant scaling**: RHi ÷ 0.95 (pre-registered ``baselines.B2.constant_scaling_divisor``;
  Teoh et al. 2024).
* **B3 latitude-dependent correction**: ``pycontrails``'
  ``ExponentialBoostLatitudeCorrectionHumidityScaling`` (Teoh et al. 2022, 2024): RHi ÷ a
  latitude-dependent factor, then a boost of supersaturated values, capped at the physical
  maximum. pycontrails returns a corrected humidity, not a probability, so B3 is 0/1 here.

The corrected humidity changes both the SAC (via RHw) and the persistence test, so the SAC is
recomputed with it. Outputs are 0/1 floats (binary baselines, build prompt §6.1).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.physics.sac import schmidt_appleman
from stratum.physics.thermo import rhi_from_q

Array = npt.NDArray[np.float64]


def _eta(seg: pd.DataFrame) -> Array:
    eta = seg["engine_efficiency"].to_numpy(float) if "engine_efficiency" in seg else None
    return np.where(np.isfinite(eta), eta, 0.30) if eta is not None else np.full(len(seg), 0.30)


def _persists(T: Array, rhi: Array, p: Array, eta: Array) -> Array:
    r = schmidt_appleman(T, rhi, p, eta)
    out: Array = np.where(np.isfinite(T) & np.isfinite(rhi), r.persists.astype(float), np.nan)
    return out


def b1(seg: pd.DataFrame) -> Array:
    return _persists(*_inputs(seg), _eta(seg))


def b2(seg: pd.DataFrame, divisor: float = 0.95) -> Array:
    T, rhi, p = _inputs(seg)
    return _persists(T, rhi / divisor, p, _eta(seg))


def b3_rhi(seg: pd.DataFrame) -> Array:
    """RHi after pycontrails' latitude correction (ExponentialBoostLatitudeCorrection)."""
    from pycontrails.models.humidity_scaling import (
        ExponentialBoostLatitudeCorrectionHumidityScaling,
    )

    T, _, p = _inputs(seg)
    q = seg["specific_humidity"].to_numpy(float).copy()
    lat = seg["lat_mid"].to_numpy(float)
    # ERA5 on pressure levels (same setting as the Phase 2 CoCiP B3 runs)
    sc = ExponentialBoostLatitudeCorrectionHumidityScaling(level_type="pressure")
    kw: dict[str, Any] = {
        "q_method": sc.params["interpolation_q_method"],
        "level_type": sc.params["level_type"],
    }
    ok = np.isfinite(T) & np.isfinite(q) & np.isfinite(p) & np.isfinite(lat)
    out: Array = np.full(len(seg), np.nan)
    if ok.any():
        kw["latitude"] = lat[ok]
        _, rhi = sc.scale(q[ok], T[ok].copy(), p[ok].copy(), **kw)
        out[ok] = rhi
    return out


def b3(seg: pd.DataFrame) -> Array:
    T, _, p = _inputs(seg)
    return _persists(T, b3_rhi(seg), p, _eta(seg))


def _inputs(seg: pd.DataFrame) -> tuple[Array, Array, Array]:
    T = seg["temperature_k"].to_numpy(float)
    p = seg["pressure_pa"].to_numpy(float)
    if "rhi" in seg:
        rhi = seg["rhi"].to_numpy(float)
    else:
        rhi = rhi_from_q(seg["specific_humidity"].to_numpy(float), T, p)
    return T, rhi, p
