"""Pre-registration lock: freeze the evaluation plan and detect any later change.

What it does
------------
The methods paper fixes the metric, splits, hypotheses and thresholds *before* any results
are seen (paper "Read this first", §6). This module makes that promise checkable
(build prompt rule 2, §0.4, §6.8):

* ``write_lock`` records a SHA-256 of the **parsed values** in
  ``configs/preregistered.yaml`` and of every **settled** answer in
  ``configs/preregistered_open_questions.md``, plus a full copy of both, the time and the
  git commit, in ``_locks/preregistration.lock``. It refuses to overwrite an existing lock.
* ``verify_lock`` compares the current files with the lock key by key. Any difference must
  be listed in ``docs/deviations.md`` with a team OK, or verification fails.

Questions that were still OPEN at lock time may be settled later without a deviation (they
are reported as "newly settled"), and the same goes for a ⚑ ``null`` placeholder in the YAML
that is later filled in. But a question that was SETTLED, or a value that was already set,
at lock time may not change silently. Editing comments or formatting is not a change: only
parsed values and answer text count.

Deviation entry format (``docs/deviations.md``)::

    ## D-001 — 2026-11-02 — short title
    - Keys: matching.max_distance_px
    - Reason: …
    - Results seen before the change: no
    - Team OK: Shrugal Vinod, 2026-11-02 (chat)
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from stratum.config import Preregistered, canonical_json, hash_data, load_yaml
from stratum.manifest import atomic_write_text, git_commit, utc_now
from stratum.paths import repo_root

LOCK_KIND = "stratum-preregistration-lock"
OPEN_QUESTIONS_KEY = "open_questions"


def default_paths() -> dict[str, Path]:
    """Standard locations of the pre-registration files, the lock and the deviation log."""
    root = repo_root()
    return {
        "prereg": root / "configs" / "preregistered.yaml",
        "open_questions": root / "configs" / "preregistered_open_questions.md",
        "lock": root / "_locks" / "preregistration.lock",
        "deviations": root / "docs" / "deviations.md",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Reading the open-questions file
# ──────────────────────────────────────────────────────────────────────────────

_SECTION_RE = re.compile(r"^###\s+(\d+)\.\s+(.*)$", re.MULTILINE)


def _normalise(text: str) -> str:
    """Strip trailing spaces and surrounding blank lines so whitespace edits don't count."""
    lines = [ln.rstrip() for ln in text.replace("\r\n", "\n").split("\n")]
    return "\n".join(lines).strip()


def parse_open_questions(text: str) -> dict[str, dict[str, str]]:
    """Split the open-questions markdown into ``{"Q<n>": {"status", "text"}}``.

    A section is one ``### <n>. <title> — <STATUS> …`` heading plus everything up to the next
    ``###`` heading. Status is ``settled`` if the heading contains SETTLED, else ``open``.
    """
    matches = list(_SECTION_RE.finditer(text))
    out: dict[str, dict[str, str]] = {}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.start() : end]
        body = body.split("\n---", 1)[0]  # drop a trailing horizontal rule, if any
        key = f"Q{m.group(1)}"
        if key in out:
            raise ValueError(f"open question number {m.group(1)} appears twice")
        status = "settled" if "SETTLED" in m.group(2) else "open"
        out[key] = {"status": status, "text": _normalise(body)}
    return out


def settled_answers(text: str) -> dict[str, str]:
    """SHA-256 of the normalised text of each SETTLED open question."""
    return {
        k: hashlib.sha256(v["text"].encode("utf-8")).hexdigest()
        for k, v in parse_open_questions(text).items()
        if v["status"] == "settled"
    }


# ──────────────────────────────────────────────────────────────────────────────
# Lock record
# ──────────────────────────────────────────────────────────────────────────────


class LockRecord(BaseModel):
    """Contents of ``_locks/preregistration.lock`` (JSON)."""

    kind: str = LOCK_KIND
    format_version: int = 1
    created_at: str
    git_commit: str
    git_dirty: bool
    prereg_sha256: str
    settled_questions_sha256: dict[str, str]
    combined_sha256: str
    open_at_lock: list[str]
    prereg_values: dict[str, Any]
    open_questions_text: str


