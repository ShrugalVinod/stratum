# CoCiP end to end on STRATUM's ERA5 files — Phase 1, task 1.4

Run 2026-10-14 with pycontrails **0.64.0** (all versions: `uv.lock`). Inputs: STRATUM's own
CDS download for 15 Jan 2026 (`raw/era5/{pl,sl}/2026-01_days-15-15`), loaded straight into
`pycontrails.MetDataset` with no conversion, which confirms the downloader's layout is what
CoCiP expects. Settings: humidity scaling = constant 1.0 (= B1 raw), aircraft performance =
Poll–Schumann (`PSFlight`), A320, `max_age` 6 h. Notebook: `notebooks/01d_cocip_end_to_end.ipynb`.

| Test | Result |
|---|---|
| 1. Synthetic VIDP → VABB, FL350, 03:00 UTC, 110 one-minute waypoints | Air 226.6–230.0 K, RHi 0.07–0.12 → SAC not satisfied anywhere, **no contrail**, EF = 0. Consistent with the very dry corridor in the ERA5 sanity map. Engine efficiency from PS model 0.270–0.280. |
| 2. Synthetic flight through the most supersaturated cold spot at 250 hPa (39.0°N 86.5°E, RHi 1.15, 213 K), FL340, 05:30–06:29 UTC | SAC satisfied at 59/60 waypoints; CoCiP initial persistence at 59; contrail evolution table 88 rows, max age 1.78 h; total EF −6.8 × 10¹² J (net cooling: late-morning local time, shortwave reflection dominates). |
| STRATUM SAC vs pycontrails SAC on CoCiP's own interpolated T, RHi, η | **100 % agreement** (59/59 forming waypoints) |

Notes for Phase 2:

* "Persistent" differs by definition: STRATUM's pre-registered B1 flag is SAC ∧ RHi ≥ 1 at
  flight level (28 waypoints here); pycontrails' `persistent_1` means the ice survives the
  wake-vortex sinking phase (59). The build prompt (§6.3) already reports CoCiP-B1 as a
  separate variant.
* The ISSR used in test 2 lies on the **northern edge of the padded download box** (39°N).
  Contrails advected out of the box end early. Phase 2 must count how many contrails hit the
  box edge before reaching `max_age`, and widen the padding if it matters.
