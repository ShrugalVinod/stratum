"""Web data v2 for the Phase 8 app (build prompt §8.1; contract ``schemas.py`` v2.0.0).

``stratum export-web-v1`` (Colab 08a) writes ``web_exports/<build_id>/`` (+ a zip):

* **Days**: the 12 held-out flight days and the rest of January 2026 (the demo month).
* **Layers** (per day, hour sprites, see ``grids.write_sprite``): B1 and B3 fraction of the hour
  with persistent-contrail conditions; STRATUM probability (calibrated model of the fold that
  holds the day out) and its spread over the four seasonal models; Meteosat observability
  where satellite data exist.
* **Flights** (flight days): commercial flights in the Delhi–Mumbai corridor plus every
  commercial flight in a model's list; ``alert`` from the STRATUM decision layer.
* **Lists** (flight days): ``segments_B1.json`` and ``segments_B3.json`` — the strongest warming
  contrail portions under each physics (CoCiP over the whole domain, 24 h lifetimes; top
  ``LIST_MAX`` by EF, descriptive); ``segments_STRATUM.json`` — every flagged portion of the
  Phase 7 decision layer with all Table 3 fields, the alternatives and an ERA5 humidity profile.
* **results.json**: H1–H4, the baseline tables, reliability, concentration curves, validation,
  feedback and decision summaries — copied from the logged final runs and labelled descriptive
  runs, never recomputed here.

Privacy (build prompt §3.6): commercial flights only, salted-hash ids; no ICAO24 is exported.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.export import grids
from stratum.export.schemas import (
    Alternative,
    Coverage,
    DaySummary,
    FlaggedSegment,
    FlightLevelInfo,
    GridMeta,
    LayerInfo,
    Manifest,
    ModelInfo,
    Profile,
)
from stratum.export.web_export import (
    CREDITS,
    _bearing,
    _num,
    airline_names,
    dir_size,
    direction,
    douglas_peucker,
    hash_id,
    id_salt,
    web_json,
)

DAY_BUDGET_BYTES = 5_000_000  # raw; JSON is served gzip-compressed (≈ 3–4× smaller)
LIST_MAX = 300
P_FULL = 0.255  # STRATUM probability sprites store 0–0.255 in steps of 0.001
MODELS = [
    ModelInfo(
        id="B1",
        label="Physics (raw ERA5)",
        description="Schmidt–Appleman ∧ RHi ≥ 1 on raw ERA5 humidity; CoCiP for persistence and warming.",
    ),
    ModelInfo(
        id="B3",
        label="Published correction",
        description="The latitude-dependent humidity correction of Teoh et al. (pycontrails), then the same physics.",
    ),
    ModelInfo(
        id="STRATUM",
        label="STRATUM (learned)",
        description="Calibrated boosted trees trained on Meteosat-9 contrail labels from the other seasons: probability that a lasting contrail forms and the satellite would see it.",
    ),
]
LAYERS = [
    LayerInfo(
        id="B1",
        file="layers/B1_FL{fl}.png",
        per_flight_level=True,
        full_scale=1.0,
        meaning="fraction of the hour with persistent-contrail conditions, raw ERA5",
    ),
    LayerInfo(
        id="B3",
        file="layers/B3_FL{fl}.png",
        per_flight_level=True,
        full_scale=1.0,
        meaning="same with the published (B3) humidity correction",
    ),
    LayerInfo(
        id="STRATUM",
        file="layers/STRATUM_FL{fl}.png",
        per_flight_level=True,
        full_scale=P_FULL,
        meaning="probability of a lasting contrail the satellite would see (half past the hour)",
    ),
    LayerInfo(
        id="STRATUM_spread",
        file="layers/STRATUM_spread_FL{fl}.png",
        per_flight_level=True,
        full_scale=P_FULL,
        meaning="max − min of that probability over the four seasonal models",
    ),
    LayerInfo(
        id="observable",
        file="layers/observable.png",
        per_flight_level=False,
        full_scale=1.0,
        meaning="share of the hour's Meteosat images in which the cell was cloud-free and seen at < 60° (satellite side only)",
    ),
]
EF_NOTE_V1 = (
    "CoCiP central run over the whole domain, contrails followed 24 h (descriptive context run)."
)
NOTE_STRATUM = ("Corrected physics (learned humidity factor at its 1.20 bound: too dry, see Methods); "
                "ranges from 100 Monte Carlo members. ATC feasibility not modelled.")  # fmt: skip


EF_NOTE_STRATUM = (
    "Planned-level EF, 5th–95th percentile of 100 Monte Carlo members (corrected physics)."
)


def export_days(eval_days: list[str], month: str | None = "2026-01") -> list[str]:
    """The held-out flight days plus every day of the demo month."""
    if month is None:
        return sorted(eval_days)
    y, m = (int(v) for v in month.split("-"))
    d, demo = date(y, m, 1), []
    while d.month == m:
        demo.append(str(d))
        d += timedelta(days=1)
    return sorted(set(eval_days) | set(demo))


# ── layers ────────────────────────────────────────────────────────────────────


def write_layers(root: Path, day: str, ddir: Path, fls: list[int], bbox: Any, mdir: Path,
                 pre: Any) -> tuple[dict[str, Any], list[str], Any]:  # fmt: skip
    """All sprites of one day. Returns grid metadata, the layers written and the ERA5 day."""
    from stratum.export import model_grids as mgr
    from stratum.met.features import PL_VARS, tropopause_grid
    from stratum.met.interp import MetGrid
    from stratum.phase2 import era5_window

    t0 = pd.Timestamp(day)
    pl = era5_window(root, "pl", t0, t0 + pd.Timedelta(hours=25)).load()
    tt = era5_window(root, "tropo_T", t0, t0 + pd.Timedelta(hours=25)).load()
    written: list[str] = []
    meta: dict[str, Any] = {}
    lat = lon = None
    for fl in fls:
        for name, scaling in (("B1", None), ("B3", "B3")):
            frac, lat, lon = grids.persistence_fraction(
                pl, fl, np.datetime64(t0), bbox, scaling=scaling
            )
            grids.write_sprite(frac, ddir / f"layers/{name}_FL{fl}.png")
    assert lat is not None and lon is not None
    written += ["B1", "B3"]
    meta = grids.grid_meta(lat, lon)
    meta["encoding"] = "png_uint8_hour_sprite"
    prob, spread = mgr.probability_grids(MetGrid.from_dataset(pl, PL_VARS), tropopause_grid(pl, tt),
                                          lat, lon, fls, day, mdir, pre)  # fmt: skip
    for fl in fls:
        grids.write_sprite(prob[fl], ddir / f"layers/STRATUM_FL{fl}.png", P_FULL)
        grids.write_sprite(spread[fl], ddir / f"layers/STRATUM_spread_FL{fl}.png", P_FULL)
    written += ["STRATUM", "STRATUM_spread"]
    obs = mgr.observability_grid(root, day, lat, lon)
    if obs is not None:
        grids.write_sprite(obs, ddir / "layers/observable.png")
        written.append("observable")
    return meta, written, pl


# ── lists ─────────────────────────────────────────────────────────────────────


def _portions(seg: pd.DataFrame) -> list[pd.DataFrame]:
    from stratum.decide import alternatives as al

    out = []
    for _, g in seg.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        g = g.reset_index(drop=True)
        out += [g.iloc[a : b + 1] for a, b in al.portions(g)]
    return out


def _base_item(part: pd.DataFrame, hid: str, k: int, names: dict[str, str], del_bom: float,
               model: str) -> dict[str, Any]:  # fmt: skip
    r0, r1 = part.iloc[0], part.iloc[-1]
    mid = part.iloc[len(part) // 2]
    t_mid = pd.Timestamp(mid["time_mid"])
    lst = (t_mid.hour + t_mid.minute / 60 + float(mid["lon_mid"]) / 15) % 24
    callsign = str(r0.get("callsign", ""))
    return {
        "segment_id": f"{hid}_{model}_{k:03d}", "flight_id": hid, "callsign": callsign,
        "airline": names.get(callsign[:3]), "direction": direction(
            float(r0["lat_start"]), float(r0["lon_start"]), float(r1["lat_end"]), float(r1["lon_end"]), del_bom),
        "time_utc": f"{pd.Timestamp(r0['time_start']):%Y-%m-%dT%H:%M:%S}Z",
        "time_end_utc": f"{pd.Timestamp(r1['time_end']):%Y-%m-%dT%H:%M:%S}Z",
        "fl": round(float(part["alt_ft_mid"].median()) / 100),
        "lat": round(float(mid["lat_mid"]), 4), "lon": round(float(mid["lon_mid"]), 4),
        "lat_start": round(float(r0["lat_start"]), 4), "lon_start": round(float(r0["lon_start"]), 4),
        "lat_end": round(float(r1["lat_end"]), 4), "lon_end": round(float(r1["lon_end"]), 4),
        "night": bool(lst >= 18 or lst < 6), "n_segments": len(part), "model": model,
    }  # fmt: skip


def physics_parts(seg: pd.DataFrame, cocip: pd.DataFrame) -> list[pd.DataFrame]:
    """Warming persistent-contrail portions (commercial) under one physics, strongest first
    (top LIST_MAX): the rows behind ``physics_list``, in its order."""
    s = seg[seg["commercial"].astype(bool)].merge(
        cocip[["segment_id", "ef", "persistent_1", "contrail_age"]], on="segment_id", how="inner"
    )
    s = s[(s["persistent_1"].fillna(0) > 0) & (s["ef"].fillna(0) > 0)]
    parts = _portions(s.assign(flagged=True))
    parts.sort(key=lambda part: -float(part["ef"].sum()))  # stable: ties keep flight order
    return parts[:LIST_MAX]


def physics_list(seg: pd.DataFrame, cocip: pd.DataFrame, salt: str, names: dict[str, str],
                 del_bom: float, model: str) -> list[FlaggedSegment]:  # fmt: skip
    """Warming persistent-contrail portions under one physics, strongest first (top LIST_MAX)."""
    out = []
    for k, part in enumerate(physics_parts(seg, cocip)):
        hid = hash_id(str(part["flight_id"].iloc[0]), salt)
        base = _base_item(part, hid, k, names, del_bom, model)
        age = (
            pd.to_timedelta(part["contrail_age"], errors="coerce").max()
            if "contrail_age" in part
            else None
        )
        out.append(FlaggedSegment(**{**base, "ef_J": float(part["ef"].sum()),
                      "ef_p05_J": None, "ef_p50_J": None, "ef_p95_J": None, "ef_note": EF_NOTE_V1,
                      "contrail_age_h": round(age.total_seconds() / 3600, 2) if age is not None and pd.notna(age) else None,
                      "confidence_note": "Physics only; no satellite correction.", "commercial_only_note": None}))  # fmt: skip
    return out


def _rng(row: Any, h: int) -> list[float] | None:
    vals = [getattr(row, f"net_h{h}_{q}", np.nan) for q in ("p05", "p50", "p95")]
    return [round(float(v), 1) for v in vals] if all(np.isfinite(vals)) else None


def stratum_parts(seg: pd.DataFrame, tab: pd.DataFrame, cands: pd.DataFrame) -> list[tuple[Any, pd.DataFrame, pd.DataFrame]]:  # fmt: skip
    """(Table 3 row, its candidates, its segment rows) of every commercial flagged portion, in
    the decision layer's order: the rows behind ``stratum_list``."""
    if tab.empty:
        return []
    seg = seg.sort_values(["flight_id", "time_start"])
    t = tab[tab["commercial"].fillna(False).astype(bool)] if "commercial" in tab else tab
    out = []
    for r in t.itertuples():
        c = cands[cands["portion_id"] == r.portion_id]
        g = seg[seg["flight_id"] == r.flight_id].reset_index(drop=True)
        out.append((r, c, g.iloc[int(c["first"].iloc[0]) : int(c["last"].iloc[0]) + 1]))
    return out


