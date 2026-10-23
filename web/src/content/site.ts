// All site copy lives here so the team can edit text without touching components.
// Rule: no invented numbers. Every number below is from the project's own documents
// (pre-registration, decision log, phase reports) or is clearly marked as pending.

export const site = {
  name: "STRATUM",
  school: "Indus International School · Bengaluru",
  competition: "Conrad Challenge 2026–27",
  tagline: "Move the plane. Lose the cloud.", // team tagline (16 Oct 2026)
  heroTitle: ["Move the plane.", "Lose the cloud."],
  heroLede:
    "Some contrails spread into long-lived cloud that traps heat. They only last in thin, cold, ice-supersaturated layers of air. STRATUM checks where those layers are over India — so that one day a plane could fly 2,000 ft above or below them.",
  email: "aerospaceonyx@gmail.com" as string | null, // team email (17 Oct 2026) → shown on Contact
  paperPdf: "/STRATUM_Research_Protocol_v1.2.pdf",
};

export const whyCards = [
  {
    title: "The problem",
    body: "Most contrails vanish in seconds. A few spread into thin cloud that lasts for hours and traps heat — a large part of aviation's climate effect.¹ Studies elsewhere found that a small share of flights makes most of it.²",
  },
  {
    title: "The India gap",
    body: "Contrail forecasts are tuned and checked over Europe and North America, not over Indian skies, where humidity at cruise height is poorly measured.",
  },
  {
    title: "Our approach",
    body: "Physics → satellite check → learned correction → advice: change altitude by about 2,000 ft only where it is likely to help.",
  },
];

export const refs = [
  "Lee, D. S. et al. (2021), Atmospheric Environment 244, 117834.",
  "Teoh, R. et al. (2020), Environmental Science & Technology 54, 2941–2950.",
];

export const loop = [
  { n: "01", code: "DEPART", title: "Flight tracks", body: "ADS-B positions of real commercial flights." },
  { n: "02", code: "WX", title: "Weather", body: "ERA5 temperature and humidity at flight level." },
  { n: "03", code: "SAC", title: "Will a contrail form?", body: "Schmidt–Appleman criterion, then CoCiP for how long and how much warming." },
  { n: "04", code: "SAT", title: "Satellite check", body: "Meteosat-9 images every 15 minutes, parallax-corrected." },
  { n: "05", code: "ARRIVE", title: "Better advice", body: "A correction learned from the satellite labels, with honest uncertainty (Phase 7)." },
];

// Ticker under the hero. Numbers are from the exported build (day.json, manifest.json) or the
// logged final run (docs/phase_reports/phase6_gate_report.md).
export const facts = [
  "1 Jan 2026 · 1,458 commercial flights on the map",
  "66 persistent-contrail segments from 6 flights (physics only, B1)",
  "31 days × 8 flight levels × 24 hours of contrail conditions",
  "Meteosat-9 checks every 15 minutes",
  "Analysis plan locked 13 Oct 2026",
  "H1 not supported — physics predicts ~6× more persistent contrails than the satellite sees",
  "Under 1 % of flying carries 80 % of contrail warming over India (H3)",
];

// Phase status: update as phases are accepted (source: docs/phase_reports).
export type PhaseState = "done" | "current" | "upcoming";
export const statusUpdated = "23 Oct 2026";
// logged = date of the progress-log entry that finished the phase (docs/progress.md)
export const phases: { n: number; name: string; state: PhaseState; logged?: string }[] = [
  { n: 0, name: "Setup & pre-registration", state: "done", logged: "13 OCT" },
  { n: 1, name: "Data ingest", state: "done", logged: "14 OCT" },
  { n: 2, name: "Physics baseline", state: "done", logged: "15 OCT" },
  { n: 3, name: "Satellite detector", state: "done", logged: "15 OCT" },
  { n: 4, name: "Web app v0", state: "done", logged: "17 OCT" },
  { n: 5, name: "Labels & matching", state: "done", logged: "18 OCT" },
  { n: 6, name: "Evaluation (H1)", state: "done", logged: "18 OCT" },
  { n: 7, name: "Correction & decisions", state: "done", logged: "19 OCT" },
  { n: 8, name: "Final web app", state: "done", logged: "20 OCT" },
];

