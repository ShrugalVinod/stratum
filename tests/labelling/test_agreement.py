"""Labeller agreement: object matching rules, κ on cells, bootstrap CIs, scoring exclusions."""

import json

import numpy as np
import pytest

from stratum.labelling import agreement as ag

LINE = np.array([[100.0, 20.0], [100.0, 220.0]])  # horizontal, 200 px


def test_same_line_matches_and_shifted_lines() -> None:
    assert ag.pair_match(LINE, LINE) == pytest.approx(0.0)
    assert ag.pair_match(LINE, LINE + np.array([1.5, 0])) == pytest.approx(
        1.5
    )  # 1.5 px apart: same contrail
    assert ag.pair_match(LINE, LINE + np.array([4.0, 0])) is None  # 4 px apart: different
    # a second labeller drew the same contrail with 3 points and slightly shorter
    b = np.array([[101.0, 40.0], [100.5, 120.0], [101.0, 210.0]])
    assert ag.pair_match(LINE, b) is not None


def test_crossing_and_angled_lines_do_not_match() -> None:
    cross = np.array([[0.0, 120.0], [200.0, 120.0]])
    assert ag.pair_match(LINE, cross) is None
    rot = np.array(
        [[100.0, 20.0], [100.0 + 200 * np.sin(np.radians(25)), 20 + 200 * np.cos(np.radians(25))]]
    )
    assert ag.pair_match(LINE, rot) is None


def test_small_overlap_does_not_match() -> None:
    other = np.array([[100.0, 180.0], [100.0, 400.0]])  # shares only 40 of the shorter 200 px
    assert ag.pair_match(LINE, other) is None


def test_hungarian_one_to_one() -> None:
    A = [LINE, LINE + np.array([30, 0])]
    B = [LINE + np.array([1, 0]), LINE + np.array([31, 0]), LINE + np.array([60, 0])]
    m = ag.match_objects(A, B)
    assert sorted((i, j) for i, j, _ in m) == [(0, 0), (1, 1)]


def test_kappa_known_values() -> None:
    assert ag.cohen_kappa([1, 1, 0, 0], [1, 1, 0, 0]) == pytest.approx(1.0)
    # 4 items: po = 0.5, pa = pb = 0.5 → pe = 0.5 → κ = 0
    assert ag.cohen_kappa([1, 1, 0, 0], [1, 0, 1, 0]) == pytest.approx(0.0)


def test_cell_grid_marks_cells_on_the_line() -> None:
    g = ag.cell_grid([LINE])
    assert g.shape == (16, 16) and g[6].sum() >= 13 and g.sum() == g[6].sum()


def _write(d, sid, who, objs, status="clear"):  # type: ignore[no-untyped-def]
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{sid}.json").write_text(
        json.dumps(
            {
                "scene_id": sid,
                "labeller": who,
                "scene_status": status,
                "objects": [
                    {"id": i, "polyline_px": p, "confidence": c} for i, (p, c) in enumerate(objs)
                ],
            }
        )
    )


def test_agreement_report_rules(tmp_path) -> None:  # type: ignore[no-untyped-def]
    L = LINE.tolist()
    L2 = (LINE + np.array([1, 0])).tolist()
    short = [[10.0, 10.0], [10.0, 15.0]]  # 5 px: dropped (rule 1)
    a, b = tmp_path / "aditya", tmp_path / "ishaan"
    _write(a, "S001", "aditya", [(L, "sure"), (short, "sure")])
    _write(b, "S001", "ishaan", [(L2, "sure")])
    _write(a, "S002", "aditya", [(L, "uncertain")])
    _write(b, "S002", "ishaan", [(L2, "sure")])
    _write(a, "S003", "aditya", [(L, "sure")], status="obscured")  # excluded
    _write(b, "S003", "ishaan", [])
    r = ag.agreement(ag.read_dir(a), ag.read_dir(b), seed=1, resamples=200)
    assert r["scenes_scored"] == 2 and r["scenes_excluded_obscured"] == 1
    assert (
        r["sure_only"]["matched"] == 1
        and r["sure_only"]["objects_A"] == 1
        and r["sure_only"]["objects_B"] == 2
    )
    assert r["sure_and_uncertain"]["object_f1"] == pytest.approx(1.0)
    lo, hi = r["sure_and_uncertain"]["ci95"]["object_f1"]
    assert lo <= 1.0 <= hi + 1e-12
    assert 0 < r["sure_only"]["object_f1"] < 1
