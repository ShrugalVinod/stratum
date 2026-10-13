# Progress log

Newest first. What was done, what's next, blockers.

## 2026-10-13 — Phase 0 (setup and guard-rails)

**Done**
- Read the build prompt, the research paper v1.0, synopsis, phase plan and Lean Canvas; listed differences between prompt and paper (resolved in `decisions.md`).
- Created the repo (`~/code/stratum`, GitHub `ShrugalVinod/stratum`, private) with the full folder structure. CI green; fresh-clone `make setup && make test` passes (33/33); pre-commit blocked a fake key (evidence in `docs/phase_reports/evidence/`).
- Phase 0 Gate Report: `docs/phase_reports/phase0_gate_report.md`.
- Pinned environment (Python 3.12, `uv.lock`, 159 packages incl. pycontrails 0.64.0, satpy 0.60, openap, eumdac, lightgbm, xgboost); `requirements-colab.txt` exported.
- `stratum` package core: `config.py` (strict typed configs, config hash, corridor polygon), `paths.py` (laptop/CI/Colab roots, Drive layout), `manifest.py` (run manifests, `_SUCCESS` markers, resumability), `lock.py` (pre-registration lock + deviation check), `cli.py` (`info`, `init-drive`, `write-corridor`, `lock-preregistration`, `verify-lock`).
- `configs/preregistered.yaml` populated from the paper with section citations; 15 open questions written, 11 settled, 4 open with owners.
- Tests, ruff, mypy --strict, pre-commit (detect-secrets, nbstripout), GitHub Actions CI.
- `colab/00_smoke_test.ipynb`; `docs/data_sources.md` account guide.

- Colab smoke test PASSED (commit 97b5b1a: 33 tests, Drive layout, write/read OK).
- Shrugal revised `preregistered.yaml` (parallax, segment-label rule, ⚑ null placeholders, monotone keys renamed to feature names); schema + lock updated so filling a ⚑ null later is allowed but changing a set value is not. 37 tests.

- Pre-registration **approved** by Shrugal and **locked**: `_locks/preregistration.lock` (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e). Settled: Q1, Q2, Q6–Q10, Q13–Q15. Open (⚑ nulls, fill before the named phase): Q3, Q4, Q5, Q11, Q12, Q16.
- **Phase 0 complete; gate report ready for review.**

**Next (Phase 1)**
- ERA5 downloader + one-day test; ADS-B Exchange adapter on a free day; eumdac collection search + 12-month coverage check.
- Start account requests now (OpenSky approval can take weeks): CDS, EUMETSAT, OpenSky.

**Blockers**
- Phase 1 needs CDS + EUMETSAT keys (in `.env` and Colab Secrets) and the OpenSky request sent.