export const pipeline = [
  {
    code: "ADSB",
    title: "ADS-B flight tracks",
    sub: "Where every commercial flight was, minute by minute",
    input: "Raw position reports",
    output: "1-minute cruise segments",
    sci: "ADS-B Exchange first-of-month samples, bounded to 4–39°N, 66–100°E. Cleaning: duplicates, implausible jumps (> 6,000 ft/min or 100 kt), cruise ≥ FL250, gaps ≤ 10 min filled along the great circle, longer gaps split. Only commercial airline flights are ever shown.",
  },
  {
    code: "ERA5",
    title: "ERA5 weather",
    sub: "What the air was like at the aircraft's height",
    input: "Segments",
    output: "Temperature + humidity",
    sci: "ECMWF ERA5 reanalysis, hourly, 0.25°, 12 pressure levels (100–500 hPa). Linear in time, bilinear in space, linear in ln p vertically (pre-registered).",
  },
  {
    code: "SAC",
    title: "Schmidt–Appleman check",
    sub: "Will a contrail form at all?",
    input: "T, humidity, engine efficiency",
    output: "Forms / persists flags",
    sci: "Exact threshold temperature from the mixing-line tangent; persistence requires ice supersaturation (RHi ≥ 1). Engine efficiency from OpenAP per aircraft type.",
  },
  {
    code: "COCIP",
    title: "CoCiP model",
    sub: "How long will it last, and how much will it warm?",
    input: "Flagged segments",
    output: "Lifetime + energy forcing",
    sci: "pycontrails CoCiP with three humidity baselines (B1 raw, B2 ÷0.95, B3 latitude correction) and 100 Monte Carlo members for the 5th–95th percentile range.",
  },
  {
    code: "SAT",
    title: "Satellite check",
    sub: "Did a contrail actually appear?",
    input: "Meteosat-9 images",
    output: "Detected contrail lines",
    sci: "Brightness-temperature difference (10.8 − 12.0 µm), oriented line filters, parallax correction for the satellite's viewing angle, and observability rules: cloudy or high-angle scenes count as unknown, never as 'no contrail'.",
  },
  {
    code: "CORR",
    title: "Correction",
    sub: "Learn where the physics is wrong",
    input: "Predictions + satellite labels",
    output: "Calibrated probability",
    sci: "Gradient-boosted trees with monotone constraints and isotonic calibration, trained west of 80°E and tested east of it on held-out seasons (Phase 7).",
  },
  {
    code: "DEC",
    title: "Decision",
    sub: "Fly 2,000 ft higher here?",
    input: "Corrected estimate + fuel",
    output: "Advice with a lower bound",
    sci: "Alternatives at ±2,000 and ±4,000 ft, extra fuel and CO₂ from OpenAP, net warming avoided at 20- and 100-year horizons; alerts only when the lower bound is positive (Phase 7).",
  },
];

// result: set once the hypothesis' logged final run exists (source: docs/phase_reports).
export const hypotheses: { id: string; plain: string; test: string; result?: { verdict: string; date: string; body: string } }[] = [
  {
    id: "H1",
    plain: "Uncorrected physics under-predicts the persistent contrails that satellites actually detect.",
    test: "Ratio of B1-predicted persistence to observed detectable contrails; supported if the upper 95 % CI is below 1.",
    result: {
      verdict: "Not supported",
      date: "18 Oct 2026",
      body: "Ratio 6.44 (95 % CI 4.92–12.12): physics predicts about 6× more persistent contrails than Meteosat-9 sees, the opposite of the hypothesis. Most are too thin or narrow to detect: allowing for that, the ratio is 1.05 (0.81–1.91). 12 flight days, mostly winter and spring.",
    },
  },
  {
    id: "H2",
    plain: "STRATUM's corrected forecast is clearly more skilful than the best existing correction (B3).",
    test: "Mean held-out-season Brier skill score vs B3 ≥ 0.10 with lower 95 % CI > 0. Primary endpoint.",
    result: {
      verdict: "Supported",
      date: "18 Oct 2026",
      body: "Skill vs B3 0.86 (95 % CI 0.82–0.91). But a constant guess of the average contrail rate scores the same, because B3 only says yes or no; against that constant the model is not better overall (−0.19). Where it does help is ranking which flights are likely to make a visible contrail (AUROC 0.65–0.83 vs 0.42–0.66 for physics rules).",
    },
  },
  {
    id: "H3",
    plain: "A small share of flying causes most contrail warming.",
    test: "Share of cruise distance carrying 80 % of positive modelled energy forcing ≤ 10 %.",
    result: {
      verdict: "Supported",
      date: "19 Oct 2026",
      body: "Under 1 % of flying carries 80 % of contrail warming: 0.48 % of cruise distance with raw ERA5 physics and 0.54 % with the published correction (descriptive). The logged test used our humidity correction, which turned out far too dry, and gave 0.0044 %.",
    },
  },
  {
    id: "H4",
    plain: "Night flights cause a larger share of contrail warming than their share of distance.",
    test: "Night EF share minus night distance share (18:00–06:00 local solar time); lower 95 % CI > 0.",
    result: {
      verdict: "Not supported",
      date: "19 Oct 2026",
      body: "Night flights carried 84 % of warming against 49 % of distance, but the logged test (too-dry corrected physics, only 1,583 warming segments) has an interval that reaches below zero (−0.03 to 0.45). With standard physics the night excess is clear: 73–75 % of warming vs 49 % of distance (descriptive).",
    },
  },
];

