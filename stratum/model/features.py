"""Correction-model features (paper §4.6; build prompt §7.2), exactly the pre-registered set.

``FEATURES`` maps each name in ``preregistered.yaml: correction_model.features`` to its column in
``interim/segments_met`` (built in Phase 2, ``stratum/met/features.py``). Everything comes from
ERA5 and the flight position/time: no detector output, no CoCiP output and nothing computed with
labels, so no feature can leak the label (§7.1).

``attach(root, table)`` adds the feature columns to the Phase 6 evaluation table (one row per
labelled segment) without rebuilding it.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

# pre-registered name → segments_met column, unit, why it might matter (docs/methods/features.md)
FEATURES: dict[str, tuple[str, str, str]] = {
    "rhi_at_level": ("rhi", "1", "ice supersaturation (RHi ≥ 1) is what lets a contrail persist"),
    "rhi_level_above": (
        "rhi_level_above",
        "1",
        "a moist layer just above/below means the ISSR may be thicker or misplaced vertically",
    ),
    "rhi_level_below": ("rhi_level_below", "1", "as above, for the level below"),
    "rhi_vertical_gradient": (
        "rhi_vertical_gradient_per_km",
        "km⁻¹",
        "sharp humidity edges are where ERA5's vertical resolution misses thin ISSRs",
    ),
    "temperature": ("temperature_k", "K", "colder air favours formation and ice growth"),
    "temp_minus_TLM": (
        "temp_minus_TLM",
        "K",
        "distance from the Schmidt–Appleman threshold: warmer than T_LM, no contrail",
    ),
    "pressure": ("pressure_pa", "Pa", "flight level; ERA5 humidity bias depends on altitude"),
    "cloud_ice_water_content": (
        "cloud_ice_water_content",
        "kg kg⁻¹",
        "natural cirrus already present: humid air, but contrails harder to see",
    ),
    "high_cloud_fraction": (
        "high_cloud_fraction",
        "1",
        "ERA5 cirrus at and above the level: supersaturation without a visible contrast",
    ),
    "vertical_velocity": (
        "vertical_velocity_pa_s",
        "Pa s⁻¹",
        "rising air cools and moistens, creating ISSRs ERA5 may underplay",
    ),
    "vertical_wind_shear": (
        "vertical_wind_shear_ms_per_km",
        "m s⁻¹ km⁻¹",
        "shear spreads contrails into wider, more visible cirrus",
    ),
    "distance_to_tropopause_wmo": (
        "distance_to_tropopause_m",
        "m",
        "ISSRs cluster just below the tropopause; ERA5 is driest there",
    ),
    "latitude": ("lat_mid", "°N", "tropical vs subtropical regime"),
    "longitude": ("lon_mid", "°E", "west/east India (sea vs land, monsoon onset)"),
    "month_sin": ("month_sin", "1", "season, encoded cyclically"),
    "month_cos": ("month_cos", "1", "season, encoded cyclically"),
    "local_solar_time_sin": (
        "local_solar_time_sin",
        "1",
        "day/night: detection and humidity both vary with the diurnal cycle",
    ),
    "local_solar_time_cos": ("local_solar_time_cos", "1", "day/night, encoded cyclically"),
}


def columns(names: list[str]) -> list[str]:
    """segments_met columns for the pre-registered feature names (order kept)."""
    missing = [n for n in names if n not in FEATURES]
    if missing:
        raise KeyError(f"no column mapping for pre-registered features {missing}")
    return [FEATURES[n][0] for n in names]


def monotone_vector(names: list[str], monotone: dict[str, str]) -> list[int]:
    """LightGBM ``monotone_constraints``: +1 increasing, −1 decreasing, 0 free (per feature)."""
    sign = {"increasing": 1, "decreasing": -1}
    unknown = set(monotone) - set(names)
    if unknown:
        raise KeyError(f"monotone constraint on non-features {sorted(unknown)}")
    return [sign.get(monotone.get(n, ""), 0) for n in names]


def attach(root: Path, table: pd.DataFrame, names: list[str]) -> pd.DataFrame:
    """Add the feature columns (named by ``columns(names)``) to the evaluation table."""
    cols = columns(names)
    need = [c for c in cols if c not in table.columns]
    if not need:
        return table
    parts = []
    for day in sorted(table["day"].unique()):
        f = root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
        parts.append(pd.read_parquet(f, columns=["segment_id", *need]))
    feats = pd.concat(parts, ignore_index=True).drop_duplicates("segment_id")
    out = table.merge(feats, on="segment_id", how="left")
    if len(out) != len(table):
        raise AssertionError("feature join changed the number of rows")
    return out


def matrix(table: pd.DataFrame, names: list[str]) -> np.ndarray:
    out: np.ndarray = table[columns(names)].to_numpy(float)
    return out


def markdown_table(names: list[str]) -> str:
    rows = ["| feature | column | unit | why it might matter |", "|---|---|---|---|"]
    for n in names:
        col, unit, why = FEATURES[n]
        rows.append(f"| {n} | `{col}` | {unit} | {why} |")
    return "\n".join(rows) + "\n"
