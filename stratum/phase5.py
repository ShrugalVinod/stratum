"""Phase 5 jobs: sample the labelling scenes, export their packages, score labeller agreement.

Drive layout (build prompt §2.3):

* ``labels/scenes/scenes.csv``: the 220 sampled scenes (200 main + 20 pilot) with their
  strata, metadata and the tuning/held-out split. **Team-internal**: labellers never see it.
* ``labels/scenes/candidates.parquet``: every candidate scene and its density (for audit).
* ``labels/scenes/pilot.zip``, ``main.zip``: the packages the labellers open in the app.
* ``labels/raw/<labeller>/<scene_id>.json``: exported labels (written by the labellers).
* ``reports/labelling/agreement_<set>.json``: agreement report.

Sampling runs **once**. If ``scenes.csv`` exists the job refuses to run again: drawing scenes
again until they look good would be leakage (pre-registered seed, Q16).
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from stratum.manifest import RunManifest, is_done, mark_success


def scenes_dir(root: Path) -> Path:
    return root / "labels" / "scenes"


def _segment_days(root: Path) -> list[date]:
    out = []
    for d in sorted((root / "interim" / "segments_met").glob("*/*")):
        if is_done(d):
            out.append(date.fromisoformat(d.name))
    return out


def _scope(root: Path, day: date) -> str | None:
    mf = root / "interim" / "segments_met" / f"{day:%Y-%m}" / f"{day:%Y-%m-%d}" / "manifest.json"
    if not mf.exists():
        return None
    scope: Any = (json.loads(mf.read_text()).get("params") or {}).get("scope")
    return None if scope is None else str(scope)


def sample_scenes_job(
    root: Path,
    seed: int,
    study_lat: tuple[float, float],
    study_lon: tuple[float, float],
    n_main: int = 200,
    n_pilot: int = 20,
    config_hash: str | None = None,
    require_domain_scope: bool = True,
) -> dict[str, Any]:
    from stratum import phase2
    from stratum.labelling import sampling as sm

    out = scenes_dir(root)
    if (out / "scenes.csv").exists():
        return {"status": "already sampled (never re-drawn)", "scenes": str(out / "scenes.csv")}
    met_root = root / "raw" / "meteosat"
    static = xr.open_zarr(met_root / "static_grid.zarr")
    lat, lon = static["lat"].values, static["lon"].values
    vza = static["vza_deg"].values
    tiles = sm.tile_table(lat, lon, vza, study_lat, study_lon)
    days = [d for d in _segment_days(root) if is_done(met_root / "clm" / f"{d:%Y-%m-%d}")]
    wrong = [str(d) for d in days if _scope(root, d) != "domain"]
    if require_domain_scope and wrong:
        return {"status": "segments not built for the whole domain (run Colab 05a)", "days": wrong}
    if not days:
        return {"status": "no day has both segments and Meteosat imagery"}
    man = RunManifest.start(
        "sample-scenes", unit="labels", config_hash=config_hash, params={"seed": seed}
    )
    parts = []
    per_day: dict[str, Any] = {}
    for d in days:
        clm = xr.open_zarr(met_root / "clm" / f"{d:%Y-%m-%d}" / "data.zarr")["cloud_mask"]
        seg = pd.read_parquet(
            root
            / "interim"
            / "segments_met"
            / f"{d:%Y-%m}"
            / f"{d:%Y-%m-%d}"
            / "segments_met.parquet",
            columns=["persists_raw", "lat_mid", "lon_mid", "alt_ft_mid", "time_mid"],
        )
        t0 = pd.Timestamp(d)
        pl = phase2.era5_window(root, "pl", t0, t0 + pd.Timedelta(hours=27))
        cc = pl["fraction_of_cloud_cover"]
        hc = cc.sel(level=cc["level"][cc["level"] <= 400]).max("level").load()
        c = sm.candidates_for_day(
            f"{d:%Y-%m-%d}",
            clm,
            seg,
            hc,
            tiles,
            static.attrs["area_proj4"],
            list(static.attrs["area_extent"]),
        )
        per_day[f"{d:%Y-%m-%d}"] = {
            "candidates": len(c),
            "persistent_segments": int(seg["persists_raw"].sum()),
        }
        parts.append(c)
    cands = pd.concat(parts, ignore_index=True)
    cls, dinfo = sm.density_classes(cands["density"].to_numpy())
    cands["density_class"] = cls
    scenes, info = sm.sample_scenes(cands, n_main, n_pilot, seed)
    out.mkdir(parents=True, exist_ok=True)
    cands.to_parquet(out / "candidates.parquet", index=False)
    scenes.to_csv(out / "scenes.csv", index=False)
    strata = scenes[scenes["role"] == "main"].groupby(["month", "tod_bin", "density_class"]).size()
    summary = {
        **info,
        "density_classes": dinfo,
        "days": per_day,
        "tiles_per_slot": len(tiles),
        "main_by_month": scenes[scenes["role"] == "main"]["month"]
        .value_counts()
        .sort_index()
        .to_dict(),
        "main_by_tod": scenes[scenes["role"] == "main"]["tod_bin"].value_counts().to_dict(),
        "main_by_density_class": {
            str(k): int(v)
            for k, v in scenes[scenes["role"] == "main"]["density_class"].value_counts().items()
        },
        "main_west_of_80e": int(scenes.loc[scenes["role"] == "main", "west_of_80e"].sum()),
        "main_vza_over_60": int((scenes.loc[scenes["role"] == "main", "vza_mean"] > 60).sum()),
        "strata_filled": len(strata),
    }
    man.stats = summary
    man.add_outputs([out / "scenes.csv", out / "candidates.parquet"])
    mark_success(out, man)
    return {"status": "sampled", **summary}


def export_packages_job(root: Path, guide_md: str | None = None) -> dict[str, Any]:
    from stratum.io.meteosat import open_day
    from stratum.labelling import packages as pk

    out = scenes_dir(root)
    scenes = pd.read_csv(out / "scenes.csv", parse_dates=["time"])
    static = xr.open_zarr(root / "raw" / "meteosat" / "static_grid.zarr")
    lat, lon = static["lat"].values, static["lon"].values
    sets: dict[str, dict[str, dict[str, bytes]]] = {"pilot": {}, "main": {}}
    for day, grp in scenes.groupby("day"):
        ds = open_day(root / "raw" / "meteosat", date.fromisoformat(str(day)))
        for _, s in grp.iterrows():
            files = pk.scene_images(ds, pd.Timestamp(s["time"]), int(s["r0"]), int(s["c0"]))
            files["meta.json"] = pk.meta_bytes(pk.scene_meta(s, lat, lon))
            sets[str(s["role"])][str(s["scene_id"])] = files
    sizes = {}
    for name, pkgs in sets.items():
        p = out / f"{name}.zip"
        pk.write_zip(p, pkgs, guide_md)
        sizes[name] = {"scenes": len(pkgs), "MB": round(p.stat().st_size / 1e6, 1)}
    return {"status": "exported", "zips": sizes}


def set_scene_ids(root: Path, set_name: str) -> set[str]:
    """Scene ids of a labelling set: pilot, test (India held-out) or calibration (expert)."""
    if set_name == "calibration":
        m = json.loads((root / "labels" / "calibration" / "calibration_map.json").read_text())
        return set(m)
    scenes = pd.read_csv(scenes_dir(root) / "scenes.csv")
    if set_name == "pilot":
        return set(scenes.loc[scenes["role"] == "pilot", "scene_id"])
    if set_name == "test":
        return set(
            scenes.loc[(scenes["role"] == "main") & (scenes["split"] == "heldout"), "scene_id"]
        )
    raise ValueError(f"unknown set {set_name!r} (pilot, test, calibration)")


def agreement_job(root: Path, labellers: list[str], seed: int, set_name: str) -> dict[str, Any]:
    """Pilot/test: every pair of labellers on the scenes both finished, plus all pairs pooled.
    Calibration: every labeller against the expert ground truth.

    On the test set each scene has exactly one pair, so the pooled numbers are the
    pre-registered scene-bootstrap agreement (Q3)."""
    from itertools import combinations

    from stratum.labelling import agreement as ag

    keep = set_scene_ids(root, set_name)
    raw = root / "labels" / "raw"
    labs = {w: {k: v for k, v in ag.read_dir(raw / w).items() if k in keep} for w in labellers}
    rep: dict[str, Any] = {"set": set_name, "scenes_in_set": len(keep), "labellers": labellers}
    if set_name == "calibration":
        experts = ag.read_dir(root / "labels" / "calibration" / "expert_labels")
        rep["vs_experts"] = {w: ag.agreement(labs[w], experts, seed=seed) for w in labellers}
    else:
        pa: dict[str, ag.SceneLabel] = {}
        pb: dict[str, ag.SceneLabel] = {}
        rep["pairs"] = {}
        for a, b in combinations(labellers, 2):
            rep["pairs"][f"{a}-{b}"] = ag.agreement(labs[a], labs[b], seed=seed)
            for sid in set(labs[a]) & set(labs[b]):
                pa[f"{sid}|{a}-{b}"] = labs[a][sid]
                pb[f"{sid}|{a}-{b}"] = labs[b][sid]
        rep["pooled"] = ag.agreement(pa, pb, seed=seed)
    d = root / "reports" / "labelling"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"agreement_{set_name}.json").write_text(json.dumps(rep, indent=1, default=_np_default))
    return rep


def make_test_zip(root: Path, guide_md: str | None = None) -> dict[str, Any]:
    """test.zip = the 100 India held-out scenes, copied from main.zip (no re-sampling)."""
    import zipfile

    keep = set_scene_ids(root, "test")
    src = zipfile.ZipFile(scenes_dir(root) / "main.zip")
    out = scenes_dir(root) / "test.zip"
    n = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:
        for name in src.namelist():
            sid = name.split("/")[0]
            if sid in keep:
                z.writestr(name, src.read(name))
                n += name.endswith("meta.json")
        if guide_md is not None:
            z.writestr("labelling_guide.md", guide_md)
    return {"test_zip": str(out), "scenes": n, "MB": round(out.stat().st_size / 1e6, 1)}


def make_calibration_zip(
    root: Path, dlr_dir: Path, seed: int, guide_md: str | None = None
) -> dict[str, Any]:
    """calibration.zip (20 expert scenes for the labellers) + the private expert answers.

    Scene ids are neutral (C001…C020, random order) so the dataset's scene numbers are not shown;
    the mapping and the expert labels stay in labels/calibration/ (not shared with labellers)."""
    import zipfile

    from stratum.labelling import dlr

    picks = dlr.calibration_scenes(seed)
    rng = np.random.default_rng(seed + 1)
    ids = [f"C{i:03d}" for i in rng.permutation(len(picks)) + 1]
    cal = root / "labels" / "calibration"
    (cal / "expert_labels").mkdir(parents=True, exist_ok=True)
    out = scenes_dir(root) / "calibration.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, Any] = {}
    n_lines = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:
        for sid, num in sorted(zip(ids, picks, strict=True)):
            arrs = dlr.scene_arrays(dlr_dir / "data" / f"scene_{num:03d}.nc")
            files, o = dlr.calibration_package(sid, arrs)
            for k, v in files.items():
                z.writestr(f"{sid}/{k}", v)
            lines = dlr.expert_polylines(dlr_dir / "geojson" / f"scene_{num:03d}.geojson", o)
            n_lines += len(lines)
            (cal / "expert_labels" / f"{sid}.json").write_text(
                json.dumps(dlr.expert_label_json(sid, lines), indent=1)
            )
            mapping[sid] = {
                "dlr_scene": num,
                "flip_rows": o.flip_rows,
                "flip_cols": o.flip_cols,
                "expert_lines": len(lines),
            }
        if guide_md is not None:
            z.writestr("labelling_guide.md", guide_md)
    (cal / "calibration_map.json").write_text(json.dumps(mapping, indent=1))
    return {
        "calibration_zip": str(out),
        "scenes": len(picks),
        "expert_lines": n_lines,
        "MB": round(out.stat().st_size / 1e6, 1),
    }


def _np_default(o: Any) -> Any:
    if isinstance(o, np.generic):
        return o.item()
    raise TypeError(type(o))


def gallery_job(
    root: Path, labeller_a: str, labeller_b: str, set_name: str, zip_name: str | None = None
) -> dict[str, Any]:
    """Side-by-side figures of every scene where the two labellers disagree (build prompt §5.3).

    Each figure shows the BTD image three times: labeller A's lines, labeller B's lines, and
    both together; lines the other labeller has no match for are drawn thick."""
    import io
    import zipfile

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image

    from stratum.labelling import agreement as ag

    zpath = scenes_dir(root) / f"{zip_name or set_name}.zip"
    z = zipfile.ZipFile(zpath)
    keep = set_scene_ids(root, set_name)

    def labels_of(who: str) -> dict[str, ag.SceneLabel]:
        d = root / "labels" / ("calibration/expert_labels" if who == "experts" else f"raw/{who}")
        return {k: v for k, v in ag.read_dir(d).items() if k in keep}

    la = labels_of(labeller_a)
    lb = labels_of(labeller_b)
    out = root / "reports" / "labelling" / f"gallery_{set_name}" / f"{labeller_a}-{labeller_b}"
    out.mkdir(parents=True, exist_ok=True)
    made = []
    for sid in sorted(set(la) & set(lb)):
        a, b = la[sid], lb[sid]
        dis = ag.disagreements(a, b)
        if not dis["unmatched_A"] and not dis["unmatched_B"] and a.status == b.status:
            continue
        img = np.asarray(Image.open(io.BytesIO(z.read(f"{sid}/btd.png"))))
        fig, axes = plt.subplots(1, 3, figsize=(13, 4.6))
        A, B = a.sure + a.uncertain, b.sure + b.uncertain
        nsa = len(a.sure)
        nsb = len(b.sure)
        for k, ax in enumerate(axes):
            ax.imshow(img, cmap="gray", vmin=60, vmax=200)
            ax.set_xticks([])
            ax.set_yticks([])
            if k in (0, 2):
                for i, p in enumerate(A):
                    ax.plot(
                        p[:, 1],
                        p[:, 0],
                        color="#ff8c1a",
                        lw=2.6 if i in dis["unmatched_A"] else 1.1,
                        ls="-" if i < nsa else "--",
                    )
            if k in (1, 2):
                for j, p in enumerate(B):
                    ax.plot(
                        p[:, 1],
                        p[:, 0],
                        color="#29d3ff",
                        lw=2.6 if j in dis["unmatched_B"] else 1.1,
                        ls="-" if j < nsb else "--",
                    )
        axes[0].set_title(f"{labeller_a} ({a.status})", color="#c76a00")
        axes[1].set_title(f"{labeller_b} ({b.status})", color="#0a7ea4")
        axes[2].set_title("both: thick = no match in the other labeller, dashed = uncertain")
        fig.suptitle(
            f"{sid}: disagreement for discussion (Meteosat-9 BTD © EUMETSAT, team-internal)"
        )
        fig.tight_layout()
        fig.savefig(out / f"{sid}.png", dpi=110)
        plt.close(fig)
        made.append(sid)
    return {"status": "done", "figures": len(made), "dir": str(out), "scenes": made}
