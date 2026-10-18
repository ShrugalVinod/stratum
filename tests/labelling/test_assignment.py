"""The assignment rule is identical in Python and in the labelling app (shared fixture)."""

import json
from pathlib import Path

from stratum.labelling.assignment import labellers_for

FIX = Path(__file__).parents[2] / "labeller" / "tests" / "fixtures" / "assignment_example.json"


def test_same_as_the_app() -> None:
    fx = json.loads(FIX.read_text())
    assert labellers_for(fx["scene_ids"]) == fx["expected"]


def test_main_two_per_scene_and_balanced_pilot_everyone() -> None:
    main = [f"S{i:03d}" for i in range(1, 201)]
    m = labellers_for(main)
    assert all(len(v) == 2 for v in m.values())
    load = {w: sum(w in v for v in m.values()) for w in ("aditya", "ishaan", "abeer")}
    assert load == {"aditya": 134, "ishaan": 133, "abeer": 133}
    assert all(len(v) == 3 for v in labellers_for(main[:20]).values())


def test_review_split_d003() -> None:
    from collections import Counter

    from stratum.labelling.assignment import reviewer_for

    ids = [f"S{i:03d}" for i in range(1, 101)]
    r = reviewer_for(ids)
    assert len(r) == 100 and Counter(r.values()) == {"aditya": 34, "ishaan": 33, "abeer": 33}
    assert r["S001"] == "aditya" and r["S002"] == "ishaan"  # same as the app's review e2e test
