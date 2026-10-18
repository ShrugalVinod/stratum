"""H3 and H4 on corrected energy forcing (build prompt §7.7; paper Table 5).

Population: every cruise segment (≥ FL250) in the study domain on the held-out days, with its
corrected CoCiP EF (central run). Distances are segment ground lengths.

* **H3**: sort segments by positive EF, largest first; the smallest share of cruise flight
  distance that carries ≥ 80 % of total positive EF. **Supported iff ≤ 10 %.** The day-bootstrap
  interval is descriptive (pre-registered). Lorenz-style concentration curve.
* **H4**: night = 18:00–06:00 local solar time. Statistic = night share of positive EF − night
  share of flight distance. **Supported iff the lower 95 % bound > 0** (day bootstrap).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.evaluate.bootstrap import count_matrix, summarise

Array = npt.NDArray[np.float64]
H3_EF_SHARE = 0.80
H3_MAX_DISTANCE_SHARE = 0.10


def is_night(lst_h: npt.ArrayLike, night: tuple[float, float] = (18.0, 6.0)) -> np.ndarray:
    h = np.mod(np.asarray(lst_h, float), 24.0)
    start, end = night
    out: np.ndarray = (h >= start) | (h < end)
    return out


def _share_for(ef_sorted: Array, len_sorted: Array, total_len: float, q: float) -> float:
    """Distance share of the top segments carrying fraction ``q`` of positive EF."""
    c = np.cumsum(ef_sorted)
    if c.size == 0 or c[-1] <= 0 or total_len <= 0:
        return float("nan")
    k = int(np.searchsorted(c, q * c[-1], side="left"))
    return float(np.sum(len_sorted[: k + 1]) / total_len)


def h3(seg: pd.DataFrame, n: int, seed: int, level: float = 0.95) -> dict[str, Any]:
    ef = seg["ef"].to_numpy(float)
    ln = seg["length_km"].to_numpy(float)
    day = seg["day"].to_numpy()
    days, di = np.unique(day, return_inverse=True)
    pos = np.isfinite(ef) & (ef > 0)
    order = np.flatnonzero(pos)[np.argsort(-ef[pos], kind="stable")]
    ef_o, len_o, di_o = ef[order], ln[order], di[order]
    len_day = np.bincount(di, weights=np.nan_to_num(ln), minlength=len(days))
    point = _share_for(ef_o, len_o, float(len_day.sum()), H3_EF_SHARE)
    w = count_matrix(len(days), n, seed)
    boot = np.empty(n)
    for i in range(n):
        wi = w[i][di_o]
        boot[i] = _share_for(ef_o * wi, len_o * wi, float(w[i] @ len_day), H3_EF_SHARE)
    r = summarise(point, boot, level)
    return {
        "statistic": "share of cruise distance carrying ≥ 80 % of positive EF",
        "segments": len(seg),
        "segments_positive_ef": int(pos.sum()),
        "days": len(days),
        "distance_km": float(len_day.sum()),
        "positive_ef_J": float(ef[pos].sum()),
        "share": r,
        "supported": bool(np.isfinite(point) and point <= H3_MAX_DISTANCE_SHARE),
        "curve": lorenz(ef_o, len_o, float(len_day.sum())),
    }


def lorenz(
    ef_sorted: Array, len_sorted: Array, total_len: float, points: int = 200
) -> dict[str, list[float]]:
    """Cumulative share of positive EF against cumulative share of distance (largest EF first)."""
    if ef_sorted.size == 0:
        return {"distance_share": [0.0], "ef_share": [0.0]}
    x = np.concatenate([[0.0], np.cumsum(len_sorted) / total_len])
    y = np.concatenate([[0.0], np.cumsum(ef_sorted) / ef_sorted.sum()])
    k = np.unique(np.linspace(0, len(x) - 1, min(points, len(x))).astype(int))
    return {
        "distance_share": [float(v) for v in x[k]] + [1.0],
        "ef_share": [float(v) for v in y[k]] + [1.0],
    }


def h4(
    seg: pd.DataFrame,
    n: int,
    seed: int,
    level: float = 0.95,
    night: tuple[float, float] = (18.0, 6.0),
) -> dict[str, Any]:
    ef = seg["ef"].to_numpy(float)
    pos_ef = np.where(np.isfinite(ef) & (ef > 0), ef, 0.0)
    ln = np.nan_to_num(seg["length_km"].to_numpy(float))
    nt = is_night(seg["local_solar_time_h"].to_numpy(float), night)
    days, di = np.unique(seg["day"].to_numpy(), return_inverse=True)

    def sums(v: Array) -> Array:
        out: Array = np.bincount(di, weights=v, minlength=len(days)).astype(float)
        return out

    s = np.vstack([sums(pos_ef * nt), sums(pos_ef), sums(ln * nt), sums(ln)])  # 4 × days

    def stat(m: Array) -> Array:
        with np.errstate(invalid="ignore", divide="ignore"):
            out: Array = m[0] / m[1] - m[2] / m[3]
        return out

    point = float(stat(s.sum(axis=1)))
    w = count_matrix(len(days), n, seed)
    boot = stat((w @ s.T).T)
    r = summarise(point, boot, level)
    tot = s.sum(axis=1)
    return {
        "statistic": "night share of positive EF − night share of flight distance",
        "night_lst": list(night),
        "night_share_positive_ef": float(tot[0] / tot[1]) if tot[1] else float("nan"),
        "night_share_distance": float(tot[2] / tot[3]) if tot[3] else float("nan"),
        "difference": r,
        "supported": bool(np.isfinite(r["lo"]) and r["lo"] > 0),
        "days": len(days),
    }
