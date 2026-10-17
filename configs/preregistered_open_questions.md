# Pre-registration: open questions

These are questions the methods paper (v1.0, 12 Oct 2026) leaves unspecified.
Each must be **settled before the relevant results are seen**. Settled answers
are part of the pre-registration: `stratum lock-preregistration` hashes this file
together with `configs/preregistered.yaml`, so editing a settled answer after the
lock counts as a deviation (log it in `docs/deviations.md`).

Owners: SV Shrugal Vinod · AH Aditya Harsoda · IK Ishaan Kupnur · AS Abeer Shah.

Status key: **SETTLED** (fixed now) · ⚑ **OPEN** (must be settled before the phase named).

---

### 1. H1: raw detected occurrence, or efficiency-adjusted? — SETTLED (2026-10-13)
**Answer.** Primary: the **raw detectable-contrail** ratio, i.e. B1-predicted persistent
contrails ÷ satellite-detected contrails, over observable labelled segments. Secondary:
the same ratio after dividing observed occurrence by the estimated detection efficiency (Q4).
**Why.** Paper §4.5 says the model predicts the probability of a *detectable* persistent
contrail, so like is compared with like. The efficiency-adjusted ratio depends on Q4's
thresholds, which add their own uncertainty, so it is reported but does not decide H1.

### 2. Aggregating per-image matches to one label per segment — SETTLED (2026-10-13)
`preregistered.yaml: matching.segment_label_rule` (`min_observable_slots: 2` is flagged "team to confirm" in the YAML; confirm it before the lock).
**Answer.** y = 1 if the segment is matched at **any observable** slot time in the 20–120 min
window. y = 0 if it is observable at **≥ 2** slot times and matched at none. Otherwise
y = missing. Per-time details are stored so other rules can be run as sensitivity analyses.
**Why.** One observable match is evidence of a contrail. A single observable "no match" is
weak evidence of absence, so two are required before calling a segment negative.

### 3. Operationalising "Cohen's κ at object level" (§4.4) — SETTLED (2026-10-17, Team OK: S. Vinod) · before any label exists
`preregistered.yaml: detection.agreement_metric` is `null` until this is settled.
**Recommended answer.** κ is computed on a fixed grid of **16 × 16-px cells** (a cell is positive for a
labeller if any of their polylines passes through it), with scene-bootstrap 95 % CIs.
Object-level agreement is reported alongside as **symmetric object F1**. Two polylines match
if the mean perpendicular distance ≤ 2 px over their overlap, the overlap is ≥ 50 % of the
shorter, and the orientation difference ≤ 20° (one-to-one, Hungarian assignment).
**Why.** κ needs true negatives. Objects have no natural "negative object", so κ on objects
alone is undefined; the grid supplies negatives while staying close to the object scale.
Deviation note: the paper's wording "κ at object level" is honoured by the object F1 and the
small grid. Must be decided before any labels exist.

### 4. Detection-efficiency thresholds (Driver et al. 2025) — SETTLED (2026-10-17, Team OK: S. Vinod) · option A, before any matching
Needs the actual optical-depth and width thresholds from Driver, Stettler & Gryspeerdt
(2025), *AMT* 18, 1115–1134. Do not estimate them; read them from the paper (Ishaan to send
the PDF or the table) and write them here with page/table references.

*Finding (2026-10-17, paper read in full; PDF in the team folder as `amt-18-1115-2025.pdf` (doi:10.5194/amt-18-1115-2025),
CC BY 4.0):* the paper gives **no single table of thresholds**. Detectability is a 3-D surface in
(IWP₀, r_eff, width), shown only as figures (Fig. 5, Fig. 8); the threshold grids are not
published ("analysis code is available on request", p. 1131). What it states in numbers:
- Detection criterion: detected effective width w_eff > R/2, R = imager resolution (§2.2, Eq. 4,
  p. 1119); threshold surface at p_obs > 0.5, uncertainty from p_obs 0.25 / 0.75 (§3.2, p. 1122).
