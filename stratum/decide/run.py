"""Decision layer jobs (build prompt §7.6): corrected physics, alternatives, Monte Carlo, ranking.

Per held-out day (resumable, one ``_SUCCESS`` per day):

1. ``corrected_domain_day``: CoCiP (central run, contrails followed 24 h) over every flight in
   the study domain with the learned humidity correction of the fold that holds the day out
   (``interim/cocip_domain/STRATUM/``). Its EF feeds H3 and H4. The segments it "flags" are its
   persistent contrails with positive EF (warming); cooling contrails are not avoidance targets.
2. ``decide_day``: every flagged portion × each feasible alternative (±2,000 / ±4,000 ft) is
   flown again through CoCiP. Only the stretch of flight that an alternative changes is run
   (planned and alternative alike): CoCiP treats every segment's contrail independently, so the
   EF of unchanged segments cancels exactly in the difference. Monte Carlo member 0 is the
   central run; members 1…N pair (i)+(ii) a humidity draw (band ``s`` refitted, with detection
   efficiency ε recomputed, on a day-bootstrap of the fold's training rows), (iii) CoCiP's own
   parameter draw (``CocipUncertaintyParams``) and (iv) an efficacy draw (Q5), identically for
   the planned and every alternative flight.
   Net warming avoided (kg CO₂e, per horizon) = CO₂e(EF_planned − EF_alt) − 3.16 × extra fuel.
   Best alternative = the largest lower bound (5th percentile, the smaller of the two horizons);
   **alert only if that lower bound is > 0 under both horizons**. Single-horizon counterfactual
   alerts are stored too, and so is the alert without credit for a fuel saving (OpenAP often
   finds a higher level slightly cheaper; such an alert would not be about the contrail).

The correction is fitted with detection efficiency (``stratum/model/correction.py``; Team OK
"Option 2", 18 Oct 2026), so the corrected physics describes persistent contrails, not only the
ones Meteosat could see.
"""

from __future__ import annotations

import json
import warnings
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.decide import alternatives as al
from stratum.decide import climate_metric as cm
from stratum.decide import humidity as hu
from stratum.manifest import RunManifest, is_done, mark_success

Array = npt.NDArray[np.float64]
CO2_PER_KG_FUEL = 3.16  # preregistered.yaml avoidance.co2_per_kg_fuel
HORIZONS = (20, 100)
MIN_EXAMPLES = 50  # open question 14
FL_BANDS = [0, 300, 340, 380, 1000]


def _day_dir(root: Path, kind: str, day: str) -> Path:
    return root / "interim" / kind / day[:7] / day


def corrected_domain_day(
    root: Path,
    day: str,
    bands: list[tuple[float, float]],
    cdir: Path,
    max_age_h: float = 24.0,
    force: bool = False,
) -> dict[str, Any]:
    from stratum.phase2 import cocip_day

    sc, s = hu.scaling_for_day(cdir, day, bands)
    return cocip_day(
        root,
        date.fromisoformat(day),
        "STRATUM",
        members=0,
        max_age_h=max_age_h,
        corridor_only=False,
        force=force,
        kind="cocip_domain",
        scaling_obj=sc,
        extra_params={"s_by_band": s, "fold": hu.fold_for_day(day)},
    )


