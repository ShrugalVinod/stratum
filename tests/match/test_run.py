"""Full-day matching on a small synthetic day: detection → advection → matching → labels."""

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xarray as xr
from pyproj import Transformer

from stratum.detect.params import load_detector_params
from stratum.manifest import SUCCESS_MARKER
from stratum.match import advect as adv
from stratum.match import run as mr
from stratum.match.geometry import point_to_pixel
from stratum.met.interp import MetGrid
from tests.detect.synthetic import plant_line, scene

PROJ4 = "+proj=geos +lon_0=45.5 +h=35785831 +a=6378169 +b=6356583.8 +units=m +no_defs"
N = 256
DAY = date(2026, 1, 1)
SLOTS = [
    pd.Timestamp("2026-01-01 06:30"),
    pd.Timestamp("2026-01-01 06:45"),
    pd.Timestamp("2026-01-01 07:00"),
]
U = 20.0  # m/s eastward everywhere


def _area() -> tuple[list[float], np.ndarray, np.ndarray]:
    """A 256 × 256 crop over the open Arabian Sea (no coastline), ~3 km pixels."""
    tr = Transformer.from_crs("EPSG:4326", PROJ4, always_xy=True)
    xc, yc = tr.transform(65.0, 15.5)
    h = N / 2 * 3000.0
    ext = [xc - h, yc - h, xc + h, yc + h]
    r, c = np.mgrid[0:N, 0:N].astype(float)
    x = ext[0] + (c + 0.5) / N * (ext[2] - ext[0])
    y = ext[3] - (r + 0.5) / N * (ext[3] - ext[1])
    lon, lat = tr.transform(x, y, direction="INVERSE")
    return ext, np.asarray(lat), np.asarray(lon)


def _segments() -> pd.DataFrame:
    rows = []
    for sid, lat, lon, forms in (
        ("A", 15.5, 64.9, True),
        ("B", 14.9, 64.6, True),
        ("C", 16.1, 65.3, True),
        ("D", 15.2, 65.4, False),
    ):
        t0 = pd.Timestamp("2026-01-01 06:00", tz="UTC")
        dlon = 14.0 / (111.32 * np.cos(np.radians(lat)))  # ~14 km in one minute, heading east
        rows.append(
            {
                "segment_id": sid,
                "flight_id": f"f{sid}",
                "time_start": t0,
                "time_end": t0 + pd.Timedelta(minutes=1),
                "time_mid": t0 + pd.Timedelta(seconds=30),
                "lat_start": lat,
                "lon_start": lon,
                "lat_end": lat,
                "lon_end": lon + dlon,
                "lat_mid": lat,
                "lon_mid": lon + dlon / 2,
                "alt_ft_mid": 36000.0,
                "geopotential_height_m": 11000.0,
                "pressure_pa": 22000.0,
                "heading_deg": 90.0,
                "forms": forms,
                "persists_raw": True,
                "commercial": True,
                "in_corridor": False,
            }
        )
    return pd.DataFrame(rows)


def _era5() -> xr.Dataset:
    t = pd.date_range("2026-01-01", periods=60, freq="h")
    lev = np.array([150.0, 200.0, 250.0, 300.0])
    la = np.arange(10.0, 21.01, 0.25)
    lo = np.arange(60.0, 70.01, 0.25)
    shp = (len(t), len(lev), len(la), len(lo))
    v = {"eastward_wind": U, "northward_wind": 0.0, "fraction_of_cloud_cover": 0.0}
    dims = ("time", "level", "latitude", "longitude")
    return xr.Dataset(
        {k: (dims, np.full(shp, x)) for k, x in v.items()},
        coords={"time": t, "level": lev, "latitude": la, "longitude": lo},
    )


def _done(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / SUCCESS_MARKER).touch()


@pytest.fixture
def root(tmp_path: Path) -> Path:
    return build_root(tmp_path)


