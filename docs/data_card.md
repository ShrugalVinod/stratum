# STRATUM data card (derived data release)

What we release, how it was made, and where it is weak (build prompt §8.3). Raw upstream data are
**not** redistributed; scripts in the repository download them again.

## Contents
| File | What it is | Rows / size (approx.) |
|---|---|---|
| `segments_predictions_labels.parquet` | One row per labelled one-minute cruise segment (commercial flights only, salted-hash flight ids): day, season, position (0.25°), flight level, satellite label `y` (D-004 rule) and the sensitivity labels, B0–B3, RATE, the RHi-only logistic, STRATUM (calibrated, raw) and the option-(b) probability on its held-out fold | ≈ 335 k |
| `decisions/<day>/table3.csv` | The decision layer's ranked avoidance list per held-out day (Table 3 fields) | 402 portions |
| `labels/india_review/` | The 100 India scenes' contrail lines (Claude drafts reviewed by the team, D-003) | 36 lines |
| `models/` | The frozen correction models (LightGBM boosters, isotonic maps, logistic, scaling cells) | 6 folds |
| `reports/` | Evaluation reports v1 (H1) and v2 (H2–H4), validation report, gate reports | — |
| `locks/` | `preregistration.lock` and `final_runs.jsonl` | — |
| `configs/` | `preregistered.yaml`, open questions, pipeline and domain configs | — |

## Collection
- **Flights:** ADS-B Exchange free sample days, the 1st of each month, Mar 2025–Feb 2026 (12 days),
  cleaned to cruise ≥ FL250 and cut into one-minute segments. Aircraft types from the OpenSky aircraft
  database snapshot (2025-08) and OpenAP.
- **Weather:** ERA5 hourly pressure levels (Copernicus C3S), 0.25°.
- **Satellite:** Meteosat-9 (IODC, 45.5°E) SEVIRI Level 1.5 every 15 minutes and the EUMETSAT cloud
  mask; contrails found by a line-filter detector on the 10.8 − 12.0 µm brightness-temperature
  difference, tuned on the DLR expert-labelled SEVIRI dataset (D-002).
- **Labels:** a segment is observed (y = 1) if a detected line matches its wind-drifted position in at
  least two observable images 20–120 min after it was flown; y = 0 if observable in ≥ 2 images with
  no match; otherwise missing (D-004).

## Coverage and biases
- 12 days only; 2–4 days per season. ADS-B coverage of scheduled flights over India is being audited
  (Nov 2026); remote and oceanic areas are likely under-covered.
- **Observability:** the satellite sees contrails only through clear air and at viewing angles < 60°;
  monsoon days had 3–5 % of images observable and 1 observed contrail in 9,803 segments. Results speak
  to winter and spring.
- **Detection:** the detector finds about a quarter of expert-labelled contrails (precision 0.22, recall
  0.23); only ~16 % of CoCiP's persistent contrails are thick and wide enough to be seen at all.
- **Label noise:** a wrong-day test estimates that about a third of y = 1 labels are chance matches.
  Inter-labeller agreement (κ) does not apply: India labels were drafted by AI and reviewed by one team
  member per scene (D-003).

## Intended uses
Research on contrail prediction and observation over India; teaching; checking our results.
**Not** for operational flight planning, air traffic control, or claims of verified emissions
reductions.

## Where to get it
GitHub release v1.0.0 (https://github.com/ShrugalVinod/stratum/releases/tag/v1.0.0), file `stratum-release-1.0.0.zip`; archived with the code on
Zenodo, DOI 10.5281/zenodo.23480202 (all versions: 10.5281/zenodo.23480201).

## Licences
- Our code: Apache-2.0. Our derived data: **CC BY 4.0** (team decision, 19 Oct 2026); anything
  derived from the DLR expert labels stays CC BY-NC 4.0.
- Upstream: ERA5 under the Copernicus licence (attribution: "Contains modified Copernicus Climate
  Change Service information"); Meteosat data © EUMETSAT (images with credit; the original numerical
  data are not redistributed); ADS-B Exchange and OpenSky under their terms.

## Privacy
Commercial airline flights only; flight ids are salted hashes; no ICAO24 addresses, registrations or
private/state aircraft.
