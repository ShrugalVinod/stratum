```
═══ PHASE 6 GATE REPORT — Evaluation harness, baselines B0–B4, H1 — DRAFT (18 Oct 2026) ═══
Status:          DRAFT. Results are filled in after the one final run (Colab 06b).
Code:            harness complete; 233 Python tests; lock verifies (D-001 … D-004).

Done-when checklist (build prompt §6.9):
  [x] Split leakage tests pass (seasonal: no flight or satellite image on both sides; spatial:
      each flight on one side; a planted shared image is detected). Metrics tests pass
      (scikit-learn Brier/AUROC, hand-computed POD/FAR/CSI); bootstrap tests pass (95 % CI
      coverage ≈ 95 % in 200 simulations; paired skill; fold-mean).
  [ ] B0–B3 scored with CIs on every held-out season and the spatial split; B4 documented skip
      (Wolf et al. 2025 coefficients are for the North Atlantic/Europe).       → 06b
  [ ] H1 final run logged (_locks/final_runs.jsonl); H1 paragraph drafted automatically
      (reports/<run_id>/h1_paragraph.md), stating the outcome plainly.          → 06b
  [ ] Evaluation report v1 delivered (reports/<run_id>/evaluation_report_v1.html/.md).  → 06b
  [~] Phase Gate Report: this draft.

Inputs (Colab 06a, 06a2):
  B0 climatology grids, 12 months ........................................... → 06a
  CoCiP B1 over the whole domain, 12 days (detectability, CoCiP variant) ...... → 06a
  Matching-tolerance variants (1.5 / 3 px, 15° / 30°) ......................... → 06a2

Results (fill from the 06b summary):
  Primary metric (BSS vs B3, mean over held-out seasons): B0 …, B1 …, B2 …
  H1: ratio … (95 % CI …–…) → supported / not supported
  H1 secondary (efficiency-adjusted): …
  Sensitivity (label rule, age window, tolerances, without Jan 2026): …

Known limits carried from Phase 5: ~33 % chance labels; no monsoon labels; 12 flight days;
  India detector precision ~4 % (D-003, exploratory).
Decisions:       docs/decisions.md (18 Oct, Phase 6 harness choices).
Deviations:      none new in Phase 6 so far.
═════════════════════════════════════════════════════
```