def _combined(prereg_sha: str, settled: dict[str, str]) -> str:
    return hashlib.sha256(
        canonical_json({"prereg": prereg_sha, "settled": settled}).encode()
    ).hexdigest()


def current_state(prereg_path: Path, oq_path: Path) -> tuple[dict[str, Any], str]:
    """Parse and validate the current pre-registration files; return (values, questions text)."""
    values = load_yaml(prereg_path)
    Preregistered.model_validate(values)  # refuse to lock or verify an invalid file
    return values, oq_path.read_text(encoding="utf-8")


class LockError(RuntimeError):
    """Raised when a lock cannot be written."""


def _uncommitted(paths: list[Path]) -> list[str]:
    """Files among ``paths`` that differ from the last commit (or aren't tracked)."""
    root = repo_root()
    dirty: list[str] = []
    for p in paths:
        rel = str(p.resolve().relative_to(root))
        tracked = (
            subprocess.run(
                ["git", "ls-files", "--error-unmatch", rel], cwd=root, capture_output=True
            ).returncode
            == 0
        )
        clean = (
            subprocess.run(["git", "diff", "--quiet", "HEAD", "--", rel], cwd=root).returncode == 0
        )
        if not (tracked and clean):
            dirty.append(rel)
    return dirty


def write_lock(
    prereg_path: Path,
    oq_path: Path,
    lock_path: Path,
    *,
    require_committed: bool = True,
) -> LockRecord:
    """Create the pre-registration lock. Refuses if a lock already exists.

    With ``require_committed`` (the default), both files must be committed unchanged, so
    the recorded git commit really contains the locked settings.
    """
    if lock_path.exists():
        raise LockError(
            f"{lock_path} already exists. The pre-registration is locked; change settings "
            "through docs/deviations.md instead of re-locking."
        )
    if require_committed:
        dirty = _uncommitted([prereg_path, oq_path])
        if dirty:
            raise LockError(f"commit these files before locking: {', '.join(dirty)}")
    values, oq_text = current_state(prereg_path, oq_path)
    settled = settled_answers(oq_text)
    prereg_sha = hash_data(values)
    sha, dirty_tree = git_commit()
    record = LockRecord(
        created_at=utc_now(),
        git_commit=sha,
        git_dirty=dirty_tree,
        prereg_sha256=prereg_sha,
        settled_questions_sha256=settled,
        combined_sha256=_combined(prereg_sha, settled),
        open_at_lock=sorted(
            k for k, v in parse_open_questions(oq_text).items() if v["status"] == "open"
        ),
        prereg_values=values,
        open_questions_text=oq_text,
    )
    atomic_write_text(lock_path, record.model_dump_json(indent=2) + "\n")
    return record


def read_lock(lock_path: Path) -> LockRecord:
    """Load a lock file."""
    return LockRecord.model_validate(json.loads(lock_path.read_text(encoding="utf-8")))


# ──────────────────────────────────────────────────────────────────────────────
# Verification
# ──────────────────────────────────────────────────────────────────────────────