export const methods = [
  { title: "Data", body: "ERA5 weather, Meteosat-9 imagery every 15 minutes, ADS-B flight tracks for 12 first-of-month days (Mar 2025 – Feb 2026), and an aircraft database." },
  { title: "Physics baseline", body: "Schmidt–Appleman formation check, then CoCiP for persistence and energy forcing, with three humidity baselines and Monte Carlo ranges." },
  { title: "Satellite detection", body: "A transparent line-filter detector on the 10.8 − 12.0 µm brightness-temperature difference, tuned on 51 Meteosat scenes labelled by three contrail experts (DLR dataset) and checked on 89 others (precision 0.22, recall 0.23). Over India it is also checked against 100 scenes whose labels Claude drafted and team members reviewed: a secondary, exploratory check." },
  { title: "Matching and labels", body: "Each predicted contrail is advected with the wind for 20–120 min, parallax-corrected and matched within 2 px and 20°. A segment counts as observed only if it matches in at least two satellite images; cloudy or steep-angle scenes are labelled unknown, never \"no contrail\". A wrong-day check measures how many matches are chance." },
  { title: "Correction and decision", body: "A calibrated model (monotone gradient-boosted trees) learns where physics is wrong, trained on some seasons and tested on another. The decision layer tries flying 2,000 or 4,000 ft higher or lower, reruns the contrail physics 100 times with different humidity, model and climate-metric assumptions, adds the extra fuel, and alerts only when the cautious end of the warming avoided is positive at both 20 and 100 years." },
];

// Correction-model inputs (source: docs/methods/features.md; pre-registered set, paper §4.6).
// mono: "+" = prediction can only rise with it, "−" = only fall; "" = unconstrained.
export const modelFeatures: { name: string; unit: string; why: string; mono?: "+" | "−" }[] = [
  { name: "RHi at the flight level", unit: "–", why: "Ice supersaturation is what lets a contrail persist", mono: "+" },
  { name: "RHi one level above", unit: "–", why: "A moist layer just above may mean ERA5 placed the supersaturated layer slightly wrong" },
  { name: "RHi one level below", unit: "–", why: "The same, for the level below" },
  { name: "Vertical RHi gradient", unit: "per km", why: "Sharp humidity edges are where ERA5 misses thin moist layers" },
  { name: "Temperature", unit: "K", why: "Colder air favours formation and ice growth" },
  { name: "Temperature above the formation threshold (T − T_LM)", unit: "K", why: "Warmer than the Schmidt–Appleman threshold, no contrail forms", mono: "−" },
  { name: "Pressure (flight level)", unit: "Pa", why: "ERA5's humidity bias depends on altitude" },
  { name: "Cloud ice water content", unit: "kg/kg", why: "Natural cirrus already present: humid air, but contrails are harder to see" },
  { name: "High-cloud fraction at and above", unit: "–", why: "Cirrus above hides contrails from the satellite" },
  { name: "Vertical velocity", unit: "Pa/s", why: "Rising air cools and moistens, creating moist layers ERA5 may underplay" },
  { name: "Vertical wind shear", unit: "m/s per km", why: "Shear spreads contrails into wider, more visible cirrus" },
  { name: "Distance to the tropopause", unit: "m", why: "Moist layers cluster just below the tropopause, where ERA5 is driest" },
  { name: "Latitude", unit: "°N", why: "Tropical versus subtropical air" },
  { name: "Longitude", unit: "°E", why: "West versus east India (sea, land, monsoon onset)" },
  { name: "Month (sin, cos)", unit: "–", why: "Season, encoded as a circle so December sits next to January" },
  { name: "Local solar time (sin, cos)", unit: "–", why: "Day and night: detection and humidity both follow the daily cycle" },
];

