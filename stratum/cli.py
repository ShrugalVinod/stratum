"""The ``stratum`` command-line tool.

What it does
------------
One entry point for every pipeline step, so the same commands run on a laptop, in CI and in
Colab (build prompt §0.3). Phase 0 provides the guard-rail commands:

* ``stratum info``: environment, paths and config hash (first thing to run anywhere).
* ``stratum init-drive``: create the standard Drive folder layout (build prompt §2.3).
* ``stratum write-corridor``: write the Delhi–Mumbai corridor polygon GeoJSON.
* ``stratum lock-preregistration`` / ``stratum verify-lock``: freeze and check the
  pre-registered plan (build prompt §0.4, §6.8).

Later phases add their own subcommands (``download-era5``, ``ingest-adsb``, …).
Every command ends by printing a summary table.
"""

from __future__ import annotations

import os

# Colab exports MPLBACKEND=module://matplotlib_inline…, which a plain subprocess cannot use;
# all STRATUM figures are written to files, so force the file backend before matplotlib loads.
if os.environ.get("MPLBACKEND", "").startswith("module://"):
    os.environ["MPLBACKEND"] = "agg"

import json
import shutil
from datetime import UTC
from pathlib import Path
from typing import Annotated, Any

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from stratum import config as cfg
from stratum import lock as lk
from stratum.manifest import git_commit, software_versions
from stratum.paths import create_drive_layout, drive_root, is_colab, repo_root, work_dir

app = typer.Typer(help="STRATUM pipeline commands.", no_args_is_help=True, add_completion=False)
console = Console()


@app.callback()
def _load_env() -> None:
    """STRATUM pipeline commands. Secrets are read from ``.env`` (never printed)."""
    # Existing environment variables (e.g. Colab Secrets exported by a launcher) win over .env.
    load_dotenv(repo_root() / ".env", override=False)
    # Show STRATUM's own progress messages (e.g. "ARCO pl 2026-02-03 done"), not other libraries'.
    import logging

    lg = logging.getLogger("stratum")
    if not lg.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))
        lg.addHandler(h)
        lg.setLevel(logging.INFO)


def _summary(title: str, rows: dict[str, object]) -> None:
    table = Table(title=title, show_header=False, title_justify="left")
    table.add_column("item", style="bold")
    table.add_column("value")
    for k, v in rows.items():
        table.add_row(k, str(v))
    console.print(table)


@app.command()
def info() -> None:
    """Print environment, paths, git commit and config hash."""
    sha, dirty = git_commit()
    prereg = cfg.load_preregistered()
    domain = cfg.load_domain()
    cfg.check_consistency(prereg, domain)
    rows: dict[str, object] = {
        "repo": repo_root(),
        "git commit": f"{sha[:12]}{' (dirty)' if dirty else ''}",
        "running in Colab": is_colab(),
        "drive root": drive_root(),
        "work dir": work_dir(),
        "config hash": cfg.config_hash()[:16],
        "preregistered.yaml": "valid",
    }
    rows.update({f"pkg {k}": v for k, v in software_versions().items()})
    _summary("stratum info", rows)


@app.command("init-drive")
def init_drive() -> None:
    """Create the standard Drive folder layout under the drive root (idempotent)."""
    root = drive_root()
    created = create_drive_layout(root)
    _summary("init-drive", {"drive root": root, "folders created": len(created)})


@app.command("write-corridor")
def write_corridor() -> None:
    """Write configs/corridor_<name>.geojson from configs/domain.yaml."""
    domain = cfg.load_domain()
    feature = cfg.corridor_geojson(domain.corridor)
    out = cfg.configs_dir() / f"corridor_{domain.corridor.name}.geojson"
    out.write_text(json.dumps(feature, indent=1) + "\n", encoding="utf-8")
    poly = cfg.corridor_polygon(domain.corridor)
    _summary(
        "write-corridor",
        {"file": out, "vertices": len(poly.exterior.coords), "bounds (lon/lat)": poly.bounds},
    )


@app.command("ingest-adsb")
def ingest_adsb(
    day: Annotated[str, typer.Option(help="UTC day, YYYY-MM-DD (ADS-B Exchange: a 1st of month)")],
    source: Annotated[
        str, typer.Option(help="adsbx (opensky arrives when access is granted)")
    ] = "adsbx",
    hours: Annotated[str, typer.Option(help="e.g. '0-23' or '6' or '0,6,12'")] = "0-23",
    max_snapshots: Annotated[
        int | None, typer.Option(help="TEST ONLY: first N snapshots per hour")
    ] = None,
    workers: Annotated[int, typer.Option(help="parallel downloads")] = 16,
) -> None:
    """Ingest one day of ADS-B into <drive>/raw/adsb/<source>/YYYY-MM-DD/ (resumable)."""
    from datetime import date as _date

    from stratum.flights.clean import daily_summary
    from stratum.io import adsb_adsbx

    if source != "adsbx":
        console.print(
            "[red]Only --source adsbx exists so far (OpenSky: when access is granted).[/red]"
        )
        raise typer.Exit(2)
    d = _date.fromisoformat(day)
    if "-" in hours:
        a, b = (int(x) for x in hours.split("-"))
        hour_list = list(range(a, b + 1))
    else:
        hour_list = [int(x) for x in hours.split(",")]
    out_root = drive_root() / "raw" / "adsb" / "adsbx"
    s = adsb_adsbx.ingest_day(
        d,
        out_root,
        hours=hour_list,
        workers=workers,
        max_snapshots_per_hour=max_snapshots,
        config_hash=cfg.config_hash(),
    )
    df = adsb_adsbx.read_day(out_root / f"{d:%Y-%m-%d}")
    rows: dict[str, object] = {
        k: v for k, v in s.items() if k not in ("hours_done", "hours_skipped")
    }
    rows["hours written now"] = s["hours_done"]
    rows["hours already on disk"] = s["hours_skipped"]
    rows.update({f"day: {k}": v for k, v in daily_summary(df).items()})
    _summary(f"ingest-adsb {source} {d}", rows)


@app.command("build-segments")
def build_segments(
    month: Annotated[str, typer.Option(help="YYYY-MM (every complete ADS-B day in it)")],
    corridor: Annotated[
        str, typer.Option(help="DEL-BOM, or 'none' for the full domain")
    ] = "DEL-BOM",
    source: Annotated[str, typer.Option(help="adsbx (opensky when granted)")] = "adsbx",
    days: Annotated[str | None, typer.Option(help="only these days, e.g. '1' or '1,15'")] = None,
    force: Annotated[bool, typer.Option(help="recompute days that are already done")] = False,
    scope: Annotated[
        str,
        typer.Option(help="corridor (keep corridor flights) or domain (keep all, flag corridor)"),
    ] = "corridor",
) -> None:
    """Phase 2/5: ADS-B → cleaned 1-min segments + ERA5 features + η + SAC flags (per day)."""
    from datetime import date as _date

    from stratum import phase2

    root = drive_root()
    poly = None if corridor.lower() == "none" else cfg.corridor_polygon(cfg.load_domain().corridor)
    day_list = phase2.days_with_adsb(root, month, source)
    if days:
        y, m = (int(x) for x in month.split("-"))
        day_list = [_date(y, m, int(d)) for d in days.split(",")]
    if not day_list:
        console.print(f"[red]No complete {source} days in {month}.[/red]")
        raise typer.Exit(1)
    for d in day_list:
        res = phase2.build_segments_day(
            root,
            d,
            source,
            poly,
            config_hash=cfg.config_hash(),
            force=force,
            keep_all=scope == "domain",
        )
        _summary(f"build-segments {d}", res)


@app.command("run-cocip")
def run_cocip(
    month: Annotated[str, typer.Option(help="YYYY-MM")],
    scaling: Annotated[str, typer.Option(help="B1, B2, B3 or all")] = "all",
    members: Annotated[int, typer.Option(help="Monte Carlo members (Q12/D-001: 100)")] = 100,
    max_age_h: Annotated[float, typer.Option(help="CoCiP max contrail age, hours")] = 24.0,
    days: Annotated[str | None, typer.Option(help="only these days, e.g. '1'")] = None,
    source: Annotated[str, typer.Option(help="adsbx (opensky when granted)")] = "adsbx",
    force: Annotated[bool, typer.Option(help="recompute days that are already done")] = False,
) -> None:
    """Phase 2: CoCiP on each day's corridor flights for B1/B2/B3 (resumable per day)."""
    from datetime import date as _date

    from stratum import phase2
    from stratum.physics.cocip_runner import SCALINGS

    root = drive_root()
    scalings = list(SCALINGS) if scaling == "all" else [scaling]
    day_list = phase2.days_with_adsb(root, month, source)
    if days:
        y, m = (int(x) for x in month.split("-"))
        day_list = [_date(y, m, int(d)) for d in days.split(",")]
    for d in day_list:
        for sc in scalings:
            res = phase2.cocip_day(
                root,
                d,
                sc,
                members=members,
                max_age_h=max_age_h,
                config_hash=cfg.config_hash(),
                force=force,
            )
            _summary(f"run-cocip {sc} {d}", res)


@app.command("cocip-convergence")
def cocip_convergence(
    day: Annotated[str, typer.Option(help="YYYY-MM-DD (a day already run by build-segments)")],
    scaling: Annotated[str, typer.Option(help="B1, B2 or B3")] = "B1",
    max_age_h: Annotated[float, typer.Option(help="CoCiP max contrail age, hours")] = 24.0,
    n_small: Annotated[int, typer.Option(help="members in the smaller ensemble")] = 100,
    n_large: Annotated[int, typer.Option(help="members in the larger ensemble")] = 200,
) -> None:
    """Q12/D-001 check: EF percentiles with N = n_small vs n_large Monte Carlo members."""
    from datetime import date as _date

    from stratum import phase2

    res = phase2.cocip_convergence(
        drive_root(), _date.fromisoformat(day), scaling, n_small, n_large, max_age_h=max_age_h
    )
    _summary(f"cocip-convergence {scaling} {day}", res)


@app.command("phase2-report")
def phase2_report(month: Annotated[str, typer.Option(help="YYYY-MM")]) -> None:
    """Write the Phase 2 sanity report to <drive>/reports/phase2_sanity/<month>/."""
    from stratum.evaluate.phase2_sanity import build_report

    root = drive_root()
    res = build_report(root, month, root / "reports" / "phase2_sanity" / month)
    _summary(f"phase2-report {month}", res)


