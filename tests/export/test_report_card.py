"""The daily report card's scores on small synthetic days (no downloads)."""

from datetime import date

import numpy as np
import pandas as pd

from stratum.export import report_card as rc

GRID = rc.Grid(lat_north=30.0, lon_west=70.0, step=1.0, rows=10, cols=10)
DAY = date(2026, 10, 23)


def _line(hour: int, lat: float, lon: float, day: date = DAY) -> dict[str, object]:
    t = pd.Timestamp(f"{day.isoformat()}T{hour:02d}:00")
    return {"image_time": t, "poly_lat": [lat, lat + 0.3], "poly_lon": [lon, lon + 0.3]}


def test_forecast_mask_takes_any_level() -> None:
    a = np.zeros((24, 10, 10))
    b = np.zeros((24, 10, 10))
    b[5, 2, 3] = 0.6
    m = rc.forecast_mask({360: a, 400: b})
    assert m[5, 2, 3] and m.sum() == 1


def test_hits_chance_and_lift() -> None:
    fc = np.zeros((24, 10, 10), bool)
    fc[12, 0:2, 0:2] = True  # forecast air in the north-west corner at 12 UTC
    obs = np.ones((24, 10, 10), bool)
    objs = pd.DataFrame([
        _line(12, 29.6, 70.2),  # inside the forecast air → hit
        _line(12, 22.0, 78.0),  # far away → miss
        _line(3, 22.0, 78.0, date(2026, 10, 24)),  # next day: not this report
    ])  # fmt: skip
    card = rc.score_day(DAY, objs, fc, obs, GRID)
    assert card["contrails_seen"] == 2
    assert card["contrails_in_forecast_air"] == 1
    # chance = share of the sky inside the tolerance-grown forecast at 12 UTC: 3 × 3 of 100 cells
    assert card["chance"] == 0.09
    assert card["lift"] == round(0.5 / 0.09, 3)


def test_cloudy_sky_is_not_counted() -> None:
    fc = np.zeros((24, 10, 10), bool)
    obs = np.zeros((24, 10, 10), bool)  # all cloudy
    card = rc.score_day(DAY, pd.DataFrame([_line(12, 25.0, 75.0)]), fc, obs, GRID)
    assert card["contrails_seen"] == 0 and card["lift"] is None


def test_notices_confirmed_or_not_checkable() -> None:
    fc = np.zeros((24, 10, 10), bool)
    obs = np.ones((24, 10, 10), bool)
    obs[:, 5:, 5:] = False  # the south-east is cloudy all day
    adv = [
        {"id": "C001/26", "bbox": [26.0, 70.0, 30.0, 74.0], "valid_from": "2026-10-23T06:00Z", "valid_to": "2026-10-23T12:00Z"},
        {"id": "C002/26", "bbox": [21.0, 76.0, 24.0, 79.0], "valid_from": "2026-10-23T06:00Z", "valid_to": "2026-10-23T12:00Z"},
        {"id": "C003/26", "bbox": [26.0, 70.0, 30.0, 74.0], "valid_from": "2026-10-23T18:00Z", "valid_to": "2026-10-24T00:00Z"},
    ]  # fmt: skip
    objs = pd.DataFrame([_line(8, 28.0, 72.0)])
    card = rc.score_day(DAY, objs, fc, obs, GRID, adv)
    status = {n["id"]: n["status"] for n in card["notice_results"]}
    assert status == {"C001/26": "confirmed", "C002/26": "not checkable", "C003/26": "not seen"}
    assert (card["notices_checked"], card["notices_confirmed"]) == (2, 1)


def test_observable_from_cloud_mask() -> None:
    lat = np.repeat(np.linspace(29.8, 20.2, 40)[:, None], 40, axis=1)
    lon = np.repeat(np.linspace(70.2, 79.8, 40)[None, :], 40, axis=0)
    vza = np.full_like(lat, 40.0)
    cm = np.full((1, 40, 40), 2, np.uint8)
    cm[0, :, :20] = 0  # western half clear
    obs = rc.observable(cm, lat, lon, vza, [6], GRID)
    assert obs[6, :, 0].all() and not obs[6, :, 9].any() and not obs[5].any()


def test_running_record(tmp_path) -> None:  # type: ignore[no-untyped-def]
    idx = tmp_path / "index.json"
    a = {"date": "2026-10-22", "contrails_seen": 10, "contrails_in_forecast_air": 4, "chance": 0.1,
         "notices_checked": 2, "notices_confirmed": 1}  # fmt: skip
    b = {"date": "2026-10-23", "contrails_seen": 30, "contrails_in_forecast_air": 6, "chance": 0.2,
         "notices_checked": 0, "notices_confirmed": 0}  # fmt: skip
    rc.update_index(idx, a)
    out = rc.update_index(idx, b)
    assert [d["date"] for d in out["days"]] == ["2026-10-23", "2026-10-22"]
    t = out["totals"]
    assert t["contrails_seen"] == 40 and t["hit_rate"] == 0.25
    assert t["chance"] == round((0.1 * 10 + 0.2 * 30) / 40, 4)
    assert rc.update_index(idx, b)["totals"]["days"] == 2  # re-running a day replaces it
