"""Release bundle of derived data (build prompt §8.3).

``stratum release-bundle`` (Colab 08b) writes ``release/<version>/`` on Drive and a zip:

* ``segments_predictions_labels.parquet`` — every labelled segment of a **commercial** flight:
  salted-hash flight id, day, hour, season, position rounded to 0.25°, flight level, the satellite
  label (D-004) and its sensitivity variants, B0–B3, the CoCiP variant and every Phase 7 forecast
  for the seasonal fold that held the segment out. No ICAO24, callsign or exact track.
* ``decisions/<day>.csv`` — the ranked avoidance lists (commercial only, hashed ids).
* ``labels/`` — the India contrail-line labels (D-003), labellers pseudonymised (L1, L2, …).
* ``models/`` and ``correction/`` — the frozen Phase 7 models and humidity corrections.
* ``reports/`` — evaluation reports v1 and v2, the model validation report.
* ``results.json``, ``locks/``, ``configs/``, the data card, CITATION.cff, LICENSE.

Raw data (ADS-B tracks, ERA5, Meteosat imagery, DLR labels) are **not** included; the repository's
scripts download them again (EUMETSAT forbids redistributing the original numerical data).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pandas as pd

LABEL_COLS = ["y", "y_k1", "y_k3", "y_age_20_90", "y_age_40_120"]
BASE_COLS = ["B0", "B0_all", "B1", "B2", "B3", "B1_cocip", "cocip_contrail", "detectable"]
DOCS = ["docs/data_card.md", "CITATION.cff", "LICENSE", "docs/deviations.md", "docs/decisions.md"]


def segments_table(root: Path, salt: str) -> pd.DataFrame:
    from stratum import config as cfg
    from stratum.export.web_export import hash_id
    from stratum.model import features as fe
    from stratum.model import run as mr

    pre = cfg.load_preregistered()
    t = pd.read_parquet(root / "interim" / "evaluation" / "table.parquet")
    t = fe.attach(root, t, list(pre.correction_model.features))
    t = mr.predict_heldout(t, pre, mr.model_dir(root))  # each segment's own held-out fold
    t = t[t["commercial"].fillna(False).astype(bool)].reset_index(drop=True)
    fids = {f: hash_id(str(f), salt) for f in t["flight_id"].unique()}
    out = pd.DataFrame({
        "flight": t["flight_id"].map(fids),
        "day": t["day"],
        "hour_utc": pd.to_datetime(t["time_mid"], utc=True).dt.hour,
        "season": t["season"],
        "lat": (t["lat_mid"] * 4).round() / 4,
        "lon": (t["lon_mid"] * 4).round() / 4,
        "flight_level": (t["alt_ft_mid"] / 100).round().astype("Int64"),
        "night": t["night_fraction"] > 0.5,
    })  # fmt: skip
    tol = [c for c in t.columns if c.startswith("y_tol_")]
    keep = [c for c in LABEL_COLS + tol + BASE_COLS if c in t]
    keep += [c for c in mr.PRED_COLS if c in t]  # seasonal folds; the spatial ones are in reports
    for c in keep:
        out[c] = t[c].to_numpy()
    out.insert(1, "segment", [f"{f}_{i:05d}" for i, f in enumerate(out["flight"])])
    return out


def decisions(root: Path, salt: str, dest: Path) -> int:
    from stratum.export.web_export import hash_id

    n = 0
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted((root / "interim" / "decisions").glob("*/*/table3.parquet")):
        tab = pd.read_parquet(f)
        if "commercial" in tab:
            tab = tab[tab["commercial"].fillna(False).astype(bool)]
        tab = tab.assign(flight=tab["flight_id"].map(lambda x: hash_id(str(x), salt)))
        drop = ("flight_id", "portion_id", "callsign", "icao24")
        tab = tab.drop(columns=[c for c in drop if c in tab])
        tab.insert(0, "flight", tab.pop("flight"))
        tab.to_csv(dest / f"{f.parent.name}.csv", index=False)
        n += len(tab)
    return n


def _copy(src: Path, dst: Path, pattern: str = "*") -> int:
    if not src.exists():
        return 0
    n = 0
    for p in src.rglob(pattern):
        if p.is_file() and ".lock" not in p.name:
            q = dst / p.relative_to(src)
            q.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, q)
            n += 1
    return n


def labels(root: Path, dest: Path) -> int:
    """Line labels (JSON) per labeller, folder names replaced by L1, L2, … (sorted order)."""
    raw = root / "labels" / "raw"
    if not raw.exists():
        return 0
    who = sorted(d for d in raw.iterdir() if d.is_dir())
    return sum(_copy(d, dest / f"L{i}", "*.json") for i, d in enumerate(who, 1))


def build(root: Path, repo: Path, out_root: Path, version: str, salt: str) -> dict[str, Any]:
    from stratum.export.web_export import web_json
    from stratum.export.web_v1 import build_results

    out = out_root / version
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    seg = segments_table(root, salt)
    seg.to_parquet(out / "segments_predictions_labels.parquet", index=False)
    info: dict[str, Any] = {"version": version, "segments": len(seg)}
    info["flights"] = int(seg["flight"].nunique())
    info["decision_rows"] = decisions(root, salt, out / "decisions")
    info["label_files"] = labels(root, out / "labels")
    info["model_files"] = _copy(root / "interim" / "model", out / "models")
    info["correction_files"] = _copy(root / "interim" / "correction", out / "correction")
    rep = root / "reports"
    lines = (root / "_locks" / "final_runs.jsonl").read_text().splitlines()
    n_rep = sum(_copy(rep / json.loads(x)["run_id"], out / "reports" / json.loads(x)["run_id"])
                for x in lines if x.strip())  # fmt: skip
    for name in ("evaluation_report_v2", "phase7_h34_context"):
        n_rep += _copy(rep / name, out / "reports" / name)
    val = sorted((rep / "phase7_validation").glob("*/model_validation.html"))
    if val:
        n_rep += _copy(val[-1].parent, out / "reports" / "phase7_validation")
    info["report_files"] = n_rep
    (out / "results.json").write_text(web_json(build_results(root), indent=1))
    _copy(repo / "_locks", out / "locks")
    _copy(repo / "configs", out / "configs")
    for f in DOCS:
        if (repo / f).exists():
            shutil.copy2(repo / f, out / Path(f).name)
    (out / "README.md").write_text(README.format(**info))
    z = shutil.make_archive(str(out_root / f"stratum-release-{version}"), "zip", out_root, version)
    info["zip"] = z
    info["zip_MB"] = round(Path(z).stat().st_size / 1e6, 1)
    return info


README = """# STRATUM derived-data release {version}

See `data_card.md` for what each file is, how it was made, its biases and licences, and
`CITATION.cff` for how to cite. Results: `results.json` (every number from the logged final runs in
`locks/final_runs.jsonl`) and `reports/`. Code and the scripts that re-download the raw data:
https://github.com/ShrugalVinod/stratum

Contents: {segments} labelled segments from {flights} commercial flights; {decision_rows} avoidance
candidates; {label_files} label files; {model_files} model files; {report_files} report files.
Computational estimates only; air traffic control feasibility is not modelled.
"""
