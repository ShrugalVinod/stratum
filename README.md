# STRATUM

**Move the plane. Lose the cloud.** Satellite-checked prediction of persistent contrails over
Indian airspace. Team STRATUM, Indus International School, Bangalore · Conrad Challenge
2026–27 (Aerospace & Aviation) · Supervisor Dr. Varsha Pant.

> STRATUM is a computational research project. No real flight has been changed, and air-traffic-control
> feasibility is not modelled. The method is pre-registered in
> [`docs/STRATUM_Research_Paper.pdf`](docs/STRATUM_Research_Paper.pdf) (v1.0, 12 Oct 2026).

**Status:** Phases 0–7 complete; Phase 8 (web app v1, expo build, open release) in progress.
Results (H1–H4) are logged in [`_locks/final_runs.jsonl`](_locks/final_runs.jsonl) and shown at
**https://stratum.aerospaceonyx.workers.dev/results**. Progress: [`docs/progress.md`](docs/progress.md).

---

## Quick start (laptop)

You need [`uv`](https://docs.astral.sh/uv/) (`brew install uv` on macOS) and `git`.

```bash
git clone https://github.com/ShrugalVinod/stratum.git ~/code/stratum
cd ~/code/stratum
make setup        # installs Python 3.12 + all pinned packages into .venv, plus git hooks
make check        # lint + type-check + tests (exactly what CI runs)
uv run stratum info
```

⚠ Don't clone into a folder whose path contains `:` (for example `MIT:CMU`). Python refuses
to create virtual environments there.

Secrets (API keys) go in a local `.env` file: copy `.env.example` to `.env` and fill it in.
`.env` is gitignored, and a pre-commit hook blocks commits that contain keys. How to get each
key: [`docs/data_sources.md`](docs/data_sources.md).

## Running on Google Colab

Heavy jobs (downloads of tens of GB, month-long model runs, model training) run on Colab and
store their outputs on Google Drive. Notebooks in [`colab/`](colab) are **thin launchers**:
they mount Drive, clone this repo at a given commit, install the pinned environment and call
`stratum` commands. All logic lives in the `stratum` package, so it is identical on a laptop,
in CI and on Colab.

1. No GitHub token is needed (the repository is public). Notebooks that download raw data need
   that source's key as a Colab secret (🔑); each notebook's first cell lists them, and
   [`docs/data_sources.md`](docs/data_sources.md) says how to get each key.
2. Open a notebook via the link Claude gives you (`https://colab.research.google.com/github/ShrugalVinod/stratum/blob/<commit>/colab/<name>.ipynb`).
3. Set the runtime it asks for, then *Runtime → Run all*. If the session disconnects, run all again: jobs resume where they stopped.
4. Paste the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.

Start with `colab/00_smoke_test.ipynb` (CPU runtime, ~5 min).

## Reproduce the results

Three levels, from cheapest to most complete:

1. **Figures only (laptop, a minute, no data download).** Every results figure is redrawn from
   `results.json`, which holds every H1–H4 number from the logged final runs:
   ```bash
   make reproduce-figures                                   # uses the website's current build
   make reproduce-figures RESULTS=path/to/release/results.json
   ```
   Output: `reports/figures_reproduced/` (H1 ratio, H2 skill, H3 concentration, H4 night, reliability).
2. **Scores from the released derived data (laptop).** The release bundle (`colab/08b_release_bundle.ipynb`,
   see [`docs/data_card.md`](docs/data_card.md)) has every labelled commercial segment with its
   satellite label, baselines B0–B3 and held-out STRATUM forecasts, so Brier scores, AUROC and the
   H2 comparison can be recomputed from one parquet file.
3. **Everything from raw data (Colab, days of compute).** Run the numbered notebooks in `colab/`
   in order (01 → 08). They re-download ERA5, ADS-B and Meteosat data (raw data are not
   redistributed), rebuild the labels, re-run the physics and the model, and check each final run
   against the pre-registration lock. A re-run of a locked final run needs `--rerun-reason`.

## Cite

See [`CITATION.cff`](CITATION.cff) (GitHub shows a "Cite this repository" button).

## Where data lives (Google Drive)

```
MyDrive/STRATUM/
  raw/        era5/{pl,sl,tropo_T}/YYYY-MM/   adsb/{opensky,adsbx}/YYYY-MM-DD/
              meteosat/{l15_crop,clm}/YYYY-MM-DD/   aircraft_db/
  interim/    segments/  segments_met/  cocip/<scaling>/  detections/  matches/
  labels/     scenes/  raw/<labeller>/  adjudicated/
  models/<run_id>/   reports/<run_id>/   web_exports/<build_id>/
  manifests/  (one JSON per pipeline run)   _locks/  (pre-registration lock, final-run log)
```

Rules: work on Colab's local disk (`/content/work`) and copy finished, consolidated files to
Drive. Every job unit (a day or a month) gets a `manifest.json` and then a `_SUCCESS` marker.
Units without `_SUCCESS` count as not done. Storage use is tracked in
[`docs/storage.md`](docs/storage.md).

On a laptop, the same layout is created under `data/drive_local/` (gitignored) for small
test slices: `uv run stratum init-drive`.

## Pre-registration

The evaluation plan (metric, splits, hypotheses H1–H4, thresholds) is fixed **before** any
results are seen, in [`configs/preregistered.yaml`](configs/preregistered.yaml) and
[`configs/preregistered_open_questions.md`](configs/preregistered_open_questions.md).

```bash
uv run stratum lock-preregistration   # once, after the team approves; writes _locks/preregistration.lock
uv run stratum verify-lock            # any later change must be in docs/deviations.md with a team OK
```

CI runs `verify-lock` on every push.

## Repository map

| Path | What |
|---|---|
| `BUILD_PROMPT.md` | Master build plan (phases 0–8) |
| `CLAUDE.md` | Standing rules for the AI assistant |
| `configs/` | All settings: pre-registered, domain, data sources, pipeline, airlines, type map, web |
| `stratum/` | The Python package (`config`, `paths`, `manifest`, `lock`, `cli`, and one sub-package per pipeline stage) |
| `colab/` | Thin Colab launcher notebooks, numbered by phase |
| `notebooks/` | Exploration only (never imported; outputs stripped) |
| `tests/` | Tests mirroring `stratum/`; tiny fixtures in `tests/fixtures/` |
| `web/` | The website (Preact + MapLibre); `npm run dev`, `npm run build:expo` for the offline booth build |
| `_locks/` | Pre-registration lock and the append-only log of final runs |
| `docs/` | Progress, decisions, deviations, data sources, storage, methods notes, phase reports, source PDFs |

## Phases

| Phase | What | Status |
|---|---|---|
| 0 | Setup, CI, secrets, Colab bridge, pre-registration lock | done |
| 1 | Data access, ingestion, coverage audit | done (November audit pending) |
| 2 | Physics baseline (B1) for Delhi–Mumbai, Jan 2026 | done |
| 3 | Satellite contrail detector and overlays | done |
| 4 | Web app v0 + Innovation Website | done |
| 5 | Labelling, matching, observability → labels for the year | done |
| 6 | Evaluation harness, baselines B0–B4, H1 | done |
| 7 | Correction model (H2), avoidance layer (H3, H4) | done |
| 8 | Web app v1, expo build, open release | in progress |

## Licence

Code: [Apache-2.0](LICENSE). Derived data: licence per source, listed in
[`docs/data_card.md`](docs/data_card.md) (DLR-derived parts stay CC BY-NC 4.0; EUMETSAT and ADS-B
raw data are never redistributed). Satellite data © EUMETSAT.
