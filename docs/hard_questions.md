# Hard questions judges will ask

Short, honest answers. Every number cites its source. Numbers from **our own** results are
marked *pending* until the relevant phase produces them; never fill them in by hand.
Updated at the end of every phase.

### "Isn't India's contrail problem small?"
Maybe, and that's exactly what we test. The only global study covering India (Teoh et al.
2024) finds India and China together have 19 % of flight distance but only 6 % of contrail
energy forcing. But that estimate uses a humidity correction tuned on measurements from
other regions, and nobody has checked it against contrails actually seen by satellite over
India. If our hypothesis H1 is refuted, that supports the low estimate, and we'll publish
it either way (paper §6.4). Also, India's fleet more than doubled between 2014 and 2025, so
the absolute amount grows regardless. Our result: *pending (Phase 6)*.

### "What if air traffic control says no?"
STRATUM doesn't model ATC, and every output says so. It's a ranked list of *candidates*
where a level change would most likely help. In operations a dispatcher or ATC decides.
Our ±2,000 ft option keeps the same direction-of-flight level parity under RVSM, which is
why it's the natural first option. Real trials show it can work operationally: in a US airline
trial, flights that adjusted altitude made 64 % fewer contrails for about 2 % more fuel per
adjusted flight (Sonabend-W et al. 2024).

### "How do you know the satellite really saw that contrail?"
Three layers: (1) a detector based on the 10.8 − 12.0 µm brightness-temperature difference,
which is how ice crystals show up in infrared, day and night; (2) 200 hand-labelled scenes,
each labelled independently by two people, with agreement (κ) reported; (3) a match only
counts if the line is within 2 pixels and 20° of where the wind carried the predicted
contrail, 20–120 minutes after the plane passed, corrected for satellite parallax. Where the
satellite *couldn't* have seen a contrail (cloud, steep viewing angle), the label is
"unknown", never "no contrail". Detector precision/recall and κ: *pending (Phase 5)*.

### "Why not just use Google's or others' tools?"
They're built and validated over the US, Europe and the North Atlantic, on humidity
corrections fitted to in-situ data mostly collected there. We haven't found a study that
checks contrail forecasts over Indian airspace against satellite observations. We also use
their open physics engine (CoCiP via pycontrails) as our baseline and compare against the
best published correction (baseline B3) rather than competing with them.

### "What happens under monsoon cloud?"
The satellite often can't see contrails then, so many monsoon segments get label "unknown"
and are excluded from training and scoring. We report results by season so this is visible,
and we never treat "couldn't see" as "no contrail" (paper §4.5, Table 7). Observable fraction
by season: *pending (Phase 5)*.

### "How much fuel does this cost?"
For each flagged segment we compute the extra fuel of the alternative level with OpenAP,
convert it to CO₂ (3.16 kg CO₂ per kg fuel), and only raise an alert when the *lower bound*
of net warming avoided is positive under both 20- and 100-year horizons, so false alarms
don't burn fuel for nothing. Published trial: about 2 % more fuel per adjusted flight
(Sonabend-W et al. 2024). Our numbers: *pending (Phase 7)*.