// Paper Table 7 (threats to validity) with how each one turned out (source: docs/decisions.md,
// gate reports). Shown on the Methods page.
export const threats: { risk: string; effect: string; mitigation: string; outcome: string }[] = [
  { risk: "Patchy ADS-B coverage", effect: "Missing flights; biased sample of routes", mitigation: "Coverage audit and decision rule; coverage reported with every result", outcome: "12 free sample days only; the coverage audit runs on 2 and 5 Nov 2026." },
  { risk: "Limited satellite observability", effect: "Labels favour thick, long-lived contrails; monsoon under-represented", mitigation: "Observability mask; unobservable = missing; results by season and viewing angle", outcome: "Real and large: 1 contrail seen in 9,803 monsoon segments; only ~16 % of predicted contrails are detectable at all (H1)." },
  { risk: "Wind advection error", effect: "True contrails fail to match, or false matches occur", mitigation: "Age window, distance and angle tolerances, each with a sensitivity analysis", outcome: "H1 verdict unchanged under all 8 variants; a wrong-day test showed a third of matches are chance, so a match now needs two images (D-004)." },
  { risk: "Labeller subjectivity", effect: "Noisy ground truth", mitigation: "Written guide, double labelling, Cohen's κ", outcome: "Changed: the detector is tuned on expert-labelled scenes (D-002); India labels were drafted by AI and reviewed by the team (D-003), so κ does not apply." },
  { risk: "Coarse reanalysis", effect: "Thin humid layers smeared across levels", mitigation: "Neighbouring-level features; results by flight level", outcome: "The humidity at, above and below the flight level are the model's most important inputs in every season." },
  { risk: "Radiative uncertainty", effect: "Warming estimates off by a large factor", mitigation: "Ranges, two metric horizons, ranking on lower bounds", outcome: "Implemented: 100 Monte Carlo members, 20- and 100-year horizons, alerts only on a positive lower bound." },
  { risk: "Operational realism", effect: "ATC may not allow a suggested level", mitigation: "Out of scope; stated plainly in all outputs", outcome: "Every card and download says it; OpenAP often finds the higher level cheaper, which we report separately." },
  { risk: "Overfitting and leakage", effect: "Optimistic scores", mitigation: "Blocked splits; primary metric and hypotheses fixed in advance", outcome: "Seasons held out with no shared flight or image; models frozen before scoring; one logged final run per hypothesis." },
];

// Model card (same text as the evaluation report v2; docs/methods/model_card.md).
export const modelCard: [string, string][] = [
  ["Model", "Monotone gradient-boosted trees (LightGBM) on 18 ERA5 and position/time inputs, isotonic calibration; one model per held-out season and per side of 80°E. Fed back into the physics as a humidity factor per latitude band (with detection efficiency)."],
  ["Intended use", "Research: where ERA5-based contrail physics is wrong over India, and which flight stretches a ±2,000/±4,000 ft change would most likely help, with uncertainty ranges, for discussion with airlines and air traffic experts."],
  ["Out of scope", "Operational flight planning or ATC instructions; anything outside 6–37°N, 68–98°E or below FL250; seasons and conditions the labels do not cover; estimates of aviation's total climate impact."],
  ["Data", "12 ADS-B days (Mar 2025–Feb 2026), ERA5, Meteosat-9 contrail labels from an automatic detector matched to wind-drifted flight segments (two images needed). About a third of positive labels are expected to be chance; almost no monsoon labels."],
  ["Metrics", "Brier skill score vs B3 (pre-registered), vs the constant rate, climatology and a humidity-only model; AUROC; reliability; 1,000 day-bootstrap resamples."],
  ["Limitations", "2–4 days per season; noisy, detection-limited labels; calibration did not help; probabilities barely beat the base rate; the feedback into physics is too blunt; ATC, traffic and airline constraints not modelled."],
  ["Ethics", "Alerts can burn fuel for no benefit, so an alert needs a positive lower bound at both horizons. Commercial flights only, hashed identities. AI-assisted labels disclosed (D-003)."],
];

