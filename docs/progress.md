# Progress log

Newest first. What was done, what's next, blockers.

## 2026-10-14 — Phase 1 (data access, ingestion, coverage audit) — in progress

**Done**
- Accounts: CDS ✔ (test download OK), EUMETSAT ✔ (login OK), OpenSky historical access **requested** (waiting), `STRATUM_ID_SALT` generated into `.env`.
- Physics (1.4) ✔: `thermo.py` (Murphy & Koop), `sac.py` (vectorised SAC, 10⁷ segments in 8.5 s), `units.py` (ISA); all §4.3 known answers pass; **paper Fig. 1 reproduced** (`reports/figures/fig1_sac.png`); pycontrails differences measured and documented.
- Meteosat (1.3.1) ✔: collections `EO:EUM:DAT:MSG:HRSEVIRI-IODC` + `EO:EUM:DAT:MSG:CLM-IODC`; **all 12 evaluation months present, all MSG2 = Meteosat-9** (`reports/phase1/meteosat_iodc_archive_coverage.csv`). Full-disk slot = 176 MB → cropping required.
- ADS-B (1.2) ✔: schema (pandera), ADS-B Exchange streaming adapter, flight reconstruction, `stratum ingest-adsb`; real 2026-01-01 06:00–06:05 UTC slice: 360 aircraft ≥ FL200 in the box, 34 cruising in the DEL–BOM corridor.
- Aircraft DB (1.2.4) ✔: OpenSky snapshot 2025-08 (616,648 rows) with URL/date/SHA-256.
- ERA5 (1.1) ✔ code + one-day test: CDS route with server-side crop; final ERA5, 0 NaN; T(250 hPa) 218–235 K, 1.7 % ISSR; 102 MB/day → ≈ 38 GB/year. Notebook `notebooks/01_era5_look.ipynb` + sanity plot. Colab launcher `colab/01a_era5_download.ipynb`.
- Coverage audit (1.5) ✔ code: matching, continuity, mechanical decision, reports; schedule template + instructions in `data/reference/`.

**Next**
- Shrugal: run `colab/01a_era5_download.ipynb` (MONTHS = "2026-01") and paste the summary; fix EUMETSAT licence (see blockers).
- Claude: Meteosat reader/crop/BTD/VZA (needs licence); ADS-B Exchange Colab launcher (12 free days); OpenSky adapter (when approved); ARCO equivalence check; coverage memo draft; ADS-B Exchange permission email draft.

**Blockers**
- **EUMETSAT SEVIRI images: HTTP 403 "GeneralLicense required to access this collection".** Licence form was filled 2026-10-14 but is not active yet (maybe not submitted, or pending approval). Cloud mask downloads fine.
- OpenSky historical access: request submitted 2026-10-14, awaiting reply.
- Scheduled-flights CSV for the audit: needs humans (`data/reference/README.md`).

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
