"""Probability-weighted physics: STRATUM's probabilities fed into the decision layer (D-006).

A descriptive second analysis, not a hypothesis test: the logged H3/H4 and decision results do
not change. Why it exists: the pre-registered feedback (RHi → RHi / s) keeps only the fitted
divisor s, which sits on its 1.20 bound, so the corrected physics is far too dry (1,583 warming
segments in 3.9 M; docs/decisions.md, 19 Oct 2026). Here the physics stays raw ERA5 (B1, whose
persistent-contrail count matches the satellites once detection efficiency is counted:
efficiency-adjusted H1 ratio 1.05), and STRATUM says how much to trust each contrail:

* w = P(persistent contrail) = min(1, p / ε): STRATUM's calibrated probability that Meteosat
  sees a persistent contrail, divided by the fold's detection efficiency ε (the share of
  persistent contrails that are detectable; 07c, ``interim/correction``);
* expected EF of a segment = w × its B1 CoCiP EF (24 h lifetimes, central run).

Per held-out day (resumable, ``interim/weighted/<month>/<day>/``):

1. ``segments.parquet``: p, w, B1 EF and weighted EF for every domain segment (H3/H4-style
   concentration and night share are computed on these);
2. the decision layer redone: the ``top`` commercial warming portions by weighted EF, each flown
   ±2,000 / ±4,000 ft through B1 CoCiP. For every planned and alternative segment w is STRATUM
   at that level (features rebuilt from ERA5 there). Monte Carlo members pair CoCiP's parameter
   draw, an efficacy draw and a bootstrap draw of ε (07c's ``de_draws``), identically for the
   planned flight and every alternative. Net warming avoided = CO₂e(Σ w·EF planned − Σ w·EF
   alternative) − 3.16 × extra fuel; the alert rule is unchanged (5th percentile > 0 under both
   horizons). Table 3 rows are written as for the logged decision layer.
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.decide import alternatives as al
from stratum.decide import climate_metric as cm
from stratum.decide import humidity as hu
from stratum.decide import report as drep
from stratum.decide import run as dr
from stratum.manifest import RunManifest, is_done, mark_success, read_manifest
from stratum.model import features as fe

Array = npt.NDArray[np.float64]
TOP_PORTIONS = 60
KIND = "weighted"


def weight(p: npt.ArrayLike, eps: npt.ArrayLike) -> Array:
    """P(persistent contrail) from P(seen persistent contrail): p / ε, capped at 1."""
    out: Array = np.clip(np.asarray(p, float) / np.asarray(eps, float), 0.0, 1.0)
    return out


def detection_efficiency(cdir: Path, fold: str) -> tuple[float, Array]:
    """The fold's central ε and its day-bootstrap draws (07c)."""
    summ = json.loads((cdir / "summary.json").read_text())
    draws: Array = np.load(cdir / fold / "de_draws.npy").astype(float)
    return float(summ["folds"][fold]["detection_efficiency"]), draws


def predict(model: Any, s: pd.DataFrame, names: list[str]) -> Array:
    """Calibrated STRATUM probability per row (NaN where ERA5 is missing)."""
    ok = np.isfinite(s["rhi"].to_numpy(float))
    p = np.full(len(s), np.nan)
    if ok.any():
        p[ok] = model.predict(s.loc[ok, fe.columns(names)].to_numpy(float))
    return p


def domain_segments(seg: pd.DataFrame, b1: pd.DataFrame, p: Array, eps: float) -> pd.DataFrame:
    """Every segment with its STRATUM p, w, B1 EF and weighted EF."""
    keep = ["segment_id", "flight_id", "length_km", "local_solar_time_h", "commercial"]
    d = seg[[c for c in keep if c in seg]].assign(p=p, w=weight(p, eps))
    d = d.merge(b1[["segment_id", "persistent_1", "ef"]], on="segment_id", how="left")
    d = d.rename(columns={"ef": "ef_b1"})
    d["ef_w"] = d["w"] * d["ef_b1"]
    return d


def top_portions(seg: pd.DataFrame, dom: pd.DataFrame, top: int) -> set[str]:
    """Segment ids of the ``top`` commercial warming portions by weighted EF (B1 persistent,
    EF > 0). Portions are the decision layer's (``alternatives.portions``)."""
    warm = dom[
        dom["commercial"].fillna(False).astype(bool)
        & (dom["persistent_1"].fillna(0) > 0)
        & (dom["ef_b1"].fillna(0) > 0)
        & np.isfinite(dom["w"].to_numpy(float))
    ]
    ids = set(warm["segment_id"])
    ef_w = dom.set_index("segment_id")["ef_w"]
    s = seg[seg["flight_id"].isin(set(warm["flight_id"]))].assign(
        flagged=lambda x: x["segment_id"].isin(ids)
    )
    scored: list[tuple[float, list[str]]] = []
    for _, g in s.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        g = g.reset_index(drop=True)
        for a, b in al.portions(g):
            sid = list(g["segment_id"].iloc[a : b + 1])
            scored.append((float(ef_w.reindex(sid).fillna(0).sum()), sid))
    scored.sort(key=lambda x: -x[0])
    return {i for _, sid in scored[:top] for i in sid}


