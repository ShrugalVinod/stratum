"""Run manifests, ``_SUCCESS`` markers and resumable jobs.

What it does
------------
*Reproducibility* (build prompt rule 6): every output records how it was made: git commit,
config hash, hashes of its input files, timestamps and software versions. That record is a
**run manifest**, a small JSON file.

*Resumability* (build prompt §2.3): Colab sessions disconnect, so long jobs are split into
**units** (e.g. one day or one month). Each unit is written into its own folder. Only
**after** everything in it is written do we add ``manifest.json`` and then an empty
``_SUCCESS`` file. On restart, a unit with ``_SUCCESS`` is skipped. A unit without it counts
as not done and is redone from scratch, so a half-written unit is never trusted.

Files are written atomically (write to a temporary name, then rename) so a crash cannot
leave a truncated manifest behind.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import tempfile
import uuid
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from stratum.paths import repo_root

SUCCESS_MARKER = "_SUCCESS"
MANIFEST_NAME = "manifest.json"

# Packages whose versions go into every manifest.
TRACKED_PACKAGES: tuple[str, ...] = (
    "stratum",
    "numpy",
    "scipy",
    "pandas",
    "xarray",
    "zarr",
    "pycontrails",
    "openap",
    "satpy",
    "pyresample",
    "scikit-learn",
    "lightgbm",
)


def utc_now() -> str:
    """Current UTC time as an ISO-8601 string with a ``Z`` suffix."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def git_commit(cwd: Path | None = None) -> tuple[str, bool]:
    """Return (commit SHA, working-tree-dirty flag), or ("unknown", True) outside git."""
    where = cwd or repo_root()
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=where, capture_output=True, text=True, check=True
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--porcelain"], cwd=where, capture_output=True, text=True, check=True
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return "unknown", True
    return sha, bool(status.strip())


def file_sha256(path: Path, chunk_bytes: int = 1 << 20) -> str:
    """SHA-256 of a file, read in chunks so large files don't fill memory."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(chunk_bytes):
            h.update(block)
    return h.hexdigest()


def software_versions(packages: Iterable[str] = TRACKED_PACKAGES) -> dict[str, str]:
    """Installed version of each package, or ``"not installed"``."""
    out: dict[str, str] = {"python": platform.python_version()}
    for name in packages:
        try:
            out[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            out[name] = "not installed"
    return out


def atomic_write_text(path: Path, text: str) -> None:
    """Write ``text`` to ``path`` via a temporary file + rename (no partial files)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class RunManifest(BaseModel):
    """Everything needed to trace an output back to its code, config and inputs."""

    job: str
    run_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    unit: str | None = None
    started_at: str = Field(default_factory=utc_now)
    finished_at: str | None = None
    git_commit: str = "unknown"
    git_dirty: bool = True
    config_hash: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    inputs: dict[str, str] = Field(default_factory=dict)  # path → sha256
    outputs: dict[str, str] = Field(default_factory=dict)  # path → sha256
    stats: dict[str, Any] = Field(default_factory=dict)
    software: dict[str, str] = Field(default_factory=software_versions)
    platform: str = Field(default_factory=platform.platform)

    @classmethod
    def start(
        cls,
        job: str,
        *,
        unit: str | None = None,
        config_hash: str | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> RunManifest:
        """Begin a manifest, filling in git commit and dirty flag automatically."""
        sha, dirty = git_commit()
        return cls(
            job=job,
            unit=unit,
            git_commit=sha,
            git_dirty=dirty,
            config_hash=config_hash,
            params=dict(params or {}),
        )

    def add_inputs(self, paths: Iterable[Path]) -> None:
        """Record the SHA-256 of each input file."""
        for p in paths:
            self.inputs[str(p)] = file_sha256(p)

    def add_outputs(self, paths: Iterable[Path]) -> None:
        """Record the SHA-256 of each output file."""
        for p in paths:
            self.outputs[str(p)] = file_sha256(p)

    def finish(self) -> None:
        """Stamp the finish time."""
        self.finished_at = utc_now()

    def write(self, path: Path) -> None:
        """Write the manifest as pretty JSON, atomically."""
        atomic_write_text(path, self.model_dump_json(indent=2) + "\n")


def mark_success(unit_dir: Path, manifest: RunManifest) -> None:
    """Finalise a unit: write its manifest, THEN the ``_SUCCESS`` marker.

    Call only after every output file of the unit is completely written.
    """
    if manifest.finished_at is None:
        manifest.finish()
    manifest.write(unit_dir / MANIFEST_NAME)
    (unit_dir / SUCCESS_MARKER).touch()


def is_done(unit_dir: Path) -> bool:
    """A unit counts as done only if its ``_SUCCESS`` marker exists."""
    return (unit_dir / SUCCESS_MARKER).is_file()


def read_manifest(unit_dir: Path) -> RunManifest:
    """Load a unit's manifest."""
    return RunManifest.model_validate(json.loads((unit_dir / MANIFEST_NAME).read_text("utf-8")))


def split_done_pending(
    units: Iterable[str], unit_dir_of: Mapping[str, Path] | None = None, base: Path | None = None
) -> tuple[list[str], list[str]]:
    """Split unit names into (already done, still to do).

    Each unit's folder is ``unit_dir_of[name]`` if given, else ``base / name``.
    """
    done: list[str] = []
    pending: list[str] = []
    for name in units:
        if unit_dir_of is not None:
            d = unit_dir_of[name]
        elif base is not None:
            d = base / name
        else:
            raise ValueError("give either unit_dir_of or base")
        (done if is_done(d) else pending).append(name)
    return done, pending
