# Data sources and accounts

This page lists every account STRATUM needs and how to get each one, step by step.
Last checked against the official pages: **13 Oct 2026**. Websites change, so if a button
has moved, tell Claude and this page gets updated.

**Golden rule for keys:** a key or password is like a house key. It goes in exactly two
places: your local `.env` file (never committed; git ignores it) and **Colab Secrets** (the
🔑 icon in Colab's left sidebar). Never paste it into chat, code, a notebook cell, a
screenshot or a document.

| # | Account | Needed for | Phase | Cost | How long it takes |
|---|---|---|---|---|---|
| 1 | Copernicus Climate Data Store (CDS) | ERA5 weather data | 1 | free | 10 min |
| 2 | EUMETSAT Data Store | Meteosat-9 satellite images | 1 | free | 15 min |
| 3 | OpenSky Network (historical data) | ADS-B flight tracks | 1 | free (research) | **days to weeks** for approval, so start now |
| 4 | ADS-B Exchange | free sample days of flight tracks | 1 | free, no account | – |
| 5 | GitHub fine-grained token | Colab can download our private code | 0 | free | 5 min |

---

## 1. Copernicus Climate Data Store (ERA5)

ERA5 is the weather "reanalysis": temperature, humidity and wind everywhere on Earth,
every hour. We download it from the Copernicus Climate Data Store.

1. Go to <https://cds.climate.copernicus.eu> and click **Login/Register**. Create an account
   (it is an ECMWF account) and confirm the email.
2. Log in, click your name (top right) → **Your profile**. Scroll to **API Token** (also
   called *Personal Access Token*) and copy it.
3. **Accept the licence for each dataset.** This is a separate step and the most common cause
   of "403 Forbidden" errors later. Open each page below, click the **Download** tab, scroll to
   the bottom, and accept the *Terms of use* (Licence to use Copernicus Products):
   * ERA5 hourly data on pressure levels: <https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels>
   * ERA5 hourly data on single levels: <https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels>
4. **On the laptop:** open `.env` (copy it from `.env.example` if it doesn't exist) and set
   `CDSAPI_URL=https://cds.climate.copernicus.eu/api` and `CDSAPI_KEY=<your token>`.
   (Alternatively a file `~/.cdsapirc` with the lines `url: https://cds.climate.copernicus.eu/api`
   and `key: <your token>`. Use one method, not both.)
5. **In Colab:** add a secret named `CDSAPI_KEY` with the same token.
6. Tell Claude "CDS done". Claude tests it with a one-day download in Phase 1.

Requires `cdsapi >= 0.7.7` (pinned in `uv.lock`). Source:
<https://cds.climate.copernicus.eu/how-to-api>.

## 2. EUMETSAT Data Store (Meteosat-9 Indian Ocean images)

Meteosat-9 sits above the Indian Ocean at 45.5°E and photographs our region in infrared
every 15 minutes. We download its images from EUMETSAT.

1. Go to <https://data.eumetsat.int> and choose **Sign in → Register** (an EUMETSAT
   *EO Portal* account). Fill in the form (organisation: Indus International School;
   purpose: student research / education) and confirm the email.
2. Log in, then open <https://api.eumetsat.int/api-key>. You see a **Consumer Key** and a
   **Consumer Secret**. Copy both.
3. **On the laptop:** in `.env` set `EUMETSAT_KEY=<consumer key>` and `EUMETSAT_SECRET=<consumer secret>`.
4. **In Colab:** add secrets `EUMETSAT_KEY` and `EUMETSAT_SECRET`.
5. Tell Claude "EUMETSAT done". In Phase 1 Claude finds the exact Meteosat-9 IODC collections,
   checks that all 12 months of Mar 2025 – Feb 2026 exist, and records the data licence here.

The Python client is `eumdac` (pinned). Its command `eumdac set-credentials` is **not**
needed: STRATUM reads the two values from `.env` / Colab Secrets.

## 3. OpenSky Network: historical flight data (start this first!)

OpenSky collects ADS-B radio messages that aircraft broadcast (position, altitude, callsign).
Its *historical database* is free for research, but a person has to approve your request.

1. Create an OpenSky account at <https://opensky-network.org> (**Sign up**).
2. Create an account on the historical database at <https://trino.opensky-network.org>.
3. Request access at <https://opensky-network.org/my-opensky/request-data>. Write a short,
   honest description, **with Dr. Pant named as supervising teacher** (ideally sent from or
   copied to her school email). For example:
   > "STRATUM is a supervised high-school research project (Indus International School,
   > Bangalore; supervisor Dr. Varsha Pant) testing contrail forecasts over Indian airspace.
   > We need state vectors for 6–37°N, 68–98°E above FL200 for sample days between March 2025
   > and February 2026, to measure OpenSky coverage of the Delhi–Mumbai route against
   > scheduled flights. Non-commercial; results and code will be published openly with
   > attribution to OpenSky (Schäfer et al. 2014)."
