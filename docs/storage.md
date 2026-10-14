# Storage budget (Google Drive, 2 TB)

Warn the team at **60 % = 1.2 TB** (build prompt §2.3). Updated after every big job with
**measured** sizes. Rows marked *estimate* come from the build prompt and are replaced by
measurements in Phase 1.

| Item | Period | Size | Status |
|---|---|---|---|
| ERA5 pressure levels (`pl`), padded domain | Mar 2025 – Feb 2026 | **≈ 3.1 GB/month → ≈ 37 GB** | **measured** 2026-10-14: 102 MB for 1 day (Zarr, compressed) |
| ERA5 single levels (`sl`) + T-only upper levels (`tropo_T`) | same | ≈ 0.14 GB/month → ≈ 1.7 GB | **measured**: 1.9 + 2.6 MB per day |
| Meteosat-9 IODC, cropped, 6 IR channels (uint16) + cloud mask | **Plan A**: 14 days (+2 h each) ≈ 1,550 slots | **≈ 8.5 GB** | **measured** 2026-10-14: 5.5 MB/slot (L1.5 crop) + 0.09 MB/slot (cloud mask). Full year (only if OpenSky) ≈ 35,000 slots ≈ 195 GB |
| Meteosat static grid (lat, lon, VZA, pixel area) | once | 14 MB | measured |
| ADS-B Exchange days, ≥ FL200 in padded box, Parquet | 12 days + audit days | ≈ 0.1 GB/day (estimate from a measured 5-min slice: 18.8 k rows) | download ≈ 12 GB/day over the network (not stored) |
| Interim (segments, CoCiP × 3 scalings, detections, matches) | year | pending | Phases 2–5 |
| Models, reports, web exports | – | < 10 GB | estimate |

| Date | Drive used (total) | Change | Job |
|---|---|---|---|
| 2026-10-14 | aircraft DB parquet ≈ 15 MB (laptop copy) | +0.02 GB | Phase 1 |
| 2026-10-13 | STRATUM folder: a few KB (empty layout + smoke-test manifest) | +0 GB | Phase 0 smoke test (`colab/00_smoke_test.ipynb`) |