// Deviations from the pre-registration, each with the team's OK (docs/deviations.md).
export const deviations: { id: string; date: string; title: string; why: string }[] = [
  { id: "D-001", date: "15 Oct 2026", title: "Monte Carlo members 20 → 100", why: "The 5th percentile moved 28 % between 20 and 40 members; the decision layer ranks on it." },
  { id: "D-002", date: "17 Oct 2026", title: "Detector tuned on expert-labelled scenes", why: "A published DLR dataset of Meteosat scenes labelled by three contrail experts replaced tuning on our own labels." },
  { id: "D-003", date: "17 Oct 2026", title: "India labels drafted by AI, reviewed by the team", why: "The team could not find contrails reliably by eye; used only as a secondary, exploratory check." },
  { id: "D-004", date: "18 Oct 2026", title: "A contrail counts as seen only in two satellite images", why: "A wrong-day test showed most single-image matches are chance; two images cut the chance share from 60 % to 33 %." },
  { id: "D-005", date: "21 Oct 2026", title: "A learned contrail detector, as a second analysis", why: "Added after the logged results: a neural network trained on OpenContrails and the expert scenes. The logged H1–H4 results keep the original detector; the new labels are reported next to them, clearly marked." },
];

// What did not work (the paper promises this list). Source: gate reports and docs/decisions.md.
export const didntWork: string[] = [
  "Our pre-registered contrail detector is weak: on expert-labelled scenes it finds about a quarter of the contrails, and over India only about 1 in 20 of its lines is a contrail. Learned detectors added afterwards (D-005) do about twice as well on the same expert scenes (F1 0.49 vs 0.22; the best finds 82.5 % of the contrails all three experts agreed on); the logged results still use the original one.",
  "We could not label India's satellite scenes ourselves; AI drafted the lines and we reviewed them, which we disclose.",
  "About a third of the satellite matches would happen by chance, even with two images required.",
  "H1 went the other way: physics over-predicts the contrails the satellite sees about six times, mostly because thin contrails are invisible.",
  "Calibrating the model (isotonic regression) did not improve it on validation days.",
  "The model's probabilities barely beat a constant guess of the average contrail rate; it is only clearly better at ranking which flights are likely to make a visible contrail.",
  "Feeding the correction back into the physics as one humidity factor per latitude band hit its limit everywhere and dried the air so much that almost no contrails formed.",
  "The monsoon cannot be tested: cloud hides contrails from the satellite almost completely.",
  "Most avoidance alerts fall on one humid day, and some rely on OpenAP finding the higher level cheaper rather than on the contrail.",
  "Twelve flight days are too few for tight per-season uncertainty ranges.",
];

