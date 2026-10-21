# Deviations from the pre-registration

Every change to a locked value in `configs/preregistered.yaml`, or to a **settled** answer in
`configs/preregistered_open_questions.md`, must be listed here **with the team's OK** before
results that depend on it are produced. `stratum verify-lock` reads this file. Use exactly
this format (one `##` heading per deviation; `Keys:` lists the dotted key paths, or
`open_questions.Q<n>`):

```
## D-001 — 2026-11-02 — short title
- Keys: matching.max_distance_px
- Reason: why the change is needed
- Results seen before the change: no | yes (which)
- Team OK: Name, date (where: chat / meeting)
```

Final runs are never deleted. If a bug is found after a final run, fix it, rerun, and report
both runs (build prompt §6.8).

---

*Pre-registration locked 2026-10-13 (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e).*

## D-001 — 2026-10-15 — CoCiP Monte Carlo members N = 20 → 100
- Keys: open_questions.Q12
- Reason: Q12 (settled 15 Oct) set N = 20 and required a convergence check, with a larger N adopted
  only through this log before any evaluation run. The check on 2026-01-01 (B1, N = 20 vs 40)
  changed the summed EF percentiles by p50 1.5 %, p95 7.1 % and **p05 27.8 %**. p05 is the lower
  bound on which the decision layer ranks alternatives, so N = 20 is not stable enough. N = 100
  (with a 100 vs 200 check) is adopted for all CoCiP runs. Cost is Colab time only.
- Results seen before the change: no hypothesis outcomes. Only the Phase 2 development-month
  physics run (EF percentiles, convergence numbers) had been seen; no labels, detections, matches
  or model scores exist.
- Team OK: Shrugal Vinod, 2026-10-15 (chat: "approved n = 100")

## D-002 — 2026-10-17 — Detector tuned on expert-labelled SEVIRI scenes; team labels only the India held-out half
- Keys: detection.labelled_scenes, detection.labelled_split, detection.detector_tuning, detection.labeller_calibration
- Reason: the team are not contrail experts, and the detector's confidence weights and
  threshold would otherwise be fitted on their own labels. A published expert dataset now exists
  for the same instrument: DLR's manually labelled MSG/SEVIRI contrail dataset (Santos Gabriel et
  al. 2026, ESSD 18, 2397–2412; 140 scenes of 256 × 256 px, three expert labellers, majority
  ground truth; CC BY-NC 4.0, used non-commercially with attribution). Change: (1) the detector
  is fitted on the dataset's training scenes and checked on its evaluation scenes; (2) the team
  labels only the 100 India held-out scenes already drawn with seed 20261017 (each by 2 of 3
  labellers, so `labellers_per_scene: 2` is unchanged), and the final detector precision/recall
  over India is reported on them; (3) each labeller first labels 20 expert scenes, and their
  accuracy against the experts is reported. India validation is kept, because the expert scenes
  cover Europe and the North Atlantic, not India. The 100 India "tuning" scenes are no longer
  labelled. The 20-scene India pilot is unchanged.
- Results seen before the change: no. No scene had been labelled; no detector score, match or
  model result exists. Only the sampling summary (counts per stratum) had been seen.
- Team OK: Shrugal Vinod, 2026-10-17 (chat: "B, Team OK")

## D-003 — 2026-10-17 — India labels: Claude drafts, one team member reviews; expert data is the primary detector check
- Keys: detection.pilot_scenes, detection.labellers_per_scene, detection.labeller_calibration, detection.india_labels
- Reason: the team tried the 20-scene India pilot and could not find contrails in the images.
  A check confirmed this is the data, not the app: the images decode correctly, and the
  detector's best score per pilot scene (median 0.30) matches the expert scenes *without*
  contrails (0.31), not those with them (0.61). Tropical India has few contrail outbreaks and a
  busy clear-sky BTD background, so from-scratch labelling by non-experts would be slow and
  unreliable. No public labelled contrail dataset exists for India, INSAT, Himawari or FY-4
  (searched 17 Oct 2026; closest: the DLR SEVIRI set already used, and US GOES-16
  OpenContrails). Change: (1) the detector's accuracy is reported primarily on the DLR expert
  evaluation split (89 scenes), also for its tropical (< 30°N) and Indian-Ocean-view scenes;
  (2) the 100 India held-out scenes get AI-assisted labels: Claude draws draft lines (BTD at
  t ± 15 min with contrast enhancement; each hand-placed line traced to the local BTD ridge;
  no detector output, flight tracks or predictions used), and one team member reviews and
  corrects every scene in the labelling app's Review mode (k mod 3 over sorted scene ids:
  34/33/33); (3) India precision/recall from these labels is secondary and exploratory, reported
  separately, never pooled with the expert result; (4) no India pilot and no labeller
  calibration round. Labelling rules (min length 10 px, scene status, uncertain lines scored
  separately, blind to tracks and predictions) are unchanged.