def flatten(data: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten nested mappings to dotted key paths; lists and scalars are leaves."""
    if isinstance(data, dict):
        out: dict[str, Any] = {}
        for k, v in data.items():
            out.update(flatten(v, f"{prefix}.{k}" if prefix else str(k)))
        return out
    return {prefix: data}


def diff_values(locked: dict[str, Any], current: dict[str, Any]) -> list[str]:
    """Dotted key paths whose value was changed, added or removed."""
    a, b = flatten(locked), flatten(current)
    return sorted(
        k
        for k in a.keys() | b.keys()
        if canonical_json(a.get(k)) != canonical_json(b.get(k)) or (k in a) != (k in b)
    )


def is_filled_placeholder(
    key: str, locked_flat: dict[str, Any], current_flat: dict[str, Any]
) -> bool:
    """True if ``key`` was a ⚑ ``null`` placeholder at lock time and now holds a value.

    Filling a placeholder means settling an open question, which is allowed (before results
    are seen) without a deviation. A placeholder can be filled with a scalar
    (``seed: null`` → ``seed: 7``) or a mapping (``agreement_metric: null`` →
    ``{kappa: …}``), so ``key`` or any of its parents must have been ``null`` in the lock.
    Changing or deleting a value that was already set is NOT a fill.
    """
    if key not in current_flat:
        # The null itself disappears when it is replaced by a mapping of sub-keys.
        replaced_by_mapping = any(k.startswith(key + ".") for k in current_flat)
        return replaced_by_mapping and locked_flat.get(key, 0) is None
    parts = key.split(".")
    prefixes = [".".join(parts[: i + 1]) for i in range(len(parts))]
    return any(p in locked_flat and locked_flat[p] is None for p in prefixes)


_DEV_RE = re.compile(r"^##\s+D-\d+", re.MULTILINE)


def approved_deviation_keys(deviations_text: str) -> set[str]:
    """Key paths covered by deviation entries that carry a non-empty ``Team OK``."""
    keys: set[str] = set()
    starts = [m.start() for m in _DEV_RE.finditer(deviations_text)]
    for i, s in enumerate(starts):
        entry = deviations_text[s : starts[i + 1] if i + 1 < len(starts) else len(deviations_text)]
        ok = re.search(r"^-\s*Team OK:\s*(.+)$", entry, re.MULTILINE)
        listed = re.search(r"^-\s*Keys:\s*(.+)$", entry, re.MULTILINE)
        if not ok or not listed:
            continue
        ok_text = ok.group(1).strip().lower()
        if not ok_text or ok_text in {"pending", "-", "—", "none", "no"}:
            continue
        keys.update(k.strip().strip("`") for k in listed.group(1).split(",") if k.strip())
    return keys


def _covered(key: str, approved: set[str]) -> bool:
    """A change is covered if its key, or any parent key, has an approved deviation."""
    parts = key.split(".")
    return any(".".join(parts[: i + 1]) in approved for i in range(len(parts)))


@dataclass
class VerifyResult:
    """Outcome of comparing current pre-registration files with the lock."""

    lock_found: bool
    changed: list[str] = field(default_factory=list)
    undocumented: list[str] = field(default_factory=list)
    newly_settled: list[str] = field(default_factory=list)
    filled_placeholders: list[str] = field(default_factory=list)
    lock: LockRecord | None = None

    @property
    def identical(self) -> bool:
        return self.lock_found and not self.changed

    @property
    def ok(self) -> bool:
        """True if locked and every difference has an approved deviation."""
        return self.lock_found and not self.undocumented


def verify_lock(
    prereg_path: Path, oq_path: Path, lock_path: Path, deviations_path: Path
) -> VerifyResult:
    """Compare the current files with the lock; list changes and undocumented changes."""
    if not lock_path.exists():
        return VerifyResult(lock_found=False)
    lock = read_lock(lock_path)
    values, oq_text = current_state(prereg_path, oq_path)
    diffs = diff_values(lock.prereg_values, values)
    locked_flat, current_flat = flatten(lock.prereg_values), flatten(values)
    filled = [k for k in diffs if is_filled_placeholder(k, locked_flat, current_flat)]
    changed = [k for k in diffs if k not in filled]

    now_settled = settled_answers(oq_text)
    for q, h in lock.settled_questions_sha256.items():
        if now_settled.get(q) != h:
            changed.append(f"{OPEN_QUESTIONS_KEY}.{q}")
    newly = sorted(q for q in now_settled if q not in lock.settled_questions_sha256)

    dev_text = deviations_path.read_text(encoding="utf-8") if deviations_path.exists() else ""
    approved = approved_deviation_keys(dev_text)
    undocumented = [k for k in changed if not _covered(k, approved)]
    return VerifyResult(True, sorted(changed), sorted(undocumented), newly, sorted(filled), lock)
