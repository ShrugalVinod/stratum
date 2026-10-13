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
        },
    )
    if not res.ok or (strict and not res.identical):
        console.print("[red]FAILED[/red]: pre-registration differs from the lock.")
        raise typer.Exit(1)
    console.print("[green]OK[/green]")


if __name__ == "__main__":
    app()