@app.command("detect")
def detect(
    days: Annotated[str, typer.Option(help="comma-separated YYYY-MM-DD days")],
    force: Annotated[bool, typer.Option(help="recompute days that are already done")] = False,
) -> None:
    """Phase 3: contrail detector on every slot of each stored Meteosat day (resumable per day)."""
    from datetime import date as _date

    from stratum.detect.run import detect_day

    root = drive_root()
    for d in days.split(","):
        res = detect_day(root, _date.fromisoformat(d.strip()), None, cfg.config_hash(), force)
        _summary(f"detect {d}", res)


@app.command("phase3-overlays")
def phase3_overlays(
    day: Annotated[str, typer.Option(help="YYYY-MM-DD flight day with CoCiP + detections")],
    scaling: Annotated[str, typer.Option(help="CoCiP run to draw (B1 = physics only)")] = "B1",
    top: Annotated[int, typer.Option(help="number of candidate overlay times")] = 3,
    lapse_hours: Annotated[float, typer.Option(help="time-lapse length (hours)")] = 4.0,
) -> None:
    """Phase 3: overlay figures (predicted vs detected contrails) + time-lapse for one day."""
    from datetime import date as _date

    from stratum.phase3 import overlays_day

    res = overlays_day(drive_root(), _date.fromisoformat(day), scaling, top, lapse_hours)
    _summary(f"phase3-overlays {day}", {k: v for k, v in res.items() if k != "figures"})


