# H1 result — draft paragraph for the paper (§6.4)

From the final run 20261018T113902Z_4a82cfa (18 Oct 2026). Generated text, with one wording fix:
"June–October" → "June–September" (October and November do have labels: 39 and 182 y = 1).
The second paragraph is Claude's proposed reading for the team to edit.

Across 334,211 observable labelled flight segments on 12 days, uncorrected ERA5 physics (B1)
predicted 10,076 persistent contrails against 1,564 observed by Meteosat-9 (ratio 6.44, 95 %
day-bootstrap interval 4.92–12.12); H1 is not supported. The interval lies entirely above 1:
uncorrected physics predicts *more* persistent contrails than the satellite detects, the
opposite of the hypothesis. Correcting the observations for detection efficiency (0.16, the
share of CoCiP-persistent segments meeting Driver et al.'s thresholds) gives a ratio of 1.05
(95 % CI 0.81–1.91); this secondary definition does not decide H1. The verdict is unchanged
across the label-rule, age-window and matching-tolerance variants (ratios 2.42–12.31, every
interval above 1) and without the development month, January 2026 (6.52, 4.95–14.05). Two
caveats bound the result: about a third of the satellite labels are expected to be chance
matches (Phase 5 wrong-day check), which inflates the observed count, and almost no labels
exist for June–September, when monsoon cloud hides contrails.

**Proposed reading.** Over India, the gap between physics and satellite is not that ERA5 is too
dry (the premise of H1), but that most contrails physics predicts are too thin
or too narrow for a geostationary imager to see: only 16 % of CoCiP's persistent contrails pass
Driver et al.'s detectability thresholds, and with that correction the two agree within the
uncertainty. Physics still has weak skill at telling which segments form visible contrails
(AUROC 0.54–0.67 outside the monsoon; about 97 % of its predicted persistent contrails are not
observed). The comparison rests on 12 flight days, so per-season intervals are rough, and the
detection efficiency itself comes from CoCiP. A correction model (H2) must therefore learn
*visible* contrail occurrence, and its value has to be shown against climatology as well as
against the latitude-corrected baseline.
