"""Avoidance alternatives and their fuel cost (build prompt §7.6.1–7.6.3; paper §4.7).

* **Candidates.** On each held-out day, the segments the corrected model flags as forming a
  persistent contrail are grouped into *portions*: runs of consecutive flagged segments of one
  flight piece, merged when less than ``MERGE_GAP_MIN`` apart. One portion = one possible alert.
* **Alternatives.** The portion is flown ±2,000 or ±4,000 ft away (pre-registered). ±2,000 ft
  keeps the direction-of-flight level parity under RVSM, which is why it is the natural first
  option. The aircraft leaves its level before the portion and returns after it at typical step
  rates (climb ``CLIMB_FPM``, descent ``DESCENT_FPM``), so the whole portion is at the new level.
  Alternatives above the type's OpenAP ceiling or below FL250 are rejected, with the reason.
* **Fuel.** OpenAP fuel flow (``FuelFlow.enroute`` with the vertical speed, so the climb or
  descent power is included) at the new altitude over every changed segment, at the **same
  Mach** as planned (true airspeed rescaled by the ISA speed of sound) and over the same ground
  track and times. Extra fuel = alternative − planned; CO₂ = 3.16 kg per kg fuel.
* **η** is recomputed at the new level (it moves the Schmidt–Appleman threshold), so CoCiP's
  formation check is redone too.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.flights import aircraft as ac

Array = npt.NDArray[np.float64]
CLIMB_FPM = 1000.0
DESCENT_FPM = 1500.0
MERGE_GAP_MIN = 10.0
FLOOR_FT = 25_000.0
M_TO_FT = 1 / 0.3048


def portions(flight: pd.DataFrame, flag: str = "flagged") -> list[tuple[int, int]]:
    """(first, last) row positions of flagged runs in one flight piece, sorted by time."""
    f = flight[flag].to_numpy(bool)
    t = pd.to_datetime(flight["time_start"]).to_numpy()
    idx = np.flatnonzero(f)
    if not len(idx):
        return []
    runs = [[idx[0], idx[0]]]
    for i in idx[1:]:
        gap = (t[i] - t[runs[-1][1]]) / np.timedelta64(1, "m")
        if i == runs[-1][1] + 1 or gap <= MERGE_GAP_MIN:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(int(a), int(b)) for a, b in runs]


def shifted_altitude(alt_ft: Array, t_s: Array, first: int, last: int, delta_ft: float) -> Array:
    """New waypoint altitudes: segment i spans waypoints i and i + 1. Waypoints first..last + 1
    are moved by ``delta_ft``; the transition ramps before and after at the step rates."""
    rate_in = CLIMB_FPM if delta_ft > 0 else DESCENT_FPM
    rate_out = DESCENT_FPM if delta_ft > 0 else CLIMB_FPM
    dur_in = abs(delta_ft) / rate_in * 60.0
    dur_out = abs(delta_ft) / rate_out * 60.0
    t0, t1 = t_s[first], t_s[last + 1]
    off = np.zeros_like(alt_ft, dtype=float)
    hold = (t_s >= t0) & (t_s <= t1)
    off[hold] = 1.0
    ramp_in = (t_s < t0) & (t_s >= t0 - dur_in)
    off[ramp_in] = 1.0 - (t0 - t_s[ramp_in]) / dur_in
    ramp_out = (t_s > t1) & (t_s <= t1 + dur_out)
    off[ramp_out] = 1.0 - (t_s[ramp_out] - t1) / dur_out
    out: Array = alt_ft + delta_ft * off
    return out


def isa_sound_speed(alt_ft: Array) -> Array:
    h = np.asarray(alt_ft, float) / M_TO_FT
    temp = np.where(h < 11_000.0, 288.15 - 0.0065 * h, 216.65)
    out: Array = np.sqrt(1.4 * 287.05 * temp)
    return out


@dataclass
class Alternative:
    delta_ft: float
    feasible: bool
    reason: str = ""
    seg_alt_ft: Array = field(default_factory=lambda: np.zeros(0))  # per segment (mid)
    waypoint_alt_ft: Array = field(default_factory=lambda: np.zeros(0))
    fuel_flow_kg_s: Array = field(default_factory=lambda: np.zeros(0))
    engine_efficiency: Array = field(default_factory=lambda: np.zeros(0))
    changed: Array = field(default_factory=lambda: np.zeros(0, bool))
    extra_fuel_kg: float = 0.0
    info: dict[str, Any] = field(default_factory=dict)


def build(flight: pd.DataFrame, first: int, last: int, delta_ft: float) -> Alternative:
    """One alternative for one portion of one flight piece (rows sorted by time)."""
    g = flight
    wp_alt = np.append(g["alt_ft_start"].to_numpy(float), g["alt_ft_end"].to_numpy(float)[-1])
    t = pd.to_datetime(g["time_start"])
    t_end = pd.to_datetime(g["time_end"]).iloc[-1]
    wp_t = np.append(
        (t - t.iloc[0]).dt.total_seconds().to_numpy(), (t_end - t.iloc[0]).total_seconds()
    )
    new_wp = shifted_altitude(wp_alt, wp_t, first, last, delta_ft)
    changed_wp = np.abs(new_wp - wp_alt) > 1e-6
    changed = changed_wp[:-1] | changed_wp[1:]
    seg_old = 0.5 * (wp_alt[:-1] + wp_alt[1:])
    seg_new = 0.5 * (new_wp[:-1] + new_wp[1:])
    otype = str(g["openap_type"].iloc[0])
    ceiling_ft = float(_ceiling_m(otype)) * M_TO_FT
    if seg_new[changed].max(initial=-np.inf) > ceiling_ft:
        return Alternative(delta_ft, False, f"above OpenAP ceiling ({ceiling_ft:,.0f} ft)")
    if seg_new[changed].min(initial=np.inf) < FLOOR_FT:
        return Alternative(delta_ft, False, "below FL250")
    dur = g["duration_s"].to_numpy(float)
    tas = g["true_airspeed_ms"].to_numpy(float)
    mach = tas / isa_sound_speed(seg_old)
    tas_new = mach * isa_sound_speed(seg_new)
    vs_new = np.diff(new_wp) / (np.diff(wp_t) / 60.0)
    ff = g["fuel_flow_kg_s"].to_numpy(float).copy()
    eta = g["engine_efficiency"].to_numpy(float).copy()
    if changed.any():
        perf = ac.performance(otype, g["aircraft_mass_kg"].to_numpy(float)[changed],
                              tas_new[changed], seg_new[changed], vs_new[changed])  # fmt: skip
        ff[changed] = perf["fuel_flow_kg_s"]
        eta[changed] = perf["engine_efficiency"]
    extra = float(np.nansum((ff - g["fuel_flow_kg_s"].to_numpy(float))[changed] * dur[changed]))
    return Alternative(
        delta_ft, True, "", seg_new, new_wp, ff, eta, changed, extra,
        {"changed_segments": int(changed.sum()), "portion_segments": last - first + 1,
         "minutes_changed": float(dur[changed].sum() / 60.0)},
    )  # fmt: skip


def _ceiling_m(openap_type: str) -> float:
    from openap import prop

    return float(prop.aircraft(openap_type, use_synonym=True)["ceiling"])


def apply(flight: pd.DataFrame, alt: Alternative) -> pd.DataFrame:
    """The flight piece's segment rows as flown under ``alt`` (for CoCiP)."""
    g = flight.copy()
    g["alt_ft_start"] = alt.waypoint_alt_ft[:-1]
    g["alt_ft_end"] = alt.waypoint_alt_ft[1:]
    g["alt_ft_mid"] = alt.seg_alt_ft
    g["fuel_flow_kg_s"] = alt.fuel_flow_kg_s
    g["engine_efficiency"] = alt.engine_efficiency
    return g