@app.command("export-web")
def export_web_cmd(
    month: Annotated[str, typer.Option(help="YYYY-MM")] = "2026-01",
    build_id: Annotated[str | None, typer.Option(help="default: <month>-<git short sha>")] = None,
    scaling: Annotated[str, typer.Option(help="CoCiP run shown on the map (v0: B1)")] = "B1",
) -> None:
    """Phase 4: export grids, flights and flagged segments for the web app.

    Needs STRATUM_ID_SALT (.env or Colab Secrets) for the hashed flight ids."""
    import subprocess

    from stratum.export.web_export import export_web
    from stratum.paths import repo_root

    try:
        sha = subprocess.run(
            ["git", "-C", str(repo_root()), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()  # fmt: skip
    except (OSError, subprocess.CalledProcessError):
        sha = "unknown"
    bid = build_id or f"{month}-{sha[:7]}"
    root = drive_root()
    res = export_web(
        root, month, root / "web_exports", bid, git_commit=sha,
        config_hash=cfg.config_hash(), scaling=scaling,
    )  # fmt: skip
    _summary(f"export-web {month}", {k: v for k, v in res.items() if k != "sizes"})


@app.command("export-web-v1")
def export_web_v1_cmd(
    build_id: Annotated[str | None, typer.Option(help="default: v1-<git short sha>")] = None,
    demo_month: Annotated[
        str, typer.Option(help="month exported in full besides the 12 flight days")
    ] = "2026-01",
    finish_only: Annotated[
        bool, typer.Option(help="days already written: only results.json, manifest and the zip")
    ] = False,
) -> None:
    """Phase 8 (Colab 08a): web data v2 — B1/B3/STRATUM layers, per-model lists with the
    decision fields, flights with alert status and results.json; zipped for download.

    Needs STRATUM_ID_SALT (.env or Colab Secrets) for the hashed flight ids."""
    import subprocess

    from stratum.export.web_v1 import export_web_v1
    from stratum.export.web_v1 import finish_only as finish_web_v1
    from stratum.paths import repo_root

    try:
        sha = subprocess.run(["git", "-C", str(repo_root()), "rev-parse", "HEAD"],
                             capture_output=True, text=True, check=True).stdout.strip()  # fmt: skip
    except (OSError, subprocess.CalledProcessError):
        sha = "unknown"
    bid = build_id or f"v1-{sha[:7]}"
    root = drive_root()
    pre = cfg.load_preregistered()
    if finish_only:
        res = finish_web_v1(root, root / "web_exports" / bid, bid, git_commit=sha,
                            config_hash=cfg.config_hash())  # fmt: skip
    else:
        res = export_web_v1(root, root / "web_exports", bid, _eval_days(root), pre,
                            git_commit=sha, config_hash=cfg.config_hash(),
                            demo_month=demo_month or None)  # fmt: skip
    z = shutil.make_archive(str(root / "web_exports" / bid), "zip", root / "web_exports", bid)
    largest = max(res["sizes"].items(), key=lambda kv: kv[1])
    _summary("export-web-v1", {**{k: v for k, v in res.items() if k != "sizes"}, "zip": z,
                               "largest_day": largest})  # fmt: skip


@app.command("reproduce-figures")
def reproduce_figures(
    results: Annotated[
        Path, typer.Option(help="results.json from a web build or the release bundle")
    ],
    out: Annotated[Path, typer.Option(help="output folder")] = Path("reports/figures_reproduced"),
) -> None:
    """Phase 8: regenerate every results figure from the released results.json (no raw data)."""
    from stratum.release.figures import reproduce

    files = reproduce(results, out)
    _summary("reproduce-figures", {"figures": len(files), "out": str(out)})


def _shards(spec: str) -> list[int]:
    """'0-29' or '0,5,7' → shard numbers."""
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.strip().partition("-")
        out += list(range(int(a), int(b) + 1)) if b else [int(a)]
    return out


@app.command("detector-nn-data")
def detector_nn_data(
    dlr_dir: Annotated[str, typer.Option(help="folder with the DLR dataset's data/ and geojson/")],
    train_shards: Annotated[str, typer.Option(help="OpenContrails train shards (0-29)")] = "0-29",
    val_shards: Annotated[str, typer.Option(help="OpenContrails validation shards")] = "0-3",
    version: Annotated[str, typer.Option(help="v1 (3 channels) or v3 (6 + soft labels)")] = "v1",
) -> None:
    """D-005 (Colab 09a / 10a): OpenContrails (streamed) + DLR scenes → training data on Drive."""
    from stratum.detect import nn_run

    res = nn_run.prepare(drive_root(), Path(dlr_dir), _shards(train_shards), _shards(val_shards),
                         log=console.print, version=version)  # fmt: skip
    _summary("detector-nn-data", {
        "oc_train_examples": sum(r["n"] for r in res["oc_train"]),
        "oc_val_examples": sum(r["n"] for r in res["oc_val"]),
        "dlr_train_scenes": res["dlr_train"]["n"], "dlr_eval_scenes": res["dlr_eval"]["n"],
    })  # fmt: skip


@app.command("detector-nn-train")
def detector_nn_train(
    dlr_dir: Annotated[str, typer.Option(help="folder with the DLR dataset's data/ and geojson/")],
    pretrain_epochs: Annotated[int | None, typer.Option(help="default: 15 (v1), 12 (v3)")] = None,
    finetune_epochs: Annotated[int, typer.Option()] = 150,
    version: Annotated[str, typer.Option(help="v1 or v3")] = "v1",
) -> None:
    """D-005 (Colab 09b / 10b, GPU): pre-train, 5-fold fine-tune for the settings; v1 adds a
    final model, v3 uses the 5 fold models as an ensemble. Only the DLR training scenes."""
    from stratum.detect import nn, nn_run

    kw: dict[str, Any] = {"finetune_epochs": finetune_epochs}
    if pretrain_epochs is not None:
        kw["pretrain_epochs"] = pretrain_epochs
    root, dd = drive_root(), Path(dlr_dir)
    if version == "v3":
        meta = nn_run.train_v3(root, dd, nn.TrainConfig.for_v3(**kw), log=console.print)
    else:
        meta = nn_run.train(root, dd, nn.TrainConfig(**kw), log=console.print)
    _summary("detector-nn-train", {k: meta[k] for k in (
        "oc_train_examples", "oc_validation_dice", "hysteresis", "max_line_residual_px",
        "max_orientation_spread_deg", "oof_train", "model_sha256")})  # fmt: skip


@app.command("detector-nn-eval")
def detector_nn_eval(
    dlr_dir: Annotated[str, typer.Option(help="folder with the DLR dataset's data/ and geojson/")],
    rerun_reason: Annotated[str | None, typer.Option(help="needed for a 2nd evaluation")] = None,
    version: Annotated[str, typer.Option(help="v1 or v3")] = "v1",
) -> None:
    """D-005 (Colab 09b / 10b): the check of the learned detector on the 89 DLR evaluation
    scenes, old and new side by side; logged in _locks/detector_runs.jsonl."""
    from stratum.detect import nn_run

    if version == "v3":
        r3 = nn_run.evaluate_v3(drive_root(), Path(dlr_dir), rerun_reason, log=console.print)
        keys = ("precision", "recall", "f1", "pixel_dice", "unanimous_recall")
        rows3: dict[str, object] = {}
        for w in ("v3", "v1", "old"):
            for k in keys:
                if k in r3[w]:
                    ci = r3[w].get("ci95", {}).get(k)
                    rows3[f"{w} {k}"] = f"{r3[w][k]:.3f} {ci}" if ci else r3[w][k]
        _summary("detector-nn-eval v3", rows3)
        return
    res = nn_run.evaluate(drive_root(), Path(dlr_dir), rerun_reason, log=console.print)
    _summary("detector-nn-eval", {
        "scenes / expert lines": f"{res['scenes']} / {res['expert_lines']}",
        **{f"{w} {k}": f"{res[w][k]:.3f} {res[w]['ci95'][k]}" for w in ("new", "old")
           for k in ("precision", "recall", "f1", "recall_lenient")},
        "pixel Dice (new)": res["pixel_dice_new"],
    })  # fmt: skip


@app.command("second-analysis-nn")
def second_analysis_nn(
    track: Annotated[str, typer.Option(help="nn (detector v1) or nn3 (detector v3)")] = "nn",
) -> None:
    """D-005 (Colab 09c): re-label the flight days with the learned detector, wrong-day null,
    H1 and H2 recomputed DESCRIPTIVELY next to the logged final runs (which never change)."""
    from stratum.evaluate import second_nn
    from stratum.release.rescore import fmt

    pre = cfg.load_preregistered()
    r = second_nn.run(drive_root(), pre, cfg.config_hash(), console.print, track)
    lab = r["labels"]
    _summary("second-analysis-nn", {
        "labelled / y1 (line → nn)": f"{lab['line']['labelled']:,} / {lab['line']['y1']:,} → "
                                     f"{lab['nn']['labelled']:,} / {lab['nn']['y1']:,}",
        "chance share (line → nn)": f"{lab['line']['chance_share']} → {lab['nn']['chance_share']}",
        "H1 ratio nn / logged": f"{fmt(r['H1']['nn'])} / {fmt(r['H1']['logged'])}",
        "H1 efficiency-adjusted nn": fmt(r["H1"]["efficiency_adjusted"]),
        "H2 BSS vs B3 nn / logged": f"{fmt(r['H2']['nn'])} / {fmt(r['H2']['logged'])}",
        "H2 vs constant rate nn": fmt(r["H2"]["vs_RATE"]),
    })  # fmt: skip


@app.command("export-contrail-viewer")
def export_contrail_viewer(
    track: Annotated[str, typer.Option(help="labels from: line, nn (v1) or nn3 (v3)")] = "nn3",
) -> None:
    """Website (Colab 11a): every satellite-confirmed contrail, shown — Meteosat crops with the
    flight path, the predicted drift and the detected line. Needs STRATUM_ID_SALT."""
    from stratum.export.contrail_viewer import export
    from stratum.export.web_export import id_salt

    root = drive_root()
    out = root / "web_exports" / f"contrails-{track}"
    idx = export(root, out, id_salt(), track)
    z = shutil.make_archive(str(out), "zip", out.parent, out.name)
    _summary("export-contrail-viewer", {"track": track, "events": idx["events"],
                                        "days": json.dumps(idx["days"]), "zip": z})  # fmt: skip


@app.command("weighted-decide")
def weighted_decide_cmd(
    day: Annotated[
        str, typer.Option(help="one day YYYY-MM-DD (default: every evaluation day)")
    ] = "",
    members: Annotated[int, typer.Option(help="Monte Carlo members (logged layer: 100)")] = 50,
    top: Annotated[int, typer.Option(help="portions per day, strongest weighted EF first")] = 60,
    force: Annotated[bool, typer.Option(help="recompute days already done")] = False,
) -> None:
    """D-006 (Colab 12a, descriptive second analysis): the decision layer on probability-weighted
    physics — raw-ERA5 CoCiP weighted by STRATUM's P(persistent contrail). Resumable per day."""
    import time

    from stratum.decide import run as dr
    from stratum.decide import weighted as wd

    root = drive_root()
    pre = cfg.load_preregistered()
    seed = pre.detection.labelled_split.seed or 0
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    t, _ = _eval_table(root)
    lab = t[t["y"].notna()]
    days = [day] if day else _eval_days(root)
    for d in days:
        cells = dr.confidence_cells(lab[lab["day"] != d], bands)
        t0 = time.time()
        r = wd.weighted_day(root, d, pre, members, seed, cells, top=top, force=force)
        console.print(f"weighted {d}: {r} ({(time.time() - t0) / 60:.1f} min)")


@app.command("weighted-summary")
def weighted_summary_cmd() -> None:
    """D-006: decision summary and H3/H4-style statistics on weighted EF, next to the logged
    numbers (reports/second_analysis_weighted/summary.json). Descriptive only."""
    from stratum.decide import report as drep
    from stratum.decide import weighted as wd
    from stratum.manifest import is_done

    root = drive_root()
    pre = cfg.load_preregistered()
    days = _eval_days(root)
    missing = [d for d in days if not is_done(wd.day_dir(root, d))]
    if missing:
        console.print(f"[red]{len(missing)} days unfinished: run weighted-decide first[/red]")
        raise typer.Exit(1)
    seed = pre.detection.labelled_split.seed or 0
    conc = wd.concentration(root, days, pre, pre.bootstrap.n_resamples, seed)
    dec = drep.summary([wd.day_dir(root, d) for d in days])
    logged = root / "reports" / "phase7_decisions" / "summary.json"
    ctx = root / "reports" / "phase7_h34_context" / "B1.json"
    res = {
        "deviation": "D-006",
        "descriptive_only": True,
        "decisions": dec,
        "concentration": conc,
        "logged_decisions": json.loads(logged.read_text()) if logged.exists() else None,
        "context_B1": json.loads(ctx.read_text()) if ctx.exists() else None,
    }
    out = root / "reports" / "second_analysis_weighted"
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(res, indent=1, default=str))
    h3, h4 = conc["h3"], conc["h4"]
    _summary("weighted-summary (D-006, descriptive)", {
        "portions / alerts": f"{dec.get('portions', 0)} / {dec.get('alerts', 0)}",
        "alerts without fuel credit": dec.get("alerts_without_fuel_credit"),
        "alerts per day": json.dumps(dec.get("alerts_per_day")),
        "net warming avoided h100 p50": dec.get("alerts_net_warming_avoided_h100_p50_kgCO2e"),
        "H3-style share": _ci(h3["share"], h3["supported"]),
        "H4-style difference": _ci(h4["difference"], h4["supported"]),
        "warming segments (weighted)": f"{conc['warming_segments_weighted']:,}",
        "mean w where B1 warms": round(conc["mean_w_where_b1_warms"], 3),
    })  # fmt: skip


@app.command("export-extras")
def export_extras_cmd(
    skip: Annotated[
        str, typer.Option(help="comma list of parts to skip: explain,weighted,game")
    ] = "",
) -> None:
    """Website extras (Colab 12a): "Why this prediction?" (per-card TreeSHAP), the weighted
    decision lists (D-006) and the "Beat STRATUM" rounds → web_exports/extras (+ zip).
    Needs STRATUM_ID_SALT."""
    from stratum.config import configs_dir, load_domain
    from stratum.decide import weighted as wd
    from stratum.export import explain as xp
    from stratum.export import game
    from stratum.export.web_export import _bearing, airline_names, id_salt, web_json

    root = drive_root()
    pre = cfg.load_preregistered()
    salt = id_salt()
    out = root / "web_exports" / "extras"
    out.mkdir(parents=True, exist_ok=True)
    parts = {p.strip() for p in skip.split(",") if p.strip()}
    names = airline_names(configs_dir() / "airlines.yaml")
    ap = load_domain().corridor.airports
    del_bom = _bearing(ap["VIDP"].lat, ap["VIDP"].lon, ap["VABB"].lat, ap["VABB"].lon)
    rows: dict[str, object] = {}
    if "weighted" not in parts or "explain" not in parts:
        made, explained = {}, {}
        for d in _eval_days(root):
            extra: list[Any] = []
            if "weighted" not in parts:
                items, extra = wd.web_list(root, d, salt, names, del_bom)
                if items is not None:
                    (out / "weighted" / "days" / d).mkdir(parents=True, exist_ok=True)
                    (out / "weighted" / "days" / d / "segments_STRATUMw.json").write_text(
                        web_json([i.model_dump() for i in items], separators=(",", ":"))
                    )
                    made[d] = len(items)
            if "explain" not in parts:
                r = xp.explain_day(root, d, pre, out / "explain", salt, extra)
                explained[d] = r["explained"]
        rows["weighted cards per day"] = json.dumps(made)
        rows["explained cards per day"] = json.dumps(explained)
        summ = root / "reports" / "second_analysis_weighted" / "summary.json"
        if "weighted" not in parts and summ.exists():
            shutil.copy(summ, out / "weighted" / "summary.json")
    if "game" not in parts:
        g = game.export(root, out / "game", salt)
        rows.update({f"game {k}": v for k, v in g.items()})
    z = shutil.make_archive(str(out), "zip", out.parent, out.name)
    rows["zip"] = z
    _summary("export-extras", rows)


@app.command("rescore")
def rescore_cmd(
    release: Annotated[Path, typer.Option(help="unzipped release folder (has results.json)")],
    n: Annotated[int, typer.Option(help="day resamples (pre-registered 1,000)")] = 1000,
) -> None:
    """Phase 8.3: recompute H1 and H2 from the released segment table and compare with the
    logged final runs (release = commercial flights only, so expect close, not identical)."""
    from stratum.release.rescore import fmt, rescore

    r = rescore(release, n)
    rows: dict[str, object] = {
        "segments / labelled / flights": " / ".join(f"{v:,}" for v in r["rows"].values()),
        "H1 ratio, release": fmt(r["H1"]["release"]),
        "H1 ratio, logged run": fmt(r["H1"]["logged"]),
        "H1 efficiency-adjusted, release": fmt(r["H1"]["efficiency_adjusted"]),
        "H2 BSS vs B3, release": fmt(r["H2"]["release"]),
        "H2 BSS vs B3, logged run": fmt(r["H2"]["logged"]),
        "H2 vs constant rate, release": fmt(r["H2"]["vs_RATE"]),
        "H2 vs climatology, release": fmt(r["H2"]["vs_B0"]),
        "H2 vs humidity-only, release": fmt(r["H2"]["vs_LOGIT"]),
        **{f"AUROC {s}": fmt(v["auroc"]) for s, v in r["H2"]["per_season"].items()},
    }
    _summary("rescore", rows)


@app.command("release-bundle")
def release_bundle(
    version: Annotated[str, typer.Option(help="release version (CITATION.cff)")] = "1.0.0",
) -> None:
    """Phase 8.3 (Colab 08b): the derived-data release on Drive (release/<version>/ and a zip).
    Commercial flights only, hashed ids, positions rounded to 0.25°; no raw or EUMETSAT data.

    Needs STRATUM_ID_SALT (.env or Colab Secrets) for the hashed flight ids."""
    from stratum.export.web_export import id_salt
    from stratum.paths import repo_root
    from stratum.release.bundle import build

    root = drive_root()
    info = build(root, repo_root(), root / "release", version, id_salt())
    _summary("release-bundle", info)


@app.command("phase3-showcase")
def phase3_showcase(
    days: Annotated[str, typer.Option(help="comma-separated YYYY-MM-DD satellite days")],
    per_day: Annotated[int, typer.Option(help="figures per day")] = 2,
) -> None:
    """Phase 3: detector-only figures (strongest isolated long lines) for days without flights."""
    from datetime import date as _date

    from stratum.phase3 import showcase_day

    for d in days.split(","):
        res = showcase_day(drive_root(), _date.fromisoformat(d.strip()), per_day)
        _summary(f"phase3-showcase {d}", {**res, "figures": len(res.get("figures", []))})


@app.command("sample-scenes")
def sample_scenes_cmd(
    n_main: Annotated[int, typer.Option(help="main labelled scenes (pre-registered 200)")] = 200,
    n_pilot: Annotated[int, typer.Option(help="pilot scenes (pre-registered 20)")] = 20,
) -> None:
    """Phase 5.1: draw the labelling scenes ONCE (stratified, pre-registered seed Q16)."""
    from stratum import phase5

    pre = cfg.load_preregistered()
    seed = pre.detection.labelled_split.seed
    if seed is None:
        console.print("[red]Q16 seed is not set in preregistered.yaml.[/red]")
        raise typer.Exit(1)
    dom = cfg.load_domain().study_bbox
    res = phase5.sample_scenes_job(
        drive_root(),
        seed,
        (dom.lat[0], dom.lat[1]),
        (dom.lon[0], dom.lon[1]),
        n_main,
        n_pilot,
        cfg.config_hash(),
    )
    _summary(
        "sample-scenes",
        {k: json.dumps(v, default=str) if isinstance(v, dict) else v for k, v in res.items()},
    )


@app.command("export-scene-packages")
def export_scene_packages() -> None:
    """Phase 5.1: write pilot.zip and main.zip (images + meta, no predictions) for the labellers."""
    from stratum import phase5

    guide = repo_root() / "docs" / "labelling_guide.md"
    res = phase5.export_packages_job(drive_root(), guide.read_text() if guide.exists() else None)
    _summary(
        "export-scene-packages",
        {k: json.dumps(v) if isinstance(v, dict) else v for k, v in res.items()},
    )


@app.command("labelling-agreement")
def labelling_agreement(
    set_name: Annotated[str, typer.Option("--set", help="pilot, test or calibration")] = "pilot",
    labellers: Annotated[
        str, typer.Option(help="comma-separated labeller ids")
    ] = "aditya,ishaan,abeer",
) -> None:
    """Phase 5.3/5.4: object F1 + 16-px-grid κ with bootstrap CIs, and the disagreement gallery."""
    from itertools import combinations

    from stratum import phase5

    who = [w.strip() for w in labellers.split(",") if w.strip()]
    seed = cfg.load_preregistered().detection.labelled_split.seed or 0
    rep = phase5.agreement_job(drive_root(), who, seed, set_name)
    zip_name = "main" if set_name == "test" else set_name
    figs = 0
    pairs = (
        [(w, "experts") for w in who] if set_name == "calibration" else list(combinations(who, 2))
    )
    for a, b in pairs:
        figs += phase5.gallery_job(drive_root(), a, b, set_name, zip_name)["figures"]
    rows = {
        k: json.dumps(v, default=str) if isinstance(v, (dict, list)) else v for k, v in rep.items()
    }
    _summary(f"agreement ({set_name})", {**rows, "gallery_figures": figs})


@app.command("make-labelling-sets")
def make_labelling_sets(
    dlr_dir: Annotated[str, typer.Option(help="folder with the DLR dataset's data/ and geojson/")],
) -> None:
    """Deviation D-002: test.zip (100 India held-out scenes) + calibration.zip (20 expert)."""
    from pathlib import Path

    from stratum import phase5

    guide = repo_root() / "docs" / "labelling_guide.md"
    md = guide.read_text() if guide.exists() else None
    seed = cfg.load_preregistered().detection.labelled_split.seed or 0
    res = {
        **phase5.make_test_zip(drive_root(), md),
        **phase5.make_calibration_zip(drive_root(), Path(dlr_dir), seed, md),
    }
    _summary("make-labelling-sets", res)


@app.command("tune-detector")
def tune_detector(
    dlr_dir: Annotated[str, typer.Option(help="folder with the DLR dataset's data/ and geojson/")],
) -> None:
    """Deviation D-002: tune the detector on the DLR training scenes, check on evaluation.

    Writes reports/detector_tuning/{tuning.json, pipeline_detector.yaml}. The chosen values are
    copied into configs/pipeline.yaml by hand (and logged in docs/decisions.md)."""
    from pathlib import Path

    import yaml

    from stratum.detect import tuning
    from stratum.detect.params import load_detector_params

    seed = cfg.load_preregistered().detection.labelled_split.seed or 0
    res = tuning.tune(Path(dlr_dir), load_detector_params(), seed, log=console.print)
    p = res.pop("params")
    out = repo_root() / "reports" / "detector_tuning"
    out.mkdir(parents=True, exist_ok=True)
    (out / "tuning.json").write_text(json.dumps(res, indent=1, default=str))
    det = p.model_dump()
    det["hysteresis"] = list(det["hysteresis"])
    (out / "pipeline_detector.yaml").write_text(yaml.safe_dump({"detector": det}, sort_keys=False))
    keys = (
        "chosen_settings",
        "operating_threshold",
        "evaluation",
        "evaluation_ci95",
        "evaluation_before_tuning",
    )
    _summary("tune-detector", {k: json.dumps(res[k]) for k in keys})


@app.command("match-year")
def match_year(
    days: Annotated[str, typer.Option(help="comma-separated YYYY-MM-DD, or 'all'")] = "all",
    force: Annotated[bool, typer.Option(help="recompute days that are already done")] = False,
    null: Annotated[bool, typer.Option(help="also run the wrong-day null (chance matches)")] = True,
) -> None:
    """Phase 5.6: detection + matching + segment labels per flight day, then the year summary.

    The wrong-day null matches each day's flights against the NEXT flight day's images and
    ERA5 (cyclic), so its y = 1 rate measures chance matches."""
    from datetime import date as _date

    from stratum import phase5
    from stratum.match.matching import rules_from_preregistered
    from stratum.match.run import match_day
    from stratum.match.summary import year_summary

    root = drive_root()
    pre = cfg.load_preregistered()
    todo = (
        phase5._segment_days(root)
        if days == "all"
        else [_date.fromisoformat(d.strip()) for d in days.split(",")]
    )
    rules = rules_from_preregistered()
    for d in todo:
        res = match_day(
            root,
            d,
            None,
            rules,
            pre.matching.min_age_min,
            pre.matching.max_age_min,
            cfg.config_hash(),
            force,
        )
        _summary(
            f"match {d}", {k: json.dumps(v) if isinstance(v, dict) else v for k, v in res.items()}
        )
    if null and len(todo) >= 2:
        for d, other in zip(todo, [*todo[1:], todo[0]], strict=True):
            res = match_day(
                root,
                d,
                None,
                rules,
                pre.matching.min_age_min,
                pre.matching.max_age_min,
                cfg.config_hash(),
                force,
                image_day=other,
            )
            _summary(
                f"null {d} on {other}", {k: v for k, v in res.items() if not isinstance(v, dict)}
            )
    s = year_summary(root, pre.min_labels.matched_observed_contrails)
    _summary(
        "labels summary",
        {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in s.items()},
    )


@app.command("label-diagnostics")
def label_diagnostics() -> None:
    """Phase 5 check: y = 1 rate on real vs wrong-day flights under 1/2/3-image match rules."""
    from stratum.match.diagnostics import label_variants

    root = drive_root()
    res = label_variants(root)
    out = root / "reports" / "phase5"
    out.mkdir(parents=True, exist_ok=True)
    (out / "label_diagnostics.json").write_text(json.dumps(res, indent=1, default=str))
    _summary(
        "label diagnostics",
        {k: json.dumps(v) if isinstance(v, dict) else v for k, v in res.items()},
    )


@app.command("india-detector-check")
def india_detector_check_cmd() -> None:
    """D-003 (secondary): detector precision/recall vs the reviewed India labels.

    Unpacks the newest ``labels/raw/labels_<id>-review_*.zip`` of each reviewer first."""
    import zipfile

    from stratum import phase5
    from stratum.detect.params import load_detector_params

    root = drive_root()
    raw = root / "labels" / "raw"
    unpacked = {}
    for w in phase5.REVIEWERS:
        zips = sorted(raw.glob(f"labels_{w}_*.zip"))
        if zips:
            with zipfile.ZipFile(zips[-1]) as z:
                z.extractall(raw)
            unpacked[w] = zips[-1].name
    seed = cfg.load_preregistered().detection.labelled_split.seed or 0
    rep = phase5.india_detector_check(root, load_detector_params().operating_threshold, seed)
    rows = {k: json.dumps(v) if isinstance(v, dict) else v for k, v in rep.items()}
    _summary("india detector check", {"unpacked": json.dumps(unpacked), **rows})


@app.command("climatology")
def climatology_cmd(
    months: Annotated[
        str, typer.Option(help="comma-separated YYYY-MM, or 'all' (evaluation year)")
    ] = "all",
    force: Annotated[bool, typer.Option(help="recompute months that are already done")] = False,
) -> None:
    """Phase 6 B0: monthly ERA5 persistence-frequency grids (SAC ∧ RHi ≥ 1, η = 0.30)."""
    from stratum.baselines import climatology as clim

    root = drive_root()
    if months == "all":
        import pandas as pd

        start, end = cfg.load_preregistered().periods.evaluation
        months_l = [p.strftime("%Y-%m") for p in pd.period_range(start[:7], end[:7], freq="M")]
    else:
        months_l = [m.strip() for m in months.split(",")]
    for m in months_l:
        _summary(f"climatology {m}", clim.build_month(root, m, force))


@app.command("run-cocip-domain")
def run_cocip_domain(
    max_age_h: Annotated[float, typer.Option(help="CoCiP max contrail age, hours")] = 2.5,
    force: Annotated[bool, typer.Option(help="recompute days that are already done")] = False,
) -> None:
    """Phase 6: CoCiP B1 central run over every flight in the domain, all flight days
    (detectability flag + the CoCiP-B1 variant). Stored in interim/cocip_domain/B1/."""
    from stratum import phase2, phase5

    root = drive_root()
    for d in phase5._segment_days(root):
        res = phase2.cocip_day(
            root, d, "B1", members=0, max_age_h=max_age_h, corridor_only=False,
            config_hash=cfg.config_hash(), force=force, kind="cocip_domain",
        )  # fmt: skip
        _summary(
            f"cocip domain {d}", {k: v for k, v in res.items() if not isinstance(v, (dict, list))}
        )


@app.command("match-sensitivity")
def match_sensitivity() -> None:
    """Phase 6 sensitivity: re-match every flight day with other distance/angle tolerances
    (labels only, kept in interim/matches_sens/<variant>/; detections are reused)."""
    from dataclasses import replace

    from stratum import phase5
    from stratum.match.matching import TOLERANCE_VARIANTS, rules_from_preregistered
    from stratum.match.run import match_day

    root = drive_root()
    pre = cfg.load_preregistered()
    base = rules_from_preregistered()
    for name, change in TOLERANCE_VARIANTS.items():
        rules = replace(base, **change)
        for d in phase5._segment_days(root):
            res = match_day(
                root, d, None, rules, pre.matching.min_age_min, pre.matching.max_age_min,
                cfg.config_hash(), variant=name,
            )  # fmt: skip
            _summary(f"{name} {d}", {k: res.get(k) for k in ("status", "y1", "y0", "missing")})


@app.command("evaluate")
def evaluate_cmd(
    final: Annotated[
        bool, typer.Option(help="the logged final run (needs a verified lock)")
    ] = False,
    peek: Annotated[
        str, typer.Option(help="non-final run on held-out seasons: type the exact phrase")
    ] = "",
    rebuild_table: Annotated[bool, typer.Option(help="rebuild the evaluation table")] = False,
    rerun_reason: RERUN = "",
) -> None:
    """Phase 6: B0–B3 on held-out seasons and the spatial split, H1, evaluation report v1.

    Final runs are appended to _locks/final_runs.jsonl (never deleted). A non-final run on
    held-out seasons needs --peek with the exact phrase and is logged to _locks/peek_runs.jsonl
    (it must then be listed as a deviation)."""
    import platform
    from datetime import datetime

    import pandas as pd

    from stratum.evaluate import report as rp
    from stratum.evaluate import run as ev
    from stratum.evaluate import table as tb

    paths = lk.default_paths()
    root = drive_root()
    v = _gate(root, final, peek, ["H1"], rerun_reason)
    pre = cfg.load_preregistered()
    n = pre.bootstrap.n_resamples
    seed = pre.detection.labelled_split.seed or 0
    ev_dir = root / "interim" / "evaluation"
    tf, imf = ev_dir / "table.parquet", ev_dir / "images.parquet"
    if rebuild_table or not tf.exists():
        t, images, info = tb.build(root, pre.matching.min_age_min, pre.matching.max_age_min)
        ev_dir.mkdir(parents=True, exist_ok=True)
        t.to_parquet(tf, index=False)
        images.to_parquet(imf, index=False)
        _summary("evaluation table", info)
    t, images = pd.read_parquet(tf), pd.read_parquet(imf)
    res = ev.evaluate(t, images, n, seed)
    sha, dirty = git_commit()
    now = datetime.now(UTC)
    run_id = f"{now:%Y%m%dT%H%M%SZ}_{(sha or 'nogit')[:7]}"
    run = {
        "run_id": run_id,
        "commit": sha,
        "dirty": dirty,
        "final": final,
        "n_resamples": n,
        "seed": seed,
    }
    out = root / "reports" / run_id
    lab5 = root / "reports" / "phase5" / "labels_summary.json"
    phase5 = json.loads(lab5.read_text()) if lab5.exists() else None
    files = rp.write(res, out, run, paths["deviations"].read_text(), phase5)
    (out / "results.json").write_text(json.dumps(res, indent=1, default=str))
    record = {
        **run,
        "time_utc": now.isoformat(),
        "config_hash": cfg.config_hash(),
        "lock_identical": v.identical,
        "deviations_covering": v.changed,
        "hypotheses": ["H1"],
        "h1_ratio": res["h1"]["ratio"],
        "h1_supported": res["h1"]["supported"],
        "results_sha256": lk.results_hash(res),
        "python": platform.python_version(),
        "rerun_reason": rerun_reason or None,
    }
    log = "final_runs.jsonl" if final else "peek_runs.jsonl"
    lk.append_run_record(root / "_locks" / log, record)
    lk.append_run_record(repo_root() / "_locks" / log, record)
    prim = {
        m: f"{x['value']:.3f} [{x['lo']:.3f}, {x['hi']:.3f}]" for m, x in res["primary"].items()
    }
    _summary("evaluate", {"run_id": run_id, "final": final, "report": files["html"], "primary_bss_vs_B3": json.dumps(prim),  # noqa: E501
                          "h1": res["h1"]["sentence"]})  # fmt: skip


def _gate(root: Path, final: bool, peek: str, hyps: list[str], rerun_reason: str) -> Any:
    """Lock check for runs that score held-out data. A final run needs a verified lock, and a
    second final run of the same hypothesis needs a reason (both runs are then reported, build
    prompt §6.8). Anything else needs the exact peek phrase."""
    paths = lk.default_paths()
    v = lk.verify_lock(paths["prereg"], paths["open_questions"], paths["lock"], paths["deviations"])
    if final:
        ok, why = lk.final_allowed(v)
        if not ok:
            console.print(f"[red]Final run refused: {why}[/red]")
            raise typer.Exit(1)
        before = sorted(
            {r for h in hyps for r in lk.previous_finals(root / "_locks" / "final_runs.jsonl", h)}
        )
        if before and not rerun_reason:
            console.print(
                f"[red]A final run of {hyps} exists ({before}). To repeat one (e.g. after a bug "
                'fix), pass --rerun-reason "…"; both runs are then reported.[/red]'
            )
            raise typer.Exit(1)
    elif peek != lk.PEEK_PHRASE:
        console.print(
            "[red]Held-out data are blocked outside a final run. "
            f'Use --final, or --peek "{lk.PEEK_PHRASE}".[/red]'
        )
        raise typer.Exit(1)
    return v


RERUN = Annotated[str, typer.Option(help="required for a second final run of the same hypothesis")]


def _eval_table(root: Path) -> tuple[Any, Any]:
    import pandas as pd

    ev_dir = root / "interim" / "evaluation"
    tf, imf = ev_dir / "table.parquet", ev_dir / "images.parquet"
    if not tf.exists():
        console.print("[red]No evaluation table: run the Phase 6 evaluation (06b) first.[/red]")
        raise typer.Exit(1)
    return pd.read_parquet(tf), pd.read_parquet(imf)


@app.command("model-train")
def model_train(
    trials: Annotated[
        int, typer.Option(help="Optuna trials per outer fold (pre-registered 50–100)")
    ] = 50,
    force: Annotated[
        bool, typer.Option(help="retrain although models exist (only before H2)")
    ] = False,
) -> None:
    """Phase 7 (Colab 07a): train the correction model for every outer fold on its training rows
    only; write the validation report (no held-out scoring) and freeze the models."""
    from datetime import datetime

    from stratum.evaluate import report_v2 as r2
    from stratum.model import features as fe
    from stratum.model import figures as mf
    from stratum.model import run as mr

    root = drive_root()
    pre = cfg.load_preregistered()
    seed = pre.detection.labelled_split.seed or 0
    mdir = mr.model_dir(root)
    final_log = root / "_locks" / "final_runs.jsonl"
    if final_log.exists() and any('"H2"' in ln for ln in final_log.read_text().splitlines()):
        console.print("[red]An H2 final run exists; the models it used are frozen.[/red]")
        raise typer.Exit(1)
    if (mdir / "summary.json").exists() and not force:
        console.print(
            "[yellow]Models already trained; use --force to retrain (before H2 only).[/yellow]"
        )
        raise typer.Exit(1)
    if mdir.exists():
        shutil.rmtree(mdir)
    t, _ = _eval_table(root)
    t = fe.attach(root, t, list(pre.correction_model.features))
    res = mr.train_all(t, pre, mdir, trials, seed)
    figs = res.pop("_figs")
    sha, dirty = git_commit()
    run: dict[str, Any] = {
        "run_id": f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}_{(sha or 'nogit')[:7]}",
        "commit": sha,
        "dirty": dirty,
    }
    out = root / "reports" / "phase7_validation" / run["run_id"]
    out.mkdir(parents=True, exist_ok=True)
    files = [mf.reliability(figs, out), mf.shap_importance(res, out)]
    files += [mf.shap_dependence(figs, res["features"], out, f) for f in ("winter", "pre_monsoon")]
    summary = {**run, **res}
    (mdir / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    (out / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    rep = r2.validation_report(res, out, run, files)
    ab = res["a_vs_b"]
    _summary("model-train", {
        "run_id": run["run_id"], "report": rep["html"], "model_hash": res["model_hash"],
        "a_vs_b": f"({ab['choice']}): a {ab['mean_validation_brier_a']:.5f} vs b {ab['mean_validation_brier_b']:.5f}",  # noqa: E501
        "validation_brier": json.dumps({f: {k: round(v[k], 5) for k in ("brier_climatology", "brier_logistic_rhi", "brier_gbm_raw", "brier_gbm_calibrated", "brier_scaling_b")} for f, v in res["folds"].items()}),  # noqa: E501
        "monotonicity_violations": sum(m["violations"] for v in res["folds"].values() for m in v["monotonicity"].values()),  # noqa: E501
    })  # fmt: skip


@app.command("evaluate-h2")
def evaluate_h2_cmd(
    final: Annotated[
        bool, typer.Option(help="the logged final run (needs a verified lock)")
    ] = False,
    peek: Annotated[str, typer.Option(help="non-final run on held-out seasons: exact phrase")] = "",
    rerun_reason: RERUN = "",
) -> None:
    """Phase 7 (Colab 07b): H2 with the frozen models of model-train. Final runs are logged in
    _locks/final_runs.jsonl; held-out predictions are kept for the decision layer."""
    import platform
    from datetime import datetime

    import pandas as pd

    from stratum.evaluate import h2 as h2m
    from stratum.evaluate import report_v2 as r2
    from stratum.model import features as fe
    from stratum.model import run as mr

    paths = lk.default_paths()
    root = drive_root()
    v = _gate(root, final, peek, ["H2"], rerun_reason)
    mdir = mr.model_dir(root)
    if not (mdir / "summary.json").exists():
        console.print("[red]No trained models: run model-train (07a) first.[/red]")
        raise typer.Exit(1)
    val = json.loads((mdir / "summary.json").read_text())
    mh = mr.dir_hash(mdir)
    if mh != val["model_hash"]:
        console.print("[red]Model files changed since model-train; refusing.[/red]")
        raise typer.Exit(1)
    pre = cfg.load_preregistered()
    n = pre.bootstrap.n_resamples
    seed = pre.detection.labelled_split.seed or 0
    t, images = _eval_table(root)
    t = fe.attach(root, t, list(pre.correction_model.features))
    t = mr.predict_heldout(t, pre, mdir)
    res = h2m.evaluate_h2(t, images, n, seed)
    sha, dirty = git_commit()
    now = datetime.now(UTC)
    run_id = f"{now:%Y%m%dT%H%M%SZ}_{(sha or 'nogit')[:7]}"
    run = {"run_id": run_id, "commit": sha, "dirty": dirty, "final": final, "n_resamples": n,
           "seed": seed, "model_hash": mh}  # fmt: skip
    out = root / "reports" / run_id
    out.mkdir(parents=True, exist_ok=True)
    files = r2.h2_report(res, out, run, val, paths["deviations"].read_text())
    (out / "results.json").write_text(json.dumps(res, indent=1, default=str))
    pred_cols = [
        "segment_id",
        "flight_id",
        "day",
        "season",
        *[c for c in t.columns if c.split("__")[0] in mr.PRED_COLS],
    ]
    preds = pd.DataFrame(t[pred_cols])
    preds.to_parquet(out / "heldout_predictions.parquet", index=False)
    if final:  # the decision layer (H3, H4, ranked lists) reads the final run's predictions
        pdir = root / "interim" / "model_predictions"
        pdir.mkdir(parents=True, exist_ok=True)
        preds.to_parquet(pdir / "heldout.parquet", index=False)
    record = {**run, "time_utc": now.isoformat(), "config_hash": cfg.config_hash(),
              "lock_identical": v.identical, "deviations_covering": v.changed, "hypotheses": ["H2"],
              "h2_bss": res["h2"]["bss"], "h2_supported": res["h2"]["supported"],
              "a_vs_b_literal_07a": val["a_vs_b"]["choice"], "results_sha256": lk.results_hash(res),
              "python": platform.python_version(),
              "rerun_reason": rerun_reason or None}  # fmt: skip
    log = "final_runs.jsonl" if final else "peek_runs.jsonl"
    lk.append_run_record(root / "_locks" / log, record)
    lk.append_run_record(repo_root() / "_locks" / log, record)
    _summary("evaluate-h2", {"run_id": run_id, "final": final, "report": files["html"],
                             "h2": res["h2"]["sentence"]})  # fmt: skip


def _eval_days(root: Path) -> list[str]:
    t, _ = _eval_table(root)
    return sorted(t["day"].unique())


@app.command("fit-correction")
def fit_correction_cmd(
    draws: Annotated[int, typer.Option(help="bootstrap draws for the Monte Carlo (N = 100)")] = 100,
) -> None:
    """Phase 7 (Colab 07c, step 1): the humidity correction fed back into the physics, fitted
    with detection efficiency per seasonal fold (training rows only), its bootstrap draws, and
    the (a)-vs-(b) rule against 07a's validation numbers."""
    from stratum.decide import humidity as hu
    from stratum.model import correction as co
    from stratum.model import run as mr

    root = drive_root()
    pre = cfg.load_preregistered()
    seed = pre.detection.labelled_split.seed or 0
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    vf = mr.model_dir(root) / "summary.json"
    if not vf.exists():
        console.print("[red]No 07a validation summary: run model-train first.[/red]")
        raise typer.Exit(1)
    t, _ = _eval_table(root)
    for c in ("cocip_contrail", "detectable"):
        if c not in t or t[c].notna().sum() == 0:
            console.print(
                f"[red]The evaluation table has no {c} (needs the Phase 6 domain CoCiP run).[/red]"
            )
            raise typer.Exit(1)
    cdir = hu.correction_dir(root)
    res = co.fit_correction(t, bands, cdir, draws, seed, json.loads(vf.read_text()))
    _summary(
        "fit-correction",
        {
            "a_vs_b": json.dumps(res.get("a_vs_b")),
            **{
                f"{f} ε / s per band": f"{v['detection_efficiency']:.3f} / "
                + ", ".join(f"{c['band_deg']} {c['s']:.3f}" for c in v["s_band"])
                for f, v in res["folds"].items()
            },
        },
    )


@app.command("run-corrected-cocip")
def run_corrected_cocip(
    day: Annotated[
        str, typer.Option(help="one day YYYY-MM-DD (default: every evaluation day)")
    ] = "",
    force: Annotated[bool, typer.Option(help="recompute days already done")] = False,
) -> None:
    """Phase 7 (Colab 07c): CoCiP over the whole domain with the learned humidity correction of
    the fold that holds each day out (central run, contrails followed 24 h)."""
    from stratum.decide import humidity as hu
    from stratum.decide import run as dr

    root = drive_root()
    pre = cfg.load_preregistered()
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    cdir = hu.correction_dir(root)
    summ = cdir / "summary.json"
    if not summ.exists():
        console.print("[red]No humidity correction: run fit-correction first.[/red]")
        raise typer.Exit(1)
    if json.loads(summ.read_text()).get("a_vs_b", {}).get("choice") != "b":
        console.print(
            "[red]The (a)-vs-(b) rule did not choose (b): decide the feedback path first.[/red]"
        )
        raise typer.Exit(1)
    days = [day] if day else _eval_days(root)
    _run_days(
        days,
        lambda d: dr.corrected_domain_day(root, d, bands, cdir, force=force),
        "corrected CoCiP",
    )


LOCKED = "locked by another run"


def _run_days(
    days: list[str], run_one: Any, label: str, wait_s: float = 60.0, max_wait_s: float = 4 * 3600
) -> None:
    """Run every day; days another process holds (a fresh ``.lock``) are retried until that
    process finishes them or its lock goes stale (10 min after it died), instead of skipped."""
    import time

    def show(d: str, r: dict[str, Any]) -> None:
        console.print(
            f"{label} {d}: {r.get('status')} (persistent share {r.get('share_persistent_1')})"
        )

    waiting = []
    for d in days:
        r = run_one(d)
        show(d, r)
        if r.get("status") == LOCKED:
            waiting.append(d)
    start = time.time()
    while waiting and time.time() - start < max_wait_s:
        console.print(
            f"[yellow]waiting for {len(waiting)} day(s) held by another process: {waiting}[/yellow]"
        )
        time.sleep(wait_s)
        still = []
        for d in waiting:
            r = run_one(d)
            if r.get("status") == LOCKED:
                still.append(d)
            else:
                show(d, r)
        waiting = still
    if waiting:
        console.print(f"[red]Still locked after {max_wait_s / 3600:.0f} h: {waiting}[/red]")
        raise typer.Exit(1)


def _ci(r: dict[str, float], supported: bool) -> str:
    verdict = "supported" if supported else "not supported"
    return f"{r['value']:.4f} [{r['lo']:.4f}, {r['hi']:.4f}] → {verdict}"


def _h34_segments(
    root: Path, days: list[str], kind: str = "cocip_domain/STRATUM"
) -> tuple[Any, dict[str, int]]:
    import pandas as pd

    from stratum.manifest import is_done

    parts, info = [], {"days_missing": 0, "segments_no_cocip": 0}
    for d in days:
        cdir = root / "interim" / kind / d[:7] / d
        if not is_done(cdir):
            info["days_missing"] += 1
            continue
        s = pd.read_parquet(
            root / "interim" / "segments_met" / d[:7] / d / "segments_met.parquet",
            columns=["segment_id", "length_km", "local_solar_time_h", "commercial"],
        )
        e = pd.read_parquet(cdir / "segments.parquet", columns=["segment_id", "ef"])
        m = s.merge(e, on="segment_id", how="left")
        info["segments_no_cocip"] += int(m["ef"].isna().sum())
        parts.append(m[m["ef"].notna()].assign(day=d))
    return pd.concat(parts, ignore_index=True), info


@app.command("evaluate-h34")
def evaluate_h34_cmd(
    final: Annotated[
        bool, typer.Option(help="the logged final run (needs a verified lock)")
    ] = False,
    peek: Annotated[str, typer.Option(help="non-final run: exact phrase")] = "",
    rerun_reason: RERUN = "",
) -> None:
    """Phase 7 (Colab 07c): H3 (concentration) and H4 (night share) on corrected EF."""
    import platform
    from datetime import datetime

    from stratum.evaluate import h34

    root = drive_root()
    v = _gate(root, final, peek, ["H3", "H4"], rerun_reason)
    pre = cfg.load_preregistered()
    n = pre.bootstrap.n_resamples
    seed = pre.detection.labelled_split.seed or 0
    days = _eval_days(root)
    seg, info = _h34_segments(root, days)
    if info["days_missing"]:
        console.print(
            f"[red]{info['days_missing']} days have no corrected CoCiP run (07c first).[/red]"
        )
        raise typer.Exit(1)
    night = tuple(float(x) for x in (pre.hypotheses["H4"].night_lst or (18, 6)))
    res = {
        "h3": h34.h3(seg, n, seed),
        "h4": h34.h4(seg, n, seed, night=night),  # type: ignore[arg-type]
        "h3_commercial": h34.h3(seg[seg["commercial"].fillna(False)], n, seed),
        "h4_commercial": h34.h4(seg[seg["commercial"].fillna(False)], n, seed, night=night),  # type: ignore[arg-type]
        "info": info,
    }
    sha, dirty = git_commit()
    now = datetime.now(UTC)
    run_id = f"{now:%Y%m%dT%H%M%SZ}_{(sha or 'nogit')[:7]}"
    out = root / "reports" / run_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "results_h34.json").write_text(json.dumps(res, indent=1, default=str))
    record = {
        "run_id": run_id,
        "commit": sha,
        "dirty": dirty,
        "final": final,
        "n_resamples": n,
        "seed": seed,
        "time_utc": now.isoformat(),
        "config_hash": cfg.config_hash(),
        "lock_identical": v.identical,
        "deviations_covering": v.changed,
        "hypotheses": ["H3", "H4"],
        "h3_share": res["h3"]["share"],
        "h3_supported": res["h3"]["supported"],
        "h4_difference": res["h4"]["difference"],
        "h4_supported": res["h4"]["supported"],
        "results_sha256": lk.results_hash(res),
        "python": platform.python_version(),
        "rerun_reason": rerun_reason or None,
    }
    log = "final_runs.jsonl" if final else "peek_runs.jsonl"
    lk.append_run_record(root / "_locks" / log, record)
    lk.append_run_record(repo_root() / "_locks" / log, record)
    h3r, h4r = res["h3"], res["h4"]
    _summary(
        "evaluate-h34",
        {
            "run_id": run_id,
            "final": final,
            "H3 share (≤ 0.10 supports)": _ci(h3r["share"], h3r["supported"]),
            "H4 night EF share − night distance share": _ci(h4r["difference"], h4r["supported"]),
        },
    )


CONTEXT_SCALINGS = ("B1", "B3")


@app.command("run-context-cocip")
def run_context_cocip(
    scaling: Annotated[str, typer.Option(help="B1 (raw ERA5) or B3 (published correction)")],
    day: Annotated[
        str, typer.Option(help="one day YYYY-MM-DD (default: every evaluation day)")
    ] = "",
) -> None:
    """Phase 7 context (descriptive, post hoc, Team OK needed): CoCiP over the whole domain with
    the uncorrected (B1) or published (B3) humidity, 24 h lifetimes, central run, in batches."""
    from datetime import date as _date

    from stratum.decide.run import CHUNK_FLIGHTS
    from stratum.phase2 import cocip_day

    if scaling not in CONTEXT_SCALINGS:
        console.print(f"[red]scaling must be one of {CONTEXT_SCALINGS}[/red]")
        raise typer.Exit(1)
    root = drive_root()

    def one(d: str) -> dict[str, Any]:
        return cocip_day(root, _date.fromisoformat(d), scaling, members=0, max_age_h=24.0,
                         corridor_only=False, kind="cocip_domain24", chunk=CHUNK_FLIGHTS,
                         keep_contrail=False)  # fmt: skip

    _run_days([day] if day else _eval_days(root), one, scaling)


@app.command("h34-context")
def h34_context(
    scaling: Annotated[str, typer.Option(help="B1 or B3")],
) -> None:
    """H3/H4 statistics under uncorrected or published physics: descriptive context for the
    logged H3/H4 final run, never a hypothesis test (written to reports/phase7_h34_context/)."""
    from stratum.evaluate import h34

    root = drive_root()
    pre = cfg.load_preregistered()
    n = pre.bootstrap.n_resamples
    seed = pre.detection.labelled_split.seed or 0
    seg, info = _h34_segments(root, _eval_days(root), kind=f"cocip_domain24/{scaling}")
    if info["days_missing"]:
        console.print(
            f"[red]{info['days_missing']} days missing: run-context-cocip --scaling {scaling}[/red]"
        )
        raise typer.Exit(1)
    lst = pre.hypotheses["H4"].night_lst or (18, 6)
    night = (float(lst[0]), float(lst[1]))
    res: dict[str, Any] = {
        "scaling": scaling,
        "descriptive_only": True,
        "h3": h34.h3(seg, n, seed),
        "h4": h34.h4(seg, n, seed, night=night),
        "info": info,
    }
    out = root / "reports" / "phase7_h34_context"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{scaling}.json").write_text(json.dumps(res, indent=1, default=str))
    h3r, h4r = res["h3"], res["h4"]
    _summary(
        f"h34-context {scaling} (descriptive)",
        {
            "segments / positive EF": f"{h3r['segments']:,} / {h3r['segments_positive_ef']:,}",
            "H3-style share": _ci(h3r["share"], h3r["supported"]),
            "H4-style difference": _ci(h4r["difference"], h4r["supported"]),
        },
    )


@app.command("decide")
def decide_cmd(
    day: Annotated[
        str, typer.Option(help="one day YYYY-MM-DD (default: every evaluation day)")
    ] = "",
    members: Annotated[
        int, typer.Option(help="Monte Carlo members (pre-registered N = 100)")
    ] = 100,
    force: Annotated[bool, typer.Option(help="recompute days already done")] = False,
    estimate: Annotated[bool, typer.Option(help="only count the work and time one member")] = False,
) -> None:
    """Phase 7 (Colab 07d): alternatives, Monte Carlo, ranked avoidance lists (Table 3)."""
    import numpy as np
    import pandas as pd

    from stratum.decide import humidity as hu
    from stratum.decide import report as drep
    from stratum.decide import run as dr
    from stratum.model import features as fe
    from stratum.model import run as mr

    root = drive_root()
    pre = cfg.load_preregistered()
    seed = pre.detection.labelled_split.seed or 0
    bands = [(float(a), float(b)) for a, b in pre.correction_model.latitude_bands_deg]
    mdir = mr.model_dir(root)
    t, _ = _eval_table(root)
    lab = t[t["y"].notna()]
    days = [day] if day else _eval_days(root)
    cdir = hu.correction_dir(root)
    names = list(pre.correction_model.features)
    if estimate:
        plan = {}
        for d in days:
            flagged, frames, cands = dr.plan_day(root, d, pre)
            plan[d] = {
                "flagged_segments": len(flagged),
                "portions": int(cands["portion_id"].nunique()) if len(cands) else 0,
                "variants": int(frames["flight_id"].nunique()) if len(frames) else 0,
                "crop_segments": len(frames),
            }
        busiest = max(plan, key=lambda k: plan[k]["crop_segments"])
        sec = (
            dr.time_one_member(root, busiest, pre, cdir, dr.plan_day(root, busiest, pre)[1])
            if plan[busiest]["variants"]
            else 0.0
        )
        total = sum(p["crop_segments"] for p in plan.values())
        est_h = sec * (members + 1) * total / max(plan[busiest]["crop_segments"], 1) / 3600.0
        _summary(
            "decide --estimate",
            {
                "per_day": json.dumps(plan),
                "busiest_day": busiest,
                "seconds_one_member_busiest_day": round(sec, 1),
                "estimated_hours_all_days": round(est_h, 1),
            },
        )
        return
    done = []
    for d in days:
        fold = hu.fold_for_day(d)
        s_draws = np.load(cdir / fold / "s_draws.npy")
        r = dr.decide_day(root, d, pre, cdir, s_draws, members, seed, force=force)
        console.print(f"decide {d}: {r}")
        odir = root / "interim" / "decisions" / d[:7] / d
        if r.get("status") in ("done", "already done") and (odir / "ranked.parquet").exists():
            ranked = pd.read_parquet(odir / "ranked.parquet")
            cands = pd.read_parquet(odir / "candidates.parquet")
            seg = pd.read_parquet(
                root / "interim" / "segments_met" / d[:7] / d / "segments_met.parquet"
            )
            model, _ = mr.load(mdir / fold)
            ok = np.isfinite(seg["rhi"].to_numpy(float))
            p = pd.Series(np.nan, index=seg["segment_id"])
            p[ok] = model.predict(seg.loc[ok, fe.columns(names)].to_numpy(float))
            cells = dr.confidence_cells(lab[lab["day"] != d], bands)
            tab = drep.table3(
                ranked, cands, seg, p, cells, bands, pre.avoidance.confidence_note_min_examples
            )
            tab.to_parquet(odir / "table3.parquet", index=False)
            tab.to_csv(odir / "table3.csv", index=False)
            done.append(odir)
    summ = drep.summary(done)
    out = root / "reports" / "phase7_decisions"
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(summ, indent=1, default=str))
    _summary("decide", {k: json.dumps(v) if isinstance(v, dict) else v for k, v in summ.items()})


