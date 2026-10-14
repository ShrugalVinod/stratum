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
