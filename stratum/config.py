"""Load and validate STRATUM's YAML configuration files, and hash them.

What it does
------------
Every choice the pipeline makes lives in ``configs/*.yaml``, not in code. This module reads
those files into typed pydantic models. Unknown or misspelt keys are an error, so a typo
cannot silently change a setting. It also computes a **config hash**: a SHA-256 of the
*parsed values* (not the text), so editing a comment does not change the hash but changing
any number does. Every run manifest records this hash (build prompt rule 6).

The pre-registered settings (``configs/preregistered.yaml``) implement the methods paper
v1.0, Sections 3–6. Their model below mirrors that file key by key.

It also builds the Delhi–Mumbai development corridor polygon (paper §3.1; build prompt
§3.1): the great circle VIDP–VABB, buffered by 75 km on each side.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import numpy as np
import shapely
import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pyproj import CRS, Geod, Transformer
from shapely.geometry import LineString, Polygon, mapping

from stratum.paths import repo_root

# ──────────────────────────────────────────────────────────────────────────────
# Generic helpers
# ──────────────────────────────────────────────────────────────────────────────


class StrictModel(BaseModel):
    """Base model: unknown keys are rejected and values are immutable after loading."""

    model_config = ConfigDict(extra="forbid", frozen=True)


def configs_dir() -> Path:
    """Directory holding the YAML configs (``<repo>/configs``)."""
    return repo_root() / "configs"


def load_yaml(path: Path) -> dict[str, Any]:
    """Read a YAML file and return its top-level mapping."""
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML mapping at the top level")
    return data


def canonical_json(data: Any) -> str:
    """Serialise parsed config values deterministically (sorted keys, no whitespace).

    Two YAML files that differ only in comments, key order or formatting give the same
    string, so their hashes match.
    """
    # default=str: YAML turns unquoted 2026-10-14 into a date object; hash its ISO text.
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def hash_data(data: Any) -> str:
    """SHA-256 hex digest of :func:`canonical_json` of ``data``."""
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def config_hash(names: tuple[str, ...] = ()) -> str:
    """Hash of the parsed contents of the named config files (default: all ``*.yaml``).

    Recorded in every run manifest so an output can be traced to the exact settings.
    """
    paths = sorted(configs_dir().glob("*.yaml"))
    if names:
        paths = [configs_dir() / f"{n}.yaml" for n in sorted(names)]
    return hash_data({p.stem: load_yaml(p) for p in paths})


# ──────────────────────────────────────────────────────────────────────────────
# Pre-registered settings (configs/preregistered.yaml) — paper §3–§6
# ──────────────────────────────────────────────────────────────────────────────

LatLonRange = tuple[float, float]


class PreDomain(StrictModel):
    lat: LatLonRange
    lon: LatLonRange
    min_flight_level: int
    development_corridor: str


class PrePeriods(StrictModel):
    development_month: str
    evaluation: tuple[str, str]
    seasonal_folds: dict[str, list[int]]
    dev_month_policy: Literal[
        "exclude_dev_month_from_winter",
        "report_winter_with_and_without_dev_month",
        "dev_month_outside_evaluation_year",
    ]

    @model_validator(mode="after")
    def _folds_cover_year_once(self) -> PrePeriods:
        months = sorted(m for ms in self.seasonal_folds.values() for m in ms)
        if months != list(range(1, 13)):
            raise ValueError("seasonal_folds must cover months 1–12 exactly once")
        return self


class PreSpatialSplit(StrictModel):
    boundary_lon: float
    train_side: Literal["west", "east"]
    test_side: Literal["west", "east"]

    @model_validator(mode="after")
    def _sides_differ(self) -> PreSpatialSplit:
        if self.train_side == self.test_side:
            raise ValueError("spatial_split train_side and test_side must differ")
        return self


class PreCoverageRule(StrictModel):
    min_fraction_continuous: float = Field(gt=0, le=1)
    max_gap_min: float = Field(gt=0)
    fallback_source: str


class PreTrajectory(StrictModel):
    max_vertical_rate_fpm: float
    max_groundspeed_jump_kt: float
    resample_min: float
    max_fill_gap_min: float
    fill_method: str


class PreAircraft(StrictModel):
    mass_fraction_of_mtow: float = Field(gt=0, le=1)
    mass_fraction_sensitivity: list[float]
    eta_source: str
    eta_default: float = Field(gt=0, lt=1)
    eta_sensitivity: list[float]


class PreSAC(StrictModel):
    EI_H2O: float
    c_p: float
    epsilon: float
    Q: float
    persistence_rhi: float
    saturation_formulas: str


class PreMetInterpolation(StrictModel):
    time: str
    vertical: str
    horizontal: str


class PreLabelledSplit(StrictModel):
    tuning: int
    heldout: int
    stratified_by: str
    seed: int | None


class PreKappa(StrictModel):
    method: Literal["cell_grid"]
    cell_px: int = Field(gt=0)


class PreObjectF1(StrictModel):
    max_mean_distance_px: float
    min_overlap_of_shorter: float
    max_angle_deg: float
    assignment: Literal["hungarian"]


class PreCI(StrictModel):
    method: Literal["scene_bootstrap"]
    level: float
    resamples: int


class PreAgreement(StrictModel):
    """Open question 3 (settled 17 Oct 2026): κ on a cell grid + object F1, scene bootstrap."""

    kappa: PreKappa
    object_f1: PreObjectF1
    ci: PreCI


class PreDetectorTuning(StrictModel):
    """Deviation D-002: detector fitted on an external expert-labelled dataset."""

    source: str
    doi: str
    fit_scenes: str
    check_scenes: str
    ground_truth: str


class PreLabellerCalibration(StrictModel):
    source: str
    scenes: int
    drawn_from: str
    seed: int


class PreIndiaLabels(StrictModel):
    """Deviation D-003: India labels are Claude drafts reviewed by one team member (secondary)."""

    source: str
    reviewers_per_scene: int
    role: str
    detector_accuracy_primary: str


class PreDetection(StrictModel):
    btd: str
    labelled_scenes: int
    scene_size_px: int
    pilot_scenes: int
    labellers_per_scene: int
    scene_strata: list[str]
    disagreement_resolution: str
    # ⚑ placeholders (null until settled): see lock.py on how filling a null is treated.
    agreement_metric: PreAgreement | None
    labelled_split: PreLabelledSplit
    detector_tuning: PreDetectorTuning | None = None
    labeller_calibration: PreLabellerCalibration | None = None
    india_labels: PreIndiaLabels | None = None


class PreLabellingRules(StrictModel):
    min_contrail_length_px: int
    scene_status: list[str]
    exclude_scene_status_from_scoring: list[str]
    uncertain_lines: str
    labellers_blind_to_tracks_and_predictions: bool


class PreSegmentLabelRule(StrictModel):
    observed_if: str
    not_observed_if: str
    min_observable_slots: int = Field(ge=1)
    otherwise: Literal["missing"]


class PreMatching(StrictModel):
    min_age_min: float
    max_age_min: float
    max_distance_px: float
    max_angle_deg: float
    advection_winds: str
    parallax_correction: str
    segment_label_rule: PreSegmentLabelRule
    candidate_segments: str


class PreOpaqueCloud(StrictModel):
    """Open question 11 (settled 17 Oct 2026): majority-cloudy box around the advected segment."""

    classes: list[str]
    rule: Literal["majority_of_box"]
    box_px: int = Field(gt=0)
    max_cloudy_fraction: float


class PreObservability(StrictModel):
    max_high_cloud_fraction: float
    high_cloud_levels: str
    opaque_cloud_mask_classes: PreOpaqueCloud | None
    require_no_opaque_cloud_in_window: bool
    max_viewing_zenith_deg: float
    unobservable_label: Literal["missing"]


class PreB2(StrictModel):
    constant_scaling_divisor: float


class PreB4(StrictModel):
    optional: bool
    method: str


class PreBaselines(StrictModel):
    B0: str
    B1: str
    B2: PreB2
    B3: str
    B4: PreB4


class PreMetrics(StrictModel):
    primary: str
    secondary: list[str]


class PreBootstrap(StrictModel):
    unit: Literal["day"]
    n_resamples: int
    ci: float


class PreHypothesis(StrictModel):
    test: str
    supported_if: str
    primary_definition: str | None = None
    secondary_definition: str | None = None
    night_lst: tuple[int, int] | None = None
    detection_efficiency_thresholds: dict[str, float] | None = None


class PreMinLabels(StrictModel):
    matched_observed_contrails: int


class PreCorrectionModel(StrictModel):
    type: str
    library: str
    training_segments: str
    monotone: dict[str, Literal["increasing", "decreasing"]]
    calibration: str
    sanity_baseline: str
    feedback_preference: str
    latitude_bands_deg: list[tuple[float, float]]
    features: list[str]

    @model_validator(mode="after")
    def _monotone_keys_are_features(self) -> PreCorrectionModel:
        # A constraint on a name that isn't a feature would silently do nothing.
        unknown = sorted(set(self.monotone) - set(self.features))
        if unknown:
            raise ValueError(f"monotone keys not in features: {unknown}")
        if len(set(self.features)) != len(self.features):
            raise ValueError("features contains duplicates")
        return self


class PreMetricConversion(StrictModel):
    source: str | None
    factor_h20: float | None
    factor_h100: float | None


class PreAvoidance(StrictModel):
    alternatives_ft: list[int]
    fuel_model: str
    co2_per_kg_fuel: float
    metric_horizons_years: list[int]
    rank_by: str
    alert_if: str
    alert_requires_all_horizons: bool
    metric_conversion: PreMetricConversion
    confidence_note_min_examples: int


class Preregistered(StrictModel):
    """Typed view of ``configs/preregistered.yaml`` (paper v1.0, §3–§6)."""

    schema_version: int
    domain: PreDomain
    periods: PrePeriods
    spatial_split: PreSpatialSplit
    coverage_rule: PreCoverageRule
    trajectory: PreTrajectory
    aircraft: PreAircraft
    sac: PreSAC
    met_interpolation: PreMetInterpolation
    detection: PreDetection
    labelling_rules: PreLabellingRules
    matching: PreMatching
    observability: PreObservability
    baselines: PreBaselines
    metrics: PreMetrics
    bootstrap: PreBootstrap
    hypotheses: dict[Literal["H1", "H2", "H3", "H4"], PreHypothesis]
    min_labels: PreMinLabels
    correction_model: PreCorrectionModel
    avoidance: PreAvoidance


# ──────────────────────────────────────────────────────────────────────────────
# Domain (configs/domain.yaml)
# ──────────────────────────────────────────────────────────────────────────────


class BBox(StrictModel):
    lat: LatLonRange
    lon: LatLonRange


class Airport(StrictModel):
    lat: float
    lon: float


class Corridor(StrictModel):
    name: str
    half_width_km: float = Field(gt=0)
    great_circle_points: int = Field(ge=2)
    airports: dict[str, Airport]


class FlightLevels(StrictModel):
    min_cruise_fl: int
    ingest_min_fl: int
    dashboard_fl_range: tuple[int, int]
    dashboard_fl_step: int


class Satellite(StrictModel):
    name: str
    sub_satellite_lon: float


class Domain(StrictModel):
    study_bbox: BBox
    padding_deg: float
    padded_bbox: BBox
    flight_levels: FlightLevels
    corridor: Corridor
    satellite: Satellite

    @model_validator(mode="after")
    def _padded_is_padding(self) -> Domain:
        s, p, d = self.study_bbox, self.padded_bbox, self.padding_deg
        expected = ((s.lat[0] - d, s.lat[1] + d), (s.lon[0] - d, s.lon[1] + d))
        if (tuple(p.lat), tuple(p.lon)) != expected:
            raise ValueError(f"padded_bbox must be study_bbox ± padding_deg = {expected}")
        return self


# ──────────────────────────────────────────────────────────────────────────────
# Loaders
# ──────────────────────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def load_preregistered(path: Path | None = None) -> Preregistered:
    """Load and validate the pre-registered settings."""
    return Preregistered.model_validate(load_yaml(path or configs_dir() / "preregistered.yaml"))


@lru_cache(maxsize=1)
def load_domain(path: Path | None = None) -> Domain:
    """Load and validate the domain/corridor geometry config."""
    return Domain.model_validate(load_yaml(path or configs_dir() / "domain.yaml"))


def check_consistency(prereg: Preregistered, domain: Domain) -> None:
    """Fail if ``domain.yaml`` contradicts the pre-registered domain (paper §3.1)."""
    if tuple(domain.study_bbox.lat) != tuple(prereg.domain.lat) or tuple(
        domain.study_bbox.lon
    ) != tuple(prereg.domain.lon):
        raise ValueError("domain.yaml study_bbox differs from preregistered.yaml domain")
    if domain.flight_levels.min_cruise_fl != prereg.domain.min_flight_level:
        raise ValueError("domain.yaml min_cruise_fl differs from preregistered.yaml")
    if domain.corridor.name != prereg.domain.development_corridor:
        raise ValueError("domain.yaml corridor name differs from preregistered.yaml")


# ──────────────────────────────────────────────────────────────────────────────
# Corridor polygon
# ──────────────────────────────────────────────────────────────────────────────

WGS84 = Geod(ellps="WGS84")


def great_circle(corridor: Corridor) -> LineString:
    """Great-circle (geodesic) line between the corridor's two airports, as lon/lat."""
    (a, b) = list(corridor.airports.values())
    inner = WGS84.npts(a.lon, a.lat, b.lon, b.lat, corridor.great_circle_points - 2)
    return LineString([(a.lon, a.lat), *inner, (b.lon, b.lat)])


