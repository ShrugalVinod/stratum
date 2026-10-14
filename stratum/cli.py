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

import json
import shutil
from typing import Annotated

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


@app.command("download-era5")
def download_era5(
    month: Annotated[str, typer.Option(help="YYYY-MM, or a range YYYY-MM:YYYY-MM")],
    group: Annotated[str, typer.Option(help="pl, sl, tropo_T, or all")] = "all",
    days: Annotated[str | None, typer.Option(help="TEST ONLY (cds): e.g. '15' or '15-16'")] = None,
    route: Annotated[str, typer.Option(help="cds (official queue) or arco (Google copy)")] = "cds",
    reverse: Annotated[bool, typer.Option(help="newest month first")] = False,
    max_hours: Annotated[int | None, typer.Option(help="TEST ONLY (arco): first N hours")] = None,
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
                    g, y, m, root, max_hours=max_hours, config_hash=cfg.config_hash()
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
