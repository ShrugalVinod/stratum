# STRATUM model card (Phase 7)

Generated from `stratum/evaluate/report_v2.py: MODEL_CARD`; the evaluation report v2 carries the
same card with the final-run numbers. Metrics are filled in from the logged final runs only.

## Model

STRATUM correction: monotone gradient-boosted trees (LightGBM) on 18 ERA5 and position/time features, isotonic calibration; one model per held-out season and per side of the west/east split. Feedback into the physics: a humidity scaling factor per latitude band, fitted with detection efficiency (option b).

## Intended use

Research: estimating where ERA5-based contrail physics is wrong over India, and ranking flight segments by the lower bound of net warming avoided by a ±2,000/±4,000 ft change, with uncertainty ranges, for discussion with airlines and air traffic experts.

## Out of scope

Operational flight planning or air traffic control instructions; any use outside 6–37°N, 68–98°E, below FL250, or for seasons and conditions the labels do not cover (the confidence note says 'extrapolating'); estimates of aviation's total climate impact.

## Data

12 ADS-B days (Mar 2025–Feb 2026), ERA5, Meteosat-9 (IODC) contrail labels from an automatic detector matched to advected flight segments (D-004: ≥ 2 matched images). About a third of positive labels are expected to be chance matches; almost no monsoon labels.

## Metrics

Brier score and Brier skill score vs B3 (pre-registered primary), vs B0 and the RHi-only logistic; AUROC, POD, FAR, CSI; reliability diagrams; 1,000 day-bootstrap resamples.

## Limitations

Few days per season (2–4); labels are noisy and detection-limited; the detection efficiency comes from CoCiP itself; fuel from OpenAP at constant Mach over the same track; ATC feasibility, traffic and airline constraints are not modelled; contrail–contrail interactions are not modelled.

## Ethical considerations

Alerts can burn fuel for no benefit if wrong, so an alert needs a positive lower bound under both horizons. Public outputs show commercial flights only with hashed identities. Labels for India were drafted with AI assistance and reviewed by the team (D-003).

## Results

Filled from the final runs (H2: 07b; H3/H4: 07c; decisions: 07d). Until then: not available.