@app.command("report-v2")
def report_v2_cmd() -> None:
    """Phase 7: evaluation report v2 from the logged final runs (H2, H3/H4), the validation and
    correction summaries and the decision-layer summary."""
    from stratum.evaluate import report_v2 as r2
    from stratum.model import run as mr

    root = drive_root()
    log = root / "_locks" / "final_runs.jsonl"
    recs = [json.loads(x) for x in log.read_text().splitlines()] if log.exists() else []
    last = {}
    for r in recs:
        for h in r.get("hypotheses", []):
            last[h] = r["run_id"]
    if "H2" not in last or "H3" not in last:
        console.print("[red]Needs the final H2 (07b) and H3/H4 (07c) runs.[/red]")
        raise typer.Exit(1)
    h2 = json.loads((root / "reports" / last["H2"] / "results.json").read_text())
    h34 = json.loads((root / "reports" / last["H3"] / "results_h34.json").read_text())
    dec_f = root / "reports" / "phase7_decisions" / "summary.json"
    dec = json.loads(dec_f.read_text()) if dec_f.exists() else {}
    val = json.loads((mr.model_dir(root) / "summary.json").read_text())
    corr = json.loads((root / "interim" / "correction" / "summary.json").read_text())
    ctx = {}
    for sc_name in CONTEXT_SCALINGS:
        f = root / "reports" / "phase7_h34_context" / f"{sc_name}.json"
        if f.exists():
            ctx[f"{sc_name} (descriptive)"] = json.loads(f.read_text())
    out = root / "reports" / "evaluation_report_v2"
    files = r2.full_report(
        h2,
        h34,
        dec,
        val,
        corr,
        {"H1": last.get("H1", "—"), "H2": last["H2"], "H3/H4": last["H3"]},
        lk.default_paths()["deviations"].read_text(),
        out,
        context=ctx or None,
    )
    _summary("report-v2", {"report": files["html"]})