def build_root(tmp_path: Path) -> Path:
    ext, lat, lon = _area()
    met = tmp_path / "raw" / "meteosat"
    xr.Dataset(
        {
            "lat": (("y", "x"), lat),
            "lon": (("y", "x"), lon),
            "vza_deg": (("y", "x"), np.full((N, N), 40.0)),
        },
        attrs={"area_proj4": PROJ4, "area_extent": ext},
    ).to_zarr(met / "static_grid.zarr")
    era = _era5()
    era.to_zarr(tmp_path / "raw" / "era5" / "pl" / "2026-01" / "data.zarr")
    seg = _segments()
    grid = MetGrid.from_dataset(era)
    a = seg[seg.segment_id == "A"].iloc[0]
    t108s, t120s = [], []
    for k, t in enumerate(SLOTS):
        t108, t120, _ = scene(seed=10 + k)
        # plant segment A's contrail where advection + parallax put it at this slot
        ages = [
            (t - a.time_start.tz_convert(None)).total_seconds(),
            (t - a.time_end.tz_convert(None)).total_seconds(),
        ]
        g_ages, la_, lo_ = adv.advect(
            grid,
            [a.lat_start, a.lat_end],
            [a.lon_start, a.lon_end],
            [a.pressure_pa] * 2,
            [a.time_start.value / 1e9, a.time_end.value / 1e9],
            7300,
        )
        pla, plo = adv.positions_at(g_ages, la_, lo_, np.array(ages)[:, None])
        r, c = point_to_pixel(pla[:, 0], plo[:, 0], [11000.0] * 2, PROJ4, ext, (N, N))
        ang = float(np.arctan2(r[1] - r[0], c[1] - c[0]))
        plant_line(t108, t120, float(r.mean()), float(c.mean()), ang, 60.0, snr=6.0)
        t108s.append(t108)
        t120s.append(t120)
    ds = xr.Dataset(
        {
            "IR_108": (("time", "y", "x"), np.stack(t108s)),
            "IR_120": (("time", "y", "x"), np.stack(t120s)),
        },
        coords={"time": np.array(SLOTS, dtype="datetime64[ns]")},
        attrs={"area_proj4": PROJ4, "area_extent": ext},
    )
    ds.to_zarr(met / "l15_crop" / "2026-01-01" / "data.zarr")
    _done(met / "l15_crop" / "2026-01-01")
    # cloud mask: clear sea (0) except a cloudy patch over segment C
    cm = np.zeros((len(SLOTS), N, N), np.uint8)
    rc, cc = point_to_pixel([16.1], [65.4], [11000.0], PROJ4, ext, (N, N))
    r0, c0 = int(rc[0]), int(cc[0])
    cm[:, r0 - 10 : r0 + 10, c0 - 20 : c0 + 40] = 2
    xr.Dataset({"cloud_mask": (("time", "y", "x"), cm)}, coords={"time": ds["time"]}).to_zarr(
        met / "clm" / "2026-01-01" / "data.zarr"
    )
    _done(met / "clm" / "2026-01-01")
    sd = tmp_path / "interim" / "segments_met" / "2026-01" / "2026-01-01"
    sd.mkdir(parents=True)
    seg.to_parquet(sd / "segments_met.parquet", index=False)
    _done(sd)
    return tmp_path


def test_match_day_labels(root: Path) -> None:
    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    res = mr.match_day(root, DAY, det_params=p)
    assert res["status"] == "done", res
    out = root / "interim" / "matches" / "2026-01" / "2026-01-01"
    lab = pd.read_parquet(out / "labels.parquet").set_index("segment_id")
    per = pd.read_parquet(out / "per_slot.parquet")
    assert "D" not in lab.index  # SAC formation not met → not a candidate
    assert lab.loc["A", "y"] == 1.0  # the planted contrail is found
    assert lab.loc["B", "y"] == 0.0  # clear, observable at 3 slots, nothing there
    assert np.isnan(lab.loc["C", "y"])  # under opaque cloud → missing, never 0
    assert lab.loc["C", "n_observable"] == 0
    # 30–60 min ages only (slots 06:30–07:00 of a 06:00:30 segment)
    assert per["age_min"].between(20, 120).all() and len(per) == 9
    # advection is independent of the planting: 20 m/s east for 30 min = 36 km
    a30 = per[(per.segment_id == "A") & (per.image_time == SLOTS[0])].iloc[0]
    km_per_deg = 6371.0 * np.pi / 180.0 * np.cos(np.radians(15.5))
    lon_mid0 = 64.9 + 7.0 / (111.32 * np.cos(np.radians(15.5)))  # flown midpoint
    # end points are 1800 s and 1740 s old at 06:30 → the midpoint moved 20 m/s × 1770 s
    assert (a30.lon_adv - lon_mid0) * km_per_deg == pytest.approx(U * 1770 / 1000.0, abs=0.3)
    assert a30.lat_adv == pytest.approx(15.5, abs=1e-6)
    # parallax correction moves the predicted point by a few pixels at VZA ~ 40°+
    assert (per["nearest_px"] < per["nearest_px_no_parallax"]).loc[per.segment_id == "A"].all()
    assert res["y1"] == 1 and res["y0"] == 1 and res["missing"] == 1
    assert {"flight_id", "image_time_first"} <= set(lab.columns)
    # resumable: a second call does nothing
    assert mr.match_day(root, DAY, det_params=p)["status"] == "already done"


def test_season_and_solar_zenith() -> None:
    assert list(mr.season([1, 4, 7, 11])) == ["winter", "pre_monsoon", "monsoon", "post_monsoon"]
    t = pd.DatetimeIndex(["2026-03-20 07:00", "2026-03-20 19:00"])
    z = mr.solar_zenith_deg(t, np.array([0.0, 0.0]), np.array([75.0, 75.0]))
    assert z[0] < 10 and z[1] > 150  # local noon at 75°E ≈ 07:00 UTC; midnight ≈ 19:00 UTC


