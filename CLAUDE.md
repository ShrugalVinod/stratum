# CLAUDE.md — standing rules for STRATUM

Read `BUILD_PROMPT.md` (the master plan) and this file at the start of every session, then
continue from `docs/progress.md` and the latest report in `docs/phase_reports/`.
Work one phase at a time. Never start phase N+1 until the team says "Phase N is accepted".

## Non-negotiable rules (BUILD_PROMPT.md §1)

1. **Never fabricate data, numbers or results.** UI placeholders read `—` or `pending` and are styled as such. A constant you can't trace to the prompt, the paper or a cited source → ask.
2. **Pre-registration is binding.** `configs/preregistered.yaml` + settled answers in `configs/preregistered_open_questions.md` are frozen by `_locks/preregistration.lock`. Changes need the team's written OK in chat **and** an entry in `docs/deviations.md`. `stratum verify-lock` enforces this.
3. **"Unobservable" is missing, never negative.** Label `NaN`/`None`, excluded from training and scoring, never coerced to 0.
4. **No leakage.** Segments of one flight and detections of one image never straddle a split. Tune only on validation data carved from training seasons.
5. **Labels must not depend on the model being evaluated.** Matching runs on all formation-criterion segments.
6. **Reproducible by default.** Pinned env (`uv.lock`), fixed seeds, every output gets a run manifest (`stratum/manifest.py`).
7. **Tests before "done".** `make check` (ruff, mypy --strict on `stratum/`, pytest) and web tests must pass. Physics has known-answer tests that must not be edited to pass.
8. **Ask, don't guess** on anything in BUILD_PROMPT.md §2.4.
9. **Explain as you go.** Every module: top docstring in plain English (what, the physics/statistics, the paper section). Non-obvious choices get a comment with the reason.
10. **Honesty in outputs.** Public outputs say: computational estimate; no real flight was changed; ATC feasibility not modelled; ADS-B coverage stated. Ranges, not single numbers.
11. **Privacy.** Public outputs show commercial airline flights only; never private, state, military or unidentified aircraft.
12. **Secrets never touch git.** `.env` locally (gitignored), Colab Secrets in Colab. pre-commit runs detect-secrets.
13. **Keep the team in the loop.** Update `docs/progress.md` and `docs/decisions.md` as you work.

## How to run things

| Task | Command |
|---|---|
| Set up (fresh clone) | `make setup` (needs `uv`; Python 3.12 is installed by uv) |
| All checks (= CI) | `make check` |
| Quick tests | `make test-fast` |
| Environment + config hash | `uv run stratum info` |
| Check pre-registration | `make verify-lock` |
| Regenerate Colab requirements | `make lock-env` |

* Repo lives at `~/code/stratum`. **Do not** put it under a path containing `:` (Python venvs refuse such paths).
* Heavy jobs run in Colab through thin launchers in `colab/` (protocol: BUILD_PROMPT.md §2.5). Notebooks contain no pipeline logic.
* Data never goes in git; it lives on Shrugal's Google Drive under `MyDrive/STRATUM/` (layout: `stratum/paths.py`).
* Owner of the repo and the only person running code: Shrugal Vinod (GitHub `ShrugalVinod`).
