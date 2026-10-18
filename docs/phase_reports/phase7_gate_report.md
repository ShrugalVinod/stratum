```
═══ PHASE 7 GATE REPORT — Correction model (H2), decision layer (H3, H4) — DRAFT (18 Oct 2026) ═══
Status:          DRAFT. Code complete and tested; results come from Colab 07a–07d.
Calendar:        far ahead (plan: Phase 7 done by ~7 Apr 2027; team goal 10 Dec 2026)
Code:            main ≥ bbd9d02; 255 Python tests; ruff + mypy --strict clean; lock verifies
                 (Q5 newly settled; deviations D-001 … D-004).

Done-when checklist (build prompt §7.8):
  [~] Monotonicity property tests pass (Hypothesis: RHi up never lowers, T − T_LM up never
      raises the calibrated prediction; tests/model/test_model.py) ✓; calibration improved on
      validation (cross-fitted isotonic) and SHAP plots → 07a.
  [ ] H2 final run logged, with a clear verdict and CIs.                       → 07b
  [ ] (a) vs (b) decision recorded with the validation numbers.                → 07c step 1
  [ ] Ranked avoidance lists for every held-out day; alert counts; fuel/CO₂ sums; H3 and H4
      verdicts.                                                                 → 07c, 07d
  [ ] Evaluation report v2 (adds H2–H4, model card, decision-layer summary).    → 07d (report-v2)
  [~] Phase Gate Report: this draft.

What was built:
  * Q5 settled: CO₂e = EF × efficacy × factor_H, AR5 AGWP factors 2.497e-9 (20 yr) and
    6.779e-10 (100 yr) kg CO₂ per J, efficacy 0.42 (Monte Carlo 0.42–1.0); code checks itself
    against the locked answer.
  * Correction model (stratum/model/): the 18 pre-registered features; RHi-only logistic
    (sanity); monotone LightGBM tuned by Optuna (50 trials, leave-one-day-out Brier); isotonic
    calibration; one frozen model per held-out season and per side of 80°E (hash-checked).
  * H2 on the Phase 6 harness (stratum/evaluate/h2.py): STRATUM vs B3 (pre-registered), and vs
    B0, the logistic, B1, B2; option (b) and the uncalibrated model beside it.
  * Humidity correction fed back into CoCiP (option b) fitted with detection efficiency
    (Team OK "Option 2"); literal fit reported as sensitivity; bootstrap draws of (s, ε).
  * Decision layer (stratum/decide/): warming persistent contrails flagged by the corrected
    physics; ±2,000/±4,000 ft with ramps, ceiling and FL250 checks; OpenAP fuel at constant Mach;
    cropped, paired 100-member Monte Carlo (humidity + ε, CoCiP parameters, efficacy); net warming
    avoided per horizon; alert only if the 5th percentile > 0 under both; alerts without fuel
    credit and single-horizon counterfactuals stored; Table 3 lists with confidence note.
  * H3 (distance share for 80 % of positive EF, Lorenz curve) and H4 (night EF share − night
    distance share), day bootstrap; final runs logged.
  * Evaluation report v2 with model card, draft H2–H4 paper paragraphs; docs/methods/
    features.md and model_card.md; website Methods page inputs table (not yet deployed).
  * Safety: a second final run of the same hypothesis needs --rerun-reason (both reported).

Key numbers:      → after 07a–07d.
Colab runs:       07a (running) · 07b · 07c · 07d.
Decisions made:   docs/decisions.md (18 Oct): Q5; Phase 7 model choices; decision-layer choices;
                  detection efficiency inside the humidity correction (Option 2).
Deviations:       none new.
Open questions:   none blocking. ⚑ Whether to also run H3/H4 with the literal (ε = 1) correction
                  as a sensitivity (one more 12-day CoCiP run, optional).
Risks:            12 flight days and noisy labels (H2 power low); B3 is a 0/1 forecast, so a
                  calibrated probability beats it on Brier easily (BSS vs B0 reported beside);
                  corrected CoCiP with 24 h lifetimes over the whole domain is the heaviest run
                  so far (resumable per day); decision-layer run time unknown until
                  `decide --estimate`.
Next phase:       Phase 8 (web app v1, expo build, release) after "Phase 7 is accepted".
═════════════════════════════════════════════════════
```
