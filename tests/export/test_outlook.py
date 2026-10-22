"""Outlook advisories on synthetic fraction grids (no download)."""

import numpy as np

from stratum.export import outlook as ol


def _grid() -> tuple[np.ndarray, np.ndarray]:
    lat = np.arange(37.0, 5.99, -0.25)  # north-up, as grids.persistence_fraction returns
    lon = np.arange(68.0, 98.01, 0.25)
    return lat, lon


def test_one_humid_patch_gives_one_advisory_with_its_levels_box_and_drier_levels() -> None:
    lat, lon = _grid()
    frac = {fl: np.zeros((24, len(lat), len(lon))) for fl in ol.FLS}
    r = np.arange(48, 60)  # exactly one 3° tile: 25.0–22.25 °N (tiles start at 37 °N, 68 °E)
    c = np.arange(36, 48)  # 77.0–79.75 °E, near Bhopal
    for fl in (340, 360):
        frac[fl][6:12, r[0] : r[-1] + 1, c[0] : c[-1] + 1] = 0.9
    frac[300][:] = 0.2
    adv = ol.advisories(frac, lat, lon, "2026-10-23")
    assert len(adv) == 1
    a = adv[0]
    assert (a["fl_low"], a["fl_high"]) == (340, 360)
    assert a["valid_from"] == "2026-10-23T06:00Z" and a["valid_to"] == "2026-10-23T12:00Z"
    assert a["b"] == "2610230600" and a["c"] == "2610231200"
    s, w, n, e = a["bbox"]
    assert (s, w, n, e) == (22.12, 76.88, 25.12, 79.88)
    assert "FL340-FL360" in a["text"] and "NOT FOR OPERATIONAL USE" in a["text"]
    assert 300 not in a["drier_fls"] and len(a["drier_fls"]) == 2  # FL300 is the humid-ish one
    assert a["id"] == "C001/26"


def test_dry_day_gives_no_advisory_and_places_are_named() -> None:
    lat, lon = _grid()
    frac = {fl: np.full((24, len(lat), len(lon)), 0.1) for fl in ol.FLS}
    assert ol.advisories(frac, lat, lon, "2026-10-23") == []
    assert ol._where(12.9, 77.6, *ol.nearest_city(12.9, 77.6)) == "NEAR BENGALURU"
    assert ol._where(15.0, 65.0, "Goa", 900.0) == "OVER THE ARABIAN SEA"
    assert ol._fmt_lat(21.5) == "2130N" and ol._fmt_lon(77.25) == "07715E"
