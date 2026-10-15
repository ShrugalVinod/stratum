```
═══ PHASE 2 GATE REPORT — Physics baseline (B1–B3), Delhi–Mumbai corridor, Jan 2026 — DRAFT 15 Oct 2026 ═══
Status:          DRAFT — first full run done in Colab (02_physics_baseline); team review of the sanity
                 report + two decisions pending (N for Monte Carlo; tropopause gaps)
Calendar:        ahead (Phase 2 window 23 Nov – 20 Dec in the team plan)

Done-when checklist:
  [x] Trajectory tests pass; each cleaning step's removals logged (manifest "steps").
  [x] Every corridor segment of the development month has met features, SAC/ISSR flags and CoCiP
      outputs for B1, B2, B3. Development month = the one free ADS-B day, 2026-01-01.
  [ ] Sanity report reviewed by the team; nothing unexplained (see open items below).
  [x] Full-year run possible with one command per month (build-segments / run-cocip --month).
      Colab time: segments + 3 scalings × 21 CoCiP runs for one day ≈ minutes, not hours.
  [ ] Phase Gate Report — this draft.

Key numbers (2026-01-01, real ERA5):
  ADS-B reports in 3,952,642 → 7,563 flights → 7,281 with cruise ≥ FL250 → 8,750 pieces
  → 347,947 one-minute segments. Corridor sample: 1,706 flights (1,458 commercial), 131,661
  segments (28,309 inside the polygon); met found for all (0 out of domain).
  Removed: step 3 implausibility 574 / 308 / 261 points (passes 1–3); step 4 below FL250 285,116.
  Types: 1,582 OpenSky DB, 120 ADS-B field, 4 none; 16 DB/ADS-B disagreements; 80 OpenAP synonyms,
  18 via type map, 26 unmapped (business jets/turboprops).
  SAC forms 11.6 %; persists_raw (SAC ∧ RHi ≥ 1) 0.10 % — a dry winter day.
  CoCiP persistent contrails: B1 77 waypoints, B2 101, B3 71, all from 6 flights; positive EF
  B1 1.30e14 J, B2 2.42e14 J, B3 2.10e14 J; max |EF| per flight 3.9e13–8.1e13 J. None reached the
  met-box edge. Persistence occurs only south of ~15°N at FL350–450 (Kerala/Karnataka/TN), not
  on the northern part of the corridor. Plausibility flags: none.
Q12 convergence (B1, N = 20 vs 40): p50 1.5 %, p95 7.1 %, p05 27.8 % → lower tail NOT stable.

Open items:
  1. ⚑ Monte Carlo N: p05 (the lower bound the decision layer ranks on) is unstable at N = 20.
     Recommendation: N = 100 via a logged deviation, before any evaluation run (Q12 allows this).
  2. Tropopause missing for 13,361 of 131,661 segments (10 %), vs 2 % of grid cells on the
     15 Jan test day. To investigate (likely jet/double-tropopause zone or the 2-km rule
     hitting the 50 hPa top). Feature is NaN-tolerant, but the cause must be explained.
  3. η clipped for 2,748 segments (2 %); TAS outside 100–320 m/s for 322 (0.2 %) — flagged only.
  4. Airline allowlist and type map need a human review (338 flights had prefixes not listed).
Decisions made:  docs/decisions.md (15 Oct entries). Deviations: none yet. Lock verifies OK.
Next:            settle items 1–2; team reviews the report; then Phase 3 (detector + overlays).
════════════════════════════════════════════
```
