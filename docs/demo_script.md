# STRATUM: 4-minute demo video script (v1, 20 Oct 2026)

Draft by Claude for the v1 site (data build v1-d126083, release v1.0.0). The team edits the words;
every number below is on the live site (Map, Results, Methods, Data & code) or in
`docs/web_numbers.md`. Say nothing that is not.

**Set-up for the recording**
- Chrome, a **new clean profile** (no extensions, no bookmarks bar), window 1440 × 900, zoom 100 %,
  **light theme** (the button top right says "Night").
- Open each URL below once before recording (fonts, map and data get cached), then start.
- Screen recorder at 1080p, system sounds off; read from this page on a second screen or phone.
- Let every page settle 2–3 s before speaking over it. Slow mouse movements.

| time | on screen / click | narration |
|---|---|---|
| 0:00–0:20 | **Home** (https://stratum.aerospaceonyx.workers.dev). Let the hero animation play. | "Contrails cause a large share of aviation's warming, but only the few that form in cold, humid air last for hours. Move the plane a little, and you can lose the cloud. We are team STRATUM." |
| 0:20–0:35 | Scroll slowly to the team's **contrail photo** and the **Phase** board. | "We photographed this one over Bengaluru. STRATUM asks a simple question: how well can we predict lasting contrails over India? We locked our analysis plan on 13 October 2026, before we had any result." |
| 0:35–1:00 | Open **/map?date=2026-02-01&fl=360&m=STRATUM**. Wait for the replay (planes move, ≈ 7 s). | "This is 1 February 2026: 2,141 commercial flights from real tracking data. The green shading is our model's chance of a contrail the satellite would see, learned from Meteosat-9 contrails." |
| 1:00–1:35 | Click the **top card** in the list (XAX601). The card opens under the map. | "The list ranks flights by the cautious estimate of warming they could avoid. Top today: an AirAsia X flight. Climbing from FL390 to FL410 would avoid between 43 and 115 tonnes of CO₂-equivalent warming over 100 years, and save 86 kilograms of fuel. Every range comes from 100 Monte Carlo runs, and the card says plainly: air traffic control feasibility is not modelled." |
| 1:35–1:50 | Point at the **humidity profile** chart in the card. | "Here is why: the humid layer is thin. FL390 sits inside it; FL410 is above it." |
| 1:50–2:10 | Click **Close**, then the **Physics** model button, then **STRATUM** again. | "Switch to raw physics and the map looks completely different. That disagreement is the problem STRATUM exists to measure." |
| 2:10–2:40 | Click **Results**. Scroll through H1 → H4 slowly. | "Four hypotheses, each tested once. H1: raw physics predicts about six times more contrails than the satellite sees, the opposite of what we expected; most are too thin to detect. H2: our model beats the published correction, but a constant guess scores the same, so its real strength is ranking. H3: under one percent of flying causes eighty percent of contrail warming. H4: night flights carry about three quarters of the warming on half the distance, but the logged test's interval reached below zero, so we report it as not supported." |
| 2:40–3:05 | Click **Methods**, scroll to **What didn't work**. | "We publish what didn't work too. Our satellite detector is simple: it finds about a quarter of contrails. We measured exactly how weak it is before testing, and every result accounts for it. A learned detector is our next step." |
| 3:05–3:30 | Click **Data & code** (About the data, §5). Show the DOI link. | "Everything is open: the code, the derived data and a one-click notebook that recomputes our results, archived on Zenodo with a DOI. A teammate who didn't write the code reproduced every figure from scratch." |
| 3:30–3:45 | Click the **Night** theme button; then back. | "The site also runs offline for our booth, in day and night themes and on a phone." |
| 3:45–4:00 | Click **Team**. Hold. | "We are students from Indus International School, Bengaluru, with Dr. Varsha Pant. STRATUM: move the plane, lose the cloud." |

**Checks before the final take**
- The top STRATUM card on 1 Feb 2026 is XAX601 with "FL410", "saves 86 kg fuel", 100-year range
  43–115 t. If the data build changes, re-read the numbers from the card and fix the narration.
- Results narration matches the four cards on /results word for word in substance (6.44; 0.86 and
  the constant-rate caveat; under 1 % with standard physics; H4 interval −0.03 to 0.45).
- Detector: "about a quarter" = recall 0.23 on the expert-labelled scenes (Methods, gate reports).
- The team photo slide and Team page show only photos the team supplied.
- Credits visible in the footer when scrolling (EUMETSAT, Copernicus, ADS-B Exchange, OpenSky,
  Natural Earth).

## Scenes added 22 Oct 2026 (for the final video, 29 Dec – 4 Jan)

Pick two or three; each is 10–20 seconds.
- **Satellite proof** (map → a flight card → "Satellite proof"): the Meteosat picture with the flight
  path, the predicted drift and the detected line, played as a time-lapse. Strongest visual.
- **Why this prediction?** (same card): "STRATUM explains every prediction: here humidity at and below
  the flight level pushed the chance up."
- **Live sky** (/live, film outdoors with a real contrail if possible): "Which plane made that
  contrail? This one, 34° up to the north-east, and the air at its level keeps contrails."
- **Advisories** (/advisory): a notice in pilot format, then "Show on the map".
- **3D** (/3d, press Play): the humid layer drifting over India with the flagged flights inside it.
- **Beat STRATUM** (/game): one round, the answer reveal.
- The second analysis (Results §5): "with STRATUM steering the physics, the night effect is clear:
  0.27, interval 0.24 to 0.34" — say it is a disclosed second analysis (D-006).
- Credits to show: also ECMWF open data, The OpenSky Network, adsb.lol, OpenContrails (footer).
