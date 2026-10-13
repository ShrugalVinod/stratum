```
═══ PHASE 0 GATE REPORT — Setup and guard-rails — 13 Oct 2026 ═══
Status:          READY FOR REVIEW (all done-when items complete)
Calendar:        on track (target 27 Oct 2026; 14 days left)

Done-when checklist:
  [x] make setup && make test on a fresh clone: laptop ✔ (fresh clone from GitHub,
      33/33 passed, coverage 87 %). Colab ✔ colab/00_smoke_test.ipynb @ 97b5b1a, 13 Oct
      2026: 33 passed, Python 3.12.3, Drive layout complete, Drive write/read OK, 1.9 min.
  [x] CI green (GitHub Actions run 38425122380, 34 s). Pre-commit blocks a fake key:
      docs/phase_reports/evidence/phase0_secret_block.txt (AWS key + secret keyword caught,
      commit exit code 1, nothing committed).
  [~] preregistered.yaml populated with paper citations ✔; Shrugal revised it (13 Oct:
      parallax, segment-label rule, explicit ⚑ null placeholders, monotone keys = feature
      names) ✔; "approved" by Shrugal in chat 13 Oct 2026 ✔;
      lock ✔ _locks/preregistration.lock (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e); verify-lock --strict OK.
      Lock copy on Drive: next Colab run copies it automatically.
  [x] docs/data_sources.md: every account, step by step (CDS, EUMETSAT, OpenSky,
      ADS-B Exchange, GitHub token, Colab Secrets).
  [x] Phase Gate Report (this file).

What was built:
  - Private repo github.com/ShrugalVinod/stratum, local copy ~/code/stratum.
  - Pinned Python 3.12 environment (uv.lock, 159 packages; pycontrails 0.64.0) + requirements-colab.txt.
  - stratum package core: strict typed configs + config hash, laptop/Colab paths and the
    Drive layout, run manifests with _SUCCESS markers (resumable jobs), pre-registration
    lock that detects any changed key and checks docs/deviations.md for a team OK, CLI.
  - configs/: preregistered.yaml (every key cites the paper), 15 open questions (11 settled,
    4 open with owners), domain + Delhi–Mumbai corridor polygon (±75 km), airline allowlist draft.
  - Guard-rails: ruff, mypy --strict, pytest, detect-secrets, nbstripout, GitHub Actions CI
    (also runs verify-lock once the lock exists).
  - colab/00_smoke_test.ipynb thin launcher; docs (progress, decisions, deviations, storage,
    data sources, hard questions); CLAUDE.md with the 13 standing rules.

Key numbers:     33 tests; coverage 87 % (cli 56 %, config 95 %, lock 86 %, manifest 86 %);
                 corridor polygon 463 vertices, lon 72.16–77.86°E, lat 18.41–29.23°N,
                 every vertex 75 ± 1 km from the great circle (tests/test_config.py).
Tests:           pytest 37/37, ruff clean, ruff-format clean, mypy --strict clean (18 files),
                 web tests n/a until Phase 4.
Colab runs:      00_smoke_test @ 97b5b1a: PASSED (verified from run summary; tests_ok true,
                 layout missing [], write/read OK). Its drive_used/total fields measured the
                 Colab VM disk, not Drive: fixed to report the STRATUM folder size instead.
Storage:         STRATUM folder on Drive: a few KB (empty layout + 1 test manifest). +0 GB this phase.
Decisions made:  docs/decisions.md, 19 lines dated 2026-10-13 (incl. Python 3.12, repo
                 location, Colab venv install, dev-month option (b), mass 0.80, η, labelling rules).
Deviations:      none.
Open questions:  ⚑ Q3 κ method (IK, before the pilot). ⚑ Q16 labelled-split seed (SV, before scene sampling).
                 ⚑ Q4 Driver et al. 2025 detection thresholds (IK, before Phase 5): need the paper's numbers.
                 ⚑ Q5 climate-metric factors, 20/100 yr (SV, before Phase 7): need a cited source.
                 ⚑ Q11 "opaque cloud" categories in the IODC cloud mask (IK, Phase 1 reads the product).
                 ⚑ Q12 CoCiP Monte Carlo N (SV, Phase 2, from measured Colab time; start N = 20).
Risks:           OpenSky approval for a school project is uncertain → pre-registered fallback to
                 ADS-B Exchange days. Meteosat download size not yet measured (Phase 1).
                 Lean Canvas text differs from the paper (satellite named as INSAT-3D/Himawari;
                 2 %/80 % finding attributed to a Japan study); fix before 29 Oct submission.
Next phase:      Phase 1 first tasks: (1) ERA5 downloader + one-day test, (2) ADS-B Exchange
                 adapter on a free day, (3) eumdac collection search + 12-month coverage check.
                 What I need from you first: CDS and EUMETSAT keys in .env and Colab Secrets;
                 OpenSky access request sent.
════════════════════════════════════════════
```
