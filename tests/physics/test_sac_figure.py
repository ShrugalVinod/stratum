"""Figure 1 reproduction: builds, writes files, and shows the paper's verdicts."""

from __future__ import annotations

from pathlib import Path

from stratum.physics.sac_figure import save_figure


def test_fig1_files_and_numbers(tmp_path: Path) -> None:
    numbers = save_figure(tmp_path)
    assert (tmp_path / "fig1_sac.png").stat().st_size > 10_000
    assert (tmp_path / "fig1_sac.svg").exists()
    assert abs(float(numbers["T_LM_C"]) - (-41.9)) < 0.05  # type: ignore[arg-type]
    points = numbers["points"]
    assert isinstance(points, dict)
    assert points["A"]["verdict"] == "short-lived contrail"
    assert points["B"]["verdict"] == "persistent contrail"
    assert points["C"]["verdict"] == "no contrail"
