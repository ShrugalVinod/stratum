# Progress log

Newest first. What was done, what's next, blockers.

## 2026-10-22 — Second analysis with the learned detector (descriptive)

**Done**
- Colab 09c re-labelled the 12 flight days with the learned detector: 942 contrails seen (was
  1,564); chance matches in the wrong-day check 12 % (was 33 %).
- H1 recomputed: 10.7 [6.6, 54.6] (logged 6.44), the same conclusion with cleaner labels.
  H2 recomputed: 0.92 [0.90, 0.97] (logged 0.86), stronger. Logged results unchanged.

**Next**
- Detector v3 ("expert level"): 6 infrared channels, all OpenContrails data, soft labels from
  the experts' agreement, 2× upsampling, an ensemble; one more logged check on the 89 scenes.

## 2026-10-21 — Learned contrail detector (D-005): F1 0.22 → 0.48 on expert scenes

**Done**
- A small U-Net, pre-trained on 6,067 OpenContrails scenes (Google, GOES-16) and fine-tuned on
  the 51 DLR expert training scenes; its probabilities feed the existing object and matching
  steps. Checked once on the 89 DLR evaluation scenes: precision 0.64 (was 0.22), recall 0.38
  (was 0.23), F1 0.48 [0.44, 0.52] (was 0.22 [0.18, 0.26]).
- The logged H1–H4 results are unchanged; the new labels give a descriptive second analysis.

**Next**
- Colab 09c: re-label the 12 flight days with the new detector, chance check, H1/H2 recomputed.
- Then the zoom-in contrail viewer on the new detections.

## 2026-10-20 — Phase 8 complete: v1.0.0 released with a DOI

**Done**
- Release bundle 1.0.0 (Colab 08b); repository public after a history scan; README reproduce path
  tested by a team member in a fresh Colab (figures identical); `make rescore` on the release
  reproduces H1 and H2 (same verdicts).
- GitHub release v1.0.0 with the derived data; Zenodo DOI 10.5281/zenodo.23480202.
- Phase 8 gate report closed (`docs/phase_reports/phase8_gate_report.md`).

**Next**
- Demo video (team). After it: learned contrail detector as a disclosed sensitivity analysis.
- Before the Summit: backup laptop, USB sticks, hardware list (`docs/expo_checklist.md`).

## 2026-10-19 — Phase 8: web app v1 built on real data; release tooling ready

**Done**
- Web app v1: model switcher B1 / B3 / STRATUM, probability / uncertainty / satellite-coverage
  views, per-model ranked lists with filters and CSV, STRATUM cards with alternatives and the
  humidity profile, /results (H1–H4), Methods (SHAP, model card, threats, deviations, what didn't
  work), Data & code. Booth mode, service worker, offline expo build (`make expo`).
- Colab 08a: data export v1-d126083 (42 days: 12 held-out flight days + January 2026). It stopped
  on its own 4 MB per-day check (2026-02-01: 4.14 MB) after writing every day; finished with the
  new finish-only mode (results.json + manifest.json), budget now 5 MB.
- Colab 07f: evaluation report v2 regenerated with the wording/format fixes (no new numbers).
- Release tooling: `stratum release-bundle` (08b), `make reproduce-figures`, CITATION.cff,
  data card, README reproduce path. Licences and DOI approved by the team (decisions.md).

**Next**
- Switch the site to v1-d126083, deploy, Playwright + Lighthouse; Colab 08b release bundle.
- Team: photos for the Team page; booth-laptop test with Wi-Fi off; fresh-Colab README test;
  make the repo public + Zenodo at v1.0.0.

## 2026-10-19 — Phase 7 accepted: H2 supported (with a caveat), H3 supported, H4 not supported

**Done**
- Colab 07a–07e all exit 0. Final runs logged: H2 (20261018T140654Z_7559cda), H3/H4
  (20261019T034442Z_5f31ccd); repo `_locks/final_runs.jsonl` = Drive.
- H2: BSS vs B3 0.86 [0.82, 0.91] → supported; a constant-rate forecast scores the same; STRATUM
  ranks much better than physics (AUROC 0.65–0.83 vs 0.42–0.66). H3: 0.0044 % → supported (corrected
  physics too dry); context B1 0.48 %, B3 0.54 %. H4: 0.36 [−0.03, 0.45] → not supported; context
  B1 0.24, B3 0.27 (clear). Decisions: 333 alerts / 402 portions, 578 t CO₂e avoided at 100 yr.
- Evaluation report v2 on Drive; H2–H4 paper draft `docs/paper/h2_h4_result_draft.md`; gate report
  `docs/phase_reports/phase7_gate_report.md`; website updated with H2–H4 results.

**Next**
- Phase 8 (web app v1, expo build, release).

## 2026-10-18 — Phase 7: all code built; Colab runs 07a–07d next

**Done (tested, pushed, main ≥ bbd9d02, 255 Python tests)**
- Q5 settled (option A): AR5 AGWP CO₂ factors 2.497e-9 (20 yr) / 6.779e-10 (100 yr) kg CO₂ per J,
  efficacy 0.42 (MC 0.42–1.0). Lock verifies.