- **Optical thickness below ≈ 0.05 is undetectable at any width** (§3.2, p. 1123).
- Width: detection starts at widths slightly below the imager resolution (§3.1, p. 1120, Fig. 3c);
  narrower contrails need a higher optical thickness (Fig. 5a).
- Resolutions simulated: 0.5, 2 and 7 km; 7 km stands for "previous-generation geostationary
  imagers at mid-latitudes (e.g. MSG-SEVIRI)" (p. 1124). Meteosat-9 SEVIRI over India is ~3 km at
  nadir, ~4–5 km over India: between the paper's 2 km and 7 km cases.
- Instantaneous observable share of CoCiP segments: 46 ± 2 % at 2 km (p. 1124); unobservable
  62 ± 2 % at 7 km, i.e. 38 ± 2 % observable (p. 1131); net RF observable 70 ± 2 % at 2 km (p. 1124).
- Over the life cycle (24 h sample, 2 km): 57 % observable at least once, 97 % of lifetime LW
  forcing; median onset of detectability 21 min after formation (quartiles 10–94 min) (p. 1128).
- Idealised: clear ocean background, nadir view, one Mannstein-style algorithm, GOES-ABI bands.
  Against a background cirrus layer < 2 % of segments are detectable (p. 1125).
Options for the team (not settled): (a) population efficiency range 0.38–0.46 (paper's 7 km and
2 km results, bracketing SEVIRI over India) for the secondary efficiency-adjusted H1; (b) a
per-segment flag from the stated numbers (CoCiP τ ≥ 0.05 and width ≥ local pixel size), stored as
a separate uncertainty term; (c) ask the authors for the threshold grids.

*Answer (2026-10-17, Team OK: S. Vinod): the per-segment rule ("option A" in chat = (b) above).*
A predicted contrail is **detectable** if CoCiP optical depth ≥ 0.05 AND CoCiP width ≥ 1 local
Meteosat pixel (√ of the pixel area at that location). Stored per segment as a separate
uncertainty term, used only for the secondary, efficiency-adjusted H1, never folded into y.
The paper's population shares (0.46 at 2 km, 0.38 at 7 km) are reported as a cross-check.
See `preregistered.yaml: hypotheses.H1.detection_efficiency_thresholds`.

### 5. Climate-metric conversion factors (20- and 100-year horizons) — ⚑ OPEN · owner SV · before Phase 7 step 7.6.4
Needs a cited, published method to put contrail energy forcing (J) and CO₂ (kg) on a common
basis at 20 and 100 years (for example a GWP- or ATR-based contrail-EF-to-CO₂e factor).
Factors and citation go here **before** anything is computed. Do not invent factors.

### 6. Aircraft mass fraction — SETTLED (2026-10-13)
**Answer.** Mass = **0.80 × MTOW**; sensitivity runs at **0.70** and **0.90**.
**Why.** Paper §4.2 fixes a constant fraction with sensitivity tests but no value. 0.80 is a
mid-range cruise mass for a domestic narrow-body; the two sensitivity runs bracket light and
heavy loading.

### 7. January 2026 is both the development month and inside the winter test fold — SETTLED (2026-10-13)
**Answer.** Option (b): report the winter fold **both with and without January 2026**. Both
numbers appear in every winter result. Any tuning done on January 2026 is listed in
`docs/decisions.md`.
**Why.** Keeps the paper's development month and evaluation year unchanged, and shows any
leakage openly instead of hiding it.

### 8. Engine overall propulsion efficiency η — SETTLED (2026-10-13)
**Answer.** Per aircraft type from OpenAP (primary, paper §4.2); 0.30 where a type has no
value (paper Appendix A); sensitivity runs at 0.25 and 0.40 (Appendix A). Engineering guards,
not pre-registered: values clipped to 0.20–0.45 with a logged warning, and pycontrails'
Poll–Schumann η as a cross-check.