@app.command("download-era5")
def download_era5(
    month: Annotated[str, typer.Option(help="YYYY-MM, or a range YYYY-MM:YYYY-MM")],
    group: Annotated[str, typer.Option(help="pl, sl, tropo_T, or all")] = "all",
    days: Annotated[str | None, typer.Option(help="TEST ONLY (cds): e.g. '15' or '15-16'")] = None,
    route: Annotated[str, typer.Option(help="cds (official queue) or arco (Google copy)")] = "cds",
    reverse: Annotated[bool, typer.Option(help="newest month first")] = False,
    max_hours: Annotated[int | None, typer.Option(help="TEST ONLY (arco): first N hours")] = None,
    workers: Annotated[
        int, typer.Option(help="arco: hours fetched in parallel (~0.3 GB each)")
    ] = 6,
) -> None:
    """Download ERA5 for the padded domain into <drive>/raw/era5/ (resumable, skips done months).

    Both routes write identical files; a month finished by either route is skipped by both,
    and a per-month lock stops two runs writing the same month.
    """
    import pandas as pd

    from stratum.io import era5

    if ":" in month:
        a, b = month.split(":")
        months = [(p.year, p.month) for p in pd.period_range(a, b, freq="M")]
    else:
        y, m = (int(x) for x in month.split("-"))
        months = [(y, m)]
    if reverse:
        months = months[::-1]
    day_list = None
    if days:
        lo, _, hi = days.partition("-")
        day_list = list(range(int(lo), int(hi or lo) + 1))
    groups = list(era5.GROUPS) if group == "all" else [group]
    root = drive_root() / "raw" / "era5"
    for y, m in months:
        for g in groups:
            if route == "arco":
                res = era5.download_month_arco(
                    g,
                    y,
                    m,
                    root,
                    max_hours=max_hours,
                    workers=workers,
                    config_hash=cfg.config_hash(),
                )
            else:
                res = era5.download_month_cds(
                    g, y, m, root, days=day_list, config_hash=cfg.config_hash()
                )
            _summary(f"download-era5 [{route}] {g} {y}-{m:02d}", res)


