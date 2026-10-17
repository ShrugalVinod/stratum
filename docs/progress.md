# Progress log

Newest first. What was done, what's next, blockers.

## 2026-10-17 — Phase 4 accepted; Phase 5 started

**Done**
- Phase 3 accepted (15 Oct). Phase 4 built and **accepted 17 Oct**: web app v0 + Innovation
  Website live at https://stratum.aerospaceonyx.workers.dev ("aeronautical chart" design, Chart/
  Night themes, flight replay with plane icons, lower detail bar with CoCiP contrail lifetime,
  team email). Lighthouse mobile / 94, /map 92 (a11y, best practices, SEO 100). Gate report:
  `docs/phase_reports/phase4_gate_report.md` (open items a–f carried forward to 18 Dec).
- Phase 5, step 1: `build-segments --scope domain` keeps every flight in the study domain and only
  flags the corridor (scoring is on the full domain). Local test, 1 Jan 2026: 8,573 flight pieces,
  347,947 segments in 27 s; corridor count 1,706 flights = Phase 2. Colab notebook
  `05a_segments_year` builds all 12 flight days.

**Next**
- Shrugal: run Colab `05a_segments_year`, paste the summary.
- Team: answer the Phase 5 questions (Q16 seed, Q3 agreement metric, labellers, Q11 opaque
  cloud, Q4 Driver et al. thresholds, labelling dates).
- Claude: scene sampling + packages, labeller app, agreement module, matching (advection,
  parallax, observability, labels) with the critical tests.

## 2026-10-15 (late) — Phase 2 accepted; Phase 3 built

**Done (tested, pushed)**
- Phase 2 accepted (p05 decision OK).
- Detector (`stratum/detect/`): line filters, ridge thinning, end trimming, coastline + cloud-edge checks, provisional confidence. Synthetic recall 100 % at SNR ≥ 2, 0 false objects on noise. On real 15 Jan slots it tracks two Arabian Sea contrails across 3 slots; ~1 s per slot.
- Parallax geometry (`stratum/match/geometry.py`), checked against independent satellite geometry.
- Overlay figures (two panels) + MP4/GIF time-lapse; `stratum detect`, `stratum phase3-overlays`; Colab `03_detector_overlays`.

**Next**
- Shrugal: run Colab `03_detector_overlays`, paste the summary.
- Team: pick the overlay figures for brief/video/website; decide on the optional CNN (§3.4).

## 2026-10-15 (night) — Phase 2 final run; gate report ready

**Done**
- Colab `02_physics_baseline`, final run (N = 100, FORCE, 79 min, all exit codes 0): 1,706 corridor flights, 131,661 segments, tropopause 0 % missing, CoCiP B1 77 / B2 101 / B3 71 contrail waypoints, no plausibility flags.
- N = 100 vs 200: p50 0.9 %, p95 5.6 % stable; p05 49.7 % (lower tail sits at the EF = 0 members; not fixable by more N). Proposed: keep N = 100 (decisions.md).
- Airline allowlist reviewed (191 prefixes: 160 airlines, 13 excluded, 18 unverified). Scoring scope settled: full domain. Paper v1.2 finalised (19 pp, no placeholders).
- `docs/phase_reports/phase2_gate_report.md` final.

**Next**
- Shrugal: OK the p05 decision and say "Phase 2 is accepted" → Phase 3.
- 2 and 5 Nov: coverage audit (ADS-B Exchange 2026-11-01 + adsb.lol comparison).

## 2026-10-15 (evening) — Phase 2 started

**Done (tested, pushed)**
- Q12 settled: N = 20 Monte Carlo members (convergence check N = 20 vs 40 runs in Colab).
- Trajectory steps 3–9: implausibility filter (≤ 3 passes), FL250 cut, 1-min great-circle resampling, gap fill ≤ 10 min / split > 10 min, position-jump split, segment geometry, aircraft type → OpenAP (logged synonyms/type map), mass 0.80 MTOW, fuel flow, η (clipped 0.20–0.45), commercial classification.
- ERA5 → segments (log-p interpolation, exact on analytic fields), WMO tropopause, features (RHi/RHw, gradient, shear, high cloud, tropopause distance, TAS, LST), SAC flags.
- CoCiP runner B1/B2/B3 with Monte Carlo EF p5/p50/p95; `build-segments`, `run-cocip`, `cocip-convergence`, `phase2-report`; Colab notebook `02_physics_baseline`.
- Software test on real 1 Jan 2026 flights (with 15 Jan ERA5 relabelled): 1,706 corridor flights, 132k segments, SAC forms 22 %, persists_raw 0.17 % (dry winter day), CoCiP contrails B1 155 / B2 291 / B3 125, none at the box edge.

