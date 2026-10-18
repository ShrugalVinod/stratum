"""Option (b): a learned RHi scaling factor per season × latitude band (build prompt §7.4).

For each (season, band) cell of the training data, fit ``s`` (RHi_scaled = RHi / s) and a
smoothing width ``τ`` by maximum likelihood of

    y ~ Bernoulli( σ((RHi / s − 1) / τ) · 1[formation] ),

with ``s`` bounded to [0.80, 1.20] (pre-registered search range). Every row of the training
table already satisfies the Schmidt–Appleman formation criterion (Phase 5 candidates), so
1[formation] = 1 here; it is kept as an argument for other inputs.

A held-out season has, by construction, no fitted ``s``. Its segments use the band's ``s`` fitted
on the pooled training seasons (decision recorded 18 Oct 2026, before any validation or test
number). Cells are reported with their row counts and whether ``s`` sits on a bound.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit

Array = npt.NDArray[np.float64]
S_BOUNDS = (0.80, 1.20)
LOG_TAU_BOUNDS = (np.log(1e-3), np.log(2.0))


def prob(rhi: Array, s: float, tau: float, forms: Array | None = None) -> Array:
    p: Array = expit((np.asarray(rhi, float) / s - 1.0) / tau)
    return p if forms is None else p * np.asarray(forms, float)


def _nll(theta: Array, rhi: Array, y: Array) -> float:
    s, tau = theta[0], np.exp(theta[1])
    p = np.clip(prob(rhi, s, tau), 1e-12, 1 - 1e-12)
    return float(-np.sum(y * np.log(p) + (1 - y) * np.log1p(-p)))


def fit(rhi: Array, y: Array) -> dict[str, Any]:
    """ML fit of (s, τ). Several starts; the best bounded L-BFGS-B solution is kept."""
    ok = np.isfinite(rhi) & np.isfinite(y)
    r, t = np.asarray(rhi, float)[ok], np.asarray(y, float)[ok]
    best = None
    for s0 in (0.85, 1.0, 1.15):
        for lt0 in (np.log(0.02), np.log(0.1), np.log(0.5)):
            res = minimize(
                _nll,
                np.array([s0, lt0]),
                args=(r, t),
                method="L-BFGS-B",
                bounds=[S_BOUNDS, LOG_TAU_BOUNDS],
            )
            if best is None or res.fun < best.fun:
                best = res
    assert best is not None
    s, tau = float(best.x[0]), float(np.exp(best.x[1]))
    tol = 1e-3
    return {
        "s": s,
        "tau": tau,
        "n": len(t),
        "pos": int(t.sum()),
        "nll": float(best.fun),
        "s_at_bound": bool(s <= S_BOUNDS[0] + tol or s >= S_BOUNDS[1] - tol),
    }


def band_index(lat: Array, bands: list[tuple[float, float]]) -> np.ndarray:
    """Band per latitude; points outside every band go to the nearest one."""
    lat = np.asarray(lat, float)
    edges = np.array([b[0] for b in bands] + [bands[-1][1]])
    return np.clip(np.searchsorted(edges, lat, side="right") - 1, 0, len(bands) - 1)


def fit_cells(
    t: pd.DataFrame, bands: list[tuple[float, float]], by_season: bool = True
) -> pd.DataFrame:
    """One fit per (season, band) — or per band if ``by_season`` is False."""
    b = band_index(t["lat_mid"].to_numpy(float), bands)
    keys = ["season", "band"] if by_season else ["band"]
    d = t.assign(band=b)
    rows = []
    for k, g in d.groupby(keys):
        k = k if isinstance(k, tuple) else (k,)
        rows.append(
            {
                **dict(zip(keys, k, strict=True)),
                **fit(g["rhi"].to_numpy(float), g["y"].to_numpy(float)),
            }
        )
    out = pd.DataFrame(rows)
    out["band_deg"] = [f"{bands[i][0]:g}–{bands[i][1]:g}°N" for i in out["band"]]
    return out


def predict(t: pd.DataFrame, cells: pd.DataFrame, bands: list[tuple[float, float]]) -> Array:
    """Probability from band-level cells (s, τ per band)."""
    b = band_index(t["lat_mid"].to_numpy(float), bands)
    by = cells.set_index("band")
    if not set(np.unique(b)) <= set(by.index):  # every band has training rows; fail loudly if not
        raise KeyError(f"no scaling cell for bands {sorted(set(np.unique(b)) - set(by.index))}")
    s = by.loc[b, "s"].to_numpy(float)
    tau = by.loc[b, "tau"].to_numpy(float)
    out: Array = expit((t["rhi"].to_numpy(float) / s - 1.0) / tau)
    return out


def lodo_predict(t: pd.DataFrame, bands: list[tuple[float, float]]) -> Array:
    """Leave-one-day-out validation predictions, in the form used at test time (band cells
    fitted on the other days)."""
    out = np.full(len(t), np.nan)
    day = t["day"].to_numpy()
    for d in np.unique(day):
        v = day == d
        cells = fit_cells(t[~v], bands, by_season=False)
        out[v] = predict(t[v], cells, bands)
    return out