### 9. Labelling rules that affect scoring — SETTLED (2026-10-13)
**Answer.** Paper Appendix B rules 1, 4, 5 and 6 are frozen in `preregistered.yaml`
(`labelling_rules`): minimum length 10 px; scene status clear / partly obscured / obscured,
with obscured excluded from scoring; uncertain lines scored separately; labellers blind to
tracks and predictions. The rest of the guide may be revised after the pilot (§4.4).

### 10. How labeller disagreements are resolved — SETTLED (2026-10-13)
**Answer.** By **discussion between the two labellers** (paper §4.4). The labeller app's
adjudication mode records the agreed result and who agreed. If they cannot agree, the object
is kept as "uncertain" (scored separately, rule 9).

### 11. What counts as "opaque cloud" in the EUMETSAT cloud mask — SETTLED (2026-10-17, Team OK: S. Vinod) · option (b), before any matching
Depends on the categories of the Meteosat-9 IODC cloud-mask product, which we will read in
Phase 1. Must be fixed before any matching results are looked at.

*Finding (2026-10-14):* `EO:EUM:DAT:MSG:CLM-IODC` has only four categories: clear sky over
water, clear sky over land, **cloudy**, no data. It cannot separate opaque from thin cloud,
and thin contrails/cirrus may themselves be flagged "cloudy". Options to decide in Phase 5:
(a) treat every "cloudy" pixel near the segment as opaque (simple, very conservative: may
discard real contrails); (b) use "cloudy" only where T10.8 is also cold and BTD small (an
opaque-cloud signature), documented thresholds; (c) add the IODC cloud-top-height product
(`EO:EUM:DAT:MSG:CTH-IODC`) and call cloud opaque if it is a thick layer below the segment.

*Answer (2026-10-17, Team OK: S. Vinod): option (b), as a box rule.* A matching window is opaque
if more than 50 % of the pixels in a 15 × 15-px box centred on the parallax-corrected, advected
segment midpoint are "cloudy". A 0–2 h contrail is at most ~3 px wide, so on its own it covers
≤ ~20 % of the box and cannot make its window "opaque"; 0.5 mirrors the ERA5 high-cloud threshold.
Set before any matching was run. See `preregistered.yaml: observability.opaque_cloud_mask_classes`.

### 12. Number of CoCiP Monte Carlo members for EF ranges — SETTLED (2026-10-15)
**N = 20** Monte Carlo members (approved by Shrugal, 15 Oct 2026). A convergence check (N = 20 vs N = 40 on one corridor day: change in EF p5/p50/p95) is reported in the Phase 2 sanity report. If the ranges are not stable, a larger N is adopted only through the deviation log, before any evaluation run.

**Amended 2026-10-15 by deviation D-001: N = 100.** The N = 20 vs 40 check moved p05 by 27.8 %; N = 100 is used for all CoCiP runs, with an N = 100 vs 200 check reported.

### 13. Latitude bands for the learned RHi scaling factor — SETTLED (2026-10-13)
**Answer.** 6–15°N, 15–25°N, 25–37°N.
**Why.** Roughly southern peninsula / central India / north India and the Himalayan
foothills; three bands keep enough labels in each band × season cell.

### 14. Minimum labelled examples for a "well covered by validation data" note — SETTLED (2026-10-13)
**Answer.** N = 50 labelled examples in the segment's (season, latitude band, FL band,
VZA band, day/night) cell; otherwise the card says "extrapolating".

### 15. Gradient-boosting library — SETTLED (2026-10-13)
**Answer.** LightGBM, on CPU. XGBoost is not used for the main model.
**Why.** Native monotone constraints, and trees on ~10⁶ rows train in minutes on CPU. Using a
single library avoids "we tried both and picked the better one".

### 16. Random seed for the 100 / 100 tuning / held-out split of the labelled scenes — SETTLED (2026-10-17): seed = 20261017, before any scene was sampled
`preregistered.yaml: detection.labelled_split.seed` is `null`. Pick any integer **once**, write it
in the YAML and here, and never change it: re-drawing the split until the detector looks good
would be leakage. After the lock, filling this `null` is allowed; changing it later is a deviation.
