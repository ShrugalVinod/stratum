# Coverage audit — Delhi–Mumbai corridor

Rule (paper §3.3, pre-registered): opensky if fraction ≥ 0.5 (max gap 10.0 min) else adsbx.

**Decision (mechanical): `adsbx`** — OpenSky not audited (no historical access) → treated as 0.

*End to end* (not part of the rule; added 9 Nov 2026): continuous **and** seen north
of 26°N and south of 22°N (across the middle).

| date | source | direction | scheduled | observed | continuous | fraction | end to end |
|---|---|---|---|---|---|---|---|
| 2026-11-05 | adsblol | DEL-BOM | 62 | 38 | 38 | 0.61 | 0 |
| 2026-11-05 | adsblol | BOM-DEL | 63 | 19 | 18 | 0.29 | 0 |
| 2026-11-06 | adsblol | DEL-BOM | 60 | 27 | 27 | 0.45 | 0 |
| 2026-11-06 | adsblol | BOM-DEL | 63 | 14 | 13 | 0.21 | 0 |
| 2026-11-07 | adsblol | DEL-BOM | 62 | 5 | 5 | 0.08 | 0 |
| 2026-11-07 | adsblol | BOM-DEL | 62 | 6 | 5 | 0.08 | 0 |
| 2026-11-08 | adsblol | DEL-BOM | 48 | 8 | 8 | 0.17 | 0 |
| 2026-11-08 | adsblol | BOM-DEL | 48 | 1 | 1 | 0.02 | 0 |

![track density](track_density.png)

![gaps](gap_histogram.png)