- Correction model (`stratum/model/`): 18 pre-registered features, monotone LightGBM, Optuna 50
  trials on leave-one-day-out Brier, isotonic calibration, RHi-only logistic; SHAP and
  monotonicity checks; frozen per-fold models with a hash. H2 on the Phase 6 harness.
- Option 2 (Team OK): the humidity correction fed back into CoCiP is fitted with detection
  efficiency; literal fit reported as sensitivity (`fit-correction`).
- Decision layer (`stratum/decide/`): warming contrails flagged by corrected CoCiP, ±2,000/±4,000 ft,
  OpenAP fuel at constant Mach, cropped paired 100-member Monte Carlo, alert rule, Table 3 lists,
  confidence note, `decide --estimate`. H3/H4 (`evaluate-h34`). Report v2 with model card and
  draft H2–H4 paragraphs (`report-v2`). Second final runs need `--rerun-reason`.
- Docs: `docs/methods/features.md`, `docs/methods/model_card.md`, Phase 7 gate report draft.
  Website Methods page: model inputs table (committed, not deployed).

**Next**
- Shrugal: 07a (running) → paste summary → 07b (H2 final) → 07c (correction + corrected CoCiP +
  H3/H4 final) → 07d (decisions + report v2).

## 2026-10-18 — Phase 6 accepted: H1 not supported

**Done**
- Colab 06a2: 12 climatology months; tolerance re-matches (1.5 / 3 px, 15° / 30°) for 12 days.
- Colab 06b: the one final run (20261018T113902Z_4a82cfa, commit 4a82cfa), logged in
  `_locks/final_runs.jsonl` (repo copy = Drive). **H1 not supported:** ratio 6.44
  (4.92–12.12) — physics predicts ~6× more persistent contrails than the satellite sees;
  efficiency-adjusted 1.05 (0.81–1.91). Robust to every sensitivity variant.
- Evaluation report v1 on Drive (`STRATUM/reports/20261018T113902Z_4a82cfa/`); H1 paragraph
  in `reports/20261018T113902Z_4a82cfa/` and `docs/paper/h1_result_draft.md`.
- Gate report: `docs/phase_reports/phase6_gate_report.md`.

**Next**
- Phase 6 accepted by Shrugal (18 Oct); website updated with the H1 result (Methods H1 card,
  ticker, diary).
- Phase 7: settle Q5 (climate-metric conversion, before step 7.6.4); build the correction model.

## 2026-10-18 — Phase 6 started: evaluation harness built

**Done (tested, pushed)**
- Baselines: B0 climatology (`stratum/baselines/climatology.py`, training months only), B1–B3
  (`stratum/baselines/physics.py`; B1 = stored persists_raw exactly), B4 documented skip.
- Harness (`stratum/evaluate/`): evaluation table, leakage-safe seasonal/spatial splits, metrics
  (vs scikit-learn and hand values), vectorised paired day bootstrap (CI coverage ≈ 95 % on
  synthetic data), H1 (primary + efficiency-adjusted + breakdowns + sensitivity), report v1
  (HTML + MD with the deviation log), final-run lock (`stratum evaluate --final`, append-only
  `_locks/final_runs.jsonl`, peek runs blocked). 231 Python tests.
- Colab notebooks 06a (climatology + domain CoCiP), 06a2 (tolerance re-matches) and 06b
  (final run). Sensitivity analyses: label rule, age window, tolerances, without Jan 2026.
  H1 paragraph drafted automatically. Phase 6 gate report drafted.

**Next**
- Shrugal: Colab 06a (running), then 06a2, then 06b (the one final run).

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

- Settled (Team OK 17 Oct, before any sampling or labelling): Q16 seed 20261017, Q3 agreement
  (16-px grid κ + object F1, scene bootstrap), Q11 opaque cloud (majority-cloudy 15-px box).
  Labellers Aditya + Ishaan, Shrugal decides disagreements; pilot by 26 Oct, 200 scenes by 9 Nov.
- Built and tested: scene sampler (`sample-scenes`, once only), scene packages
  (`export-scene-packages`), agreement + disagreement gallery (`labelling-agreement`), labelling
  guide v0.1 (`docs/labelling_guide.md`), **labelling app** (`labeller/`, Vitest + Playwright,
  own CI job, hosted separately), Colab `05b_scenes`. 173 Python tests.

- Colab `05a_segments_year` PASSED (commit 798fe9b, 58 min, 12/12 days exit 0, all whole-domain):
  8,035–10,401 flights and 298k–385k segments per day; corridor flights 1,465–1,846 per day;
  1 Jan 2026 identical to the local test (8,573 flights, 347,947 segments, 1,706 corridor).
  Lasting-contrail conditions (raw ERA5) 0.7 % (1 Apr) to 9.5 % (1 Feb); highest in the
  monsoon/post-monsoon days and 1 Feb.

