# H2–H4 results — draft paragraphs for the paper (§6.4, §7)

From the final runs H2 20261018T140654Z_7559cda and H3/H4 20261019T034442Z_5f31ccd (18–19 Oct
2026), with the descriptive context runs (B1, B3 physics) labelled as such. Claude's draft for the
team to edit; every number is from `docs/decisions.md` and evaluation report v2.

**H2.** On the four held-out seasons, the calibrated STRATUM model's mean Brier skill score against
the latitude-dependent correction (B3) was 0.86 (95 % day-bootstrap interval 0.82–0.91), so H2 is
supported as pre-registered. The margin does not come from the correction itself: a constant
forecast of the training contrail rate scores the same against B3 (0.86), because B3 is a yes/no
forecast and the Brier score rewards any sensible probability for an event seen in about 0.5 % of
segments. Against that constant forecast STRATUM's mean skill was −0.19 (−1.07 to −0.08): slightly
better in the pre-monsoon, post-monsoon and winter seasons (by 0.3–1.1 %), much worse in the monsoon,
when the satellite saw one contrail in 9,803 segments. Where the model does add something is in
ranking: its AUROC was 0.78–0.83 against 0.46–0.57 for the physics baselines, and a logistic
regression on RHi alone came close (0.78–0.79). Treating humidity as a continuous predictor instead
of a threshold at ice saturation does most of the work; the other 17 features add little
(skill vs the RHi-only logistic 0.05, 0.02–0.10), and isotonic calibration did not improve the
validation score.

**H3.** The pre-registered test uses energy forcing from CoCiP with the learned humidity
correction. That correction sat at its upper bound (RHi divided by 1.20) in every latitude band, and
feeding it back as a single divisor removed almost all persistent contrails (1,583 of 3.9 million
cruise segments with warming EF), so the logged share of cruise distance carrying 80 % of the
warming, 0.0044 % (0.0008–0.012 %), supports H3 for a partly artificial reason. With standard
physics the conclusion stands on firmer ground: 0.48 % of cruise distance with raw ERA5 (0.30–0.72 %)
and 0.54 % with the published correction (0.35–0.80 %) carry 80 % of the warming (descriptive,
added after the final run). Contrail warming over India is concentrated in well under 1 % of flying.

**H4.** In the logged run, flights between 18:00 and 06:00 local solar time carried 84 % of the
positive energy forcing against 49 % of the cruise distance, but with only 1,583 warming segments
the 95 % interval of the difference (−0.03 to 0.45) reaches below zero, so H4 is not supported as
pre-registered. With standard physics the night excess is clear: 73 % vs 49 % with raw ERA5
(difference 0.24, 0.21–0.31) and 75 % vs 49 % with B3 (0.27, 0.23–0.33), descriptive.

**Decision layer.** For each warming contrail the corrected physics flagged on the 12 held-out days,
we tried ±2,000 and ±4,000 ft with 100 Monte Carlo members (humidity and detection efficiency, CoCiP
parameters, efficacy). 333 of 402 flagged stretches met the conservative alert rule (5th percentile
of net warming avoided above zero under both the 20- and 100-year horizons), 259 of them on a single
humid day (1 Feb 2026); 207 alerts remain if a fuel saving at the new level is not credited. The
alerts would avoid a median 578 t CO₂e at the 100-year horizon (5th percentile 240 t). Air traffic
control feasibility is not modelled.

**What this means.** Raw ERA5 physics over-predicts the contrails Meteosat-9 can see, mostly because
most predicted contrails are too thin to detect (H1). A learned correction ranks contrail-prone
segments much better than any yes/no physics rule, but its probabilities barely beat the base rate,
and the planned way of feeding it back into the physics (one humidity divisor per latitude band) is
too blunt. The robust, decision-relevant result is H3 and the night excess: a fraction of a percent of
flying, mostly at night, carries most of the contrail warming over India.
