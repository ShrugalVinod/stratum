```
═══ PHASE 6 GATE REPORT — Evaluation harness, baselines B0–B4, H1 — 18 Oct 2026 ═══
Status:          ACCEPTED by Shrugal Vinod, 18 Oct 2026 (chat: "phase 6 is accepted"), with H1
                 reported as NOT SUPPORTED and the website update approved.
Calendar:        far ahead (plan: Phases 5 + 6 done by 28 Feb 2027; done 18 Oct 2026)
Code:            final run at commit 4a82cfa (clean tree); 234 Python tests pass; ruff clean;
                 pre-registration lock verifies (differences all covered by D-001 … D-004).

Done-when checklist (build prompt §6.9):
  [x] Split leakage tests pass (seasonal: no flight or satellite image on both sides; spatial:
      each flight on one side; a planted shared image is detected). Metrics tests pass
      (scikit-learn Brier/AUROC, hand-computed POD/FAR/CSI); bootstrap tests pass (95 % CI
      coverage ≈ 95 % in 200 simulations; paired skill; fold-mean).
      (tests/evaluate/test_splits_h1.py, test_metrics_bootstrap.py, test_harness_e2e.py)
  [x] B0–B3 scored with 95 % day-bootstrap CIs on every held-out season, winter without
      January 2026, and both spatial directions; CoCiP-B1 reported as a variant. B4 is a
      documented skip (Wolf et al. 2025 coefficients are for the North Atlantic/Europe).
  [x] H1 final run logged: _locks/final_runs.jsonl (run 20261018T113902Z_4a82cfa, final,
      dirty false, results sha256 6cc21be9…af46e; repo copy matches Drive). H1 paragraph
      drafted (reports/20261018T113902Z_4a82cfa/h1_paragraph.md; paper version with one
      wording fix in docs/paper/h1_result_draft.md). It states the outcome plainly.
  [x] Evaluation report v1 delivered: Drive STRATUM/reports/20261018T113902Z_4a82cfa/
      (evaluation_report_v1.html + .md, reliability.png, results.json, h1_paragraph.md).
  [x] Phase Gate Report: this file.

H1 (pre-registered: supported iff the whole 95 % CI of B1-predicted / observed is < 1):
  PRIMARY (raw detectable, Q1): 334,211 observable labelled segments, 12 days.
    B1 predicted 10,076 persistent contrails; Meteosat-9 observed 1,564.
    Ratio 6.44, 95 % CI 4.92–12.12  →  H1 NOT SUPPORTED.
    The interval lies entirely above 1: uncorrected ERA5 physics predicts about 6× MORE
    persistent contrails than the satellite sees — the opposite of the hypothesis.
  SECONDARY (efficiency-adjusted, Q1/Q4; does not decide H1): detection efficiency 0.163
    (16 % of 10,036 CoCiP-persistent segments are thick and wide enough to see, Driver
    et al. thresholds) → ratio 1.05, 95 % CI 0.81–1.91. Once detectability is allowed for,
    physics and satellite roughly agree. Caveat: the efficiency comes from CoCiP itself.
  Same verdict under every sensitivity variant (ratio, 95 % CI):
    label rule 1 image 2.42 (1.83–4.10) · 3 images 12.31 (8.99–26.57)
    age window 20–90 min 6.61 (4.92–13.37) · 40–120 min 7.59 (5.61–15.28)
    distance 1.5 px 8.60 (6.53–16.77) · 3 px 4.12 (3.18–7.38)
    angle 15° 7.50 (5.68–15.00) · 30° 4.92 (3.79–8.72)
    without January 2026 6.52 (4.95–14.05)
  Breakdowns (descriptive): winter 5.85 · pre-monsoon 4.83 · post-monsoon 6.80 · monsoon
    937 (1 observed contrail); west of 80°E 5.38 vs east 10.24 (east is seen at higher
    viewing angle); night 5.21 vs day 8.40; FL340–379 6.01, ≥ FL380 6.57.
  Chance labels (Phase 5 wrong-day check, ~33 % of y = 1) inflate the observed count, so
    the true raw ratio is, if anything, higher than 6.44.

Primary metric (pre-registered): Brier skill score vs B3, mean over the 4 held-out seasons
    B0 climatology   +0.45 [−0.08, +0.58]
    B1 raw ERA5      −0.23 [−0.27, −0.20]
    B2 RHi / 0.95    −1.04 [−1.17, −0.85]
    B3 latitude corr  0     (reference)
    CoCiP-B1         −0.74 [−0.88, −0.48]
  Reading: among the physics baselines B3 is best and every extra source of humidity
    (B2) or contrail (CoCiP) makes the Brier score worse, because ~97 % of their "yes"
    forecasts are not seen (FAR 0.96–1.00 in every fold). B0 wins on Brier only because
    it forecasts small probabilities (POD 0 at the 0.5 cut) on a 0.47 % base rate; it
    cannot rank segments (AUROC 0.44–0.69, below 0.5 in winter and pre-monsoon). Physics
    ranks a little better than chance outside the monsoon (AUROC 0.54–0.67; CoCiP-B1
    highest, 0.59–0.67).
  Spatial split (B0 from all months): train west → test east BSS: B0 +0.58, B1 −0.20,
    B2 −0.95, CoCiP −0.96; reverse: B0 +0.64, B1 −0.18, B2 −0.90, CoCiP −0.89.
    19,162 segments dropped each way (their flight sits mostly on the other side).

Data in the final run: 334,211 labelled segments (D-004 rule), 1,564 y = 1, 12 days.
    winter 205,610 / 1,135 · pre-monsoon 90,201 / 207 · post-monsoon 28,597 / 221 ·
    monsoon 9,803 / 1.

Limits the team must read before accepting:
  1. Few days per season. The day bootstrap resamples 2–4 days per held-out season
     (post-monsoon and winter-without-January have 2 days: only 3 distinct resamples).
     Per-season intervals are therefore rough and probably too narrow; the 12-day H1
     interval is the most trustworthy number. Cause: 12 free ADS-B days (pre-registered
     design). The 2/5 Nov coverage audit (adsb.lol) is the route to more days.
  2. Monsoon is untestable: 1 observed contrail in 4 days; its fold scores reflect
     cloud, not physics.
  3. Label noise as in Phase 5 (~33 % chance y = 1; detector recall ≈ 1 in 4 on expert
     scenes). The secondary ratio depends on CoCiP's own optical depth and width.
  4. The primary metric (BSS vs B3) rewards low probabilities on rare events. A Phase 7
     model that outputs calibrated probabilities will beat B3 easily; the fair bar is
     also B0. Recommend Phase 7 reports BSS vs B0 next to the pre-registered BSS vs B3
     (descriptive, no deviation needed).

Colab runs:      06a (domain CoCiP 12 days; climatology crashed → fixed in 4a82cfa)
                 06a2 4a82cfa: 12 climatology months, 4 tolerance variants × 12 days ✓
                 06b 4a82cfa: final run, exit 0, 6.0 min ✓ (the only final run)
Storage:         not re-measured; Phase 6 adds 12 climatology files, 12 domain CoCiP days
                 and 48 sensitivity match days (well inside the Drive quota).
Decisions:       docs/decisions.md (18 Oct): Phase 6 harness choices; sensitivity analyses;
                 final run result.
Deviations:      none new in Phase 6. No peek runs (_locks/peek_runs.jsonl absent).
Fixed after the final run (wording only, no result changes): the auto paragraph says "no
                 labels for June–October"; October has 39 and November 182 y = 1, so the
                 code and paper draft now say June–September.
Open questions:  H1 reported as not supported (accepted 18 Oct). Website updated 18 Oct
                   (H1 card result, ticker, diary entry with the limits).
                 Q5 settled 18 Oct 2026 (option A; see the Phase 7 gate report).
Risks:           Phase 7 (H2) uses the same 12 days and noisy labels; power is low. More
                 ADS-B days would help most.
Next phase:      Phase 7 — correction model (H2), avoidance layer (H3, H4).
                 First: settle Q5; coverage audit 2/5 Nov; build B5 on the same harness.
                 What I need from you first: "Phase 6 is accepted" and Q5.
═════════════════════════════════════════════════════
```
