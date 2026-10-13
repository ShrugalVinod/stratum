"""Tests for stratum.config: configs load, validate strictly, hash stably; corridor geometry."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import yaml
from pydantic import ValidationError
from pyproj import Geod

from stratum import config as cfg


def test_all_configs_parse() -> None:
    for p in cfg.configs_dir().glob("*.yaml"):
        assert isinstance(cfg.load_yaml(p), dict), p


def test_preregistered_matches_paper_values() -> None:
    """Spot-check values quoted in the methods paper v1.0 (sections in comments)."""
    pre = cfg.load_preregistered()
    assert pre.domain.lat == (6, 37) and pre.domain.lon == (68, 98)  # §3.1
    assert pre.domain.min_flight_level == 250  # §3.1
    assert pre.periods.evaluation == ("2025-03-01", "2026-02-28")  # §3.1
    assert pre.coverage_rule.min_fraction_continuous == 0.5  # §3.3
    assert pre.trajectory.max_vertical_rate_fpm == 6000  # §4.2
    assert pre.trajectory.max_groundspeed_jump_kt == 100  # §4.2
    assert (pre.sac.EI_H2O, pre.sac.c_p, pre.sac.epsilon, pre.sac.Q) == (
        1.23,
        1004.0,
        0.622,
        43.2e6,
    )  # §2.1
    assert pre.aircraft.eta_default == 0.3 and pre.aircraft.eta_sensitivity == [
        0.25,
        0.40,
    ]  # App. A
    assert (pre.matching.min_age_min, pre.matching.max_age_min) == (20, 120)  # §4.5
    assert (pre.matching.max_distance_px, pre.matching.max_angle_deg) == (2, 20)  # §4.5
    assert pre.observability.max_viewing_zenith_deg == 60  # §4.5
    assert pre.baselines.B2.constant_scaling_divisor == 0.95  # Table 4
    assert pre.bootstrap.n_resamples == 1000  # §6.3
    assert pre.hypotheses["H2"].supported_if == "mean >= 0.10 and lower_ci > 0"  # Table 5
    assert pre.hypotheses["H4"].night_lst == (18, 6)  # Table 5
    assert pre.min_labels.matched_observed_contrails == 300  # Table 6
    assert pre.avoidance.co2_per_kg_fuel == 3.16  # §4.7
    assert pre.avoidance.alternatives_ft == [-4000, -2000, 2000, 4000]  # §4.7
    assert pre.labelling_rules.min_contrail_length_px == 10  # App. B


def test_preregistered_rejects_unknown_key(tmp_path: Path) -> None:
    data = cfg.load_yaml(cfg.configs_dir() / "preregistered.yaml")
    data["matching"]["max_distnace_px"] = 3  # typo must not be silently accepted
    with pytest.raises(ValidationError):
        cfg.Preregistered.model_validate(data)


def test_seasonal_folds_must_cover_year() -> None:
    data = cfg.load_yaml(cfg.configs_dir() / "preregistered.yaml")
    data["periods"]["seasonal_folds"]["winter"] = [12, 1]
    with pytest.raises(ValidationError):
        cfg.Preregistered.model_validate(data)


def test_domain_consistent_with_preregistration() -> None:
    cfg.check_consistency(cfg.load_preregistered(), cfg.load_domain())


def test_hash_ignores_comments_and_order_but_not_values() -> None:
    a = yaml.safe_load("x: 1  # comment\ny: [1, 2]\n")
    b = yaml.safe_load("# other comment\ny: [1, 2]\nx: 1\n")
    c = yaml.safe_load("x: 2\ny: [1, 2]\n")
    assert cfg.hash_data(a) == cfg.hash_data(b)
    assert cfg.hash_data(a) != cfg.hash_data(c)


def test_config_hash_is_stable() -> None:
    assert cfg.config_hash() == cfg.config_hash()
    assert len(cfg.config_hash()) == 64


def test_corridor_polygon_is_75km_from_great_circle() -> None:
    """Every polygon vertex should be 75 km (± 1 km) from the VIDP–VABB great circle."""
    corridor = cfg.load_domain().corridor
    poly = cfg.corridor_polygon(corridor)
    line = np.asarray(cfg.great_circle(corridor).coords)
    # densify the great circle so the nearest-point distance is accurate to < 0.1 km
    geod = Geod(ellps="WGS84")
    dense = np.vstack(
        [
            np.array(geod.npts(line[i, 0], line[i, 1], line[i + 1, 0], line[i + 1, 1], 20))
            for i in range(len(line) - 1)
        ]
        + [line]
    )
    verts = np.asarray(poly.exterior.coords)[::5]
    for lon, lat in verts:
        _, _, d = geod.inv(
            np.full(len(dense), lon), np.full(len(dense), lat), dense[:, 0], dense[:, 1]
        )
        assert abs(d.min() / 1000 - corridor.half_width_km) < 1.0, (lon, lat, d.min())


def test_corridor_contains_airports_and_midpoint() -> None:
    corridor = cfg.load_domain().corridor
    poly = cfg.corridor_polygon(corridor)
    from shapely.geometry import Point

    for ap in corridor.airports.values():
        assert poly.contains(Point(ap.lon, ap.lat))
    assert poly.contains(cfg.great_circle(corridor).interpolate(0.5, normalized=True))
    assert not poly.contains(Point(80.0, 13.0))  # Chennai area is far outside


def test_committed_corridor_geojson_is_current() -> None:
    """configs/corridor_DEL-BOM.geojson must match what the code generates."""
    import json

    corridor = cfg.load_domain().corridor
    path = cfg.configs_dir() / f"corridor_{corridor.name}.geojson"
    assert json.loads(path.read_text()) == json.loads(json.dumps(cfg.corridor_geojson(corridor)))


def test_monotone_keys_must_be_features() -> None:
    """A monotone constraint on a misspelt feature name would silently do nothing."""
    data = cfg.load_yaml(cfg.configs_dir() / "preregistered.yaml")
    data["correction_model"]["monotone"] = {"rhi": "increasing"}
    with pytest.raises(ValidationError):
        cfg.Preregistered.model_validate(data)