@app.command("audit-coverage")
def audit_coverage(
    schedule: Annotated[str, typer.Option(help="human-filled schedule CSV")] = (
        "data/reference/scheduled_flights.csv"
    ),
    record: Annotated[
        bool, typer.Option(help="write the decision to configs + decision log")
    ] = False,
) -> None:
    """Coverage audit (paper §3.3): apply the pre-registered rule to every audit day on disk."""
    import datetime as _dt

    import yaml

    from stratum.flights import coverage
    from stratum.io import adsb_adsbx

    sched_path = repo_root() / schedule
    if not sched_path.exists():
        console.print(f"[red]{sched_path} not found.[/red] Fill in the template first.")
        raise typer.Exit(1)
    sched = coverage.load_schedule(sched_path)
    days: dict[tuple[str, str], object] = {}
    for d in sorted({str(x) for x in sched["date"]}):
        p = drive_root() / "raw" / "adsb" / "adsbx" / d
        if p.exists():
            days[("adsbx", d)] = adsb_adsbx.read_day(p)
    corridor = cfg.corridor_polygon(cfg.load_domain().corridor)
    out = repo_root() / "reports" / "coverage_audit"
    res = coverage.run_audit(sched_path, days, corridor, out)
    dec = res["decision"]
    if record:
        ds_path = cfg.configs_dir() / "data_sources.yaml"
        text = ds_path.read_text()
        data = yaml.safe_load(text)
        today = _dt.date.today().isoformat()
        old = f"  chosen_source: {data['adsb']['chosen_source']}"
        text = text.replace(old, f"  chosen_source: {dec['chosen_source']}", 1)
        text = text.replace("  decided_on: null", f'  decided_on: "{today}"', 1)
        text = text.replace(
            "  audit_report: null", "  audit_report: reports/coverage_audit/coverage_audit.md", 1
        )
        ds_path.write_text(text)
        log_path = repo_root() / "docs" / "decisions.md"
        log_path.write_text(
            log_path.read_text().rstrip("\n")
            + f"\n| {today} | ADS-B source = **{dec['chosen_source']}** (coverage audit) | "
            f"{dec['reason']}; applied mechanically by `stratum audit-coverage` | "
            "rule (paper §3.3) |\n"
        )
    _summary("audit-coverage", {**dec, "report": out / "coverage_audit.md", "recorded": record})


