```
═══ PHASE 8 GATE REPORT — Web app v1, expo build, open release — 19 Oct 2026 (draft) ═══
Status:          OPEN. Everything Claude can do is built and tested; the items marked [team]
                 need a person (decisions, photos, a fresh-Colab test, the booth laptop).
Calendar:        far ahead (plan: Phase 8 by the Summit, 21–24 Apr 2027)
Code:            main ≥ 8ad5698; ruff + mypy --strict clean; Python tests pass (slow ones
                 included: web export end to end, finish-only, release bundle); lock verifies.
                 No new deviation in Phase 8.

Done-when checklist (build prompt §8.5):
  [~] v1 live: model switcher (B1 / B3 / STRATUM, default STRATUM), STRATUM probability,
      uncertainty and satellite-coverage views, flights coloured by alert, ranked lists per model
      with airline / direction / night / alerts / confidence filters and CSV, segment cards with
      every Table-3 field, alternatives and the RHi profile chart, /results with H1–H4, Methods
      with SHAP, model card, threats, deviations and what didn't work. Built on data export
      v1-d126083 (42 days: 12 held-out flight days + January 2026). Live once 08a finish-only
      has written results.json + manifest.json (the export stopped on the per-day size check;
      fixed in cff7208).
      Playwright: new tests for /results and booth mode. Lighthouse: run after deploy.
  [~] Expo build: `npm run build:expo` / `make expo` → web/expo-build/ with start-expo.command,
      .bat and .sh (local server, no internet calls at runtime), service worker, booth mode
      (?booth=1: tours map → top alert and its card → B1 for contrast → results → threats;
      pauses on any touch, resumes after 60 s). docs/expo_checklist.md written.
      [team] test on the booth laptop with Wi-Fi off; tick the checklist.
  [~] Release: `stratum release-bundle` (colab/08b) — commercial flights only, salted-hash ids,
      positions rounded to 0.25°, labellers pseudonymised, no raw ADS-B / ERA5 / Meteosat data;
      `make reproduce-figures` redraws every results figure from results.json alone;
      CITATION.cff; docs/data_card.md; README "reproduce" path (three levels).
      [team] licence choice (suggested CC BY 4.0 for our derived data; DLR-derived parts stay
      CC BY-NC 4.0), no EUMETSAT scene packages (numerical data may not be redistributed),
      position resolution in the release, DOI timing (Zenodo; permanent — needs the team's OK),
      a team member runs the README path in a fresh Colab.
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
     minutes instead of re-running 49 minutes.

Still open outside Phase 8: the November ADS-B coverage audit (2 and 5 Nov 2026); team photos
for the Team page (real photos only, location metadata stripped); India boundary confirmation
with Dr. Pant; 07f report refresh; the demo recording.
```
