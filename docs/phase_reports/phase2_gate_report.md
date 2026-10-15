```
═══ PHASE 2 GATE REPORT — Physics baseline (B1–B3), Delhi–Mumbai corridor, Jan 2026 — 15 Oct 2026 ═══
Status:          ACCEPTED by Shrugal Vinod, 15 Oct 2026 (chat: "ok p05 phase 2 accepted")
                 Final Colab run 15 Oct, commit 3a208d3, N = 100, 79 min
Calendar:        ahead (Phase 2 window 23 Nov – 20 Dec in the team plan)

Done-when checklist:
  [x] Trajectory tests pass; each cleaning step's removals logged (manifest "steps").
  [x] Every corridor segment of the development month has met features, SAC/ISSR flags and CoCiP
      outputs for B1, B2, B3 (N = 100 Monte Carlo members each). Development month = the one free
      ADS-B day, 2026-01-01.
  [x] Sanity report (reports/phase2_sanity/2026-01/report.md) — no plausibility flags; every open
      item explained below.
  [x] Full-year run possible with one command per month (build-segments / run-cocip --month).
      Colab time per day: segments ≈ 10 min, each scaling ≈ 12 min (N = 100) → ≈ 50 min/day,
      ≈ 10 h for the 12 flight days (resumable per day).
  [x] Phase Gate Report — this file.

Key numbers (2026-01-01, real ERA5):
  ADS-B reports in 3,952,642 → 7,563 flights → 7,281 with cruise ≥ FL250 → 8,750 pieces
  → 347,947 one-minute segments. Corridor sample: 1,706 flights (1,458 commercial), 131,661
  segments (28,309 inside the polygon); met found for all (0 out of domain); tropopause found
  for all (0 missing, was 10 % before the profile-top fix).
  Removed: step 3 implausibility 574 / 308 / 261 points (passes 1–3); step 4 below FL250 285,116.
  Types: 1,582 OpenSky DB, 120 ADS-B field, 4 none; 16 DB/ADS-B disagreements; 80 OpenAP synonyms,
  18 via type map, 26 unmapped (business jets/turboprops: F2TH, GLEX, E35L, CL60 …).
  QC: η clipped 2,748 segments (2.1 %); TAS outside 100–320 m/s 322 (0.2 %, flagged only).
  SAC forms 11.6 % (corridor flights); persists_raw (SAC ∧ RHi ≥ 1) 0.10 % — a dry winter day.
  CoCiP (central run identical to the N = 20 run → reproducible):
                 contrail waypoints   positive EF     negative EF     net EF
     B1                 77            1.30e14 J      −1.78e13 J      1.12e14 J
     B2                101            2.42e14 J      −2.71e13 J      2.15e14 J
     B3                 71            2.10e14 J      −2.58e13 J      1.84e14 J
  All from 6 flights; none reached the met-box edge. Persistence only south of ~15°N at
  FL350–450, not on the northern corridor. B2 > B3 > B1 in EF, as expected from the scalings.
  Plausibility flags: none.

Monte Carlo convergence (B1, nested members, 73 segments with EF):
                 N = 20 vs 40     N = 100 vs 200
     p50            1.5 %             0.9 %       ✓ stable
     p95            7.1 %             5.6 %       ✓ stable
     p05           27.8 %            49.7 %       ✗ not stable — and NOT shrinking with N
  Interpretation: with plain Monte Carlo noise the p05 change should fall by ≈ √5 ≈ 2.2× from
  N = 20 to N = 100; it rose instead. The summed p05 (1.1–1.7e13 J) is only 10–15 % of the
  p50 sum (1.08e14 J): for most segments only some members make a persistent contrail, so the
  5th percentile sits at the edge of a pile of EF = 0 (or slightly negative) members and jumps
  when a few members switch. Larger N will not fix this (N = 1000 would cost ≈ 60 h of Colab
  for the 12 days). Measured on the p50 scale, the p05 change is 5.1 %.

Decision (Team OK, S. Vinod, 15 Oct 2026 — no locked value changes):
  Keep N = 100 (D-001). Report per-segment p05 with a "lower tail unstable" note. Before Phase 7,
  the team settles how the decision layer's lower bound is computed (e.g. probability of a
  persistent contrail across members × conditional EF percentiles, instead of raw p05).
  Logged in docs/decisions.md.

Other notes:
  • This run used the draft airline allowlist (338 flights not listed). The reviewed list
    (commit 78b7177, all 191 prefixes categorised) applies from the next run and in the Phase 4
    export; it affects only what may be shown publicly, not the physics.
  • Very few persistent contrails in January (0.07–0.09 % of waypoints). Winter will add little
    to the ≥ 300 matched-contrail target; the monsoon/post-monsoon days will matter more.
Decisions made:  docs/decisions.md (15 Oct). Deviations: D-001 (N = 100). Lock verifies OK.
Next:            team accepts Phase 2 ("Phase 2 is accepted") → Phase 3 (detector + overlays).
════════════════════════════════════════════
```