4. Check OpenSky's FAQ for the current eligibility conditions. If they say no to a school
   project, **that is fine**: the pre-registered rule (paper §3.3) then sends us to the 12 free
   ADS-B Exchange days. Record the reply in `docs/decisions.md`.
5. When approved: in `.env` set `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` (your Trino login),
   and add the same two names as Colab secrets.

The Python client is `pyopensky` (added once access is granted). It reads exactly these two
environment variable names. Source: <https://mode-s.org/pyopensky/credentials.html>.

## 4. ADS-B Exchange: free sample days (no account)

ADS-B Exchange publishes its complete global "readsb-hist" data (a snapshot of every aircraft
every 5 seconds) **free for the 1st day of every month**, for testing and evaluation, at
`https://samples.adsbexchange.com/readsb-hist/YYYY/MM/01/`. No account or key is needed.

Terms (to be re-checked and quoted here in Phase 1): commercial use needs a licence; bulk
resale or redistribution is not allowed without their consent. So **we will not publish the
raw ADS-B Exchange data**, only our derived results (paper §9).
Sources: <https://www.adsbexchange.com/data-products/sample-data/>, <https://www.adsbexchange.com/api>.

## 5. GitHub token for Colab (do this now: needed for the Phase 0 smoke test)

Our code is in a **private** GitHub repo. Colab needs a key that can *read* it, and nothing else.

1. On GitHub: your profile picture (top right) → **Settings** → scroll down to
   **Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
2. Fill in:
   * **Token name:** `stratum-colab`
   * **Expiration:** custom, **31 May 2027** (or the longest allowed; renew when it expires)
   * **Resource owner:** `ShrugalVinod`
   * **Repository access:** *Only select repositories* → `stratum`
   * **Permissions → Repository permissions → Contents:** **Read-only**. (Metadata read-only
     is added automatically.) Leave everything else as *No access*.
