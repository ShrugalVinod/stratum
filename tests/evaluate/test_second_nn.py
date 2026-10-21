"""D-005 second analysis: label counts and chance share per detector track."""

from pathlib import Path

import pandas as pd

from stratum.evaluate.second_nn import label_counts
from stratum.manifest import SUCCESS_MARKER


def _write(d: Path, ys: list[float | None]) -> None:
    d.mkdir(parents=True)
    pd.DataFrame({"segment_id": range(len(ys)), "flight_id": [f"F{i % 3}" for i in range(len(ys))],
                  "y": ys}).to_parquet(d / "labels.parquet")  # fmt: skip
    (d / SUCCESS_MARKER).write_text("{}")


def test_label_counts_per_track(tmp_path: Path) -> None:
    _write(tmp_path / "interim/matches/2026-01/2026-01-01", [1, 0, 0, 0, None])
    _write(tmp_path / "interim/matches_null/2026-01-01_on_2026-02-01", [1, 0, 0, 0, 0, 0, 0, 0])
    _write(tmp_path / "interim/matches_nn/2026-01/2026-01-01", [1, 1, 0, 0])
    _write(tmp_path / "interim/matches_null_nn/2026-01-01_on_2026-02-01", [0, 0, 0, 0])
    line, nn = label_counts(tmp_path, "line"), label_counts(tmp_path, "nn")
    assert line["labelled"] == 4 and line["y1"] == 1 and line["y1_rate_real"] == 0.25
    assert line["chance_share"] == 0.5  # 0.125 / 0.25
    assert nn["y1"] == 2 and nn["flights_with_y1"] == 2 and nn["chance_share"] == 0.0
    assert label_counts(tmp_path, "other")["labelled"] == 0