@app.command("meteosat-day")
def meteosat_day(
    day: Annotated[str, typer.Option(help="UTC day, YYYY-MM-DD")],
    extend_hours: Annotated[float, typer.Option(help="also take slots after midnight")] = 2.0,
    max_slots: Annotated[int | None, typer.Option(help="TEST ONLY: first N slots")] = None,
) -> None:
    """Download + crop one day of Meteosat-9 IODC (6 IR channels + cloud mask) to Drive."""
    import os
    from datetime import date as _date

    from eumdac.datastore import DataStore
    from eumdac.token import AccessToken

    from stratum.io import meteosat

    tok = AccessToken((os.environ["EUMETSAT_KEY"], os.environ["EUMETSAT_SECRET"]))
    root = drive_root() / "raw" / "meteosat"
    res = meteosat.ingest_day(
        _date.fromisoformat(day),
        root,
        work_dir(),
        DataStore(tok),
        extend_hours=extend_hours,
        max_slots=max_slots,
        config_hash=cfg.config_hash(),
    )
    area = res.pop("_area", None)
    grid_path = root / "static_grid.zarr"
    if area is not None and not grid_path.exists():
        meteosat.static_grid(area).to_zarr(grid_path, mode="w", consolidated=True)
        res["static_grid"] = str(grid_path)
    _summary(f"meteosat-day {day}", res)