// Dated lab diary (source: docs/progress.md). Newest first.
export const progress = [
  { date: "2026-10-23", phase: 8, title: "Your flight's hidden footprint", body: "A new page, /flight: pick a trip (or an airliner flying now) and STRATUM checks the forecast minute by minute along its whole cruise, at its level and the levels around it. It shows the fuel's CO₂ (OpenAP) next to the warming its contrail could cause (our CoCiP runs over India, converted like the decision layer), and the nearby level that avoids the humid layer. A scan finds the most contrail-prone trips in each day's forecast. Physics only, with H1's caveat stated." },
  { date: "2026-10-23", phase: 8, title: "The website in Hindi", body: "Every page can now be read in Hindi: the switch in the header remembers the choice, and ?lang=hi links straight to it. The Hindi was translated with AI (Claude) and checked by the team; numbers, codes and names stay as they are, and the English is the reference." },
  { date: "2026-10-22", phase: 8, title: "See the proof: 241 contrails on the map", body: "Every contrail the satellite confirmed is now on the map as a cyan ring: 241 of them on 7 days, from 234 commercial flights. Click one to see the real Meteosat-9 images around it, with where the plane flew, where the physics says its contrail drifted, and the line our detector found, frame by frame. The predicted and detected lines sit a median of 1.2 pixels apart." },
  { date: "2026-10-22", phase: 8, title: "Detector v3: close to expert level", body: "A second, stronger network (six infrared channels, trained on every labeller's vote, all 20,088 OpenContrails scenes, five models voting together) matches the experts' consensus at a pixel Dice of 0.64, close to the 0.72 a single expert reaches at most, and finds 82.5 % of the contrails all three experts agreed on. Re-labelling the twelve flight days with it gives 1,109 contrails with 14 % chance matches, and the same answers: H1 not supported, H2 supported. All of this is a disclosed second analysis; the logged results are unchanged." },
  { date: "2026-10-21", phase: 8, title: "A learned contrail detector doubles detection quality", body: "Our simple line-finding detector was the weakest part of the project. We trained a small neural network on 6,067 human-labelled contrail scenes from Google's OpenContrails dataset, then fine-tuned it on the 51 expert-labelled Meteosat scenes. Checked once on the 89 expert scenes it never saw: 64 % of its detections are real contrails (the old detector: 22 %) and it finds 38 % of the contrails (old: 23 %), F1 0.48 against 0.22. This was added after the logged results, so it is a disclosed second analysis (D-005): the H1–H4 results stay as logged, and the new labels are reported next to them." },
  { date: "2026-10-20", phase: 8, title: "Open release with a DOI", body: "Version 1.0.0 is public: the code, a derived-data release (every labelled commercial flight segment with its satellite label, baselines and held-out forecasts) and a one-click notebook that recomputes our results, archived on Zenodo (doi:10.5281/zenodo.23480202). A teammate who did not write the code reproduced every results figure from scratch." },
  { date: "2026-10-19", phase: 7, title: "Phase 7 accepted: H2–H4 tested", body: "A machine-learning correction trained on the satellite labels ranks contrail-prone flight segments far better than any yes/no physics rule, and it passes H2 against the published correction. But a constant guess of the average contrail rate passes too, so we report that the model's probabilities barely beat the base rate. Feeding the correction back into the physics as one humidity factor turned out too blunt: it dried the air so much that almost no contrails formed. With standard physics, under 1 % of flying carries 80 % of contrail warming over India (H3, supported), and night flights carry about three quarters of it against half the distance (H4 not supported in the logged test, clear in the context runs). The avoidance layer flagged 402 stretches of flight on 12 days and would alert on 333 of them, mostly on one humid day in February." },
  { date: "2026-10-18", phase: 6, title: "Phase 6 accepted: H1 is not supported", body: "The one logged test of H1: over 334,211 flight segments on 12 days, raw ERA5 physics predicted 10,076 persistent contrails and Meteosat-9 saw 1,564 — a ratio of 6.44 (95 % range 4.92–12.12). We expected physics to predict too few; it predicts about six times too many. Most predicted contrails are too thin or narrow for the satellite: only 16 % pass the detectability thresholds, and allowing for that the two agree (1.05). The answer is the same under every alternative label rule and matching tolerance. Limits: only 2–4 days per season, no monsoon contrails seen, and about a third of the satellite labels are chance matches. A refuted hypothesis is a result, and we report it as one." },
  { date: "2026-10-18", phase: 6, title: "Evaluation harness built", body: "One harness that every model goes through the same way: four baselines (climatology, raw ERA5, constant humidity scaling, latitude-dependent correction), seasons held out one at a time, no flight or satellite image on both sides of a split, and 1,000 day-resamples for every uncertainty range. The H1 test runs once, logged, before the results are seen." },
  { date: "2026-10-18", phase: 5, title: "Phase 5 accepted: satellite labels for the whole year", body: "680,387 contrail-forming flight segments over India checked against Meteosat-9: 421 contrails observed from 369 flights (the pre-registered minimum is 300). A wrong-day check shows about a third of these matches would happen by chance, so the labels are noisy. Almost all observations are from winter and spring: monsoon cloud hides contrails from June to October. Over India the detector finds about 1 in 3 labelled contrails, but only about 1 in 20 of its lines is a contrail." },
  { date: "2026-10-18", phase: 5, title: "India labels drafted by AI, reviewed by the team", body: "The team could not find contrails reliably in the India scenes, so Claude drafted the lines and Aditya, Ishaan and Abeer each reviewed and corrected a third of the 100 scenes: 15 draft lines, 0 deleted, 5 moved, 21 added. This is logged as a deviation from the plan and used only as a secondary check." },
  { date: "2026-10-17", phase: 5, title: "Detector tuned on expert labels; matching built", body: "The satellite detector was tuned on 51 Meteosat scenes labelled by three contrail experts (DLR dataset) and checked on 89 others: precision 0.22, recall 0.23, up from 0.14 / 0.26. It still misses many short, faint contrails. The full-year matching that turns satellite images into labels for every flight segment is built and tested." },
  { date: "2026-10-17", phase: 5, title: "Labelling scenes drawn", body: "220 Meteosat scenes drawn once with a fixed seed, stratified by month, time of day and predicted contrail density. A separate labelling app keeps the satellite data private." },
  { date: "2026-10-17", phase: 4, title: "Web app v0 accepted", body: "Map with real January 2026 contrail conditions, flight replay and contrail details, plus the Innovation Website, live on Cloudflare." },
  { date: "2026-10-16", phase: 4, title: "Web app v0 started", body: "Data contract for the website: contrail-condition grids for every hour and flight level of January 2026, commercial flights only, aircraft identities hashed." },
  { date: "2026-10-15", phase: 3, title: "Satellite contrail detector", body: "A line-filter detector on Meteosat-9 finds long contrails such as two over the Arabian Sea at night. Overlays of physics predictions on satellite images: on 1 Jan 2026 no predicted contrail lined up with a detected one — a first sign that physics alone is not enough." },
  { date: "2026-10-15", phase: 2, title: "Physics baseline for January 2026", body: "1,706 flights through the Delhi–Mumbai corridor on 1 Jan 2026, 131,661 one-minute segments, CoCiP with three humidity baselines and 100 Monte Carlo members. A dry winter day: persistent contrails from 6 flights, all south of 15°N." },
  { date: "2026-10-14", phase: 1, title: "A year of data acquired", body: "ERA5 for the full evaluation year (36/36 month-blocks), 12 ADS-B days, 14 days of Meteosat-9 imagery and the aircraft database." },
  { date: "2026-10-13", phase: 0, title: "Analysis plan locked", body: "Every hypothesis, threshold and test was fixed and fingerprinted (SHA-256) before any result existed. Changes since then are logged as deviations with a team sign-off." },
];

