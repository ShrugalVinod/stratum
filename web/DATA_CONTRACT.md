# STRATUM web data contract v1.0.0

Produced by `stratum export-web --month 2026-01` (code: `stratum/export/`). Written to
`<drive>/web_exports/<build_id>/`, copied into `web/public/data/<build_id>/` for a site build.
JSON Schemas generated from the pydantic models are in `web/schemas/`; the app validates
every file with zod on load.

| File | Model | Notes |
|---|---|---|
| `manifest.json` | `Manifest` | build id, git commit, config hash, days, flight levels (FL + hPa), grid georeferencing, coverage (null until the audit), credits |
| `corridor.geojson` | GeoJSON Feature | 75-km Delhi–Mumbai polygon |
| `days/<date>/day.json` | `DaySummary` | counts; `has_flights` false for days without ADS-B data |
| `days/<date>/grids/FL{nnn}_{HH}.png` | 8-bit grey PNG | value/255 = fraction of the UTC hour with B1 persistent-contrail conditions (SAC ∧ RHi ≥ 1, η = 0.30); north-up; extents in `manifest.grid` (cell centres) |
| `days/<date>/flights.geojson` | Features with `FlightProps` | commercial corridor flights only; Douglas–Peucker 200 m; `minutes` = minutes after 00 UTC per vertex |
| `days/<date>/segments_flagged.json` | `FlaggedSegment[]` | CoCiP B1 persistent segments, sorted by EF (largest first) |

Rules
- `null` means "not available yet". Phase-7 fields (`p_persistent`, `best_alternative_fl`, `extra_fuel_kg`, `extra_co2_kg`, `net_warming_avoided_20y/100y`) are always `null` in v0; the app shows "— (Phase 7)".
- `flight_id` is `sha256(salt | piece id)[:12]` with a private salt (`STRATUM_ID_SALT`). ICAO24 addresses are never exported.
- Size budget: each `days/<date>/` folder ≤ 3 MB (the export fails otherwise).
- The 5th-percentile EF is flagged as unstable (`ef_note`, Phase 2 convergence check).
