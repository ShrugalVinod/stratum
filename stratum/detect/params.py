"""Detector settings from ``configs/pipeline.yaml`` → ``detector:`` (build prompt §3.1 step 7).

Not pre-registered. Values are tuned on the development month and, from Phase 5, on the
labelled tuning half only; every change is recorded in ``docs/decisions.md``.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict

from stratum.config import configs_dir, load_yaml


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ConfidenceWeights(_Strict):
    intercept: float
    response: float
    length: float
    linearity: float
    btd_contrast: float
    cold: float
    edge: float


class DetectorParams(_Strict):
    background_px: int
    noise_px: int
    orientations: int
    lengths_px: list[int]
    core_sigma_px: float
    flank_px: float
    t120_weight: float
    hysteresis: tuple[float, float]
    min_length_px: int
    trim_field_min: float
    max_width_px: float
    max_line_residual_px: float
    max_orientation_spread_deg: float
    coast_buffer_px: int
    coast_max_fraction: float
    max_flank_asymmetry: float
    max_vza_deg: float
    confidence: ConfidenceWeights
    operating_threshold: float


def load_detector_params(path: Path | None = None) -> DetectorParams:
    data = load_yaml(path or configs_dir() / "pipeline.yaml")
    return DetectorParams(**data["detector"])
