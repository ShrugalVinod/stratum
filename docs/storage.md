# Storage budget (Google Drive, 2 TB)

Warn the team at **60 % = 1.2 TB** (build prompt §2.3). Updated after every big job with
**measured** sizes. Rows marked *estimate* come from the build prompt and are replaced by
measurements in Phase 1.

| Item | Period | Size | Status |
|---|---|---|---|
| ERA5 pressure levels, padded domain | Mar 2025 – Feb 2026 + Jan 2026 | 30–60 GB | estimate (build prompt §3.2) |
| ERA5 single levels + T-only upper levels | same | a few GB | estimate |
| Meteosat-9 IODC, cropped, 2–6 channels | 12 months | 100–300 GB | estimate (build prompt §3.4). Must be measured on 1 day and approved before bulk download |
| ADS-B (OpenSky or 12 ADS-B Exchange days), bbox-filtered Parquet | sample days / year | pending | Phase 1 |
| Interim (segments, CoCiP × 3 scalings, detections, matches) | year | pending | Phases 2–5 |
| Models, reports, web exports | – | < 10 GB | estimate |

| Date | Drive used (total) | Change | Job |
|---|---|---|---|
| 2026-10-13 | pending (reported by `colab/00_smoke_test.ipynb`) | – | Phase 0 setup |