def variant_weights(
    frames: pd.DataFrame, model: Any, names: list[str], pl: Any, tropo: Any
) -> Array:
    """STRATUM p for every planned / alternative row, with ERA5 features rebuilt at the row's
    (possibly moved) level."""
    from stratum.met.features import build_segments_met

    f = frames.reset_index(drop=True)
    per = pd.DataFrame({"flight_id": f["flight_id"].unique()})
    s, _ = build_segments_met(f, per, pl, tropo)
    return predict(model, s, names)


def _ef_rows(
    flights: list[Any], met: Any, rad: Any, params: dict[str, Any] | None, max_age_h: float
) -> pd.DataFrame:
    """B1 CoCiP EF per (variant, segment index)."""
    from pycontrails.models.cocip import Cocip

    from stratum.physics import cocip_runner as cr

    warnings.filterwarnings("ignore", module="pycontrails")
    kw: dict[str, Any] = {
        "met": met,
        "rad": rad,
        "humidity_scaling": cr.humidity_scaling("B1"),
        "max_age": np.timedelta64(int(max_age_h * 3600), "s"),
    }
    if params:
        kw["params"] = params
    df = cr._frames(Cocip(**kw).eval(source=flights))
    n_seg = {fl.attrs["flight_id"]: len(fl) - 1 for fl in flights}
    df = df[df["waypoint"] < df["flight_id"].map(n_seg)]
    return df.assign(ef=df["ef"].fillna(0.0))[["flight_id", "waypoint", "ef"]]


def weighted_ef(ef: pd.DataFrame, frames: pd.DataFrame, p: Array, eps: float) -> pd.Series:
    """Σ w·EF per variant. ``frames`` rows are in waypoint order within each variant."""
    f = frames.reset_index(drop=True).assign(p=p)
    f["waypoint"] = f.groupby("flight_id").cumcount()
    m = f[["flight_id", "waypoint", "p"]].merge(ef, on=["flight_id", "waypoint"], how="left")
    m["ef"] = m["ef"].fillna(0.0)
    m["we"] = weight(m["p"].fillna(0.0), eps) * m["ef"]
    return m.groupby("flight_id")["we"].sum().reindex(f["flight_id"].unique(), fill_value=0.0)


def day_dir(root: Path, day: str) -> Path:
    return root / "interim" / KIND / day[:7] / day


