"""Tests for path resolution, the Drive layout and the CLI's guard-rail commands."""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

from stratum import paths
from stratum.cli import app


def test_env_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(tmp_path / "drive"))
    monkeypatch.setenv("STRATUM_WORK_DIR", str(tmp_path / "work"))
    assert paths.drive_root() == tmp_path / "drive"
    assert paths.work_dir() == tmp_path / "work"


def test_local_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STRATUM_DRIVE_ROOT", raising=False)
    monkeypatch.delenv("COLAB_RELEASE_TAG", raising=False)
    if not paths.is_colab():
        assert paths.drive_root() == paths.repo_root() / "data" / "drive_local"


def test_colab_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STRATUM_DRIVE_ROOT", raising=False)
    monkeypatch.delenv("STRATUM_WORK_DIR", raising=False)
    monkeypatch.setenv("COLAB_RELEASE_TAG", "test")
    assert paths.drive_root() == Path("/content/drive/MyDrive/STRATUM")
    assert paths.work_dir() == Path("/content/work")


def test_drive_layout_is_idempotent(tmp_path: Path) -> None:
    first = paths.create_drive_layout(tmp_path)
    assert len(first) == len(paths.DRIVE_LAYOUT)
    assert (tmp_path / "raw" / "meteosat" / "l15_crop").is_dir()
    assert paths.create_drive_layout(tmp_path) == []


def test_cli_info_runs() -> None:
    res = CliRunner().invoke(app, ["info"])
    assert res.exit_code == 0, res.output
    assert "config hash" in res.output


def test_cli_init_drive(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("STRATUM_DRIVE_ROOT", str(tmp_path))
    res = CliRunner().invoke(app, ["init-drive"])
    assert res.exit_code == 0, res.output
    assert (tmp_path / "manifests").is_dir()