- Limitation stated up front: reviewers see the drafts, so their labels are not independent of
  Claude's; the number of draft lines kept, deleted and added is reported.
- Results seen before the change: the DLR tuning result (D-002); the detector's object counts
  and best scores on the 20 *pilot* scenes (not the test scenes); Claude looked at the pilot and
  test images (drafting the test labels is the change itself). No detector result on the test
  scenes, no match or segment label, no model or hypothesis result.
- Team OK: Shrugal Vinod, 2026-10-17 (chat: "Merge 1st option and 2nd and then do it")

## D-004 — 2026-10-18 — A segment counts as "observed" only if matched in ≥ 2 observable images
- Keys: matching.segment_label_rule.observed_if, matching.segment_label_rule.min_matched_slots
- Reason: the wrong-day null (each day's flights matched against another day's images, where
  every match is coincidence) gave a chance y = 1 rate of 0.76 % against 1.27 % for the real
  flights: about 60 % of single-image matches are expected by chance, mostly cirrus streaks that
  happen to line up with a flight path. A real contrail drifts with the wind and stays lined up
  in the next image; a chance line rarely does. Colab 05e: requiring ≥ 2 matched observable
  images lowers the chance share to 33 % (≥ 3: 24 %) and leaves an estimated ≈ 1,050 truly
  observed segments (≥ 3: ≈ 620, likely below the 300-contrail minimum). Change: y = 1 needs
  ≥ 2 matched observable images in the 20–120 min window; y = 0 is unchanged (≥ 2 observable
  images, no match); a segment with exactly 1 observable match becomes missing. The original
  rule (any 1 image) is reported as a sensitivity analysis, and the ≥ 300 check is re-run on
  the new labels.
- Results seen before the change: 05d label counts and the ≥ 300 check (passed: 1,222 events),
  the wrong-day null and parallax summaries (Phase 5 data-quality checks), and the 05e
  diagnostics above. No correction model, baseline, hypothesis test or H1–H4 result exists.
- Team OK: Shrugal Vinod, 2026-10-18 (chat: "D-004 Team OK")

## D-005 — 2026-10-21 — A learned contrail detector, as a disclosed second analysis
- Keys: none of the pre-registered values change. New: `stratum/detect/nn*.py`,
  `colab/09a_detector_data.ipynb`, `colab/09b_detector_train_eval.ipynb`.
- Reason: the pre-registered line-filter detector is weak. On the DLR expert evaluation scenes
  it finds about a quarter of the contrails (precision 0.22, recall 0.23, F1 0.22; reproduced
  exactly by the new evaluation code on 21 Oct). Every satellite label, and so every H1/H2
  number, inherits that weakness.
- Change: a small U-Net, pre-trained on OpenContrails (Google Research, GOES-16, CC BY 4.0) and
  fine-tuned on the 51 DLR training scenes only. Its probabilities replace the line-filter
  response inside the existing detector; objects, matching, labels and scoring are unchanged.
  Settings are chosen by 5-fold out-of-fold F1 on the training scenes; the 89 evaluation scenes
  are scored **once**, old and new side by side, logged in `_locks/detector_runs.jsonl`.
- What never changes: the logged final runs (H1–H4) and their numbers. If the new detector is
  better, the year is re-labelled with it and H1/H2 are recomputed as a **descriptive second
  analysis**, shown next to the logged results and labelled as such.
- Results seen before the change: all of Phases 0–8 (H1–H4 logged 18–19 Oct). This is a
  post-hoc analysis and is reported as one.
- Team OK: _pending_