def _variant_frames(
    seg: pd.DataFrame, flagged: set[str], deltas: list[int]
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Cropped planned/alternative segment rows (flight_id = variant id) and the candidate table."""
    rows, cands = [], []
    seg = seg.assign(flagged=seg["segment_id"].isin(flagged))
    for fid, g in seg.sort_values(["flight_id", "time_start"]).groupby("flight_id", sort=False):
        if not g["flagged"].any() or g["openap_type"].isna().all():
            continue
        g = g.reset_index(drop=True)
        for k, (first, last) in enumerate(al.portions(g)):
            alts = {d: al.build(g, first, last, float(d)) for d in deltas}
            ok = {d: a for d, a in alts.items() if a.feasible}
            span = np.zeros(len(g), bool)
            span[first : last + 1] = True
            for a in ok.values():
                span |= a.changed
            idx = np.flatnonzero(span)
            lo, hi = int(idx.min()), int(idx.max())
            pid = f"{fid}|p{k}"
            crop = g.iloc[lo : hi + 1]
            rows.append(crop.assign(flight_id=f"{pid}|0"))
            for d, a in ok.items():
                rows.append(al.apply(g, a).iloc[lo : hi + 1].assign(flight_id=f"{pid}|{d:+d}"))
            for d, a in alts.items():
                cands.append(
                    {
                        "portion_id": pid,
                        "flight_id": fid,
                        "delta_ft": d,
                        "feasible": a.feasible,
                        "reason": a.reason,
                        "extra_fuel_kg": a.extra_fuel_kg if a.feasible else np.nan,
                        "first": first,
                        "last": last,
                        "crop_segments": hi - lo + 1,
                    }
                )
    frames = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    return frames, pd.DataFrame(cands)


def _ef_by_variant(
    flights: list[Any],
    met: Any,
    rad: Any,
    scaling: Any,
    params: dict[str, Any] | None,
    max_age_h: float,
) -> pd.Series:
    from pycontrails.models.cocip import Cocip

    from stratum.physics.cocip_runner import _frames

    warnings.filterwarnings("ignore", module="pycontrails")
    kw: dict[str, Any] = {
        "met": met,
        "rad": rad,
        "humidity_scaling": scaling,
        "max_age": np.timedelta64(int(max_age_h * 3600), "s"),
    }
    if params:
        kw["params"] = params
    df = _frames(Cocip(**kw).eval(source=flights))
    n_seg = {fl.attrs["flight_id"]: len(fl) - 1 for fl in flights}
    df = df[df["waypoint"] < df["flight_id"].map(n_seg)]
    ef = df.assign(ef=df["ef"].fillna(0.0)).groupby("flight_id")["ef"].sum()
    return ef.reindex(list(n_seg), fill_value=0.0)


def summarise_candidates(cands: pd.DataFrame, ef: pd.DataFrame, efficacy: Array) -> pd.DataFrame:
    """Per portion × alternative: net warming avoided percentiles per horizon.

    ``ef``: rows = variant ids (``<portion>|0`` planned, ``<portion>|+2000`` …), columns =
    Monte Carlo members (member 0 = central)."""
    out = []
    for r in cands.itertuples():
        base = dict(r._asdict())
        base.pop("Index", None)
        planned = ef.loc[f"{r.portion_id}|0"].to_numpy(float)
        base["ef_planned_p05"], base["ef_planned_p50"], base["ef_planned_p95"] = np.percentile(
            planned, [5, 50, 95]
        )
        if r.feasible:
            d_ef = planned - ef.loc[f"{r.portion_id}|{r.delta_ft:+d}"].to_numpy(float)
            extra_co2 = CO2_PER_KG_FUEL * r.extra_fuel_kg
            base["extra_co2_kg"] = extra_co2
            base["d_ef_central_J"] = float(d_ef[0])
            for h in HORIZONS:
                gain = cm.co2e_kg(d_ef, h, efficacy)
                net = gain - extra_co2
                p5, p50, p95 = np.percentile(net, [5, 50, 95])
                base[f"net_h{h}_p05"], base[f"net_h{h}_p50"], base[f"net_h{h}_p95"] = p5, p50, p95
                # the same without credit for a fuel saving (a level that simply burns less)
                base[f"net_nofuelcredit_h{h}_p05"] = float(
                    np.percentile(gain - max(extra_co2, 0.0), 5)
                )
            base["lower_bound"] = min(base["net_h20_p05"], base["net_h100_p05"])
        out.append(base)
    return pd.DataFrame(out)


def rank(c: pd.DataFrame) -> pd.DataFrame:
    """One row per portion: the best feasible alternative by lower bound; the alert rule."""
    rows = []
    for pid, g in c.groupby("portion_id", sort=False):
        f = g[g["feasible"]]
        row: dict[str, Any] = {
            "portion_id": pid,
            "flight_id": g["flight_id"].iloc[0],
            "alternatives_feasible": len(f),
            "rejected": "; ".join(
                f"{d:+d} ft: {why}"
                for d, why in zip(
                    g.loc[~g["feasible"], "delta_ft"], g.loc[~g["feasible"], "reason"], strict=True
                )
            ),
        }
        if len(f):
            b = f.loc[f["lower_bound"].idxmax()]
            row.update({k: b[k] for k in b.index if k not in row and k not in ("reason",)})
            row["best_delta_ft"] = int(b["delta_ft"])
            row["alert"] = bool(b["net_h20_p05"] > 0 and b["net_h100_p05"] > 0)
            row["alert_without_fuel_credit"] = bool(
                b["net_nofuelcredit_h20_p05"] > 0 and b["net_nofuelcredit_h100_p05"] > 0
            )
            row["alert_if_h20_only"] = bool((f["net_h20_p05"] > 0).any())
            row["alert_if_h100_only"] = bool((f["net_h100_p05"] > 0).any())
        else:
            row.update(
                {
                    "alert": False,
                    "alert_if_h20_only": False,
                    "alert_if_h100_only": False,
                    "alert_without_fuel_credit": False,
                    "lower_bound": np.nan,
                }
            )
        rows.append(row)
    out = pd.DataFrame(rows)
    return out.sort_values("lower_bound", ascending=False, na_position="last").reset_index(
        drop=True
    )


def confidence_cells(labelled: pd.DataFrame, bands: list[tuple[float, float]]) -> pd.Series:
    """Labelled examples per (season, lat band, FL band, VZA band, day/night) cell."""
    return labelled.groupby(cell_keys(labelled, bands)).size()


def cell_keys(t: pd.DataFrame, bands: list[tuple[float, float]]) -> list[pd.Series]:
    from stratum.evaluate.table import VZA_BANDS
    from stratum.model.scaling import band_index

    lat_band = pd.Series(
        band_index(t["lat_mid"].to_numpy(float), bands), index=t.index, name="lat_band"
    )
    fl = pd.cut(t["alt_ft_mid"] / 100.0, FL_BANDS, right=False).astype(str).rename("fl_band")
    vza = pd.cut(t["vza_median"], VZA_BANDS, right=False).astype(str).rename("vza_band")
    dn = pd.Series(
        np.where(t["night_fraction"] > 0.5, "night", "day"), index=t.index, name="day_night"
    )
    return [t["season"].rename("season"), lat_band, fl, vza, dn]


def decide_day(
    root: Path,
    day: str,
    pre: Any,
    cdir: Path,
    s_draws: Array,
    members: int,
    seed: int,
    max_age_h: float = 24.0,
    force: bool = False,
) -> dict[str, Any]:
    """Alternatives, Monte Carlo and ranking for one held-out day (needs corrected_domain_day)."""
    from pycontrails import MetDataset
    from pycontrails.models.cocip import CocipUncertaintyParams

    from stratum.phase2 import era5_window
    from stratum.physics.cocip_runner import segments_to_flights

    out_dir = _day_dir(root, "decisions", day)
    if is_done(out_dir) and not force:
        return {"day": day, "status": "already done"}
    corr_dir = _day_dir(root, "cocip_domain/STRATUM", day)
    if not is_done(corr_dir):
        return {"day": day, "status": "corrected CoCiP missing"}
    bands = [tuple(b) for b in pre.correction_model.latitude_bands_deg]
    seg = pd.read_parquet(_day_dir(root, "segments_met", day) / "segments_met.parquet")
    corr = pd.read_parquet(
        corr_dir / "segments.parquet", columns=["segment_id", "persistent_1", "ef"]
    )
    # flagged = persistent contrail under the corrected humidity that warms (EF > 0): avoiding a
    # cooling contrail is not the aim, and rewarding a move into one would be perverse
    warm = (corr["persistent_1"].fillna(0) > 0) & (corr["ef"].fillna(0) > 0)
    flagged = set(corr.loc[warm, "segment_id"])
    deltas = [int(d) for d in pre.avoidance.alternatives_ft]
    frames, cands = _variant_frames(seg, flagged, deltas)
    out_dir.mkdir(parents=True, exist_ok=True)
    man = RunManifest.start(
        "decide-day",
        unit=day,
        params={
            "members": members,
            "seed": seed,
            "max_age_h": max_age_h,
            "fold": hu.fold_for_day(day),
            "flagged_segments": len(flagged),
        },
    )
    if cands.empty:
        pd.DataFrame().to_parquet(out_dir / "candidates.parquet")
        pd.DataFrame().to_parquet(out_dir / "ranked.parquet")
        man.stats = {"portions": 0, "alerts": 0}
        mark_success(out_dir, man)
        return {"day": day, "status": "done", "portions": 0}
    flights = segments_to_flights(frames)
    t0 = pd.Timestamp(day)
    t1 = t0 + pd.Timedelta(hours=24 + max_age_h + 1)
    met = MetDataset(era5_window(root, "pl", t0, t1).load())
    rad = MetDataset(era5_window(root, "sl", t0, t1).load())
    edges = hu.edges(bands)
    _, s_central = hu.scaling_for_day(cdir, day, bands)
    cols = []
    for m in range(members + 1):
        s = s_central if m == 0 else list(s_draws[(m - 1) % len(s_draws)])
        params = None if m == 0 else CocipUncertaintyParams(seed=seed + m).as_dict()
        cols.append(_ef_by_variant(flights, met, rad, hu.scaling(edges, s), params, max_age_h))
    ef = pd.concat(cols, axis=1)
    ef.columns = [f"m{m}" for m in range(members + 1)]
    eff = np.r_[cm.EFFICACY_CENTRAL, cm.draw_efficacy(members, seed)]
    c = summarise_candidates(cands, ef, eff)
    ranked = rank(c)
    ef.to_parquet(out_dir / "ef_members.parquet")
    c.to_parquet(out_dir / "candidates.parquet", index=False)
    ranked.to_parquet(out_dir / "ranked.parquet", index=False)
    man.stats = {
        "portions": len(ranked),
        "alerts": int(ranked["alert"].sum()),
        "variants": len(flights),
    }
    mark_success(out_dir, man)
    (out_dir / "s_central.json").write_text(json.dumps({"s_by_band": s_central}))
    return {"day": day, "status": "done", **man.stats}