export const team = [
  { initials: "SV", name: "Shrugal Vinod", role: "Team lead · modelling & software" },
  { initials: "AH", name: "Aditya Harsoda", role: "Flight data · label review" },
  { initials: "IK", name: "Ishaan Kupnur", role: "Satellite data · label review" },
  { initials: "AS", name: "Abeer Shah", role: "Product & communication · label review" },
];
export const supervisor = { initials: "VP", name: "Dr. Varsha Pant", role: "Supervisor" };

export const dataSources = [
  { source: "ERA5 / Copernicus", what: "Hourly weather reanalysis, 0.25°", use: "Temperature and humidity at flight level", credit: "Contains modified Copernicus Climate Change Service information 2026", limits: "Reanalysis humidity at cruise height can be wrong — the reason this project exists." },
  { source: "Meteosat-9 / EUMETSAT", what: "Indian Ocean geostationary satellite, every 15 min", use: "Detect real contrails; check predictions", credit: "Meteosat-9 imagery © EUMETSAT 2026", limits: "Thin or cloud-covered contrails can be missed; steep viewing angles near the edges." },
  { source: "ADS-B Exchange", what: "Aircraft position reports", use: "Flight tracks (free first-of-month samples)", credit: "Flight data: ADS-B Exchange", limits: "12 days in the year; coverage over India is being audited (Nov 2026)." },
  { source: "OpenSky Network", what: "Aircraft database", use: "Aircraft type → performance and engine efficiency", credit: "Aircraft metadata: OpenSky Network", limits: "Some types missing; fallbacks are logged." },
  { source: "OpenContrails (Google Research)", what: "GOES-16 scenes with human contrail masks", use: "Pre-training the learned detector (D-005)", credit: "OpenContrails, Ng et al. 2024, CC BY 4.0", limits: "American satellite and skies; fine-tuned on Meteosat before use." },
  { source: "DLR expert contrail labels", what: "Meteosat scenes labelled by three contrail experts", use: "Tuning (51 scenes) and checking (89 scenes) the detectors", credit: "DLR, CC BY-NC 4.0", limits: "Not over India; the 89 check scenes have been used twice and are now closed." },
  { source: "ECMWF open data (IFS)", what: "Daily global weather forecast, 0.25°", use: "Live outlook and contrail advisories (/advisory, /live)", credit: "Forecast: ECMWF open data, CC BY 4.0", limits: "No cloud fields on pressure levels, so physics only; experimental." },
  { source: "The OpenSky Network (live)", what: "Live aircraft positions", use: "Airliners over India now (/live), every 5 minutes", credit: "Live aircraft: The OpenSky Network", limits: "Snapshot every 5 minutes; positions moved on by speed and heading in between." },
  { source: "adsb.lol", what: "Live aircraft positions (community receivers)", use: "Airliners near the visitor (/live)", credit: "Live aircraft: adsb.lol, ODbL", limits: "Few receivers over India." },
  { source: "Natural Earth", what: "Coastlines, borders (India point of view), cities", use: "Base map", credit: "Made with Natural Earth", limits: "Simplified for the web." },
];