def stratum_list(seg: pd.DataFrame, tab: pd.DataFrame, cands: pd.DataFrame, salt: str,
                 names: dict[str, str], del_bom: float, profile_of: Any, model: str = "STRATUM",
                 note: str = NOTE_STRATUM, ef_note: str = EF_NOTE_STRATUM) -> list[FlaggedSegment]:  # fmt: skip
    """Phase 7 decision-layer portions (commercial only), ranked by the lower bound."""
    out = []
    for k, (r, c, part) in enumerate(stratum_parts(seg, tab, cands)):
        hid = hash_id(str(r.flight_id), salt)
        base = _base_item(part, hid, k, names, del_bom, model)
        planned_fl = int(r.planned_fl)
        alts = []
        for a in c.sort_values("delta_ft").itertuples():
            alts.append(Alternative(
                delta_ft=int(a.delta_ft), fl=planned_fl + int(a.delta_ft) // 100, feasible=bool(a.feasible),
                reason=str(a.reason or ""), extra_fuel_kg=_num(a.extra_fuel_kg),
                net_20y=_rng(a, 20) if a.feasible else None, net_100y=_rng(a, 100) if a.feasible else None))  # fmt: skip
        best = getattr(r, "best_alternative_fl", None)
        out.append(FlaggedSegment(
            **{**base, "fl": planned_fl},
            ef_J=None, ef_p05_J=_num(r.ef_planned_p05_J), ef_p50_J=None, ef_p95_J=_num(r.ef_planned_p95_J),
            ef_note=ef_note,
            contrail_age_h=None, p_persistent=_num(r.p_persistent_contrail_max),
            best_alternative_fl=int(best) if best is not None and np.isfinite(best) else None,
            extra_fuel_kg=_num(r.extra_fuel_kg), extra_co2_kg=_num(r.extra_co2_kg),
            net_warming_avoided_20y=_num(r.net_warming_avoided_h20_p05_kgCO2e),
            net_warming_avoided_100y=_num(r.net_warming_avoided_h100_p05_kgCO2e),
            net_warming_avoided_20y_range=_trio(r, 20), net_warming_avoided_100y_range=_trio(r, 100),
            alert=bool(r.alert), alert_without_fuel_credit=bool(r.alert_without_fuel_credit),
            alternatives=alts, alternatives_rejected=str(r.alternatives_rejected or "") or None,
            confidence_note=f"{r.confidence_note}. {note}",
            profile=profile_of(float(base["lat"]), float(base["lon"]), pd.Timestamp(part.iloc[len(part) // 2]["time_mid"])) if profile_of else None,
            commercial_only_note=None,
        ))  # fmt: skip
    return out


def _trio(r: Any, h: int) -> list[float] | None:
    vals = [
        getattr(r, f"net_warming_avoided_h{h}_{q}_kgCO2e", np.nan) for q in ("p05", "p50", "p95")
    ]
    return [round(float(v), 1) for v in vals] if all(np.isfinite(vals)) else None


def profile_fn(pl: Any, s_band: list[float], bands: list[tuple[float, float]]) -> Any:
    """Humidity column at a point: raw ERA5 RHi, B3-corrected and STRATUM (RHi / s)."""
    from stratum.model.scaling import band_index
    from stratum.physics import cocip_runner as cr
    from stratum.physics.thermo import rhi_from_q
    from stratum.physics.units import pressure_to_flight_level

    b3 = cr.humidity_scaling("B3")
    lev = pl["level"].values.astype(float)

    def f(lat: float, lon: float, t: pd.Timestamp) -> Profile:
        col = pl.sel(latitude=lat, longitude=lon, method="nearest").sel(
            time=np.datetime64(t.tz_localize(None) if t.tzinfo else t), method="nearest"
        )
        T = col["air_temperature"].values.astype(float)
        q = col["specific_humidity"].values.astype(float)
        p = lev * 100.0
        raw = rhi_from_q(q, T, p)
        _, r3 = b3.scale(
            q, T, p, latitude=np.full_like(T, lat), q_method=None, level_type="pressure"
        )
        s = s_band[int(band_index(np.array([lat]), bands)[0])]
        order = np.argsort(lev)

        def r(x: Any) -> list[float | None]:
            return [
                None if not np.isfinite(v) else round(float(v), 3) for v in np.asarray(x)[order]
            ]

        return Profile(pressure_hpa=[float(v) for v in lev[order]],
                       fl=[round(float(v), 0) for v in np.asarray(pressure_to_flight_level(p))[order]],
                       rhi_raw=r(raw), rhi_b3=r(r3), rhi_stratum=r(raw / s), temperature_k=r(T))  # fmt: skip

    return f


# ── flights ───────────────────────────────────────────────────────────────────


def flights_fc(seg: pd.DataFrame, keep_ids: set[str], salt: str, names: dict[str, str],
               del_bom: float, day: str, flagged_by: dict[str, set[str]], alerts: set[str]) -> dict[str, Any]:  # fmt: skip
    s = seg[seg["commercial"].astype(bool) & seg["flight_id"].isin(keep_ids)].copy()
    midnight = pd.Timestamp(day)
    feats = []
    for fid, g in s.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        lat = np.r_[g["lat_start"].to_numpy(float), g["lat_end"].to_numpy(float)[-1]]
        lon = np.r_[g["lon_start"].to_numpy(float), g["lon_end"].to_numpy(float)[-1]]
        t = pd.to_datetime(np.r_[g["time_start"].to_numpy(), g["time_end"].to_numpy()[-1]])
        minutes = ((t - midnight).total_seconds() // 60).astype(int)
        keep = douglas_peucker(lat, lon)
        callsign = str(g["callsign"].iloc[0])
        models = [m for m, ids in flagged_by.items() if fid in ids]
        props = {
            "flight_id": hash_id(str(fid), salt), "callsign": callsign, "airline": names.get(callsign[:3]),
            "aircraft_type": g["typecode"].iloc[0] if "typecode" in g and pd.notna(g["typecode"].iloc[0]) else None,
            "direction": direction(lat[0], lon[0], lat[-1], lon[-1], del_bom),
            "t_start": f"{t[0]:%Y-%m-%dT%H:%M:%S}Z", "t_end": f"{t[-1]:%Y-%m-%dT%H:%M:%S}Z",
            "minutes": [int(m) for m in minutes[keep]], "flagged": "B1" in models,
            "flagged_models": models, "alert": fid in alerts,
        }  # fmt: skip
        feats.append({"type": "Feature", "properties": props, "geometry": {
            "type": "LineString", "coordinates": [[round(float(lon[i]), 4), round(float(lat[i]), 4)] for i in keep]}})  # fmt: skip
    return {"type": "FeatureCollection", "features": feats}


# ── results ───────────────────────────────────────────────────────────────────


def _load(p: Path) -> Any:
    return json.loads(p.read_text()) if p.exists() else None


def build_results(root: Path) -> dict[str, Any]:
    """Everything the results page shows, copied from the logged runs (no recomputation)."""
    log = root / "_locks" / "final_runs.jsonl"
    runs = (
        [json.loads(x) for x in log.read_text().splitlines() if x.strip()] if log.exists() else []
    )
    last = {h: r["run_id"] for r in runs if r.get("final") for h in r.get("hypotheses", [])}
    rep = root / "reports"
    h1 = _load(rep / last.get("H1", "-") / "results.json") or {}
    h2 = _load(rep / last.get("H2", "-") / "results.json") or {}
    h34 = _load(rep / last.get("H3", "-") / "results_h34.json") or {}
    ctx = {k: _load(rep / "phase7_h34_context" / f"{k}.json") for k in ("B1", "B3")}
    val = _load(root / "interim" / "model" / "summary.json") or {}
    corr = _load(root / "interim" / "correction" / "summary.json") or {}
    dec = _load(rep / "phase7_decisions" / "summary.json") or {}

    def ci(r: dict[str, Any] | None) -> dict[str, float] | None:
        return None if not r else {k: float(r[k]) for k in ("value", "lo", "hi") if k in r}

    hyp = []
    if h1:
        hyp.append({"id": "H1", "verdict": "supported" if h1["h1"]["supported"] else "not supported",
                    "statistic": "B1-predicted / observed persistent contrails", "rule": "upper 95 % CI < 1",
                    "estimate": ci(h1["h1"]["ratio"]), "sentence": h1["h1"]["sentence"],
                    "secondary": h1["h1"].get("secondary"), "run_id": last.get("H1")})  # fmt: skip
    if h2:
        hyp.append({"id": "H2", "verdict": "supported" if h2["h2"]["supported"] else "not supported",
                    "statistic": "mean Brier skill score of STRATUM vs B3 over held-out seasons",
                    "rule": "mean ≥ 0.10 and lower 95 % CI > 0", "estimate": ci(h2["h2"]["bss"]),
                    "sentence": h2["h2"]["sentence"], "vs_RATE": ci(h2["h2"].get("vs_RATE")),
                    "vs_B0": ci(h2["h2"].get("vs_B0")), "vs_LOGIT": ci(h2["h2"].get("vs_LOGIT")),
                    "run_id": last.get("H2")})  # fmt: skip
    for k, key, stat, rule in (
        ("H3", "h3", "share of cruise distance carrying 80 % of positive EF", "share ≤ 10 %"),
        ("H4", "h4", "night share of positive EF − night share of distance", "lower 95 % CI > 0"),
    ):
        if key in h34:
            r = h34[key]
            est = r["share"] if key == "h3" else r["difference"]
            hyp.append({"id": k, "verdict": "supported" if r["supported"] else "not supported",
                        "statistic": stat, "rule": rule, "estimate": ci(est), "run_id": last.get("H3"),
                        "details": {kk: vv for kk, vv in r.items() if kk not in ("curve",)},
                        "context": {m: ({kk: vv for kk, vv in c[key].items() if kk != "curve"} if c else None)
                                    for m, c in ctx.items()}})  # fmt: skip
    curves = {"STRATUM-corrected (logged)": (h34.get("h3") or {}).get("curve")}
    curves.update(
        {f"{m} (descriptive)": (c or {}).get("h3", {}).get("curve") for m, c in ctx.items()}
    )
    return {
        "generated_from": [
            f"_locks/final_runs.jsonl ({len(runs)} runs)",
            "reports/<run_id>/results*.json",
            "reports/phase7_h34_context/*.json",
            "interim/model/summary.json",
            "interim/correction/summary.json",
            "reports/phase7_decisions/summary.json",
        ],
        "hypotheses": hyp,
        "final_runs": [
            {
                k: r.get(k)
                for k in (
                    "run_id",
                    "time_utc",
                    "hypotheses",
                    "commit",
                    "final",
                    "results_sha256",
                    "rerun_reason",
                )
            }
            for r in runs
        ],
        "baselines_phase6": {
            "primary_bss_vs_B3": h1.get("primary"),
            "folds": {
                f: {
                    m: {
                        k: v
                        for k, v in (x or {}).items()
                        if k in ("brier", "bss_vs_B3", "auroc", "pod", "far", "csi")
                    }
                    for m, x in (fd.get("models") or {}).items()
                }
                for f, fd in (h1.get("folds") or {}).items()
            },
        },
        "h2_mean_over_seasons": h2.get("mean_over_seasons"),
        "h2_folds": {
            f: {
                m: {
                    k: v
                    for k, v in (x or {}).items()
                    if k in ("brier", "bss_vs_B3", "bss_vs_RATE", "auroc")
                }
                for m, x in (fd.get("models") or {}).items()
            }
            for f, fd in (h2.get("folds") or {}).items()
        },
        "reliability": {"phase6": h1.get("reliability"), "phase7": h2.get("reliability")},
        "class_balance": h2.get("class_balance"),
        "h1_breakdowns": (h1.get("h1") or {}).get("breakdowns"),
        "h1_sensitivity": (h1.get("h1") or {}).get("sensitivity_label_rule"),
        "concentration_curves": curves,
        "validation": {
            f: {
                k: v.get(k)
                for k in (
                    "train_rows",
                    "train_pos",
                    "brier_climatology",
                    "brier_logistic_rhi",
                    "brier_gbm_raw",
                    "brier_gbm_calibrated",
                    "auroc",
                    "shap_importance",
                )
            }
            for f, v in (val.get("folds") or {}).items()
        },
        "correction": {
            "a_vs_b": corr.get("a_vs_b"),
            "folds": {
                f: {k: v.get(k) for k in ("detection_efficiency", "s_band", "s_band_literal")}
                for f, v in (corr.get("folds") or {}).items()
            },
        },
        "decisions": dec,
    }


# ── build ─────────────────────────────────────────────────────────────────────


def export_web_v1(root: Path, out_root: Path, build_id: str, eval_days: list[str], pre: Any,
                  git_commit: str = "unknown", config_hash: str = "unknown",
                  demo_month: str | None = "2026-01") -> dict[str, Any]:  # fmt: skip
    from stratum.config import corridor_geojson, load_domain
    from stratum.decide import humidity as hu
    from stratum.model import run as mr
    from stratum.paths import repo_root

    salt = id_salt()
    dom = load_domain()
    out = out_root / build_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "corridor.geojson").write_text(web_json(corridor_geojson(dom.corridor)))
    names = airline_names(repo_root() / "configs" / "airlines.yaml")
    ap = dom.corridor.airports
    del_bom = _bearing(ap["VIDP"].lat, ap["VIDP"].lon, ap["VABB"].lat, ap["VABB"].lon)
    lo, hi = dom.flight_levels.dashboard_fl_range
    fls = list(range(lo, hi + 1, dom.flight_levels.dashboard_fl_step))
    bbox = (tuple(dom.study_bbox.lat), tuple(dom.study_bbox.lon))
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    mdir, cdir = mr.model_dir(root), hu.correction_dir(root)
    meta: dict[str, Any] | None = None
    done, with_flights, sizes = [], [], {}
    for day in export_days(eval_days, demo_month):
        ddir = out / "days" / day
        try:
            m, layers, pl = write_layers(root, day, ddir, fls, bbox, mdir, pre)
        except FileNotFoundError:  # no ERA5 month file
            sizes[day] = "no ERA5"
            continue
        except ValueError as e:
            if "do not cover" not in str(e):  # only "this day is outside the ERA5 file" is skipped
                raise
            sizes[day] = "no ERA5 for this day"
            continue
        meta = meta or m
        summ: dict[str, Any] = {"date": day, "has_flights": False, "n_flights": None, "n_segments": None,
                                "n_flagged": None, "ef_positive_J": None, "ef_negative_J": None,
                                "grid_files": len(list((ddir / "layers").glob("*.png"))), "quality_flags": [],
                                "layers": layers, "has_observability": "observable" in layers}  # fmt: skip
        src = root / "interim" / "segments_met" / day[:7] / day / "segments_met.parquet"
        if day in eval_days and src.exists():
            seg = pd.read_parquet(src)
            for c in ("time_start", "time_end", "time_mid"):
                seg[c] = pd.to_datetime(seg[c], utc=True).dt.tz_convert(None)
            lists: dict[str, list[FlaggedSegment]] = {}
            for model in ("B1", "B3"):
                f = root / "interim" / "cocip_domain24" / model / day[:7] / day / "segments.parquet"
                lists[model] = (
                    physics_list(seg, pd.read_parquet(f), salt, names, del_bom, model)
                    if f.exists()
                    else []
                )
                if not f.exists():
                    summ["quality_flags"].append(f"no {model} context CoCiP")
            ddec = root / "interim" / "decisions" / day[:7] / day
            tab = (
                pd.read_parquet(ddec / "table3.parquet")
                if (ddec / "table3.parquet").exists()
                else pd.DataFrame()
            )
            cands = (
                pd.read_parquet(ddec / "candidates.parquet")
                if (ddec / "candidates.parquet").exists()
                else pd.DataFrame()
            )
            _, s_band = hu.scaling_for_day(cdir, day, bands)
            lists["STRATUM"] = stratum_list(
                seg, tab, cands, salt, names, del_bom, profile_fn(pl, s_band, bands)
            )
            for model, items in lists.items():
                (ddir / f"segments_{model}.json").write_text(
                    web_json([i.model_dump() for i in items], separators=(",", ":"))
                )
            # flights: corridor commercial flights + every flight in a list
            hid_to_fid = {hash_id(str(f), salt): f for f in seg["flight_id"].unique()}
            flagged_by = {m: {hid_to_fid[i.flight_id] for i in items} for m, items in lists.items()}
            alerts = {hid_to_fid[i.flight_id] for i in lists["STRATUM"] if i.alert}
            corr_ids = (
                set(seg.loc[seg["in_corridor"].astype(bool), "flight_id"])
                if "in_corridor" in seg
                else set()
            )
            keep = corr_ids | set().union(*flagged_by.values())
            fc = flights_fc(seg, keep, salt, names, del_bom, day, flagged_by, alerts)
            (ddir / "flights.geojson").write_text(web_json(fc, separators=(",", ":")))
            summ.update({"has_flights": True, "n_flights": len(fc["features"]),
                         "n_segments": int(seg["commercial"].astype(bool).sum()),
                         "n_flagged": len(lists["B1"]), "n_flagged_by_model": {m: len(v) for m, v in lists.items()},
                         "n_alerts": sum(1 for i in lists["STRATUM"] if i.alert)})  # fmt: skip
            with_flights.append(day)
        (ddir / "day.json").write_text(DaySummary(**summ).model_dump_json())
        size = dir_size(ddir)
        if size > DAY_BUDGET_BYTES:
            raise RuntimeError(
                f"{day}: {size / 1e6:.2f} MB exceeds the {DAY_BUDGET_BYTES / 1e6:.0f} MB per-day budget"
            )
        sizes[day] = f"{size / 1e6:.2f} MB"
        done.append(day)
    if meta is None:
        raise RuntimeError("no ERA5 found for any export day")
    finish(root, out, build_id, meta, fls, done, with_flights, git_commit, config_hash)
    return {"build_id": build_id, "days": len(done), "days_with_flights": with_flights, "sizes": sizes,
            "total_MB": round(dir_size(out) / 1e6, 2), "files": sum(1 for _ in out.rglob("*") if _.is_file())}  # fmt: skip


def finish(root: Path, out: Path, build_id: str, meta: dict[str, Any], fls: list[int], done: list[str],
           with_flights: list[str], git_commit: str, config_hash: str) -> None:  # fmt: skip
    """results.json and manifest.json for the days already written under ``out``."""
    from stratum.physics.units import flight_level_to_pressure

    (out / "results.json").write_text(web_json(build_results(root), indent=1))
    man = Manifest(
        build_id=build_id, created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        git_commit=git_commit, config_hash=config_hash, pipeline_version="phase8-v1",
        model_version="B1+B3 physics; STRATUM correction (Phase 7 frozen models)",
        days=done, days_with_flights=with_flights,
        flight_levels=[FlightLevelInfo(fl=fl, pressure_hpa=round(float(flight_level_to_pressure(fl)) / 100, 1)) for fl in fls],
        hours_utc=list(range(24)), grid=GridMeta(**meta), eta_for_grids=grids.ETA_MAP,
        coverage=Coverage(adsb_coverage_pct=None, note="Coverage audit on 2 and 5 Nov 2026 (build prompt Phase 1); pending."),
        credits=CREDITS, models=MODELS, layers=LAYERS, results_file="results.json",
    )  # fmt: skip
    (out / "manifest.json").write_text(man.model_dump_json(indent=1))


def finish_only(root: Path, out: Path, build_id: str, git_commit: str = "unknown",
                config_hash: str = "unknown") -> dict[str, Any]:  # fmt: skip
    """Finish an export whose days are all written but which stopped before the manifest
    (e.g. the per-day size check on the last day): reads the days back from ``day.json``,
    checks each day's size, takes the grid from ERA5 and writes results.json + manifest.json."""
    from stratum.config import load_domain
    from stratum.phase2 import era5_window

    dom = load_domain()
    lo, hi = dom.flight_levels.dashboard_fl_range
    fls = list(range(lo, hi + 1, dom.flight_levels.dashboard_fl_step))
    done, with_flights, sizes = [], [], {}
    for f in sorted((out / "days").glob("*/day.json")):
        d = DaySummary.model_validate_json(f.read_text())
        size = dir_size(f.parent)
        if size > DAY_BUDGET_BYTES:
            raise RuntimeError(f"{d.date}: {size / 1e6:.2f} MB exceeds the per-day budget")
        sizes[d.date] = f"{size / 1e6:.2f} MB"
        done.append(d.date)
        if d.has_flights:
            with_flights.append(d.date)
    if not done:
        raise RuntimeError(f"no exported days under {out}")
    t0 = pd.Timestamp(done[0])
    pl = era5_window(root, "pl", t0, t0 + pd.Timedelta(hours=1))
    (la0, la1), (lo0, lo1) = tuple(dom.study_bbox.lat), tuple(dom.study_bbox.lon)
    sub = pl.sel(latitude=slice(la0, la1), longitude=slice(lo0, lo1))
    lat, lon = np.sort(sub["latitude"].values)[::-1], np.sort(sub["longitude"].values)
    meta = {**grids.grid_meta(lat, lon), "encoding": "png_uint8_hour_sprite"}
    finish(root, out, build_id, meta, fls, done, with_flights, git_commit, config_hash)
    return {"build_id": build_id, "days": len(done), "days_with_flights": with_flights, "sizes": sizes,
            "total_MB": round(dir_size(out) / 1e6, 2), "files": sum(1 for _ in out.rglob("*") if _.is_file())}  # fmt: skip
