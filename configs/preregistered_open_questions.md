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
**Answer.** y = 1 if the segment is matched at **any observable** slot time in the 20–120 min
window. y = 0 if it is observable at **≥ 2** slot times and matched at none. Otherwise
y = missing. Per-time details are stored so other rules can be run as sensitivity analyses.
**Why.** One observable match is evidence of a contrail. A single observable "no match" is
weak evidence of absence, so two are required before calling a segment negative.

### 3. Operationalising "Cohen's κ at object level" (§4.4) — SETTLED (2026-10-13)
**Answer.** κ is computed on a fixed grid of **16 × 16-px cells** (a cell is positive for a
labeller if any of their polylines passes through it), with scene-bootstrap 95 % CIs.
Object-level agreement is reported alongside as **symmetric object F1**. Two polylines match
if the mean perpendicular distance ≤ 2 px over their overlap, the overlap is ≥ 50 % of the
shorter, and the orientation difference ≤ 20° (one-to-one, Hungarian assignment).
**Why.** κ needs true negatives. Objects have no natural "negative object", so κ on objects
alone is undefined; the grid supplies negatives while staying close to the object scale.
Deviation note: the paper's wording "κ at object level" is honoured by the object F1 and the
small grid. This was decided before any labels existed.

### 4. Detection-efficiency thresholds (Driver et al. 2025) — ⚑ OPEN · owner IK · before Phase 5 step 5.5.7
Needs the actual optical-depth and width thresholds from Driver, Stettler & Gryspeerdt
(2025), *AMT* 18, 1115–1134. Do not estimate them; read them from the paper (Ishaan to send
the PDF or the table) and write them here with page/table references.

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

### 11. What counts as "opaque cloud" in the EUMETSAT cloud mask — ⚑ OPEN · owner IK · before Phase 5 step 5.5.5
Depends on the categories of the Meteosat-9 IODC cloud-mask product, which we will read in
Phase 1. Must be fixed before any matching results are looked at.

### 12. Number of CoCiP Monte Carlo members for EF ranges — ⚑ OPEN · owner SV · before Phase 2 full-month run
Start with N = 20 for development. The final N depends on measured Colab run time.

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
