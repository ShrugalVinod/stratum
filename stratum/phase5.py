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


def agreement_job(
    root: Path, labeller_a: str, labeller_b: str, seed: int, set_name: str
) -> dict[str, Any]:
    from stratum.labelling import agreement as ag

    scenes = pd.read_csv(scenes_dir(root) / "scenes.csv")
    keep = set(scenes.loc[scenes["role"] == set_name, "scene_id"])
    la = {k: v for k, v in ag.read_dir(root / "labels" / "raw" / labeller_a).items() if k in keep}
    lb = {k: v for k, v in ag.read_dir(root / "labels" / "raw" / labeller_b).items() if k in keep}
    rep = ag.agreement(la, lb, seed=seed)
    rep["set"] = set_name
    rep["scenes_in_set"] = len(keep)
    d = root / "reports" / "labelling"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"agreement_{set_name}.json").write_text(json.dumps(rep, indent=1, default=_np_default))
    return rep


def _np_default(o: Any) -> Any:
    if isinstance(o, np.generic):
        return o.item()
    raise TypeError(type(o))


def gallery_job(root: Path, labeller_a: str, labeller_b: str, set_name: str) -> dict[str, Any]:
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

    zpath = scenes_dir(root) / f"{set_name}.zip"
    z = zipfile.ZipFile(zpath)
    la = ag.read_dir(root / "labels" / "raw" / labeller_a)
    lb = ag.read_dir(root / "labels" / "raw" / labeller_b)
    out = root / "reports" / "labelling" / f"gallery_{set_name}"
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
