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

// Ticker under the hero. Every number is from the exported build (day.json, manifest.json).
export const facts = [
  "1 Jan 2026 · 1,458 commercial flights on the map",
  "66 persistent-contrail segments from 6 flights (physics only, B1)",
  "31 days × 8 flight levels × 24 hours of contrail conditions",
  "Meteosat-9 checks every 15 minutes",
  "Analysis plan locked 13 Oct 2026",
  "Results: none yet — they arrive in Phase 7",
];

// Phase status: update as phases are accepted (source: docs/phase_reports).
export type PhaseState = "done" | "current" | "upcoming";
export const statusUpdated = "17 Oct 2026";
// logged = date of the progress-log entry that finished the phase (docs/progress.md)
export const phases: { n: number; name: string; state: PhaseState; logged?: string }[] = [
  { n: 0, name: "Setup & pre-registration", state: "done", logged: "13 OCT" },
  { n: 1, name: "Data ingest", state: "done", logged: "14 OCT" },
  { n: 2, name: "Physics baseline", state: "done", logged: "15 OCT" },
  { n: 3, name: "Satellite detector", state: "done", logged: "15 OCT" },
  { n: 4, name: "Web app v0", state: "done", logged: "17 OCT" },
  { n: 5, name: "Labels & matching", state: "done", logged: "18 OCT" },
  { n: 6, name: "Evaluation (H1)", state: "current" },
  { n: 7, name: "Correction & decisions", state: "upcoming" },
  { n: 8, name: "Final web app", state: "upcoming" },
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

export const hypotheses = [
  {
    id: "H1",
    plain: "Uncorrected physics under-predicts the persistent contrails that satellites actually detect.",
    test: "Ratio of B1-predicted persistence to observed detectable contrails; supported if the upper 95 % CI is below 1.",
  },
  {
    id: "H2",
    plain: "STRATUM's corrected forecast is clearly more skilful than the best existing correction (B3).",
    test: "Mean held-out-season Brier skill score vs B3 ≥ 0.10 with lower 95 % CI > 0. Primary endpoint.",
  },
  {
    id: "H3",
    plain: "A small share of flying causes most contrail warming.",
    test: "Share of cruise distance carrying 80 % of positive modelled energy forcing ≤ 10 %.",
  },
  {
    id: "H4",
    plain: "Night flights cause a larger share of contrail warming than their share of distance.",
    test: "Night EF share minus night distance share (18:00–06:00 local solar time); lower 95 % CI > 0.",
  },
];

export const methods = [
  { title: "Data", body: "ERA5 weather, Meteosat-9 imagery every 15 minutes, ADS-B flight tracks for 12 first-of-month days (Mar 2025 – Feb 2026), and an aircraft database." },
  { title: "Physics baseline", body: "Schmidt–Appleman formation check, then CoCiP for persistence and energy forcing, with three humidity baselines and Monte Carlo ranges." },
  { title: "Satellite detection", body: "A transparent line-filter detector on the 10.8 − 12.0 µm brightness-temperature difference, tuned on 51 Meteosat scenes labelled by three contrail experts (DLR dataset) and checked on 89 others (precision 0.22, recall 0.23). Over India it is also checked against 100 scenes whose labels Claude drafted and team members reviewed: a secondary, exploratory check." },
  { title: "Matching and labels", body: "Each predicted contrail is advected with the wind for 20–120 min, parallax-corrected and matched within 2 px and 20°. A segment counts as observed only if it matches in at least two satellite images; cloudy or steep-angle scenes are labelled unknown, never \"no contrail\". A wrong-day check measures how many matches are chance." },
  { title: "Correction and decision", body: "A calibrated model learns where physics is wrong; the decision layer ranks altitude changes by their lower-bound net warming avoided." },
];

// Dated lab diary (source: docs/progress.md). Newest first.
export const progress = [
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
  { source: "Natural Earth", what: "Coastlines, borders (India point of view), cities", use: "Base map", credit: "Made with Natural Earth", limits: "Simplified for the web." },
];
