"""CoCiP on STRATUM flights, per humidity scaling (build prompt §2.3, §4.6).

What it does
------------
* Builds one pycontrails ``Flight`` per flight piece from the segment table: waypoints are
  the segment start points plus the last end point, carrying OpenAP **fuel flow**, **η**
  (``engine_efficiency``), **aircraft mass** (0.80 MTOW) and wingspan, and the ICAO type as
  ``aircraft_type`` so pycontrails' emissions model can look up the engine's **nvPM number
  emission index** (ICAO engine databank). The engine count comes from OpenAP; when the
  databank has no engine for the type, pycontrails uses its constant default nvPM EI
  (10¹⁵ kg⁻¹) and ``engine_uid_used`` is empty for that flight (counted in the summary).
* Runs CoCiP with one of the pre-registered humidity scalings (library implementations; not
  re-implemented):

  ========  ===============================================  ===========================
  B1 raw    ``ConstantHumidityScaling(rhi_adj=1.0)``           RHi unchanged
  B2        ``ConstantHumidityScaling(rhi_adj=0.95)``          RHi → RHi / 0.95
  B3        ``ExponentialBoostLatitudeCorrectionHumidityScaling()``  Teoh et al. latitude fit
  ========  ===============================================  ===========================

* **Uncertainty**: ``members`` extra runs with ``CocipUncertaintyParams(seed=…)`` (wake
  vortex depth, sedimentation, nvPM factor, SW/LW radiative factors, ice habits; never the
  humidity scaling). Per segment we keep the central EF and its 5th/50th/95th percentiles.
  N = 20 (open question 12, settled 2026-10-15).
* Outputs per segment (``segment_id`` = flight piece + waypoint index): SAC flag, CoCiP
  initial persistence, contrail age, width, optical-depth proxy, SW/LW/net RF, EF; and the
  contrail evolution table (positions at each CoCiP time step) for Phase 5 advection checks.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

SCALINGS = ("B1", "B2", "B3")
SEGMENT_OUT_COLS = [
    "sac",
    "persistent_1",
    "contrail_age",
    "width",
    "iwc_1",
    "rf_sw_mean",
    "rf_lw_mean",
    "rf_net_mean",
    "ef",
    "nvpm_ei_n",
    "engine_uid_used",
]


def humidity_scaling(name: str) -> Any:
    """The pycontrails humidity-scaling object for baseline B1, B2 or B3."""
    from pycontrails.models.humidity_scaling import (
        ConstantHumidityScaling,
        ExponentialBoostLatitudeCorrectionHumidityScaling,
    )

    if name == "B1":
        return ConstantHumidityScaling(rhi_adj=1.0)
    if name == "B2":
        return ConstantHumidityScaling(rhi_adj=0.95)
    if name == "B3":
        return ExponentialBoostLatitudeCorrectionHumidityScaling()
    raise ValueError(f"unknown scaling {name!r}; expected one of {SCALINGS}")


def segments_to_flights(seg: pd.DataFrame) -> list[Any]:
    """One pycontrails Flight per flight piece (needs the segments_met columns)."""
    from pycontrails import Flight

    flights = []
    for fid, g in seg.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        if g["openap_type"].isna().all() or len(g) < 2:
            continue
        last = g.iloc[[-1]]
        lon = np.append(g["lon_start"].to_numpy(), last["lon_end"].to_numpy())
        lat = np.append(g["lat_start"].to_numpy(), last["lat_end"].to_numpy())
        alt = np.append(g["alt_ft_start"].to_numpy(), last["alt_ft_end"].to_numpy())
        t = np.append(
            g["time_start"].dt.tz_localize(None).to_numpy(),
            last["time_end"].dt.tz_localize(None).to_numpy(),
        )

        def ext(col: str, g: pd.DataFrame = g) -> np.ndarray:
            v = g[col].to_numpy(float)
            return np.append(v, v[-1])

        fl = Flight(
            longitude=lon,
            latitude=lat,
            altitude_ft=alt,
            time=t,
            fuel_flow=ext("fuel_flow_kg_s"),
            engine_efficiency=ext("engine_efficiency"),
            aircraft_mass=ext("aircraft_mass_kg"),
            flight_id=str(fid),
            aircraft_type=str(g["typecode"].iloc[0]),
            wingspan=float(g["wingspan_m"].iloc[0]),
            n_engine=int(g["n_engines"].iloc[0]) if "n_engines" in g else 2,
        )
        flights.append(fl)
    return flights


def _frames(out: Any) -> pd.DataFrame:
    parts = []
    for o in out if isinstance(out, list) else [out]:
        d = o.dataframe.copy()
        d.attrs = {}
        d["flight_id"] = o.attrs["flight_id"]
        # None → pycontrails used its constant default nvPM EI (engine not in the ICAO EDB)
        d["engine_uid_used"] = o.attrs.get("engine_uid_used")
        parts.append(d)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


@dataclass
class CocipResult:
    segments: pd.DataFrame  # one row per waypoint/segment, central run + EF percentiles
    contrail: pd.DataFrame  # evolution table of the central run
    summary: dict[str, Any]


def run(
    flights: list[Any],
    met: Any,
    rad: Any,
    scaling: str,
    members: int = 20,
    seed: int = 20261013,
    max_age_h: float = 24.0,
) -> CocipResult:
    """Central CoCiP run plus ``members`` Monte Carlo runs for one humidity scaling."""
    from pycontrails.models.cocip import Cocip, CocipUncertaintyParams

    warnings.filterwarnings("ignore", module="pycontrails")
    common = {
        "met": met,
        "rad": rad,
        "humidity_scaling": humidity_scaling(scaling),
        "max_age": np.timedelta64(int(max_age_h * 3600), "s"),
    }
    central = Cocip(**common)
    df = _frames(central.eval(source=flights))
    contrail = central.contrail.copy() if central.contrail is not None else pd.DataFrame()
    # waypoint i starts segment i; the extra last waypoint ends the last segment (dropped)
    n_seg = {fl.attrs["flight_id"]: len(fl) - 1 for fl in flights}
    df = df[df["waypoint"] < df["flight_id"].map(n_seg)].reset_index(drop=True)
    df["segment_id"] = df["flight_id"] + "_" + df["waypoint"].astype(int).map("{:04d}".format)
    efs = []
    for i in range(members):
        params = CocipUncertaintyParams(seed=seed + i).as_dict()
        mc = Cocip(**common, params=params)
        d = _frames(mc.eval(source=flights))
        d = d[d["waypoint"] < d["flight_id"].map(n_seg)]
        efs.append(d["ef"].to_numpy(float))
    keep = ["segment_id", "flight_id", *[c for c in SEGMENT_OUT_COLS if c in df]]
    seg = df[keep].copy()
    seg["scaling"] = scaling
    if efs:
        ens = np.vstack(efs)
        seg["ef_p05"], seg["ef_p50"], seg["ef_p95"] = np.nanpercentile(ens, [5, 50, 95], axis=0)
        seg["members"] = members
    summary = _summary(seg, contrail, met)
    return CocipResult(seg.reset_index(drop=True), contrail, summary)


def _summary(seg: pd.DataFrame, contrail: pd.DataFrame, met: Any) -> dict[str, Any]:
    ef = seg["ef"].fillna(0.0)
    out: dict[str, Any] = {
        "waypoints": len(seg),
        "share_sac": float(seg["sac"].fillna(0).astype(bool).mean()) if "sac" in seg else None,
        "share_persistent_1": float(seg["persistent_1"].fillna(0).astype(bool).mean())
        if "persistent_1" in seg
        else None,
        "ef_total_J": float(ef.sum()),
        "ef_positive_J": float(ef[ef > 0].sum()),
        "ef_negative_J": float(ef[ef < 0].sum()),
        "contrail_rows": len(contrail),
        "flights_default_nvpm_no_engine": int(
            seg.groupby("flight_id")["engine_uid_used"].first().isna().sum()
        )
        if "engine_uid_used" in seg
        else None,
    }
    if len(contrail):
        # contrails that end up at the edge of the met box (build prompt Phase 1 note)
        lon0, lon1 = float(met.data["longitude"].min()), float(met.data["longitude"].max())
        lat0, lat1 = float(met.data["latitude"].min()), float(met.data["latitude"].max())
        last = contrail.sort_values("time").groupby(["flight_id", "waypoint"]).tail(1)
        edge = (
            (last["longitude"] <= lon0 + 0.5)
            | (last["longitude"] >= lon1 - 0.5)
            | (last["latitude"] <= lat0 + 0.5)
            | (last["latitude"] >= lat1 - 0.5)
        )
        out["contrails"] = len(last)
        out["contrails_ending_at_box_edge"] = int(edge.sum())
    return out
