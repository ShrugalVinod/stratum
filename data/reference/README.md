# Reference data filled in by humans

## `scheduled_flights.csv` (coverage audit, paper §3.3, build prompt §4.1)

Copy `scheduled_flights_template.csv` to `scheduled_flights.csv` and add **one row per
scheduled Delhi ↔ Mumbai flight** on each audit day. Delete the example row.

| column | what to write | example |
|---|---|---|
| `date` | the UTC date of the flight (YYYY-MM-DD) | `2026-01-01` |
| `direction` | `DEL-BOM` (Delhi → Mumbai) or `BOM-DEL` | `DEL-BOM` |
| `airline` | 2-letter IATA code: `6E` IndiGo, `AI` Air India, `IX` Air India Express, `QP` Akasa, `SG` SpiceJet | `6E` |
| `flight_number` | the number only | `2134` |
| `sched_dep_utc` | scheduled departure in **UTC** (IST − 5:30), ISO format with `Z` | `2026-01-01T02:30:00Z` |
| `source_url` | the page you took it from | |
| `checked_by` | your name | `Ishaan` |

Rules: count **every** scheduled flight that day (not only ones you think were tracked);
include codeshares only once (the operating airline's number); write down where each number
came from. The code checks the columns and refuses bad directions.
