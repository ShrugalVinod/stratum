```
═══ PHASE 4 GATE REPORT — Web app v0 + Innovation Website — 17 Oct 2026 ═══
Status:          ACCEPTED by Shrugal Vinod, 17 Oct 2026 (chat: "phase 4 accepted"),
                 with the open items below carried forward (all due before 18 Dec 2026)
Calendar:        ahead (Phase 4 deadline 18 Dec 2026)

Live site:       https://stratum.aerospaceonyx.workers.dev  (Cloudflare Workers, new team
                 account; builds branch ui-chart-redesign). The first site,
                 https://stratum.shrugalvinod874.workers.dev, still builds main (old design).

Done-when checklist (build prompt §4.6):
  [~] Live URL opens on phone and laptop: YES (checked headless at 1440×900 and 390×844,
      no horizontal scroll). Lighthouse (mobile, production build):
          /               94 / 100 / 100 / 100   (perf / a11y / best practices / SEO)
          /map            92 / 100 / 100 / 100
          /how-it-works   93 / 100 / 100 / 100
      End-to-end: a headless-Chrome click-through (19 checks, no JS errors) passes locally:
      map loads, replay starts, a segment opens the detail bar, step segments, close,
      click an unflagged flight, sky column, flight level, hour by keyboard, layers,
      lightbox, night theme, a day without flights, back to 1 Jan, phone layout.
      Live site re-checked the same way (11 checks).
      OPEN: this test is puppeteer on the laptop, not Playwright in CI as §4.4 asks.
      CI runs Vitest + type-check + build only.
  [x] Map shows real B1 data for all 31 January 2026 days (8 FL × 24 h grids per day);
      ranked list (66 flagged segments, 6 flights, 1 Jan) and segment details work;
      Phase 7 fields show "— Phase 7" in a muted stamp. Flight tracks exist for 1 Jan only
      (the only January ADS-B Exchange day); other days say so and still show the grids.
  [~] All Innovation Website pages exist: /, /map, /how-it-works, /progress, /methods,
      /team, /about-data (privacy + AI-use), /contact (team email aerospaceonyx@gmail.com).
      OPEN: team photos (Shrugal will send); number-consistency list (§4.1
      check_numbers) not yet produced or sent to the team.
  [ ] 4-minute demo script path tested + screen recording on a clean profile. OPEN.
  [x] Phase Gate Report: this file.

Data export (contract v1.0.0, docs: web/DATA_CONTRACT.md):
  Build 2026-01-6f2edc6 (Colab 04_web_export): 31 days, 8 flight levels FL280–FL420
  (ISA → pressure, ln-p interpolation, η = 0.30), 24 h. 1 Jan: 1,458 commercial flights,
  95,470 segments, 66 flagged (CoCiP B1, EF ≠ 0), EF+ 1.30 × 10¹⁴ J, EF− −1.78 × 10¹³ J.
  Privacy: commercial flights only (airline allowlist), ids = sha256(salt | piece)[:12]
  with the salt only in .env / Colab Secrets; a test asserts no ICAO24 is exported.
  Contrail lifetime shown on the site is CoCiP's contrail age (B1 central run), 0.3–8.7 h.

Design and quality:
  "Aeronautical chart" design from the team's Lovable mock-up (17 Oct), Chart/Night
  themes, reduced-motion respected, WCAG AA contrast checked for all text colours,
  keyboard access for every control, alt text on figures, no cookies/analytics/trackers.
  Size: initial JS 15.6 KB + 4.9 KB gzip (home), map engine lazy-loaded (290 KB gzip).

Deviations from the build-prompt wording (none touch pre-registered values):
  1. Hosting: Cloudflare Workers static assets instead of GitHub Pages (private repo;
     GitHub Pages needs a paid plan). Team OK 16 Oct; new account 17 Oct.
  2. Style: §4.4 suggests IBM Plex + one blue accent; the team chose the chart design
     (decisions.md, 17 Oct). Contrast, accessibility and Lighthouse targets still met.
  3. Copy lives in web/src/content/site.ts (one file) rather than web/content/*.md.
  4. The Bangalore contrail photo on Home is not provided yet; the hero uses an animated
     illustration and the Meteosat Arabian Sea figure is shown in §4.
Decisions made:  docs/decisions.md (16–17 Oct). Deviations (pre-registration): none new.

Open items carried forward (due before 18 Dec 2026):
  a. Playwright e2e in CI (port the 19 local checks).          — Claude
  b. Number-consistency list from site data + copy → team.     — Claude, then team
  c. Team photos into the boarding passes.                     — Shrugal sends
  d. 4-minute demo script + recording on a clean profile.      — Claude drafts, team records
  e. Old site: disconnect or keep (old Cloudflare account).    — Shrugal
  f. India boundary depiction (Natural Earth, India POV): confirm with Dr. Pant. — team
Next:            Phase 5 (labelling, matching, observability).
════════════════════════════════════════════
```
