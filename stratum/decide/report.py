"""Ranked avoidance lists in the paper's Table 3 form, and the decision-layer summary
(build prompt §7.6.7, §7.8)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.decide import run as dr
from stratum.evaluate.splits import season_of
from stratum.io.meteosat import viewing_zenith_angle

IST = pd.Timedelta(hours=5, minutes=30)


def table3(
    ranked: pd.DataFrame,
    cands: pd.DataFrame,
    seg: pd.DataFrame,
    p_stratum: pd.Series,
    cells: pd.Series,
    bands: list[tuple[float, float]],
    min_examples: int,
) -> pd.DataFrame:
    """One row per flagged portion with every Table 3 field.

    ``seg``: the day's segments_met rows; ``p_stratum``: calibrated P(persistent contrail) per
    segment_id; ``cells``: labelled-example counts per confidence cell (other days only)."""
    if ranked.empty:
        return pd.DataFrame()
    seg = seg.sort_values(["flight_id", "time_start"])
    rows = []
    for r in ranked.itertuples():
        c = cands[cands["portion_id"] == r.portion_id].iloc[0]
        g = seg[seg["flight_id"] == r.flight_id].reset_index(drop=True)
        part = g.iloc[int(c["first"]) : int(c["last"]) + 1]
        t0 = pd.to_datetime(part["time_start"].iloc[0])
        t1 = pd.to_datetime(part["time_end"].iloc[-1])
        conf = confidence(part, cells, bands, min_examples)
        rows.append({
            "portion_id": r.portion_id,
            "flight_id": r.flight_id,
            "commercial": bool(part["commercial"].iloc[0]) if "commercial" in part else None,
            "typecode": part["typecode"].iloc[0] if "typecode" in part else None,
            "start_utc": t0, "end_utc": t1,
            "start_ist": t0.tz_convert(None) + IST if t0.tzinfo else t0 + IST,
            "segments": len(part),
            "planned_fl": round(float(part["alt_ft_mid"].median()) / 100.0),
            "p_persistent_contrail_max": float(p_stratum.reindex(part["segment_id"]).max()),
            "ef_planned_p05_J": getattr(r, "ef_planned_p05", np.nan),
            "ef_planned_p95_J": getattr(r, "ef_planned_p95", np.nan),
            "best_alternative_ft": getattr(r, "best_delta_ft", np.nan),
            "best_alternative_fl": _fl(part, getattr(r, "best_delta_ft", np.nan)),
            "extra_fuel_kg": getattr(r, "extra_fuel_kg", np.nan),
            "extra_co2_kg": getattr(r, "extra_co2_kg", np.nan),
            **{f"net_warming_avoided_h{h}_{q}_kgCO2e": getattr(r, f"net_h{h}_{q}", np.nan)
               for h in (20, 100) for q in ("p05", "p50", "p95")},
            "alert": bool(r.alert),
            "alert_without_fuel_credit": bool(getattr(r, "alert_without_fuel_credit", False)),
            "alternatives_rejected": r.rejected,
            "confidence_note": conf,
            "caveat": "ATC feasibility not modelled",
        })  # fmt: skip
    return pd.DataFrame(rows)


def _fl(part: pd.DataFrame, delta_ft: float) -> int | None:
    if not np.isfinite(delta_ft):
        return None
    return round((float(part["alt_ft_mid"].median()) + delta_ft) / 100.0)


def confidence(
    part: pd.DataFrame, cells: pd.Series, bands: list[tuple[float, float]], min_examples: int
) -> str:
    """'well covered by validation data' if the portion's median segment sits in a cell with
    ≥ N labelled examples (open question 14), else 'extrapolating'."""
    p = part.assign(
        season=season_of(pd.to_datetime(part["time_start"]).dt.month.to_numpy()),
        vza_median=viewing_zenith_angle(
            part["lat_mid"].to_numpy(float), part["lon_mid"].to_numpy(float)
        ),
        night_fraction=(
            (part["local_solar_time_h"] >= 18) | (part["local_solar_time_h"] < 6)
        ).astype(float),
    )
    keys = pd.MultiIndex.from_arrays(dr.cell_keys(p, bands))
    n = cells.reindex(keys).fillna(0).to_numpy()
    top = float(np.median(n)) if len(n) else 0.0
    return "well covered by validation data" if top >= min_examples else "extrapolating"


def summary(days: list[Path]) -> dict[str, Any]:
    tabs = [pd.read_parquet(d / "table3.parquet") for d in days if (d / "table3.parquet").exists()]
    t = (
        pd.concat([x for x in tabs if len(x)], ignore_index=True)
        if any(len(x) for x in tabs)
        else pd.DataFrame()
    )
    if t.empty:
        return {"days": len(days), "portions": 0, "alerts": 0}
    a = t[t["alert"]]
    return {
        "days": len(days),
        "portions": len(t),
        "portions_commercial": int(t["commercial"].fillna(False).sum()),
        "alerts": len(a),
        "alerts_without_fuel_credit": int(t["alert_without_fuel_credit"].sum()),
        "alerts_per_day": {
            str(k): int(v)
            for k, v in a.groupby(a["start_utc"].dt.strftime("%Y-%m-%d")).size().items()
        },
        "alerts_extra_fuel_kg": float(a["extra_fuel_kg"].sum()),
        "alerts_extra_co2_kg": float(a["extra_co2_kg"].sum()),
        "alerts_net_warming_avoided_h20_p50_kgCO2e": float(
            a["net_warming_avoided_h20_p50_kgCO2e"].sum()
        ),
        "alerts_net_warming_avoided_h100_p50_kgCO2e": float(
            a["net_warming_avoided_h100_p50_kgCO2e"].sum()
        ),
        "alerts_net_warming_avoided_h100_p05_kgCO2e": float(
            a["net_warming_avoided_h100_p05_kgCO2e"].sum()
        ),
        "best_alternative_ft": {
            str(k): int(v) for k, v in a["best_alternative_ft"].value_counts().items()
        },
        "confidence": {str(k): int(v) for k, v in t["confidence_note"].value_counts().items()},
    }
