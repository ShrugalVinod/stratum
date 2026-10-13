# STRATUM

**Move the plane. Lose the cloud.** Satellite-checked prediction of persistent contrails over
Indian airspace. Team STRATUM, Indus International School, Bangalore · Conrad Challenge
2026–27 (Aerospace & Aviation) · Supervisor Dr. Varsha Pant.

> STRATUM is a computational research project. No real flight has been changed, and air-traffic-control
> feasibility is not modelled. The method is pre-registered in
> [`docs/STRATUM_Research_Paper.pdf`](docs/STRATUM_Research_Paper.pdf) (v1.0, 12 Oct 2026).

**Status:** Phase 0 (setup and guard-rails). No data has been downloaded and no results exist yet.
Progress: [`docs/progress.md`](docs/progress.md).

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

1. Create the `GITHUB_TOKEN` Colab secret once (see [`docs/data_sources.md`](docs/data_sources.md) §5).
2. Open a notebook via the link Claude gives you (`https://colab.research.google.com/github/ShrugalVinod/stratum/blob/<commit>/colab/<name>.ipynb`).
3. Set the runtime it asks for, then *Runtime → Run all*. If the session disconnects, run all again: jobs resume where they stopped.
4. Paste the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.

Start with `colab/00_smoke_test.ipynb` (CPU runtime, ~5 min).

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
| `docs/` | Progress, decisions, deviations, data sources, storage, methods notes, phase reports, source PDFs |

## Phases

| Phase | What | Target |
|---|---|---|
| 0 | Setup, CI, secrets, Colab bridge, pre-registration lock | 27 Oct 2026 |
| 1 | Data access, ingestion, coverage audit | 22 Nov 2026 |
| 2 | Physics baseline (B1) for Delhi–Mumbai, Jan 2026 | 6 Dec 2026 |
| 3 | Satellite contrail detector and overlays | 13 Dec 2026 |
| 4 | Web app v0 + Innovation Website | 18 Dec 2026 |
| 5 | Labelling, matching, observability → labels for the year | 7 Feb 2027 |
| 6 | Evaluation harness, baselines B0–B4, H1 | 28 Feb 2027 |
| 7 | Correction model (H2), avoidance layer (H3, H4) | 31 Mar 2027 |
| 8 | Web app v1, expo build, open release | Apr–May 2027 |

## Licence

Code: [Apache-2.0](LICENSE). Data licences are set per source at release (Phase 8).