def corridor_polygon(corridor: Corridor) -> Polygon:
    """Polygon ``half_width_km`` either side of the great circle (round ends), in lon/lat.

    Method: project the line to an azimuthal equidistant (AEQD) projection centred on the
    route mid-point, buffer by the half-width in metres, project back. AEQD keeps distances
    from its centre exact; elsewhere along a ~1,150 km route the scale error is well under
    1 %, i.e. < 1 km on a 75 km buffer (checked in tests/test_config.py).
    """
    line = great_circle(corridor)
    mid = line.interpolate(0.5, normalized=True)
    aeqd = CRS.from_proj4(f"+proj=aeqd +lat_0={mid.y} +lon_0={mid.x} +datum=WGS84 +units=m")
    fwd = Transformer.from_crs("EPSG:4326", aeqd, always_xy=True).transform
    inv = Transformer.from_crs(aeqd, "EPSG:4326", always_xy=True).transform
    buffered = shapely.transform(line, fwd, interleaved=False).buffer(
        corridor.half_width_km * 1000.0, quad_segs=16
    )
    poly = shapely.transform(buffered, inv, interleaved=False)
    if not isinstance(poly, Polygon):  # buffer of a single line is always one polygon
        raise TypeError("corridor buffer did not produce a single polygon")
    return poly


def corridor_geojson(corridor: Corridor) -> dict[str, Any]:
    """GeoJSON Feature of the corridor polygon with its generating parameters."""
    poly = corridor_polygon(corridor)
    coords = np.round(np.asarray(poly.exterior.coords), 6).tolist()
    return {
        "type": "Feature",
        "properties": {
            "name": corridor.name,
            "half_width_km": corridor.half_width_km,
            "airports": {k: v.model_dump() for k, v in corridor.airports.items()},
            "generated_by": "stratum.config.corridor_polygon",
        },
        "geometry": {**mapping(Polygon(coords)), "coordinates": [coords]},
    }
