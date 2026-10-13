"""Work out where data lives: laptop, CI or Google Colab with Drive mounted.

What it does
------------
The same code runs in three places (build prompt §2.2), and each keeps data in a
different folder:

* **Colab**: persistent data on Google Drive at ``/content/drive/MyDrive/STRATUM``.
  Scratch work on the fast local disk at ``/content/work``, because Drive is slow for
  many small files (build prompt §2.3).
* **Laptop or CI**: no Drive is mounted, so the "Drive root" defaults to
  ``<repo>/data/drive_local`` (gitignored). Only small test slices go there.
* Either default can be overridden with the ``STRATUM_DRIVE_ROOT`` and
  ``STRATUM_WORK_DIR`` environment variables (for example in ``.env``).

It also defines the standard Drive folder layout (build prompt §2.3) and creates it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

COLAB_DRIVE_ROOT = Path("/content/drive/MyDrive/STRATUM")
COLAB_WORK_DIR = Path("/content/work")

# Top-level folders of the Drive layout (build prompt §2.3). Per-month and per-day
# sub-folders (YYYY-MM/, YYYY-MM-DD/) are created by the jobs that write them.
DRIVE_LAYOUT: tuple[str, ...] = (
    "raw/era5/pl",
    "raw/era5/sl",
    "raw/era5/tropo_T",
    "raw/adsb/opensky",
    "raw/adsb/adsbx",
    "raw/meteosat/l15_crop",
    "raw/meteosat/clm",
    "raw/aircraft_db",
    "interim/segments",
    "interim/segments_met",
    "interim/cocip",
    "interim/detections",
    "interim/matches",
    "labels/scenes",
    "labels/raw",
    "labels/adjudicated",
    "models",
    "reports",
    "web_exports",
    "manifests",
    "_locks",
)


def repo_root() -> Path:
    """Root of the git repository (the folder containing ``pyproject.toml``)."""
    return Path(__file__).resolve().parents[1]


def is_colab() -> bool:
    """True when running inside Google Colab."""
    return "google.colab" in sys.modules or "COLAB_RELEASE_TAG" in os.environ


def drive_root() -> Path:
    """Persistent data root: ``$STRATUM_DRIVE_ROOT``, else Colab Drive, else a local folder."""
    env = os.environ.get("STRATUM_DRIVE_ROOT")
    if env:
        return Path(env).expanduser()
    if is_colab():
        return COLAB_DRIVE_ROOT
    return repo_root() / "data" / "drive_local"


def work_dir() -> Path:
    """Scratch folder: ``$STRATUM_WORK_DIR``, else ``/content/work`` on Colab, else ``.work``."""
    env = os.environ.get("STRATUM_WORK_DIR")
    if env:
        return Path(env).expanduser()
    if is_colab():
        return COLAB_WORK_DIR
    return repo_root() / ".work"


def create_drive_layout(root: Path | None = None) -> list[Path]:
    """Create every folder of the standard layout under ``root``; return the ones created.

    Safe to run repeatedly: existing folders are left untouched.
    """
    base = root or drive_root()
    created: list[Path] = []
    for rel in DRIVE_LAYOUT:
        p = base / rel
        if not p.exists():
            p.mkdir(parents=True)
            created.append(p)
    return created
