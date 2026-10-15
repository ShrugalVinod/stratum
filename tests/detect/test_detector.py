"""Detector tests on synthetic scenes (build prompt §3.1): recall ≥ 0.9 at SNR ≥ 3, blob rejected."""

from __future__ import annotations

import numpy as np
import pytest

from stratum.detect.line_filters import line_kernel
from stratum.detect.params import load_detector_params
from stratum.detect.run import detect_slot
from tests.detect import synthetic as syn

P = load_detector_params()


def _detect(t108, t120):  # type: ignore[no-untyped-def]
    lat, lon, vza = syn.grid(t108.shape[0])
    df, log = detect_slot(t108, t120, lat, lon, vza, P)
    return df, log


def test_kernel_zero_mean_unit_norm() -> None:
    k = line_kernel(21, 0.7, P.core_sigma_px, P.flank_px)
    assert abs(k.sum()) < 1e-9
    assert abs((k**2).sum() - 1.0) < 1e-9


@pytest.mark.parametrize("snr", [3.0, 5.0])
def test_recall_straight_and_curved_lines(snr: float) -> None:
    found = total = 0
    for seed in range(6):
        t108, t120, rng = syn.scene(seed=seed)
        truths = []
        for j, (r0, c0) in enumerate([(70, 70), (70, 185), (185, 70), (185, 185)]):
            ang = rng.uniform(0, np.pi)
            curv = 0.0 if j % 2 == 0 else 0.08
            truths.append(syn.plant_line(t108, t120, r0, c0, ang, rng.uniform(30, 60), snr, curv))
        df, _ = _detect(t108, t120)
        for tr in truths:
            total += 1
            found += any(
                syn.matches(tr, np.array(r.poly_row), np.array(r.poly_col)) for r in df.itertuples()
            )
    assert found / total >= 0.9, f"recall {found}/{total} at SNR {snr}"


def test_blob_rejected_and_line_kept() -> None:
    t108, t120, _ = syn.scene(seed=11)
    syn.plant_blob(t108, t120, 80, 80, radius=12, amp=2.0)
    tr = syn.plant_line(t108, t120, 185, 160, 0.4, 50, 5.0)
    df, _ = _detect(t108, t120)
    near_blob = df[(abs(df["centroid_lat"] - (20 - 80 * 0.03)) < 0.6)
                   & (abs(df["centroid_lon"] - (75 + 80 * 0.03)) < 0.6)]  # fmt: skip
    assert near_blob.empty, near_blob[["length_px", "width_px", "line_residual_px"]]
    assert any(syn.matches(tr, np.array(r.poly_row), np.array(r.poly_col)) for r in df.itertuples())


def test_noise_only_gives_few_objects() -> None:
    t108, t120, _ = syn.scene(seed=21)
    df, _ = _detect(t108, t120)
    assert (df["confidence"] >= P.operating_threshold).sum() == 0
    assert len(df) <= 2


def test_output_geography() -> None:
    t108, t120, _ = syn.scene(seed=3)
    syn.plant_line(t108, t120, 128, 128, 0.0, 60, 6.0)  # along +column = due east
    df, _ = _detect(t108, t120)
    best = df.sort_values("length_px").iloc[-1]
    assert abs(best["orientation_deg"] - 90.0) < 10.0
    assert 150 < best["length_km"] < 220  # 60 px × 0.03° × ~111 km × cos(16°)…
    assert 0.0 <= best["confidence"] <= 1.0


def test_line_along_cloud_edge_rejected() -> None:
    """A bright line on the edge of a broad cloud band is a cloud edge, not a contrail."""
    t108, t120, _ = syn.scene(seed=31)
    n = t108.shape[0]
    cols = np.arange(n)[None, :].repeat(n, axis=0).astype(float)
    band = np.clip((cols - 128.0) / 1.5, 0.0, 1.0) * 2.5  # cloud band east of column 128
    t108 -= 1.0 * band
    t120 -= 2.0 * band
    syn.plant_line(t108, t120, 128, 129, np.pi / 2, 60, 4.0)  # along the edge
    df, _ = _detect(t108, t120)
    near = df[(df["centroid_lon"] - (75 + 129 * 0.03)).abs() < 0.15]
    assert near.empty or (near["confidence"] < P.operating_threshold).all()
