```
═══ PHASE 1 GATE REPORT — Data access, ingestion and coverage audit — DRAFT 14 Oct 2026 ═══
Status:          DRAFT — waiting for 3 Colab runs + the scheduled-flights CSV (team)
Calendar:        on track (target 22 Nov 2026; ~5 weeks early)

Done-when checklist:
  [~] ERA5 Jan 2026 on Drive ✔ (01a run 1, commit 4e4fa01: 3/3 groups, 744 h, final ERA5,
      0 NaN, 3.5 GB). Full year: RUNNING (01a run 2, started 14 Oct ~12:15 UTC;
      ETA ~20–24 h; CDS processes one request at a time, ~14 min each).
  [~] ADS-B sample days normalised on Drive — RUNNING (01b: 12 free days); aircraft DB
      snapshot 2025-08 stored ✔ (616,648 rows, SHA-256 recorded).
  [~] Meteosat: collection coverage confirmed for all 12 months ✔ (MSG2 = Meteosat-9 in
      every month; reports/phase1/meteosat_iodc_archive_coverage.csv); geolocation verified
      with a figure ✔ (reports/phase1/meteosat/ir108_coast_2026-01-15T0000.png); size
      estimate approved ✔ (Plan A, 14 Oct); bulk plan agreed ✔; 3 Jan 2026 days + 12
      ADS-B days: RUNNING (01c).
  [x] All physics known-answer tests pass (tests/physics/test_sac.py); Figure 1 reproduced
      (reports/figures/fig1_sac.png). CoCiP end to end on our ERA5 ✔
      (reports/phase1/cocip_end_to_end.md; STRATUM SAC = pycontrails SAC at 59/59 waypoints).
  [ ] Coverage audit memo with the mechanical decision — code + auto-memo ready and tested;
      needs data/reference/scheduled_flights.csv (team, ≥ 7 days) and the 01b data.
  [x] Exploration notebooks end with a sanity plot: 01_era5_look, 01b_adsb_look,
      01c_meteosat_look (+ 01d_cocip_end_to_end).
  [ ] Phase Gate Report — this draft; final after the items above.

What was built:
  - ERA5 downloader (CDS, server-side crop, pycontrails layout, resumable per variable,
    queue-limit retries, per-month heartbeat lock) + ARCO reader; CDS = ARCO verified.
  - ADS-B schema (pandera), ADS-B Exchange streaming adapter, flight reconstruction,
    per-day summaries; aircraft DB ingest.
  - Meteosat-9 IODC ingest: native download + satpy calibration to BT, native-grid crop,
    cloud mask on the same grid, static lat/lon/VZA/pixel-area grid, clear-day selection,
    quick-look + geolocation figures.
  - Physics: Murphy–Koop thermo, vectorised SAC (10⁷ segments in 8.5 s), ISA units.
  - Coverage audit: matching, continuity, mechanical decision, reports, auto-drafted memo.
  - Colab launchers 01a/01b/01c from one generator (colab/make_notebooks.py).

Key numbers:     ERA5 102 MB/day (≈ 38 GB/yr); Meteosat 5.5 MB/slot stored (180 MB
                 downloaded); full-disk slot 176 MB (uncropped year ≈ 6 TB → crop needed);
                 VZA Mumbai 38.3°, Delhi 48.1°, Kolkata 54.5°, Guwahati 59.1°; 9.1 % of
                 the study box has VZA ≥ 60°; ADS-B: 34 aircraft cruising in the corridor
                 in 5 min (2026-01-01 06 UTC); ERA5 CDS vs ARCO worst relative diff 2.2e-4.
Tests:           pytest 100 passed; coverage physics 96–100 %, total 74 %; ruff + mypy
                 --strict clean; CI green.
Colab runs:      00 smoke ✔; 01a Jan 2026 ✔ (verified); 01a full year, 01b, 01c running.
Storage:         Drive ≈ 3.5 GB now; after runs ≈ 3.5 + 35 (ERA5) + 1.2 (ADS-B) + 8.5
                 (Meteosat) ≈ 48 GB (2.4 % of 2 TB).
Decisions made:  docs/decisions.md, entries dated 2026-10-14 (CDS route, Murphy–Koop kept,
                 aircraft DB 2025-08, no paid flight data, EUMETSAT second account, native
                 Meteosat route, Plan A, ADS-B filters, OpenSky-not-granted rule).
Deviations:      none. Pre-registration lock verifies OK.
Open questions:  ⚑ Q11 opaque-cloud definition — new finding: the IODC cloud mask has only
                 clear/cloudy (options a/b/c in configs/preregistered_open_questions.md).
                 ⚑ Q3, Q4, Q5, Q12, Q16 unchanged (later phases).
Risks:           Only 12 free flight days unless OpenSky is approved (wide CIs; < 300
                 matched contrails possible). ADS-B Exchange (JETNET) publishing permission
                 (email drafted). ISSRs at the edge of the padded box (CoCiP test) — check
                 contrails leaving the box in Phase 2. ERA5 full-year run ~1 day.
Next phase:      Phase 2 first tasks: trajectory cleaning steps 3–9 + tests; ERA5 → segment
                 interpolation; SAC/ISSR flags + CoCiP B1/B2/B3 for Jan 2026 corridor.
                 Needed from you first: the 3 Colab summaries and the schedule CSV.
════════════════════════════════════════════
```
