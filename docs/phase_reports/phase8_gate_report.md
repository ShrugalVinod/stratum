```
═══ PHASE 8 GATE REPORT — Web app v1, expo build, open release — 20 Oct 2026 ═══
Status:          COMPLETE — every done-when item met; awaiting Shrugal's acceptance.
                 Released: v1.0.0, DOI 10.5281/zenodo.23480202 (all versions 10.5281/zenodo.23480201).
Calendar:        far ahead (plan: Phase 8 by the Summit, 21–24 Apr 2027)
Code:            main = v1.0.0 (03d7484) + DOI commit; ruff + mypy --strict clean; Python tests pass (slow ones
                 included: web export end to end, finish-only, release bundle); lock verifies.
                 No new deviation in Phase 8.

Done-when checklist (build prompt §8.5):
  [x] v1 live (https://stratum.aerospaceonyx.workers.dev, data build v1-d126083: 42 days =
      12 held-out flight days + January 2026): model switcher (B1 / B3 / STRATUM, default
      STRATUM), STRATUM probability, uncertainty and satellite-coverage views, flights coloured
      by alert, ranked lists per model with airline / direction / night / alerts / confidence
      filters and CSV, segment cards with every Table-3 field, alternatives and the RHi profile
      chart, /results with H1–H4 from results.json, Methods with SHAP, model card, threats,
      deviations and what didn't work, Data & code.
      Playwright 6/6 (map with STRATUM card + model switcher, every page, phone layout, reload,
      /results, booth mode); CI green. Lighthouse (mobile, live): accessibility, best practices
      and SEO 100 on /, /map, /results, /methods; performance / 97 (after the font preload),
      /map 87, /results 94, /methods 95.
  [x] Expo build: `npm run build:expo` / `make expo` → web/expo-build/ with start-expo.command,
      .bat and .sh (local server, no internet calls at runtime), service worker, booth mode
      (?booth=1: tours map → top alert and its card → B1 for contrast → results → threats;
      pauses on any touch, resumes after 60 s). docs/expo_checklist.md written.
      Checked by Claude: the 72 MB folder served by serve.py with every non-local request
      blocked — all 9 pages load, the map shows 298 candidates and the card, booth mode starts,
      0 external requests, 0 errors.
      Booth test with Wi-Fi off passed on Shrugal's Mac (19 Oct; checklist ticked). Before the
      Summit (not a Phase 8 item): backup laptop, USB sticks, hardware list in the checklist.
  [x] Release: `stratum release-bundle` (colab/08b) — commercial flights only, salted-hash ids,
      positions rounded to 0.25°, labellers pseudonymised, no raw ADS-B / ERA5 / Meteosat data;
      `make reproduce-figures` redraws every results figure from results.json alone;
      CITATION.cff; docs/data_card.md; README "reproduce" path (three levels).
      Decided by the team 19 Oct (decisions.md): CC BY 4.0 for derived data, DLR-derived parts
      CC BY-NC 4.0, no EUMETSAT scene packages, positions at 0.25°, DOI approved for v1.0.0.
      08b run 19 Oct: 312,276 labelled segments from 12,515 commercial flights, 388 avoidance
      candidates, 223 files, 27.9 MB; privacy checks passed. Repository made public after a
      history scan (159 commits: no keys, tokens or salt; no raw data). README tested by a team
      member who did not write the code, in a fresh Colab: level 1 reproduced all 5 figures
      byte-identically. Level 2 (`make rescore` on the release) reproduces the logged runs on
      commercial flights only: H1 6.58 [5.02, 12.4] vs logged 6.44 [4.92, 12.1]; H2 0.860
      [0.825, 0.911] vs logged 0.859 [0.822, 0.909]; same verdicts.
      GitHub release v1.0.0 (stratum-release-1.0.0.zip attached) published 19 Oct after the
      team's OK; Zenodo archived it: DOI 10.5281/zenodo.23480202. DOI added to CITATION.cff,
      README, data card and the website's Data & code section.
  [x] Final gate report with what didn't work: below.

What didn't work, and why (the paper promises this list):
  1. Detector: on expert-labelled scenes it finds about a quarter of the contrails (precision
     0.22, recall 0.23); over India only ~1 in 20 of its lines is a contrail. Thin, short
     contrails at 3 km pixels are hard; we had no budget for a learned detector.
  2. India labels: the team could not label the scenes reliably; AI drafted, the team reviewed
     (disclosed as D-003). The expert DLR split stays the primary accuracy measure.
  3. Chance matches: a wrong-day check says about a third of satellite matches would happen by
     chance even with two images required. Labels are noisy; every score carries that noise.
  4. H1 went the other way: raw physics over-predicts the contrails the satellite sees about
     six times (ratio 6.44 [4.92, 12.12]); most predicted contrails are too thin to be seen.
  5. Calibration (cross-fitted isotonic) did not improve validation Brier in any fold.
  6. H2 passes, but a constant training-rate forecast passes too: the probabilities barely
     beat the base rate. STRATUM is clearly better only at ranking (AUROC 0.65–0.83 vs
     0.42–0.66 for B1–B3).
  7. Feeding the correction into the physics as one humidity factor per latitude band hit its
     1.20 bound in every band and dried the air so much that almost no contrails formed; the H3
     "supported" verdict is partly an artefact of that. Standard-physics context runs are shown
     next to it.
  8. Monsoon: cloud hides contrails almost completely from June to October, so that season is
     untestable with this satellite approach.
  9. Decisions: most alerts fall on one humid day (2026-02-01), and some rest on OpenAP finding
     the higher level cheaper rather than on the contrail (reported as "alerts without fuel
     credit").
 10. Twelve flight days (free ADS-B samples) are too few for tight per-season intervals.
 11. Engineering: the first v1 export stopped on its own 4 MB per-day check after writing all
     42 days (the busiest day was 4.14 MB); a finish-only mode now completes such an export in
     minutes instead of re-running 49 minutes. The real results.json then held NaN for
     undefined numbers (B0's false-alarm ratio; empty H1 breakdown cells), which browsers
     reject; all web JSON is now written strictly with null. Neither showed up on test data.

Still open outside Phase 8: the November ADS-B coverage audit (2 and 5 Nov 2026); team photos
for the Team page (real photos only, location metadata stripped); India boundary confirmation
with Dr. Pant; 07f report refresh; the demo recording.
```
