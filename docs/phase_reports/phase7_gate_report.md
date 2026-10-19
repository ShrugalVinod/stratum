```
═══ PHASE 7 GATE REPORT — Correction model (H2), decision layer (H3, H4) — 19 Oct 2026 ═══
Status:          ACCEPTED by Shrugal Vinod, 19 Oct 2026 (chat: "consider phase 7 as accepted
                 from my side if everything works … finish full phase 7"), with the findings below.
Calendar:        far ahead (plan: Phase 7 done by ~7 Apr 2027; team goal 10 Dec 2026)
Code:            main ≥ 47853ea; 257 Python tests; ruff + mypy --strict clean; lock verifies
                 (Q5 newly settled; deviations D-001 … D-004; no new deviation in Phase 7).

Done-when checklist (build prompt §7.8):
  [x] Monotonicity property tests pass (Hypothesis; tests/model/test_model.py) and 0 wrong-way
      rows on real training rows in all 6 folds (07a). SHAP importance and dependence plots
      produced (Drive reports/phase7_validation/).
  [✗] Calibration improved on validation: NOT met. Cross-fitted isotonic calibration made the
      leave-one-day-out Brier slightly worse in all 6 folds and lowered AUROC (ties). Reported as
      a result; the calibrated model is still the pre-registered STRATUM forecast.
  [x] H2 final run logged (20261018T140654Z_7559cda) with verdict and CIs.
  [x] (a) vs (b) recorded with validation numbers: (b), both in the literal form (07a) and with
      detection efficiency (07c, binding): Brier (a) 0.00449 vs (b) 0.00450.
  [x] Ranked avoidance lists for every held-out day (Drive interim/decisions/*/table3.csv); alert
      counts; fuel/CO₂ sums; H3 and H4 verdicts (final run 20261019T034442Z_5f31ccd).
  [x] Evaluation report v2 (H2–H4, validation, feedback choice, decisions, model card, H3 curve,
      descriptive B1/B3 context) — Drive reports/evaluation_report_v2/.
  [x] Phase Gate Report: this file.

Results (final runs; 95 % day-bootstrap intervals):
  H2  mean BSS of STRATUM vs B3 over held-out seasons 0.86 [0.82, 0.91] → SUPPORTED.
      Caveat: a constant training-rate forecast (RATE) also scores 0.86 vs B3; STRATUM vs RATE
      −0.19 [−1.07, −0.08] (better by 0.3–1.1 % in three seasons, much worse in the monsoon).
      Ranking: AUROC 0.65–0.83 by season vs 0.42–0.66 for B1–B3; the RHi-only logistic 0.78–0.80;
      STRATUM vs that logistic +0.05 [0.02, 0.10].
  H3  share of cruise distance carrying 80 % of positive corrected EF 0.0044 % [0.0008, 0.012 %]
      → SUPPORTED, partly for an artificial reason (below). Context (descriptive): B1 0.48 %
      [0.30, 0.72], B3 0.54 % [0.35, 0.80] — concentration is real and robust.
  H4  night EF share − night distance share 0.36 [−0.03, 0.45] → NOT SUPPORTED (only 1,583 warming
      segments). Context: B1 0.24 [0.21, 0.31], B3 0.27 [0.23, 0.33] — the night excess is clear
      with standard physics.
  Decisions (corrected physics): 402 flagged portions, 333 alerts (207 without fuel credit; 259
      on 2026-02-01); extra fuel −12.0 t (OpenAP finds higher levels cheaper); net warming avoided
      578 t CO₂e at 100 yr (median; 5th pct 240 t), 2,025 t at 20 yr; 359 well covered, 43
      extrapolating.

Key finding about the method:
  The humidity correction fed back into CoCiP sits at its 1.20 bound in every band, with and
  without detection efficiency. Its fitted curve implies ≈ 3 % persistent segments (like raw ERA5),
  but the pre-registered single divisor drops the curve's spread, so the corrected physics forms
  persistent contrails only where ERA5 RHi ≥ 1.2: 1,583 warming segments instead of ~91,000. H3/H4
  as logged rest on that; the B1/B3 context runs (Team OK, post hoc) show what standard physics says.

What was built:   see docs/progress.md (18–19 Oct) and docs/decisions.md (Phase 7 entries).
Colab runs:       07a train (f7ebdbc, 59 min) · 07b H2 final (7559cda, 5.6 min) · 07c correction +
                  corrected CoCiP + H3/H4 final (5f31ccd, 35 min) · 07d decisions + report v2
                  (d71871d, 66 min) · 07e context B1/B3 + report v2 (cf0b75b, 23 min). All exit 0.
Decisions made:   docs/decisions.md (18–19 Oct): Q5; model choices; decision-layer choices; Option 2
                  (detection efficiency); 07a review and RATE reference; H2; H3/H4 diagnosis; 07e
                  Team OK; results.
Deviations:       none new.
Fixed after runs: report wording/format only (H3 shares, H2 paragraph, decision table); lock
                  wait instead of skip for corrected/context CoCiP (07e first attempt).
Risks / limits:   12 flight days; noisy, detection-limited labels; calibration did not help; the
                  feedback step is too blunt; alerts concentrate on one day and partly ride on fuel
                  savings; ATC feasibility not modelled.
Next phase:       Phase 8 — web app v1 (model switcher, results page with H1–H4 cards, segment
                  cards), expo build, model card, open release.
═════════════════════════════════════════════════════
```
