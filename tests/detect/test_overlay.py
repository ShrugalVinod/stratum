"""Overlay helpers: CoCiP evolution table → positions at an image time → polylines → figure."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from stratum.detect.overlay import contrail_polylines, contrails_at, overlay_figure
from tests.match.test_geometry import EXTENT, PROJ4, SHAPE

T0 = pd.Timestamp("2026-01-01 06:00")


def _table() -> pd.DataFrame:
    rows = []
    for k, dt in enumerate([0, 30, 60]):
        for wp in range(6):
            rows.append(
                {
                    "flight_id": "F1",
                    "waypoint": wp,
                    "time": T0 + pd.Timedelta(minutes=dt),
                    "longitude": 72.0 + 0.1 * wp + 0.05 * k,
                    "latitude": 19.0 + 0.02 * k,
                    "altitude": 11000.0,
                    "continuous": wp != 2,
                }
            )
    return pd.DataFrame(rows)


def test_positions_interpolated_in_time() -> None:
    a = contrails_at(_table(), T0 + pd.Timedelta(minutes=15))
    assert len(a) == 6
    assert np.allclose(a.sort_values("waypoint")["longitude"], 72.025 + 0.1 * np.arange(6))
    assert contrails_at(_table(), T0 - pd.Timedelta(minutes=1)).empty  # not formed yet
    assert contrails_at(_table(), T0 + pd.Timedelta(minutes=61)).empty  # gone


def test_polylines_break_where_not_continuous() -> None:
    lines = contrail_polylines(contrails_at(_table(), T0))
    assert [list(g["waypoint"]) for g in lines] == [[0, 1, 2], [3, 4, 5]]


def test_figure_written(tmp_path: Path) -> None:
    btd = np.random.default_rng(0).normal(1.0, 0.2, SHAPE)
    det = pd.DataFrame(
        {"confidence": [0.9], "poly_row": [[500.0, 520.0]], "poly_col": [[700.0, 690.0]]}
    )
    res = overlay_figure(
        btd, T0, _table(), det, {"area_proj4": PROJ4, "area_extent": EXTENT},
        tmp_path / "f.png", window=(400, 700, 300, 600), dpi=40,
    )  # fmt: skip
    assert res["predicted_lines"] == 2 and res["detected_lines"] == 1
    assert (tmp_path / "f.png").stat().st_size > 10_000