@app.command("meteosat-figures")
def meteosat_figures(
    day: Annotated[str, typer.Option(help="stored day, YYYY-MM-DD")],
    time: Annotated[str, typer.Option(help="UTC time HH:MM (nearest slot)")],
) -> None:
    """Quick-look PNGs (T10.8 with coastline = geolocation check; BTD) for one slot."""
    from datetime import date as _date

    from stratum.io import meteosat, meteosat_plots

    d = _date.fromisoformat(day)
    ds = meteosat.open_day(drive_root() / "raw" / "meteosat", d)
    t = f"{day}T{time}"
    out = repo_root() / "reports" / "phase1" / "meteosat"
    files = [
        meteosat_plots.slot_figure(
            ds, t, out / f"ir108_coast_{day}T{time.replace(':', '')}.png", "IR_108"
        ),
        meteosat_plots.slot_figure(ds, t, out / f"btd_{day}T{time.replace(':', '')}.png", "BTD"),
    ]
    _summary("meteosat-figures", {"files": [str(f) for f in files]})


@app.command("select-clear-days")
def select_clear_days(
    month: Annotated[str, typer.Option(help="YYYY-MM with ERA5 pl on Drive")] = "2026-01",
    n: Annotated[int, typer.Option(help="how many days")] = 2,
    exclude: Annotated[str, typer.Option(help="comma-separated days to skip")] = "2026-01-01",
) -> None:
    """Pick the N days with least ERA5 high cloud over the study box (objective choice)."""
    from stratum.io import era5, meteosat

    y, m = (int(x) for x in month.split("-"))
    pl = era5.open_month(drive_root() / "raw" / "era5", "pl", y, m)
    b = cfg.load_domain().study_bbox
    days = meteosat.select_clear_days(pl, n, exclude.split(","), b.lat, b.lon)
    hc = meteosat.daily_high_cloud(pl, b.lat, b.lon)
    _summary(
        "select-clear-days", {"chosen": ",".join(days), "high-cloud by day": hc.round(3).to_dict()}
    )
    console.print(f"CLEAR_DAYS={','.join(days)}")


@app.command("era5-equivalence")
def era5_equivalence(
    day: Annotated[
        str, typer.Option(help="day downloaded with --days (YYYY-MM-DD)")
    ] = "2026-01-15",
    pl_hours: Annotated[str, typer.Option(help="hours checked for pl, e.g. 0,6,18")] = "0,6,18",
) -> None:
    """Prove the CDS and ARCO routes give the same ERA5 values (build prompt §1.1.3)."""
    import pandas as pd
    import xarray as xr

    from stratum.io import era5

    y, m, d = day.split("-")
    rows: list[dict[str, object]] = []
    hours = {"pl": [int(h) for h in pl_hours.split(",")], "sl": list(range(24)), "tropo_T": [6]}
    for g, hs in hours.items():
        path = drive_root() / "raw" / "era5" / g / f"{y}-{m}_days-{d}-{d}" / "data.zarr"
        times = [f"{day}T{h:02d}:00" for h in hs]
        cds = xr.open_zarr(path).sel(time=times).load()
        arco = era5.open_arco_subset(g, times).load()
        for r in era5.compare_routes(cds, arco):
            rows.append({"group": g, "hours_utc": " ".join(map(str, hs)), **r})
    df = pd.DataFrame(rows)
    out = repo_root() / "reports" / "phase1" / "era5_cds_vs_arco.csv"
    df.to_csv(out, index=False)
    worst = float(df["max_abs_diff_relative_to_max"].max())
    _summary(
        "era5-equivalence",
        {
            "day": day,
            "variables": len(df),
            "worst relative difference": f"{worst:.1e}",
            "report": out,
        },
    )


@app.command("ingest-aircraft-db")
def ingest_aircraft_db(
    snapshot: Annotated[str, typer.Option(help="OpenSky snapshot month, YYYY-MM")] = "2025-08",
) -> None:
    """Store a dated OpenSky aircraft-database snapshot in <drive>/raw/aircraft_db/."""
    from stratum.io import aircraft_db

    meta = aircraft_db.ingest(snapshot, drive_root() / "raw" / "aircraft_db")
    _summary(f"ingest-aircraft-db {snapshot}", meta)


@app.command("figure-sac")
def figure_sac() -> None:
    """Reproduce paper Figure 1 (SAC diagram) into reports/figures/."""
    from stratum.physics.sac_figure import save_figure

    out = repo_root() / "reports" / "figures"
    numbers = save_figure(out)
    rows: dict[str, object] = {"files": f"{out}/fig1_sac.png, .svg"}
    rows.update({k: v for k, v in numbers.items() if k != "points"})
    points = numbers["points"]
    assert isinstance(points, dict)
    for name, d in points.items():
        rows[f"point {name}"] = d
    _summary("figure-sac", rows)


@app.command("lock-preregistration")
def lock_preregistration() -> None:
    """Freeze preregistered.yaml + settled open questions into _locks/preregistration.lock."""
    p = lk.default_paths()
    try:
        record = lk.write_lock(p["prereg"], p["open_questions"], p["lock"])
    except lk.LockError as e:
        console.print(f"[red]Not locked:[/red] {e}")
        raise typer.Exit(1) from e
    copied = "no (no Drive mounted)"
    if is_colab() or drive_root() != repo_root() / "data" / "drive_local":
        dest = drive_root() / "_locks" / p["lock"].name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p["lock"], dest)
        copied = str(dest)
    _summary(
        "lock-preregistration",
        {
            "lock file": p["lock"],
            "combined sha256": record.combined_sha256,
            "git commit": record.git_commit[:12],
            "settled questions": ", ".join(sorted(record.settled_questions_sha256)),
            "still open": ", ".join(record.open_at_lock) or "none",
            "copied to Drive": copied,
        },
    )


@app.command("verify-lock")
def verify_lock(
    strict: Annotated[bool, typer.Option(help="Fail on ANY change, even documented ones.")] = False,
) -> None:
    """Check the pre-registration against the lock; fail on undocumented changes."""
    p = lk.default_paths()
    res = lk.verify_lock(p["prereg"], p["open_questions"], p["lock"], p["deviations"])
    if not res.lock_found:
        console.print("[red]No lock found.[/red] Run `stratum lock-preregistration` first.")
        raise typer.Exit(1)
    _summary(
        "verify-lock",
        {
            "lock created": res.lock.created_at if res.lock else "?",
            "identical to lock": res.identical,
            "changed keys": ", ".join(res.changed) or "none",
            "changes WITHOUT approved deviation": ", ".join(res.undocumented) or "none",
            "questions settled since lock": ", ".join(res.newly_settled) or "none",
            "⚑ placeholders filled since lock": ", ".join(res.filled_placeholders) or "none",
        },
    )
    if not res.ok or (strict and not res.identical):
        console.print("[red]FAILED[/red]: pre-registration differs from the lock.")
        raise typer.Exit(1)
    console.print("[green]OK[/green]")


if __name__ == "__main__":
    app()