- Colab `05b_scenes` PASSED (commit b64e245, 23 min): scenes drawn once with seed 20261017 from
  43,992 candidates; 200 main (100 tuning / 100 held-out) + 20 pilot; all 144 strata filled
  (1 slot short filled elsewhere); 12–22 scenes per month; night 58 / day 50 / dusk 48 /
  dawn 44; density classes 64 / 64 / 72 (terciles, q1 = 0, q2 = 57 persistent segments);
  107 west / 93 east of 80°E; 17 scenes with mean VZA > 60°. pilot.zip 3.9 MB, main.zip 40.9 MB.

- Matching built and tested (`stratum/match/advect.py`, `matching.py`): RK2 advection with ERA5
  wind, 2 px / 20° match, observability (high cloud at and above < 0.5, majority-cloudy 15-px box,
  VZA < 60°), segment label rule (unobservable stays missing, never 0).
- D-002 (Team OK 17 Oct): detector tuned on the DLR expert MSG/SEVIRI dataset; all 200 India
  scenes held out; three labellers (Aditya, Ishaan, Abeer). Expert-line frame checked on the real
  files (south-up arrays flipped; 97 % of expert points on expert pixels). 191 Python tests.
- Colab `05c_label_sets` PASSED (commit 2d3e7a6, 2.5 min): test.zip 100 held-out India scenes
  (20.5 MB); calibration.zip 20 DLR evaluation scenes C001–C020 (1.3 MB, 126 expert lines),
  DLR ids = `calibration_scenes(20261017)` exactly. Expert answers kept private in
  `labels/calibration/`.

- Detector tuned on the DLR expert scenes (D-002, `stratum tune-detector`): evaluation (89
  scenes) precision 0.22 [0.17, 0.27], recall 0.23 [0.18, 0.29], F1 0.22 [0.18, 0.26] (Phase 3
  settings: F1 0.18). New settings in `configs/pipeline.yaml`; report `reports/detector_tuning/`.
- Full-year matching built and tested (`stratum match-year`, Colab `05d_match_year`): detection on
  every slot, advection + parallax + matching + observability per image, segment labels, label
  counts, ≥ 300 check (counted as contrail events), parallax before/after figure, wrong-day null
  (chance matches), Driver detectability flag and CoCiP advection comparison where CoCiP ran.
  Local test: 0.07 ms per segment; 206 Python tests.

- Colab `05d_match_year` PASSED (commit d1cc320): 680,387 SAC-forming candidates; y = 1 4,263,
  y = 0 332,647, missing 343,477 (known 49.5 %; monsoon days Jul–Sep only 3–5 % of images
  observable). ≥ 300 check passed: 1,222 contrail events (1,065 flights). **But** the wrong-day
  null gives a chance y = 1 rate of 0.77 % vs 1.27 % real: about 60 % of y = 1 labels are
  expected by coincidence. Parallax correction barely changes near-matches (0.73 % vs 0.69 %
  within 2 px), consistent with mostly chance matches. Escalated to the team before Phase 6.
- D-003 (Team OK): India labels = Claude drafts + one reviewer; drafts done (100 scenes: 4 sure
  lines in 3 scenes, 11 uncertain lines in 6 more, 91 with no contrails).

- Colab `05e_label_diagnostics`: chance share of y = 1 is 60 % with the 1-image rule, 33 % with
  ≥ 2 matched images, 24 % with ≥ 3. **D-004 (Team OK 18 Oct): y = 1 needs ≥ 2 matched observable
  images**; the 1-image rule stays as a sensitivity analysis. Aditya finished his review of
  Claude's India drafts.

- 05d re-run with D-004: y = 1 1,564 segments, **421 contrail events (≥ 300 passed)**, 369
  flights; chance share 0.33 (was 0.60). Sensitivity: 1 image 1,222 events, 3 images 207. A bug
  put 2,608 single-match segments into y = 0; fixed (see decisions 18 Oct).
- India review finished (36 lines in 16 scenes; 91 scenes scored).

- Colab 05f PASSED (commit 0a89831): final labels (y = 1 1,564; 421 events; y = 0 332,647);
  India check (91 scenes): detector precision 0.044 [0.020, 0.071], recall 0.33 [0.21, 0.51]
  (sure + uncertain). Phase 5 gate report written (docs/phase_reports/phase5_gate_report.md).

**Next**
- Phase 5 ACCEPTED 18 Oct (Shrugal). Phase 6 on hold until the team says go.
- Claude: coverage audit 2/5 Nov.
- Team: review Claude's drafts in the labelling app (Review tab).
- Shrugal: share pilot.zip, calibration.zip, test.zip (never scenes.csv or labels/calibration/)
  with Aditya, Ishaan, Abeer.
- Labellers: pilot (all three, 20 scenes) by 26 Oct → guide revision → calibration (all three)
  → test (pairs: Aditya 67, Ishaan 67, Abeer 66) by 9 Nov. Exports → Drive `labels/raw/<id>/`.
- Claude: Phase 4 open items a, b, d; coverage audit 2/5 Nov; detector precision/recall on the
  India held-out labels once they exist.

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