**Next**
- Shrugal: run Colab `02_physics_baseline` and paste the summary.
- Team: review `configs/airlines.yaml` (307 flights had prefixes not in the draft list) and `configs/type_map.yaml`.
- Claude: verify the run, review the sanity report, Phase 2 gate report.

## 2026-10-15 — Phase 1 data complete

**Done**
- **ERA5 full year on Drive: 36/36** month-blocks (pl, sl, tropo_T × Mar 2025 – Feb 2026), verified by `_SUCCESS` markers via the Drive connector. Bulk via ARCO (01a2).
- **ADS-B Exchange: 12/12** first-of-month days on Drive (01b).
- **Meteosat-9 IODC: 14 days**, 1,451/1,456 slots (01c). 5 failed slots accepted (decisions.md).
- **Callsign-flicker fix** in flight reconstruction (decisions.md; flights on 2025-03-01 00–12 UTC 8,713 → 4,628).
- Phase 1 gate report finalised (`docs/phase_reports/phase1_gate_report.md`); only the November coverage audit remains.
- Reviewed the team's 15 Oct paper drafts; wrote a self-contained revision prompt (team folder, `PAPER_FIX_PROMPT_v2.md`). The 78-page technical edition conflicts with the lock (H1–H6 vs H1–H4, 3 annotators, 30 s / 5 min / 0–120 min) — flagged to Shrugal.

**Next**
- Shrugal: accept Phase 1 → start Phase 2. Decide Q12 (CoCiP Monte Carlo N) before the full-month run.
- Claude: 2 Nov / 5 Nov schedule lookups + coverage audit.

## 2026-10-14 — Phase 1 (data access, ingestion, coverage audit) — in progress

**Done (all tested, pushed)**
- Accounts: CDS ✔, EUMETSAT ✔ (second account; first account's API blocked by licence sync — helpdesk ticket sent), OpenSky historical access requested (pending), salt generated.
- **Physics (1.4)** ✔: Murphy & Koop thermo, vectorised SAC (all §4.3 known answers), ISA units; **paper Fig. 1 reproduced**; **CoCiP runs end to end on our ERA5 files** (`reports/phase1/cocip_end_to_end.md`): STRATUM SAC = pycontrails SAC at 100 % of waypoints.
- **ERA5 (1.1)** ✔: CDS downloader (server-side crop, pycontrails layout, resumable, queue-limit retries, per-month lock). **January 2026 on Drive** (3.5 GB, final ERA5, 0 NaN). **CDS = ARCO** to GRIB-packing precision (`reports/phase1/era5_cds_vs_arco.csv`). Full year running in Colab (01a).
- **ADS-B (1.2)** ✔ code: schema, ADS-B Exchange streaming adapter, flight reconstruction, aircraft DB snapshot 2025-08. 12 free days running in Colab (01b). Sanity plot `reports/phase1/adsb_sanity_2026-02-01T00.png`.
- **Meteosat (1.3)** ✔ code: all 12 months present (MSG2); native download + satpy calibration/crop (5.5 MB/slot); cloud mask on the same grid; static lat/lon/VZA/area grid (VZA matches prompt values); **geolocation verified** (`reports/phase1/meteosat/ir108_coast_2026-01-15T0000.png`); **Plan A approved** and running in Colab (01c).
- **Coverage audit (1.5)** ✔ code: matching, continuity, mechanical decision, reports, **auto-drafted memo**; schedule template in `data/reference/`.
- Notebooks: `01_era5_look`, `01b_adsb_look`, `01c_meteosat_look`, `01d_cocip_end_to_end` (each ends with a sanity plot/result).
- Docs: data sources (endpoints, versions, licences), storage (measured), methods page P1, ADS-B Exchange permission email draft (`docs/memos/`).

**Next**
- Shrugal: paste the 3 Colab summaries (01a, 01b, 01c) when they finish; team: fill `data/reference/scheduled_flights.csv` (≥ 7 days); decide whether to send the ADS-B Exchange permission email.
- Claude: verify the 3 runs; run the coverage audit → memo; Phase 1 gate report.

**Blockers**
- Scheduled-flights CSV (humans only). OpenSky reply (external). EUMETSAT helpdesk (old account; no longer blocking).

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
