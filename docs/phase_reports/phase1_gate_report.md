```
═══ PHASE 1 GATE REPORT — Data access, ingestion and coverage audit — 15 Oct 2026 ═══
Status:          READY FOR REVIEW — all data on Drive; coverage audit scheduled 1–7 Nov 2026
                 (team chose "option 2" on 14 Oct: start Phase 2 before the audit)
Calendar:        ahead (plan target 22 Nov 2026; data complete 15 Oct)

Done-when checklist:
  [x] ERA5 Jan 2026 on Drive; full year on Drive — 36/36 month-blocks with _SUCCESS
      (Mar 2025 – Feb 2026 × {pl 12 levels 100–500 hPa, sl TOA radiation, tropo_T 50/70 hPa});
      Jan 2026 via CDS, rest via Google ARCO-ERA5 (CDS = ARCO, worst rel. diff 2.2e-4).
      Last block (tropo_T 2025-03) finished 15 Oct 09:14 UTC.
  [x] ADS-B sample days normalised on Drive — 12/12 ADS-B Exchange first-of-month days with
      _SUCCESS (Mar 2025 – Feb 2026; ~3.4–3.6 M reports and ~2,000–2,165 aircraft per day
      ≥ FL200 in the padded box). Aircraft DB snapshot 2025-08 stored (616,648 rows, SHA-256).
      OpenSky: historical access requested, pending.
  [x] Meteosat: coverage confirmed for all 12 months (MSG2); 14 days on Drive (12 first-of-
      month + 13 & 14 Jan 2026 clear days), 1,451/1,456 slots (99.66 %; 5 slots failed after
      3 retries, recorded); geolocation verified with a figure; size estimate approved (Plan A).
  [x] All physics known-answer tests pass; Figure 1 reproduced; CoCiP runs end to end on our
      ERA5 (STRATUM SAC = pycontrails SAC at 59/59 waypoints).
  [ ] Coverage audit memo with the mechanical decision — code + auto-memo ready and tested.
      Runs 2 Nov (schedules 1–5 Nov) and 5 Nov (6–7 Nov) + ADS-B Exchange 2026-11-01.
  [x] Exploration notebooks end with a sanity plot (01_era5_look, 01b_adsb_look,
      01c_meteosat_look, 01d_cocip_end_to_end).
  [x] Phase Gate Report — this document.

What was built:
  - ERA5: CDS + ARCO routes behind one interface; day-level resume, per-month heartbeat lock,
    hour-by-hour fetch (peak 1.65 GB RAM), pycontrails variable layout.
  - ADS-B: pandera schema; ADS-B Exchange streaming adapter (glitch values blanked, failed
    hour does not kill the day, dropped downloads retried); flight reconstruction with the
    callsign-flicker fix (decision 2026-10-15); aircraft DB ingest.
  - Meteosat-9 IODC: native L1.5 download (retries) + satpy calibration, native-grid crop,
    cloud mask on the same grid, static lat/lon/VZA/area grid, clear-day selection.
  - Physics: Murphy–Koop thermo, vectorised SAC, ISA units, Fig. 1.
  - Coverage audit: schedule matching, continuity, mechanical rule, reports, memo draft.

Key numbers:     ERA5 pl 178 MB/day uncompressed day files; Meteosat ~5.5 MB/slot stored;
                 VZA Mumbai 38.3°, Delhi 48.1°, Kolkata 54.5°, Guwahati 59.1°; 9.1 % of the
                 study box VZA ≥ 60°; callsign fix on 2025-03-01 00–12 UTC: 8,713 → 4,628
                 flights, < 5-min fragments 3,469 → 411.
Tests:           108 passed; ruff + mypy --strict clean; CI green. verify-lock: OK.
Colab runs:      00 smoke ✔; 01a Jan 2026 (CDS) ✔; 01a2 ARCO full year ✔ (36/36);
                 01b ADS-B ✔ (12/12); 01c Meteosat ✔ (14 days).
Decisions made:  docs/decisions.md — 2026-10-14 entries; 2026-10-15: Meteosat accepted with
                 5 missing slots; callsign flicker no longer splits flights.
Deviations:      none. Pre-registration lock verifies OK.
Open questions:  ⚑ Q11 opaque cloud — IODC cloud mask has only clear water / clear land /
                 cloud / no data (options a/b/c in preregistered_open_questions.md).
                 ⚑ Q3, Q4, Q5, Q12, Q16 for later phases. Q12 (CoCiP Monte Carlo N) is
                 needed before the Phase 2 full-month run.
Risks:           Only 12 flight days unless OpenSky is approved (post-monsoon fold = 2 days;
                 300-match minimum at risk on the corridor alone — scope of confirmatory
                 scoring to be confirmed by the team). Audit measures Nov 2026 coverage, not
                 the evaluation year. ADS-B Exchange publishing permission (email sent 14 Oct).
                 Research-paper drafts of 15 Oct conflict with the lock in places (review
                 prompt: PAPER_FIX_PROMPT_v2.md in the team folder).
Next phase:      Phase 2 — trajectory cleaning steps 3–9 + tests; ERA5 → segment
                 interpolation; SAC/ISSR flags + CoCiP B1/B2/B3 for the Jan 2026 corridor.
                 Needed from you: "Phase 1 is accepted" (audit to follow in Nov), and a
                 value for Q12 (or approve the recommendation in Phase 2).
════════════════════════════════════════════
```
