```
═══ PHASE 5 GATE REPORT — Labels, matching and observability — 18 Oct 2026 ═══
Status:          ACCEPTED by Shrugal Vinod, 18 Oct 2026 (chat: "Phase 5 is accepted"),
                 with the risks and open items below. Phase 6 starts when the team says so.
Calendar:        ahead (plan: Phase 5 20 Oct–10 Nov; done 18 Oct)
Code:            commit 0a89831; 214 Python tests + labeller (Vitest 11, Playwright 2) pass;
                 CI green; pre-registration lock verifies (deviations D-001 … D-004).

Done-when checklist (build prompt §5.8), as changed by deviations D-002/D-003/D-004:
  [~] Labels. Original: 20-scene pilot, 200 scenes double-labelled, agreement with CIs,
      adjudicated set. Changed (D-002, D-003, Team OK): no from-scratch labelling. The
      20-scene pilot showed the team could not find contrails (detector best score per
      scene matches the experts' no-contrail scenes). The 100 India held-out scenes got
      Claude drafts reviewed by one team member each (Aditya 34, Ishaan 33, Abeer 33).
      Result: 15 draft lines → 10 kept, 5 moved, 0 deleted; 21 added; 36 lines (10 sure,
      26 uncertain) in 16 scenes. Status after guide v0.1.2: 32 clear, 59 partly obscured,
      9 obscured. Inter-labeller κ / F1: not applicable (one reviewer per scene; stated).
  [x] Detector precision/recall, threshold chosen on tuning data only (D-002):
        DLR expert evaluation (89 scenes, PRIMARY): P 0.22 [0.17, 0.27], R 0.23 [0.18,
        0.29], F1 0.22 [0.18, 0.26]; tropical scenes F1 0.32 [0.18, 0.42].
        India reviewed labels (91 scored scenes, SECONDARY, exploratory, D-003):
          sure + uncertain: P 0.044 [0.020, 0.071], R 0.33 [0.21, 0.51], F1 0.078
          sure only:        P 0.015 [0.003, 0.030], R 0.40 [0.17, 0.60]
        → over India the detector finds 273 objects in 91 scenes; about 1 in 20 is a
          labelled contrail. Recall (≈ 1 in 3) is similar to the expert data.
  [x] Segment labels for all 12 flight days on Drive (interim/matches/*), label counts
      (reports/phase5/label_counts.csv), parallax figure (reports/phase5/
      parallax_before_after.png).
  [x] ≥ 300 check (pre-registered, counted as contrail events): PASSED, 421 events.
  [x] Critical tests pass (unobservable is missing not zero; synthetic match vs 3-px
      shift; leakage keys; plus full-day synthetic end-to-end).
  [x] Phase Gate Report: this file.

Segment labels (D-004 rule: y = 1 needs ≥ 2 matched observable images; 20–120 min):
  SAC-forming candidates 680,387 · y = 1 1,564 (421 contrail events, 369 flights)
  · y = 0 332,647 · missing 346,176 (known 49 %).
  By day (y = 1): Feb 827 · Dec 236 · Nov 182 · Mar 155 · Jan 72 · Apr 42 · Oct 39 ·
  May 10 · Sep 1 · Jun–Aug 0. Monsoon days: only 3–5 % of images observable.
  Sensitivity (y = 1 rule): 1 image 4,263 segments / 1,222 events; 2 images 1,564 / 421;
  3 images 809 / 207.

Label quality checks (added, not pre-registered):
  Wrong-day null (flights matched against another day's images; every match is chance):
    chance y = 1 rate 0.154 % vs real 0.468 % → 33 % of y = 1 expected by coincidence
    (1-image rule: 60 %). Signal is real (3× chance) but noisy.
  Parallax: predicted points within 2 px of a detected object 0.729 % with correction vs
    0.690 % without (+6 %). Small, because most near-matches are chance lines.
  Detectability (Driver et al., Q4): flag stored per segment on days with a stored CoCiP
    B1 run (Phase 2 corridor runs); missing elsewhere until CoCiP runs for all days.

Deviations (pre-registration), all with Team OK before any model/hypothesis result:
  D-002 detector tuned on DLR expert SEVIRI scenes; team labels India held-out only.
  D-003 India labels = Claude drafts + one team reviewer; secondary; no pilot/calibration.
  D-004 y = 1 needs ≥ 2 matched observable images (chance share 60 % → 33 %).
Decisions:       docs/decisions.md (17–18 Oct): tuning search, matching choices, ≥ 300
                 counted as events, wrong-day null, review results, D-004 bug + fix.
Bugs found and fixed in this phase (before any later step used the data):
  expert-line frame flip (17 Oct); D-004 first run labelled single-match segments y = 0
  (2,608 segments; fixed, LABEL_RULE_VERSION); India check read the export summary file.

Risks for Phase 6 (the team should weigh these before accepting):
  1. Label noise: ~33 % of y = 1 are chance; India detector precision ~4 %. H1 compares
     models on these labels, so both are scored against the same noise, but power drops.
     The wrong-day null rate can be reported next to every H1 number.
  2. Seasonal gap: almost no labels June–October (monsoon cloud). Results speak to winter
     and spring only; say so in the paper and on the website.
  3. Few India contrails in the reviewed set (36 lines): India precision/recall have wide
     ranges and are exploratory only.
  4. 12 flight days only (ADS-B Exchange free samples); coverage audit 2/5 Nov pending.

Open items carried forward:
  a. Coverage audit 2 and 5 Nov (ADS-B Exchange 1 Nov; adsb.lol test).      — Claude
  b. Q5 before Phase 7.                                                        — team
  c. Phase 4 items c, d (recording), f (photos; demo video; India boundary).
     Items a, b, the demo script and e (old site deleted 18 Oct) are done.      — team
Next:            Phase 6 (evaluation harness, baselines B0–B4, H1) after acceptance.
═════════════════════════════════════════════════════
```