def test_contrail_events_count_runs_not_segments() -> None:
    from stratum.match.summary import contrail_events

    lab = pd.DataFrame(
        {
            "segment_id": ["f1_0001", "f1_0002", "f1_0003", "f1_0007", "f2_0002", "f2_0003"],
            "flight_id": ["f1", "f1", "f1", "f1", "f2", "f2"],
            "y": [1.0, 1.0, 1.0, 1.0, 1.0, np.nan],
        }
    )
    assert contrail_events(lab) == 3  # f1 0001–0003, f1 0007, f2 0002


def test_year_summary_and_minimum_sample_check(root: Path) -> None:
    from stratum.match.summary import year_summary

    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    mr.match_day(root, DAY, det_params=p)
    s = year_summary(root)
    assert s["status"] == "done" and s["y1"] == 1
    assert s["min_labels_check"]["result"] == "escalate"  # 1 event ≪ 300: must be escalated
    sens = s["sensitivity_min_matched_slots"]
    assert sens["k1"]["y1"] == sens["k2"]["y1"] == 1  # A is matched in all 3 images
    out = root / "reports" / "phase5"
    assert (out / "parallax_before_after.png").exists() and (out / "label_counts.csv").exists()
    t = pd.read_csv(out / "label_counts.csv")
    assert set(t["by"]) == {"all", "month", "season", "west_east", "vza_band", "day_night"}


def test_wrong_day_null_shifts_flights_onto_other_images(root: Path) -> None:
    met = root / "raw" / "meteosat"
    for kind in ("l15_crop", "clm"):  # a second image day = the same images one day later
        ds = xr.open_zarr(met / kind / "2026-01-01" / "data.zarr").load()
        ds = ds.assign_coords(time=ds["time"] + np.timedelta64(1, "D"))
        ds.to_zarr(met / kind / "2026-01-02" / "data.zarr")
        _done(met / kind / "2026-01-02")
    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    res = mr.match_day(root, DAY, det_params=p, image_day=date(2026, 1, 2))
    assert res["status"] == "done" and res["image_day"] == "2026-01-02"
    out = root / "interim" / "matches_null" / "2026-01-01_on_2026-01-02"
    per = pd.read_parquet(out / "per_slot.parquet")
    assert per["image_time"].min() == pd.Timestamp("2026-01-02 06:30")
    # identical images one day later → segment A matches again: the shift is consistent
    assert res["y1"] == 1
    assert not (root / "interim" / "matches" / "2026-01" / "2026-01-02").exists()
    from stratum.match.summary import null_summary

    assert null_summary(root)["chance_y1_rate"] == 0.5


def test_detections_with_other_settings_are_recomputed(root: Path) -> None:
    import json

    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    mr.match_day(root, DAY, det_params=p)
    mf = root / "interim" / "detections" / "2026-01-01" / "manifest.json"
    assert not mr._stale_detections(root, "2026-01-01", p)
    p2 = p.model_copy(update={"hysteresis": (5.5, 8.0)})
    assert mr._stale_detections(root, "2026-01-01", p2)
    res = mr.match_day(root, DAY, det_params=p2)  # no force needed: settings changed
    assert res["status"] == "done"
    assert json.loads(mf.read_text())["params"]["hysteresis"] == [5.5, 8.0]


def test_changed_label_rule_recomputes_matches(root: Path) -> None:
    from stratum.match import matching as mt

    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    out = root / "interim" / "matches" / "2026-01" / "2026-01-01"
    mr.match_day(root, DAY, det_params=p, rules=mt.MatchRules(min_matched_slots=1))
    assert not mr._stale_matches(out, p, mt.MatchRules(min_matched_slots=1))
    assert mr._stale_matches(out, p, mt.DEFAULT_RULES)  # D-004 rule differs → recompute
    assert mr.match_day(root, DAY, det_params=p)["status"] == "done"


def test_tolerance_variant_goes_to_its_own_folder(root: Path) -> None:
    from dataclasses import replace

    from stratum.match import matching as mt

    p = load_detector_params().model_copy(update={"operating_threshold": 0.0})
    rules = replace(mt.DEFAULT_RULES, **mt.TOLERANCE_VARIANTS["dist3"])
    res = mr.match_day(root, DAY, det_params=p, rules=rules, variant="dist3")
    assert res["status"] == "done"
    assert (
        root / "interim" / "matches_sens" / "dist3" / "2026-01" / "2026-01-01" / "labels.parquet"
    ).exists()
    assert not (
        root / "interim" / "matches" / "2026-01" / "2026-01-01"
    ).exists()  # primary untouched
