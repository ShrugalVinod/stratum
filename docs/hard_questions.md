# Hard questions judges will ask

Short, honest answers. Every number cites its source. Our own results come from the logged final
runs (`_locks/final_runs.jsonl`, `docs/decisions.md`); never fill them in by hand.
Updated at the end of every phase (last: Phase 7, 19 Oct 2026).

### "Isn't India's contrail problem small?"
Maybe, and that's exactly what we test. The only global study covering India (Teoh et al.
2024) finds India and China together have 19 % of flight distance but only 6 % of contrail
energy forcing. But that estimate uses a humidity correction tuned on measurements from
other regions, and nobody has checked it against contrails actually seen by satellite over
India. If our hypothesis H1 is refuted, that supports the low estimate, and we'll publish
it either way (paper §6.4). Also, India's fleet more than doubled between 2014 and 2025, so
the absolute amount grows regardless. **Our result (H1, not supported):** raw ERA5 physics predicts
about 6× more lasting contrails than Meteosat-9 sees (ratio 6.44, 95 % CI 4.92–12.12), but only
~16 % of predicted contrails are thick and wide enough to see; allowing for that, the two agree
(1.05). So we found no sign that the low estimate for India is too low. And the warming is very
concentrated: under 1 % of flying carries 80 % of it (H3, 0.48 % with raw ERA5).

### "What if air traffic control says no?"
STRATUM doesn't model ATC, and every output says so. It's a ranked list of *candidates*
where a level change would most likely help. In operations a dispatcher or ATC decides.
Our ±2,000 ft option keeps the same direction-of-flight level parity under RVSM, which is
why it's the natural first option. Real trials show it can work operationally: in a US airline
trial, flights that adjusted altitude made 64 % fewer contrails for about 2 % more fuel per
adjusted flight (Sonabend-W et al. 2024).

### "How do you know the satellite really saw that contrail?"
Four layers: (1) a detector based on the 10.8 − 12.0 µm brightness-temperature difference,
which is how ice crystals show up in infrared, day and night, tuned on 51 Meteosat scenes that
three DLR contrail experts labelled and checked on 89 others (precision 0.22, recall 0.23; D-002);
(2) over India, 100 scenes whose lines Claude drafted and team members reviewed (an honest,
secondary check, disclosed as AI-assisted: D-003); (3) a match only counts if the line is within
2 pixels and 20° of where the wind carried the predicted contrail, 20–120 minutes after the plane
passed, corrected for parallax, **in at least two images** (D-004); (4) a "wrong-day" test that
matches each day's flights against another day's images, so every match there is chance: it says
about a third of our matches are coincidence, and we report that next to every result. Where the
satellite *couldn't* have seen a contrail (cloud, steep viewing angle), the label is "unknown",
never "no contrail". Weak point we state openly: the detector is far from perfect.

### "Why not just use Google's or others' tools?"
They're built and validated over the US, Europe and the North Atlantic, on humidity
corrections fitted to in-situ data mostly collected there. We haven't found a study that
checks contrail forecasts over Indian airspace against satellite observations. We also use
their open physics engine (CoCiP via pycontrails) as our baseline and compare against the
best published correction (baseline B3) rather than competing with them.

### "What happens under monsoon cloud?"
The satellite often can't see contrails then, so many monsoon segments get label "unknown"
and are excluded from training and scoring. We report results by season so this is visible,
and we never treat "couldn't see" as "no contrail" (paper §4.5, Table 7). In our data, monsoon
days had only 3–5 % of satellite images observable, and the satellite saw 1 contrail in 9,803
checked monsoon segments, so our results speak to winter and spring; we say so.

### "How much fuel does this cost?"
For each flagged segment we compute the extra fuel of the alternative level with OpenAP,
convert it to CO₂ (3.16 kg CO₂ per kg fuel), and only raise an alert when the *lower bound*
of net warming avoided is positive under both 20- and 100-year horizons, so false alarms
don't burn fuel for nothing. Published trial: about 2 % more fuel per adjusted flight
(Sonabend-W et al. 2024). **Our numbers (Phase 7, 12 days):** 333 alerts on 402 flagged stretches of
flight, avoiding a median 578 t CO₂e at the 100-year horizon. On balance OpenAP says the alerted
moves *save* 12 t of fuel, because it finds higher levels slightly cheaper; 207 alerts remain if we
give no credit for that. Most alerts (259) fall on one humid day, and the corrected physics behind
them is too dry, so treat these as a demonstration, not a forecast of savings.

### "Does your machine-learning model actually work?"
Partly, and we say exactly how. It passes our pre-registered test against the best published
correction (H2: skill 0.86, CI 0.82–0.91), but a constant guess of the average contrail rate passes
too, because that correction only says yes or no. Against the constant guess our model is not
better overall. What it does well is *ranking*: it picks out the flights most likely to make a
visible contrail far better than physics rules (AUROC 0.65–0.83 vs 0.42–0.66), mostly by treating
humidity as a scale instead of a yes/no cut-off. Feeding it back into the physics as one humidity
factor was too blunt, and we report that as a lesson, not hide it.
