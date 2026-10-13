"""Tests for run manifests, _SUCCESS markers and resumability (build prompt rule 6, §2.3)."""

from __future__ import annotations

import hashlib
from pathlib import Path

from stratum import manifest as mf


def test_file_sha256_matches_hashlib(tmp_path: Path) -> None:
    p = tmp_path / "x.bin"
    p.write_bytes(b"stratum" * 100_000)
    assert mf.file_sha256(p, chunk_bytes=1000) == hashlib.sha256(p.read_bytes()).hexdigest()


def test_manifest_records_provenance(tmp_path: Path) -> None:
    inp = tmp_path / "in.txt"
    inp.write_text("hello")
    m = mf.RunManifest.start("unit-test", unit="2026-01-15", config_hash="abc", params={"n": 1})
    m.add_inputs([inp])
    assert m.git_commit  # a SHA, or "unknown" outside git
    assert m.software["python"] and "numpy" in m.software
    assert m.inputs[str(inp)] == hashlib.sha256(b"hello").hexdigest()


def test_unit_is_done_only_after_mark_success(tmp_path: Path) -> None:
    unit = tmp_path / "2026-01-15"
    unit.mkdir()
    (unit / "data.parquet").write_text("partial")
    assert not mf.is_done(unit)  # written data without _SUCCESS is NOT done
    mf.mark_success(unit, mf.RunManifest.start("t"))
    assert mf.is_done(unit)
    assert mf.read_manifest(unit).finished_at is not None


def test_split_done_pending(tmp_path: Path) -> None:
    for name in ["d1", "d2", "d3"]:
        (tmp_path / name).mkdir()
    mf.mark_success(tmp_path / "d2", mf.RunManifest.start("t"))
    done, pending = mf.split_done_pending(["d1", "d2", "d3", "d4"], base=tmp_path)
    assert done == ["d2"] and pending == ["d1", "d3", "d4"]


def test_atomic_write_leaves_no_temp_files(tmp_path: Path) -> None:
    target = tmp_path / "sub" / "m.json"
    mf.atomic_write_text(target, "{}")
    assert target.read_text() == "{}"
    assert [p.name for p in target.parent.iterdir()] == ["m.json"]
