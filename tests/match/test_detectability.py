"""Driver et al. detectability flag: τ ≥ 0.05 and width ≥ 1 pixel at age 20–120 min."""

import numpy as np
import pandas as pd

from stratum.match import detectability as dt


def _px(lat: object, lon: object) -> np.ndarray:
    return np.full(np.shape(np.asarray(lat, float)), 3.0)  # 3 km pixels everywhere


def test_flag_needs_both_thresholds_inside_the_window() -> None:
    m = pd.Timedelta(minutes=1)
    c = pd.DataFrame(
        {
            "flight_id": ["f"] * 6,
            "waypoint": [1, 1, 2, 2, 3, 4],
            "age": [10 * m, 30 * m, 30 * m, 60 * m, 30 * m, 150 * m],
            "latitude": 20.0,
            "longitude": 75.0,
            # wp1: thick + wide only at 10 min (outside); wide at 30 min but too thin
            # wp2: thick and wide at 60 min → detectable; wp3: thick but 2 km wide (< 1 px)
            # wp4: detectable only at 150 min (outside the window)
            "width": [5000, 5000, 1000, 4000, 2000, 9000],
            "tau_contrail": [0.3, 0.01, 0.2, 0.1, 0.5, 0.5],
        }
    )
    d = dt.detectability(c, _px).set_index("segment_id")
    assert not d.loc["f_0001", "detectable"]
    assert d.loc["f_0002", "detectable"]
    assert not d.loc["f_0003", "detectable"]
    assert not d.loc["f_0004", "detectable"]
    assert d.loc["f_0002", "width_px_max"] == 4000 / 1000 / 3.0


def test_flag_never_changes_labels() -> None:
    lab = pd.DataFrame({"segment_id": ["f_0002", "f_0009"], "y": [0.0, np.nan]})
    det = pd.DataFrame(
        {
            "segment_id": ["f_0002"],
            "cocip_contrail": [True],
            "detectable": [True],
            "tau_max": [0.1],
            "width_px_max": [1.3],
        }
    )
    out = dt.attach(lab, det)
    assert out["y"].equals(lab["y"])  # y untouched
    assert bool(out.loc[1, "detectable"]) is False and bool(out.loc[1, "cocip_contrail"]) is False
    assert np.isnan(dt.attach(lab, None)["detectable"]).all()  # no CoCiP that day → unknown


def test_pixel_lookup() -> None:
    lat, lon = np.meshgrid(np.arange(10.0, 12.0, 0.03), np.arange(70.0, 72.0, 0.03), indexing="ij")
    f = dt.pixel_km_lookup(lat, lon, np.full(lat.shape, 9.0))
    assert f([11.0], [71.0])[0] == 3.0 and np.isnan(f([30.0], [71.0])[0])


def test_advection_vs_cocip_pairs_by_segment_and_time() -> None:
    per = pd.DataFrame(
        {
            "segment_id": ["f_0001", "f_0001"],
            "image_time": pd.to_datetime(["2026-01-01 06:30", "2026-01-01 06:45"]),
            "lat_adv": [20.0, 20.0],
            "lon_adv": [75.0, 75.1],
        }
    )
    con = pd.DataFrame(
        {
            "flight_id": ["f", "f"],
            "waypoint": [1, 1],
            "time": pd.to_datetime(["2026-01-01 06:31", "2026-01-01 07:30"]),
            "latitude": [20.0, 20.0],
            "longitude": [75.01, 76.0],
        }
    )
    r = dt.advection_vs_cocip(per, con)
    assert r["pairs"] == 1 and abs(r["median_km"] - 1.05) < 0.05  # 0.01° at 20°N ≈ 1.05 km