3. Click **Generate token** and copy it (GitHub shows it only once).
4. Open Colab (<https://colab.research.google.com>), open any notebook, click the **🔑 key
   icon** in the left sidebar → **Add new secret** → Name `GITHUB_TOKEN`, Value: paste →
   switch **Notebook access** on.
5. Done. Don't save the token anywhere else.

**Opening our notebooks from GitHub:** the first time you open a
`colab.research.google.com/github/ShrugalVinod/stratum/...` link, Colab asks to connect to
GitHub. Allow it and tick **"Include private repos"**.

---

## Colab Secrets: the full list of names

Use exactly these names (they match `.env.example`). Turn on *Notebook access* for each.

| Name | From | When |
|---|---|---|
| `GITHUB_TOKEN` | §5 | now |
| `CDSAPI_KEY` | §1 | Phase 1 |
| `EUMETSAT_KEY`, `EUMETSAT_SECRET` | §2 | Phase 1 |
| `OPENSKY_USERNAME`, `OPENSKY_PASSWORD` | §3 | when approved |
| `STRATUM_ID_SALT` | any long random string you make up (e.g. 40 random letters) | Phase 4 |

## Data used without an account

| Source | What | Notes |
|---|---|---|
| ARCO-ERA5 on Google Cloud | Analysis-ready ERA5 copy, fast from Colab | Public; checked against a CDS download in Phase 1 before use |
| OpenSky aircraft database | ICAO24 → aircraft type, operator | Public download; dated snapshot stored on Drive in Phase 1 |
| OpenAP | Aircraft performance and fuel flow | Python package (pinned) |
| OurAirports | Airport coordinates (VIDP, VABB) for the corridor | `davidmegginson.github.io/ourairports-data`, retrieved 13 Oct 2026; public domain |

## Versions and endpoints in use (checked 2026-10-14)

Library versions are pinned in `uv.lock` and recorded in every run manifest.

| Source | What we use | Client / version | Notes |
|---|---|---|---|
| **ERA5** (Copernicus CDS) | `reanalysis-era5-pressure-levels` (t, q, u, v, w, ciwc, z, cc at 100–500 hPa; t at 50, 70 hPa) and `reanalysis-era5-single-levels` (tsr, ttr), padded box 4–39°N 66–100°E, hourly | `cdsapi` (pinned), endpoint `https://cds.climate.copernicus.eu/api` | Final ERA5 (`expver 0001`) for all of 2025-03 → 2026-02. CDS limits queued requests per user; the downloader waits and retries. Licence: CC-BY 4.0 (Copernicus). |
| ERA5 (ARCO, Google Cloud) | `gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3` | `xarray` + `gcsfs` (anonymous) | **Only for the equivalence check**: identical to CDS to GRIB-packing precision (`reports/phase1/era5_cds_vs_arco.csv`). Whole-globe chunks → not used for bulk. |
| **Meteosat-9 IODC** (EUMETSAT) | `EO:EUM:DAT:MSG:HRSEVIRI-IODC` (native Level 1.5, ~180 MB/slot) and `EO:EUM:DAT:MSG:CLM-IODC` (cloud mask, GRIB, ~3.5 MB/slot) | `eumdac` + `satpy` readers `seviri_l1b_native`, `seviri_l2_grib` (needs `eccodeslib`) | Satellite MSG2 = Meteosat-9 at 45.5°E in all 12 evaluation months. Requires the **"Meteosat > 1 hr latency & Metop" (General) licence**. Licence terms: credit EUMETSAT; **do not redistribute the original data**; non-operational, non-commercial use. Files are stored rotated 180° (south up); figures rotate them north-up. |
| **ADS-B Exchange** | `https://samples.adsbexchange.com/readsb-hist/YYYY/MM/01/HHMMSSZ.json.gz` (free 1st-of-month days) | `requests` + `orjson` | Free for "testing and evaluation". ADS-B Exchange is owned by **JETNET**, whose terms forbid publishing their data or derived data without written permission → permission email drafted (`docs/memos/adsbx_permission_email.md`). |
| OpenSky Network | historical state vectors (Trino) | `pyopensky` (added once access is granted) | Access requested 2026-10-14; pending. |
| OpenSky aircraft DB | `https://s3.opensky-network.org/data-samples/metadata/aircraft-database-complete-2025-08.csv` | `requests`, `pandas` | Newest snapshot available; 616,648 rows; SHA-256 in `raw/aircraft_db/aircraft_db_2025-08.json`. |
| Natural Earth | 1:50m coastline, clipped (`configs/geo/coastline_ne50m_padded.geojson`) | — | Public domain. Used for the geolocation check. |
| OurAirports | VIDP, VABB coordinates | — | Public domain. |

### EUMETSAT account note
The first EUMETSAT account accepted the General Licence on 2026-10-14 and could download in
the browser, but its API key kept returning `403 "GeneralLicense required"` (helpdesk ticket
sent to ops@eumetsat.int). A second account, where the licence was accepted **before** the
API key was created, works. Its key is the one in `.env` and Colab Secrets.

## OpenContrails (learned detector pre-training, D-005)
- What: ~27,000 GOES-16 ABI scenes (256 × 256 px, 2 km) with human-labelled contrail masks;
  snapshot `20250305`, public bucket `gs://goes_contrails_dataset` (read over HTTPS, no account).
- Licence: **CC BY 4.0** (Google Research); GOES-16 data have no restrictions.
- Cite: Ng et al. (2024), *Contrail Detection on GOES-16 ABI With the OpenContrails Dataset*,
  IEEE TGRS 62.
- Use: pre-training only (3 infrared channels at the labelled time + the mask); nothing is
  redistributed. Reader: `stratum/detect/tfrecord.py` (no TensorFlow needed).

## ECMWF open data (live outlook and advisories, website only)
- What: the IFS HRES forecast, 0.25°, temperature and specific humidity at 400/300/250/200/150 hPa,
  steps 0–54 h of the latest 00 UTC run; fetched with `ecmwf-opendata` (no account).
- Licence: **CC BY 4.0**; credit "Forecast: ECMWF open data". Processed by `stratum outlook`
  (GitHub Action `outlook.yml`, daily 09:20 UTC) into the `outlook-data` branch; only derived
  hour sprites and advisories are published, never the GRIB files.
- Use: physics only (B1, B3, SAC); STRATUM's model is not applied (no cloud fields on pressure levels).

## Live aircraft (website /live only)
- **The OpenSky Network** REST API, `/states/all` for the India box, every 5 minutes by the GitHub
  Action `live.yml` (OpenSky does not answer Cloudflare's servers); authenticated with the team's
  API client (GitHub secrets `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`), anonymous otherwise.
  Non-commercial research use with attribution ("The OpenSky Network").
- **adsb.lol** `/v2/lat/…/lon/…/dist/…` near the visitor, by the site's Worker (60 s cache per
  0.5° cell; adsb.lol needs a User-Agent with contact details). Data **ODbL**; credited.
- Only airline callsigns above FL200, position, level, track and speed are kept; no ICAO24
  address is stored or shown, nothing is archived. adsb.fi was tested and refuses Cloudflare.
