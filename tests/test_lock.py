"""Tests for the pre-registration lock (build prompt rule 2, §0.4, §6.8)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from stratum import lock as lk

REAL = lk.default_paths()


@pytest.fixture
def files(tmp_path: Path) -> dict[str, Path]:
    """Copies of the real pre-registration files in a temp dir, plus empty lock/deviations."""
    p = {
        "prereg": tmp_path / "preregistered.yaml",
        "open_questions": tmp_path / "preregistered_open_questions.md",
        "lock": tmp_path / "_locks" / "preregistration.lock",
        "deviations": tmp_path / "deviations.md",
    }
    shutil.copy(REAL["prereg"], p["prereg"])
    shutil.copy(REAL["open_questions"], p["open_questions"])
    p["deviations"].write_text("# Deviations\n")
    return p


def _lock(p: dict[str, Path]) -> lk.LockRecord:
    return lk.write_lock(p["prereg"], p["open_questions"], p["lock"], require_committed=False)


def _verify(p: dict[str, Path]) -> lk.VerifyResult:
    return lk.verify_lock(p["prereg"], p["open_questions"], p["lock"], p["deviations"])


def _set(p: Path, section: str, key: str, value: object) -> None:
    data = yaml.safe_load(p.read_text())
    data[section][key] = value
    p.write_text(yaml.safe_dump(data))


def test_no_lock_means_not_ok(files: dict[str, Path]) -> None:
    res = _verify(files)
    assert not res.lock_found and not res.ok


def test_fresh_lock_verifies_identical(files: dict[str, Path]) -> None:
    rec = _lock(files)
    assert len(rec.combined_sha256) == 64
    import re

    still_open = set(re.findall(r"^### (\d+)\..*⚑ OPEN", files["open_questions"].read_text(), re.M))
    assert set(rec.open_at_lock) == {f"Q{n}" for n in still_open}
    assert "Q1" in rec.settled_questions_sha256
    res = _verify(files)
    assert res.ok and res.identical


def test_refuses_to_overwrite_lock(files: dict[str, Path]) -> None:
    _lock(files)
    with pytest.raises(lk.LockError):
        _lock(files)


def test_comment_and_formatting_changes_are_not_changes(files: dict[str, Path]) -> None:
    _lock(files)
    files["prereg"].write_text("# extra comment\n" + files["prereg"].read_text() + "\n\n")
    assert _verify(files).identical


def test_value_change_without_deviation_fails(files: dict[str, Path]) -> None:
    _lock(files)
    _set(files["prereg"], "matching", "max_distance_px", 3)
    res = _verify(files)
    assert res.changed == ["matching.max_distance_px"]
    assert res.undocumented == ["matching.max_distance_px"] and not res.ok


def test_value_change_with_approved_deviation_passes(files: dict[str, Path]) -> None:
    _lock(files)
    _set(files["prereg"], "matching", "max_distance_px", 3)
    files["deviations"].write_text(
        "# Deviations\n\n## D-001 — 2026-11-02 — widen tolerance\n"
        "- Keys: matching.max_distance_px\n- Reason: test\n"
        "- Results seen before the change: no\n- Team OK: Shrugal Vinod, 2026-11-02 (chat)\n"
    )
    res = _verify(files)
    assert res.ok and not res.identical


def test_deviation_without_team_ok_does_not_count(files: dict[str, Path]) -> None:
    _lock(files)
    _set(files["prereg"], "matching", "max_distance_px", 3)
    files["deviations"].write_text(
        "## D-001 — 2026-11-02 — x\n- Keys: matching.max_distance_px\n- Team OK: pending\n"
    )
    assert not _verify(files).ok


def test_parent_key_deviation_covers_children(files: dict[str, Path]) -> None:
    _lock(files)
    _set(files["prereg"], "matching", "max_angle_deg", 25)
    files["deviations"].write_text(
        "## D-002 — d — t\n- Keys: matching\n- Team OK: AH, 2026-12-01\n"
    )
    assert _verify(files).ok


def test_editing_a_settled_answer_is_a_change(files: dict[str, Path]) -> None:
    _lock(files)
    text = (
        files["open_questions"]
        .read_text()
        .replace("Mass = **0.80 × MTOW**", "Mass = **0.85 × MTOW**")
    )
    files["open_questions"].write_text(text)
    res = _verify(files)
    assert "open_questions.Q6" in res.undocumented and not res.ok


def _reopen_q16_and_q3(files: dict[str, Path]) -> None:
    """Put Q16/Q3 back to their lock-time state (open, null), whatever the real files say now."""
    import re

    data = yaml.safe_load(files["prereg"].read_text())
    data["detection"]["labelled_split"]["seed"] = None
    data["detection"]["agreement_metric"] = None
    files["prereg"].write_text(yaml.safe_dump(data))
    text = re.sub(
        r"(### 16\. Random seed for the 100 / 100 tuning / held-out split of the labelled scenes — ).*",
        r"\1⚑ OPEN · owner SV · before scene sampling (Phase 5)",
        files["open_questions"].read_text(),
    )
    files["open_questions"].write_text(text)


def test_settling_an_open_question_later_is_allowed(files: dict[str, Path]) -> None:
    _reopen_q16_and_q3(files)
    _lock(files)
    text = (
        files["open_questions"]
        .read_text()
        .replace(
            "### 16. Random seed for the 100 / 100 tuning / held-out split of the labelled scenes — ⚑ OPEN",
            "### 16. Random seed for the 100 / 100 tuning / held-out split of the labelled scenes — SETTLED (2026-12-01)",
        )
    )
    files["open_questions"].write_text(text)
    res = _verify(files)
    assert res.ok and res.newly_settled == ["Q16"]


def test_invalid_prereg_cannot_be_locked(files: dict[str, Path]) -> None:
    _set(files["prereg"], "matching", "typo_key", 1)
    with pytest.raises(ValidationError):
        _lock(files)


def test_flatten_and_diff() -> None:
    assert lk.flatten({"a": {"b": 1, "c": [1, 2]}}) == {"a.b": 1, "a.c": [1, 2]}
    assert lk.diff_values({"a": {"b": 1}}, {"a": {"b": 1, "c": None}}) == ["a.c"]


def test_filling_a_null_placeholder_is_allowed(files: dict[str, Path]) -> None:
    _reopen_q16_and_q3(files)
    _lock(files)
    data = yaml.safe_load(files["prereg"].read_text())
    data["detection"]["labelled_split"]["seed"] = 7
    data["detection"]["agreement_metric"] = {
        "kappa": {"method": "cell_grid", "cell_px": 16},
        "object_f1": {
            "max_mean_distance_px": 2,
            "min_overlap_of_shorter": 0.5,
            "max_angle_deg": 20,
            "assignment": "hungarian",
        },
        "ci": {"method": "scene_bootstrap", "level": 0.95, "resamples": 2000},
    }
    files["prereg"].write_text(yaml.safe_dump(data))
    res = _verify(files)
    assert res.ok and res.identical
    assert "detection.labelled_split.seed" in res.filled_placeholders
    assert "detection.agreement_metric.kappa.cell_px" in res.filled_placeholders


def test_changing_a_set_value_next_to_placeholders_still_fails(files: dict[str, Path]) -> None:
    _lock(files)
    data = yaml.safe_load(files["prereg"].read_text())
    data["detection"]["labelled_split"]["tuning"] = 120  # was 100, not a placeholder
    files["prereg"].write_text(yaml.safe_dump(data))
    res = _verify(files)
    assert res.undocumented == ["detection.labelled_split.tuning"] and not res.ok


def test_refilling_a_placeholder_after_it_was_locked_filled_is_a_change(
    files: dict[str, Path],
) -> None:
    data = yaml.safe_load(files["prereg"].read_text())
    data["detection"]["labelled_split"]["seed"] = 7
    files["prereg"].write_text(yaml.safe_dump(data))
    _lock(files)
    data["detection"]["labelled_split"]["seed"] = 8  # seed-shopping must be caught
    files["prereg"].write_text(yaml.safe_dump(data))
    assert _verify(files).undocumented == ["detection.labelled_split.seed"]