// Second analysis with the learned contrail detectors (deviation D-005; descriptive). Source:
// _locks/detector_runs.jsonl, docs/deviations.md (D-005), reports/second_analysis_nn{,3}. The
// logged H1–H4 results above are unchanged.
export const detectorCheck = {
  scenes: 89,
  expertLines: 520,
  expertPixelDiceMax: 0.72,
  rows: [
    { name: "Line filter (pre-registered)", precision: 0.22, recall: 0.23, f1: "0.22 [0.18, 0.26]", dice: "—", unanimous: "—" },
    { name: "Learned v1", precision: 0.64, recall: 0.38, f1: "0.48 [0.44, 0.52]", dice: "0.55", unanimous: "73 %" },
    { name: "Learned v3 (ensemble)", precision: 0.66, recall: 0.39, f1: "0.49 [0.44, 0.54]", dice: "0.64", unanimous: "82.5 %" },
  ],
};
export const secondAnalysis = [
  { labels: "Line filter (logged)", seen: "1,564", chance: "33 %", h1: "6.44 [4.92, 12.1]", h2: "0.86 [0.82, 0.91]" },
  { labels: "Learned v1", seen: "942", chance: "12 %", h1: "10.7 [6.6, 54.6]", h2: "0.92 [0.90, 0.97]" },
  { labels: "Learned v3", seen: "1,109", chance: "14 %", h1: "9.1 [5.5, 46.5]", h2: "0.92 [0.89, 0.97]" },
];

// How our results compare with published studies (Results §5). Every study number was checked
// against the paper's abstract on 22 Oct 2026. Their concentration numbers are shares of
// *flights*; our H3 is a share of cruise *distance* (pre-registered), so the two are not the same
// measure: a flight is many segments, and only its humid stretch warms.
export const literature = [
  {
    topic: "Concentration",
    study: "Teoh et al. 2020",
    ref: "Environ. Sci. Technol. 54, 2941",
    url: "https://doi.org/10.1021/acs.est.9b05608",
    where: "Japan, 1 year",
    theirs: "2.2 % of flights cause 80 % of contrail warming",
    ours: "0.48 % of cruise distance carries 80 % of warming (raw ERA5 physics; 0.54 % with the published correction)",
  },
  {
    topic: "Concentration",
    study: "Teoh et al. 2022",
    ref: "Atmos. Chem. Phys. 22, 10919",
    url: "https://doi.org/10.5194/acp-22-10919-2022",
    where: "North Atlantic, 2016–2021",
    theirs: "About 12 % of flights cause 80 % of yearly contrail warming; most of it from night flights in winter",
    ours: "Same pattern over India: winter nights dominate (H4 context runs)",
  },
  {
    topic: "Concentration",
    study: "Teoh et al. 2024",
    ref: "Atmos. Chem. Phys. 24, 6071",
    url: "https://doi.org/10.5194/acp-24-6071-2024",
    where: "Global, 2019–2021",
    theirs: "14 % of flights form a warming contrail; 2 % of flights cause 80 % of the warming",
    ours: "Under 1 % of distance carries 80 %: as concentrated, measured by distance",
  },
  {
    topic: "Night",
    study: "Stuber & Forster 2007",
    ref: "Atmos. Chem. Phys. 7, 3153",
    url: "https://doi.org/10.5194/acp-7-3153-2007",
    where: "Global model",
    theirs: "Night flights: under 40 % of distance, 60 % of contrail forcing",
    ours: "Night: 49 % of distance, 73–75 % of warming (standard physics; descriptive)",
  },
  {
    topic: "Avoidance",
    study: "Martín Frías et al. 2024",
    ref: "Environ. Res.: Infrastruct. Sustain. 4 (2024)",
    url: "https://doi.org/10.1088/2634-4505/ad310c",
    where: "Commercial flight planner, ~85,000 simulated flights",
    theirs: "Contrail forcing −73 % for +0.11 % fuel (simulation)",
    ours: "Our alerts need a positive cautious (5th-percentile) estimate at 20 and 100 years, so we flag fewer flights than a central-estimate planner would",
  },
  {
    topic: "Avoidance",
    study: "Sonabend-W et al. 2024",
    ref: "Commun. Eng. 3, 184",
    url: "https://doi.org/10.1038/s44172-024-00329-7",
    where: "Randomised trial with American Airlines, 22 adjusted and 22 control flights",
    theirs: "Satellites saw 64 % fewer contrails on adjusted flights; about 2 % more fuel per adjusted flight",
    ours: "We use the same kind of check: satellite images confirm which predicted contrails really formed",
  },
];
