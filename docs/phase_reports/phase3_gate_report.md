```
═══ PHASE 3 GATE REPORT — Satellite contrail detector and overlays — DRAFT 15 Oct 2026 ═══
Status:          DRAFT — figures approved and CNN skipped (S. Vinod, 15 Oct); waiting for the
                 time-lapse check and "Phase 3 is accepted"
Calendar:        ahead (Phase 3 window in the team plan is after Phase 2, 20 Dec)

Done-when checklist:
  [x] Detector tests pass (7 detector, 3 overlay, 5 parallax; 140 in the suite). It ran on
      the 3 January 2026 satellite days (1, 13, 14 Jan; 104 slots each); per-day object counts
      and confidence histograms are below.
  [~] Figures approved by the team (15 Oct): Arabian Sea showcase + overlay_1300 (and the
      other overlays as candidates); time-lapse check pending.
  [x] Detector parameters documented with reasons (configs/pipeline.yaml → detector;
      docs/decisions.md, 15 Oct entries).
  [ ] Phase Gate Report — this draft.

Detector (classical, provisional confidence; build prompt §3.1):
  Synthetic: recall 100 % at SNR ≥ 2 (97 % at 1.5); 0 false objects in 30 noise-only scenes;
  cirrus-like blob and line along a cloud edge rejected. Speed ≈ 1 s/slot locally,
  ≈ 6–7 min per 104-slot day on Colab (mostly Drive reads).
                 objects   ≥ 0.5 conf   median/slot   median length
     2026-01-01   24,061      9,871         229          55 km
     2026-01-13   12,124      4,710         116          56 km
     2026-01-14   11,449      4,472         110          55 km
  Visual check (team screenshots, 15 Oct): clean contrails are found, e.g. the two long
  Arabian Sea contrails at 2026-01-15 00:00 UTC, tracked across consecutive slots. Known
  limitation: in cluttered daytime land scenes, many detections follow streaky cirrus and
  cloud bands. Separating these is the job of the Phase 5 labels (confidence refit on the
  tuning half), not more hand tuning on unlabelled data.

Overlays (1 Jan 2026, the only January day with flights; CoCiP B1, 6 flights):
  56 of 104 slots have predicted contrail points visible in clear sky. Top times
  06:00, 13:00, 15:00 UTC → overlay_0600/1300/1500.png + timelapse.mp4/.gif (4 h).
  Finding: in all three, NO predicted contrail coincides with a detected line. The
  predictions lie in cluttered, partly cloudy areas south of 15°N. Possible causes:
  optically thin contrails, masking by other cloud, ERA5 humidity errors. No scoring in
  Phase 3. The figures stay labelled "illustration, not a result" and must never be
  described as a match.
  Showcase (detector only, no flights): 4 figures for 13/14 Jan. Recommended for the video:
  2026-01-15 00:00 UTC (Arabian Sea pair). Not recommended: 13 Jan 05:15 and 09:45, 14 Jan
  13:45 (ambiguous cirrus streaks).

Geometry: parallax correction checked against independent satellite scan-angle geometry
  (1e-5°); shift at 11 km ≈ 10 km Mumbai, 12 km Delhi, 16 km Kolkata.

Deviation from the build-prompt wording (not pre-registered): §3.3 asks for 3 January days
  with flagged segments. Only 1 Jan has flights, so the overlays come from 3 times on 1 Jan
  (docs/decisions.md). 13/14 Jan flights would need OpenSky or adsb.lol (to be assessed at
  the 2/5 Nov coverage audit).

Team decisions needed:
  1. Approve the figures for brief/video/website. Proposed: Arabian Sea showcase
     (2026-01-15 00:00) + overlay_1300 ("physics alone is not enough") + timelapse.mp4.
  2. Optional CNN detector (§3.4): SKIPPED for now (team, 15 Oct). It is not part of the
     pre-registered method; OpenContrails (GOES-16) needs fine-tuning on our Phase 5 labels.
     Revisit after Phase 5 as an exploratory comparison only.
Decisions made:  docs/decisions.md (15 Oct). Deviations: none new. Lock verifies OK.
Next:            team approves → "Phase 3 is accepted" → Phase 4 (web app v0, due 18 Dec).
════════════════════════════════════════════
```