def weighted_day(
    root: Path,
    day: str,
    pre: Any,
    members: int,
    seed: int,
    cells: pd.Series,
    top: int = TOP_PORTIONS,
    max_age_h: float = 24.0,
    force: bool = False,
) -> dict[str, Any]:
    from pycontrails import MetDataset
    from pycontrails.models.cocip import CocipUncertaintyParams

    from stratum.met.features import PL_VARS, tropopause_grid
    from stratum.met.interp import MetGrid
    from stratum.model import run as mr
    from stratum.phase2 import era5_window
    from stratum.physics.cocip_runner import segments_to_flights

    out = day_dir(root, day)
    if is_done(out) and not force:
        return {"day": day, "status": "already done"}
    b1_dir = root / "interim" / "cocip_domain24" / "B1" / day[:7] / day
    if not is_done(b1_dir):
        return {"day": day, "status": "B1 domain CoCiP missing"}
    names = list(pre.correction_model.features)
    fold = hu.fold_for_day(day)
    model, _ = mr.load(mr.model_dir(root) / fold)
    eps, eps_draws = detection_efficiency(hu.correction_dir(root), fold)
    seg = pd.read_parquet(dr._day_dir(root, "segments_met", day) / "segments_met.parquet")
    b1 = pd.read_parquet(b1_dir / "segments.parquet", columns=["segment_id", "persistent_1", "ef"])
    p_dom = predict(model, seg, names)
    dom = domain_segments(seg, b1, p_dom, eps)
    out.mkdir(parents=True, exist_ok=True)
    dom.to_parquet(out / "segments.parquet", index=False)
    man = RunManifest.start(
        "weighted-day",
        unit=day,
        params={"members": members, "seed": seed, "top": top, "fold": fold, "eps": eps},
    )
    keep = top_portions(seg, dom, top)
    deltas = [int(d) for d in pre.avoidance.alternatives_ft]
    frames, cands = dr._variant_frames(seg, keep, deltas)
    p_series = pd.Series(p_dom, index=seg["segment_id"])
    if cands.empty or frames.empty:
        c = (
            dr.summarise_candidates(cands, pd.DataFrame(columns=["m0"]), np.array([0.42]))
            if len(cands)
            else pd.DataFrame()
        )
        ranked = dr.rank(c) if len(c) else pd.DataFrame()
    else:
        t0 = pd.Timestamp(day)
        t1 = t0 + pd.Timedelta(hours=24 + max_age_h + 1)
        pl = era5_window(root, "pl", t0, t1).load()
        tt = era5_window(root, "tropo_T", t0, t1).load()
        p_var = variant_weights(
            frames, model, names, MetGrid.from_dataset(pl, PL_VARS), tropopause_grid(pl, tt)
        )
        flights = segments_to_flights(frames)
        met = MetDataset(pl)
        rad = MetDataset(era5_window(root, "sl", t0, t1).load())
        cols = []
        for m in range(members + 1):
            params = None if m == 0 else CocipUncertaintyParams(seed=seed + m).as_dict()
            e = eps if m == 0 else float(eps_draws[(m - 1) % len(eps_draws)])
            cols.append(
                weighted_ef(_ef_rows(flights, met, rad, params, max_age_h), frames, p_var, e)
            )
        ef = pd.concat(cols, axis=1)
        ef.columns = [f"m{m}" for m in range(members + 1)]
        ef.to_parquet(out / "ef_members.parquet")
        eff = np.r_[cm.EFFICACY_CENTRAL, cm.draw_efficacy(members, seed)]
        c = dr.summarise_candidates(cands, ef, eff)
        ranked = dr.rank(c)
    c.to_parquet(out / "candidates.parquet", index=False)
    ranked.to_parquet(out / "ranked.parquet", index=False)
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    tab = drep.table3(
        ranked, cands, seg, p_series, cells, bands, pre.avoidance.confidence_note_min_examples
    )
    tab.to_parquet(out / "table3.parquet", index=False)
    man.stats = {
        "domain_segments": len(dom),
        "w_capped_share": float((dom["w"] >= 1.0).mean()),
        "portions": len(ranked),
        "alerts": int(ranked["alert"].sum()) if len(ranked) else 0,
    }
    mark_success(out, man)
    return {"day": day, "status": "done", **man.stats}


def concentration(root: Path, days: list[str], pre: Any, n: int, seed: int) -> dict[str, Any]:
    """H3/H4-style statistics on weighted EF (descriptive; same code as the logged tests)."""
    from stratum.evaluate import h34

    parts = []
    for d in days:
        f = day_dir(root, d) / "segments.parquet"
        if f.exists():
            s = pd.read_parquet(f)
            parts.append(s[np.isfinite(s["ef_w"].to_numpy(float))].assign(day=d, ef=s["ef_w"]))
    seg = pd.concat(parts, ignore_index=True)
    lst = pre.hypotheses["H4"].night_lst or (18, 6)
    return {
        "h3": h34.h3(seg, n, seed),
        "h4": h34.h4(seg, n, seed, night=(float(lst[0]), float(lst[1]))),
        "segments": len(seg),
        "warming_segments_weighted": int((seg["ef"] > 0).sum()),
        "mean_w_where_b1_warms": float(seg.loc[seg["ef_b1"] > 0, "w"].mean()),
    }


NOTE_W = (
    "Second analysis D-006, not the logged decision layer: raw-ERA5 physics (B1) weighted by "
    "STRATUM's probability that a persistent contrail forms"
)


def web_list(
    root: Path, day: str, salt: str, names: dict[str, str], del_bom: float
) -> tuple[list[Any] | None, list[tuple[str, pd.DataFrame]]]:
    """The day's weighted cards for the map (model "STRATUMw") and their (card id, portion rows)
    for "Why this prediction?". (None, []) when the day was not run."""
    from stratum.export import web_v1 as w1
    from stratum.export.explain import load_segments
    from stratum.export.web_export import hash_id

    d = day_dir(root, day)
    if not (d / "table3.parquet").exists():
        return None, []
    tab = pd.read_parquet(d / "table3.parquet")
    cands = pd.read_parquet(d / "candidates.parquet")
    seg = load_segments(root, day)
    members = int(read_manifest(d).params.get("members", 0))
    ef_note = (
        f"Planned-level weighted EF (w × B1 EF), 5th–95th percentile of {members} Monte Carlo "
        "members."
    )
    items = w1.stratum_list(seg, tab, cands, salt, names, del_bom, None, model="STRATUMw",
                            note=NOTE_W, ef_note=ef_note)  # fmt: skip
    parts = [
        (f"{hash_id(str(p['flight_id'].iloc[0]), salt)}_STRATUMw_{k:03d}", p)
        for k, (_, _, p) in enumerate(w1.stratum_parts(seg, tab, cands))
    ]
    return items, parts
