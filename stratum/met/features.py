"""Atmosphere on segments, aircraft performance and SAC flags (build prompt §2.2–2.3).

What it does
------------
For each 1-minute segment (at its midpoint time and position, at the ISA pressure of its mean
barometric altitude), ``build_segments_met`` adds:

* ERA5 at the segment (log-p interpolation): T, q, u, v, ω, cloud ice, cloud fraction,
  geopotential; and T, q, u, v, geopotential on the native ERA5 levels **immediately above
  and below** it;
* RHi and RHw (Murphy–Koop), **vertical RHi gradient** (per km, between the levels above and
  below), **vertical wind shear** (m s⁻¹ per km, same levels), **high-cloud fraction** at and
  above the segment (max over the segment and every level above it),
* **tropopause** pressure and height (WMO, from ERA5 T on 50–500 hPa) and the signed
  **distance to tropopause** (segment geopotential height − tropopause height, m; negative =
  below),
* **true airspeed** (ground velocity from the segment minus ERA5 wind), vertical speed,
  **local solar time** (UTC + lon/15 h) and month, with sin/cos encodings,
* OpenAP **fuel flow** and **η** for the flight's aircraft type and mass (``aircraft.py``),
* the **Schmidt–Appleman** result with that η: T_LM, T_LC, ``forms``, ``persists_raw``
  (RHi ≥ 1), ``temp_margin_K = T_LC − T`` and ``temp_minus_TLM = T − T_LM``.

Segments with no aircraft type keep η at the pre-registered default 0.30 and are flagged.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from stratum.flights import aircraft as ac
from stratum.met.interp import MetGrid, at_level, interp_points
from stratum.physics import thermo
from stratum.physics.sac import schmidt_appleman
from stratum.physics.tropopause import wmo_tropopause
from stratum.physics.units import ft_to_pressure

G0 = 9.80665
ETA_DEFAULT = 0.30  # preregistered.yaml aircraft.eta_default
PL_VARS = [
    "air_temperature",
    "specific_humidity",
    "eastward_wind",
    "northward_wind",
    "lagrangian_tendency_of_air_pressure",
    "specific_cloud_ice_water_content",
    "fraction_of_cloud_cover",
    "geopotential",
]


def tropopause_grid(pl: xr.Dataset, tropo_t: xr.Dataset) -> MetGrid:
    """Tropopause pressure (Pa) and geopotential height (m) per grid cell and hour."""
    t_all = xr.concat([pl["air_temperature"], tropo_t["air_temperature"]], dim="level").sortby(
        "level"
    )
    t_all = t_all.sortby(["time", "latitude", "longitude"])
    arr = t_all.transpose("time", "latitude", "longitude", "level").values.astype(float)
    p_tp, z_rel, _ = wmo_tropopause(t_all["level"].values * 100.0, arr)
    z500 = (
        pl["geopotential"]
        .sel(level=500.0)
        .sortby(["time", "latitude", "longitude"])
        .transpose("time", "latitude", "longitude")
        .values
        / G0
    )
    return MetGrid(
        times_s=t_all["time"].values.astype("datetime64[s]").astype("int64"),
        levels_pa=np.array([1.0, 2.0]),
        lat=t_all["latitude"].values.astype(float),
        lon=t_all["longitude"].values.astype(float),
        fields={"p_tropo_pa": p_tp[:, None], "z_tropo_m": (z500 + z_rel)[:, None]},
    )


def build_segments_met(
    seg: pd.DataFrame, per_flight: pd.DataFrame, pl: MetGrid, tropo: MetGrid
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Return ``seg`` with met features, performance and SAC columns, plus a run summary."""
    extra = [c for c in per_flight.columns if c == "flight_id" or c not in seg.columns]
    s = seg.merge(per_flight[extra], on="flight_id", how="left")
    t_s = s["time_mid"].dt.as_unit("s").astype("int64").to_numpy().astype(float)
    lat, lon = s["lat_mid"].to_numpy(float), s["lon_mid"].to_numpy(float)
    p = np.asarray(ft_to_pressure(s["alt_ft_mid"].to_numpy(float)))
    s["pressure_pa"] = p
    v, info = interp_points(pl, PL_VARS, t_s, lat, lon, p)
    T, q = v["air_temperature"], v["specific_humidity"]
    s["temperature_k"], s["specific_humidity"] = T, q
    s["u_ms"], s["v_ms"] = v["eastward_wind"], v["northward_wind"]
    s["vertical_velocity_pa_s"] = v["lagrangian_tendency_of_air_pressure"]
    s["cloud_ice_water_content"] = v["specific_cloud_ice_water_content"]
    s["cloud_fraction"] = v["fraction_of_cloud_cover"]
    z_seg = v["geopotential"] / G0
    s["geopotential_height_m"] = z_seg
    s["rhi"] = thermo.rhi_from_q(q, T, p)
    s["rhw"] = thermo.rhw_from_q(q, T, p)

    lev_a, lev_b = info["lev_above"], info["lev_below"]
    side: dict[str, dict[str, np.ndarray]] = {}
    for tag, lev in (("above", lev_a), ("below", lev_b)):
        d = {
            n: at_level(pl, n, t_s, lat, lon, lev)
            for n in (
                "air_temperature",
                "specific_humidity",
                "eastward_wind",
                "northward_wind",
                "geopotential",
            )
        }
        p_lev = pl.levels_pa[np.clip(lev, 0, len(pl.levels_pa) - 1)]
        d["rhi"] = thermo.rhi_from_q(d["specific_humidity"], d["air_temperature"], p_lev)
        side[tag] = d
        s[f"rhi_level_{tag}"] = d["rhi"]
        s[f"pressure_level_{tag}_pa"] = p_lev
    dz_km = (side["above"]["geopotential"] - side["below"]["geopotential"]) / G0 / 1000.0
    with np.errstate(invalid="ignore", divide="ignore"):
        s["rhi_vertical_gradient_per_km"] = (side["above"]["rhi"] - side["below"]["rhi"]) / dz_km
        s["vertical_wind_shear_ms_per_km"] = (
            np.hypot(
                side["above"]["eastward_wind"] - side["below"]["eastward_wind"],
                side["above"]["northward_wind"] - side["below"]["northward_wind"],
            )
            / dz_km
        )
    # high-cloud fraction at and above the segment: max of the segment value and every
    # native level with pressure ≤ the segment's
    hc = np.array(s["cloud_fraction"], dtype=float)
    for k, pk in enumerate(pl.levels_pa):
        ck = at_level(pl, "fraction_of_cloud_cover", t_s, lat, lon, np.full(len(s), k))
        hc = np.where(pk <= p, np.fmax(hc, ck), hc)
    s["high_cloud_fraction"] = np.where(np.isfinite(s["cloud_fraction"]), hc, np.nan)

    tp_p = at_level(tropo, "p_tropo_pa", t_s, lat, lon, np.zeros(len(s), int))
    tp_z = at_level(tropo, "z_tropo_m", t_s, lat, lon, np.zeros(len(s), int))
    s["tropopause_pressure_pa"] = tp_p
    s["distance_to_tropopause_m"] = z_seg - tp_z

    # true airspeed: ground velocity (from the segment) minus wind
    gs_ms = s["length_km"].to_numpy(float) * 1000.0 / s["duration_s"].to_numpy(float)
    hdg = np.radians(s["heading_deg"].to_numpy(float))
    ax = gs_ms * np.sin(hdg) - s["u_ms"].to_numpy(float)
    ay = gs_ms * np.cos(hdg) - s["v_ms"].to_numpy(float)
    s["true_airspeed_ms"] = np.hypot(ax, ay)
    # QC flag only (not a filter): airliner cruise TAS is ~200–280 m/s
    s["qc_tas_ok"] = (s["true_airspeed_ms"] >= 100.0) & (s["true_airspeed_ms"] <= 320.0)
    s["vertical_speed_fpm"] = (
        (s["alt_ft_end"] - s["alt_ft_start"]) / s["duration_s"] * 60.0
    ).to_numpy(float)
    hours = (s["time_mid"].dt.hour + s["time_mid"].dt.minute / 60.0).to_numpy(float)
    lst = (hours + lon / 15.0) % 24.0
    month = s["time_mid"].dt.month.to_numpy()
    s["local_solar_time_h"] = lst
    s["month"] = month
    s["local_solar_time_sin"], s["local_solar_time_cos"] = (
        np.sin(2 * np.pi * lst / 24),
        np.cos(2 * np.pi * lst / 24),
    )
    s["month_sin"], s["month_cos"] = np.sin(2 * np.pi * month / 12), np.cos(2 * np.pi * month / 12)

    # aircraft performance and η, per OpenAP type
    s["fuel_flow_kg_s"] = np.nan
    s["engine_efficiency"] = ETA_DEFAULT
    s["eta_source"] = "default_no_type"
    s["eta_clipped"] = False
    ok_perf = s["openap_type"].notna() & np.isfinite(s["true_airspeed_ms"])
    for oa, idx in s[ok_perf].groupby("openap_type").groups.items():
        r = s.loc[idx]
        perf = ac.performance(
            str(oa),
            mass_kg=r["aircraft_mass_kg"].to_numpy(float),
            tas_ms=r["true_airspeed_ms"].to_numpy(float),
            alt_ft=r["alt_ft_mid"].to_numpy(float),
            vs_fpm=r["vertical_speed_fpm"].to_numpy(float),
        )
        s.loc[idx, "fuel_flow_kg_s"] = perf["fuel_flow_kg_s"]
        s.loc[idx, "engine_efficiency"] = perf["engine_efficiency"]
        s.loc[idx, "eta_clipped"] = perf["eta_clipped"]
        s.loc[idx, "eta_source"] = "openap"
    s["eta_clipped"] = s["eta_clipped"].astype(bool)

    sac = schmidt_appleman(T, s["rhi"].to_numpy(float), p, s["engine_efficiency"].to_numpy(float))
    s["G"], s["T_LM"], s["T_LC"] = sac.G, sac.T_LM, sac.T_LC
    s["forms"], s["persists_raw"] = sac.forms, sac.persists
    s["temp_margin_K"], s["temp_minus_TLM"] = sac.temp_margin_K, sac.temp_minus_TLM

    met_ok = np.isfinite(T)
    summary = {
        "segments": len(s),
        "flights": int(s["flight_id"].nunique()),
        "met_out_of_domain": int((~met_ok).sum()),
        "tropopause_missing": int((~np.isfinite(tp_z)).sum()),
        "eta_default_no_type": int((s["eta_source"] == "default_no_type").sum()),
        "eta_clipped": int(s["eta_clipped"].sum()),
        "qc_tas_outside_100_320_ms": int((met_ok & ~s["qc_tas_ok"].to_numpy()).sum()),
        "share_forms": float(np.mean(sac.forms[met_ok])) if met_ok.any() else None,
        "share_persists_raw": float(np.mean(sac.persists[met_ok])) if met_ok.any() else None,
    }
    return s, summary
