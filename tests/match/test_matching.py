"""Matching and labels, including the build prompt's critical tests (§5.5)."""

import numpy as np
import pandas as pd

from stratum.detect.params import load_detector_params
from stratum.detect.run import detect_slot
from stratum.match import matching as mt
from tests.detect.synthetic import grid, plant_line, scene


def test_unobservable_is_missing_not_zero() -> None:
    """Cloudy / steep-angle scene, no match → label is missing (NaN) and the segment is excluded."""
    hc = np.array([0.8, 0.9, 0.2])  # high cloud in the first two images
    cf = np.array([0.1, 0.2, 0.9])  # opaque cloud mask in the third
    vz = np.array([40.0, 40.0, 40.0])
    obs = mt.observable(hc, cf, vz)
    assert not obs.any()
    per = pd.DataFrame(
        {
            "segment_id": ["s1"] * 3,
            "flight_id": ["f1"] * 3,
            "observable": obs,
            "matched": [False] * 3,
        }
    )
    lab = mt.segment_labels(per)
    assert np.isnan(lab.loc[0, "y"])  # missing, never 0
    assert len(mt.trainable(lab)) == 0  # and kept out of training and scoring
    # steep viewing angle alone also makes it unobservable
    assert not mt.observable([0.0], [0.0], [65.0]).any()


def test_label_rule_any_observable_match_or_two_observable_misses() -> None:
    per = pd.DataFrame(
        {
            "segment_id": ["a", "a", "b", "b", "c", "c", "d"],
            "observable": [True, False, True, True, False, True, True],
            "matched": [False, True, False, False, True, True, False],
        }
    )
    lab = mt.segment_labels(per).set_index("segment_id")
    assert np.isnan(lab.loc["a", "y"])  # its only match was unobservable; 1 observable miss
    assert lab.loc["b", "y"] == 0.0  # observable twice, never matched
    assert lab.loc["c", "y"] == 1.0  # matched at an observable image
    assert np.isnan(lab.loc["d", "y"])  # one observable miss is not enough


def test_box_fraction_majority_rule() -> None:
    m = np.zeros((50, 50), bool)
    m[:, :25] = True
    f = mt.box_fraction(m, [25, 25, 2], [10, 40, 10], 15)
    assert f[0] == 1.0 and f[1] == 0.0 and np.isnan(f[2])  # off-image box → NaN


def test_synthetic_end_to_end_match_and_3px_shift() -> None:
    """Plant a line at the predicted (advected, parallax-corrected) position: y = 1; 3 px away: y = 0."""
    p = load_detector_params()
    lat, lon, vza = grid()
    t108, t120, _ = scene(seed=3)
    truth = plant_line(t108, t120, 128.0, 128.0, np.radians(30), 90.0, snr=4.0)
    det, _ = detect_slot(t108, t120, lat, lon, vza, p)
    objs = [
        (np.array(r), np.array(c)) for r, c in zip(det["poly_row"], det["poly_col"], strict=True)
    ]
    # predicted segment = the planted axis (as if advection + parallax put it exactly there)
    a = (float(truth.rows[40]), float(truth.cols[40]))
    b = (float(truth.rows[-40]), float(truth.cols[-40]))
    hit = mt.matches_line(a, b, objs)
    # the same prediction shifted 3 px across the line
    nr, nc = -np.cos(np.radians(30)), np.sin(np.radians(30))  # unit normal (row, col)
    a3 = (a[0] + 3 * nr, a[1] + 3 * nc)
    b3 = (b[0] + 3 * nr, b[1] + 3 * nc)
    miss = mt.matches_line(a3, b3, objs)
    assert hit and not miss
    per = pd.DataFrame(
        {
            "segment_id": ["ok", "ok", "shift", "shift"],
            "observable": [True, True, True, True],
            "matched": [hit, hit, miss, miss],
        }
    )
    lab = mt.segment_labels(per).set_index("segment_id")
    assert lab.loc["ok", "y"] == 1.0 and lab.loc["shift", "y"] == 0.0


def test_wrong_direction_does_not_match() -> None:
    obj = [(np.full(50, 100.0), np.arange(50.0, 100.0))]  # horizontal line
    assert mt.matches_line((100.0, 60.0), (100.0, 90.0), obj)
    assert not mt.matches_line((80.0, 75.0), (120.0, 75.0), obj)  # crosses at 90°


def test_label_keys_for_leakage_guard() -> None:
    per = pd.DataFrame(
        {
            "segment_id": ["s"],
            "flight_id": ["F"],
            "image_time_first": ["t"],
            "observable": [True],
            "matched": [True],
        }
    )
    lab = mt.segment_labels(per)
    assert {"segment_id", "flight_id", "image_time_first"} <= set(lab.columns)


def test_high_cloud_takes_the_max_at_and_above() -> None:
    from stratum.met.interp import MetGrid

    lev = np.array([150e2, 200e2, 250e2, 300e2])
    cc = np.zeros((2, 4, 3, 3))
    cc[:, 0] = 0.7  # thick cirrus at 150 hPa, above a 225-hPa segment
    cc[:, 3] = 0.9  # cloud at 300 hPa, below it: must not count
    g = MetGrid(
        times_s=np.array([0, 3600]),
        levels_pa=lev,
        lat=np.array([0.0, 1.0, 2.0]),
        lon=np.array([70.0, 71.0, 72.0]),
        fields={"fraction_of_cloud_cover": cc},
    )
    hc = mt.high_cloud_at_and_above(g, [1800.0, 1800.0], [1.0, 1.0], [71.0, 71.0], [225e2, 320e2])
    assert hc[0] == 0.7  # cirrus above counts, the 300-hPa cloud below does not
    assert np.isnan(hc[1]) or hc[1] >= 0.9  # a segment below every level is outside the grid
