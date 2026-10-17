# Detector tuning on expert-labelled SEVIRI scenes (deviation D-002)

Run: `stratum tune-detector --dlr-dir <DLR dataset>` on 17 Oct 2026 (laptop, ≈ 7 min).
Data: Santos Gabriel et al. (2026), ESSD 18, 2397–2412, doi:10.5194/essd-18-2397-2026;
dataset doi:10.5281/zenodo.17669443, **CC BY-NC 4.0** (Contains modified EUMETSAT Meteosat data).
Only derived counts are stored here; no image data.

| | precision | recall | F1 | lenient recall |
|---|---|---|---|---|
| Evaluation (89 scenes), tuned | 0.22 [0.17, 0.27] | 0.23 [0.18, 0.29] | 0.22 [0.18, 0.26] | 0.26 [0.21, 0.33] |
| Evaluation, Phase 3 settings | 0.14 [0.11, 0.17] | 0.26 [0.22, 0.31] | 0.18 [0.15, 0.22] | 0.30 [0.25, 0.36] |
| Training (51 scenes), in-sample | 0.35 | 0.35 | 0.35 | 0.40 |

95 % scene-bootstrap intervals (2,000 resamples, seed 20261017). One-to-one matching with the
labeller-agreement rule (≤ 2 px mean distance over ≥ 50 % of the shorter line, ≤ 20°). Expert
lines shorter than 10 px are dropped. Lenient recall: an expert line counts as found if any
detection lies on it.

Files: `tuning.json` (full search, chosen settings, weights, per-scene counts),
`pipeline_detector.yaml` (the block copied into `configs/pipeline.yaml`). See
`docs/decisions.md` (17 Oct 2026) for the disclosure that the evaluation split was scored twice.
