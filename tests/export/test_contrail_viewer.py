"""Contrail proof viewer export on the synthetic matching day (planted contrail of segment A)."""

import json
from pathlib import Path

import numpy as np

from stratum.detect.params import load_detector_params
from stratum.export import contrail_viewer as cv
from stratum.match import run as mr
from tests.match.test_run import DAY, build_root


def test_export_day_draws_the_seen_contrail(tmp_path: Path) -> None:
    root = build_root(tmp_path / "drive")
    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    assert mr.match_day(root, DAY, det_params=p)["status"] == "done"
    out = tmp_path / "viewer"
    ev = cv.export_day(root, "2026-01-01", out, "a-test-salt-that-is-long-enough", {}, track="line")
    assert len(ev) == 1  # segment A's contrail is the only y = 1
    e = ev[0]
    assert len(e["flight_id"]) == 12 and not e["flight_id"].startswith("F")  # hashed
    assert 1 <= len(e["slots"]) <= cv.MAX_SLOTS
    s = e["slots"][0]
    img = out / "days" / "2026-01-01" / s["img"]
    assert img.exists() and img.stat().st_size > 500
    pts = np.array([xy for line in s["drift"] for xy in line])
    assert ((pts >= 0) & (pts < cv.CROP)).all()  # the prediction lies in the crop
    matched = [d for d in s["detected"] if d["matched"]]
    assert len(matched) == 1 and s["match_px"] is not None and s["match_px"] < 3
    assert (
        json.loads((out / "days" / "2026-01-01" / "contrails.json").read_text())[0]["id"] == e["id"]
    )


def test_ash_rgb_ranges() -> None:
    t108 = np.array([[243.0, 303.0]])
    img = cv.ash_rgb(t108 - 1.0, t108, t108 - 2.0)
    assert img.shape == (1, 2, 3) and img.dtype == np.uint8
    assert img[0, 0, 2] == 0 and img[0, 1, 2] == 255  # blue = T10.8 from 243 to 303 K
    assert (cv.ash_rgb(None, t108, t108)[..., 1] == 128).all()  # no IR8.7: neutral green
