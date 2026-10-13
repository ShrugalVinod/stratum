# STRATUM — Master Build Prompt for Claude Code

**Version 2.0 · 13 Oct 2026 · Team STRATUM (Shrugal Vinod, Aditya Harsoda, Ishaan Kupnur, Abeer Shah) · Supervisor Dr. Varsha Pant**

---

## How to use this file (for the team, not for Claude Code)

1. Create an empty GitHub repo called `stratum` (private for now) and clone it to your laptop.
2. Save this file in the repo root as `BUILD_PROMPT.md`. Commit it.
3. Open Claude Code in the repo folder and type:
   > Read BUILD_PROMPT.md in full. Then do Phase 0 only. Ask me anything you need before you start.
4. When a phase finishes, Claude Code prints a **Phase Gate Report** (template in §12). Check every "done when" item yourself. Only then say:
   > Phase N is accepted. Read BUILD_PROMPT.md again and start Phase N+1.
5. Never let it skip ahead. Run one phase per session (or a few sessions per phase), and start each new session with "Read BUILD_PROMPT.md and CLAUDE.md, then continue Phase N from the last Phase Gate Report / `docs/progress.md`."

Everything below this line is addressed to Claude Code.

---

## 0. Who you are working for and what you are building

You are the engineering lead for **STRATUM**, a student research project entered in the **Conrad Challenge 2026–27 (Aerospace & Aviation)**. The team is four high-school students at Indus International School, Bangalore. They are smart and motivated but new to atmospheric science and to production ML. You are building real research software that will be judged by scientists and may be published, so it must be **correct, reproducible, honest and explainable**. A clean, tested, boring pipeline beats a clever, fragile one.

### 0.1 The project in one paragraph

Contrails that persist and spread into cirrus are estimated to be the largest single part of aviation's warming, and they can often be avoided by small altitude changes. Avoiding them requires predicting **ice-supersaturated regions (ISSRs)** at cruise altitude, which weather reanalyses such as ERA5 do poorly (dry bias near the tropopause). Published humidity corrections were fitted on data from Europe, the North Atlantic and the US. **No one has checked contrail forecasts over Indian airspace against contrails actually seen by satellite.** STRATUM:
1. runs the Schmidt–Appleman criterion (SAC) and the Contrail Cirrus Prediction Model (CoCiP, via `pycontrails`) on open ADS-B trajectories and ERA5 over India;
2. detects contrails in **Meteosat-9 Indian Ocean Data Coverage (IODC) SEVIRI** thermal-infrared imagery and matches them to wind-advected flight segments;
3. trains a **correction model** on those observations, using only scenes in which a contrail could have been seen;
4. for each flagged segment, ranks altitude alternatives (±2,000 / ±4,000 ft) by **lower-bound net warming avoided** against extra fuel/CO₂;
5. publishes everything in a **static web app** (dashboard + project website).

### 0.2 Source-of-truth documents

The method is **pre-registered** in the team's research paper *"How well can persistent contrails be predicted over India?"* (v1.0, 12 Oct 2026). This prompt restates the parts you need. If the team gives you the paper PDF (`docs/STRATUM_Research_Paper.pdf`), the synopsis or the phase plan, read them. **Where this prompt and the paper disagree, stop and ask.** Do not resolve it yourself.

### 0.3 Calendar you are building against (all dates 2026–27, IST)

| Milestone | Internal date | What must exist in code |
|---|---|---|
| Activation Stage submitted | 27 Oct 2026 | Phase 0 done (repo, CI, secrets plan) |
| Phase-1 checkpoint with Dr. Pant | 22 Nov 2026 | Phase 1 done: all data sources open, coverage audit memo, data-source decision |
| **Prototype v0 live demo** | **18 Dec 2026** (hard: Shrugal is away 24 Dec – 2 Jan) | Phases 2, 3, 4 done: physics map for Delhi–Mumbai, Jan 2026, overlays, web app v0 |
| Innovation Stage submitted | 5 Jan 2027 (official 7 Jan, 11:59 pm CT) | Website live, numbers frozen |
| Satellite validation report v1 | 28 Feb 2027 | Phases 5, 6 done: labelled set, matching, baselines B0–B3, H1 result |
| Summit rehearsal | ~7 Apr 2027 | Phase 7 done: correction model (H2), avoidance ranking (H3, H4) |
| Innovation Summit, Houston | 21–24 Apr 2027 | Phase 8 done: web app v1, offline expo build |
| Preprint + open dataset | May 2027 onward | Phase 8 release tasks |

If a phase is slipping against this calendar, **say so in the Phase Gate Report** and propose cuts in this order (from the team's plan; never cut the pre-registered hypotheses or the honest write-up): (1) optional baseline B4, (2) west–east spatial test, (3) ±4,000 ft alternatives, (4) full-India expansion, (5) dashboard polish.

---

## 1. Non-negotiable rules (copy these into `CLAUDE.md` in Phase 0)

1. **Never fabricate data, numbers or results.** No placeholder values that could be mistaken for real outputs. Placeholders in the UI must literally read `—` or `pending` and be styled as such. A constant you can't trace to this prompt, the paper or a cited source → **ask**.
2. **Pre-registration is binding.** The primary metric, splits, hypothesis tests and thresholds in `configs/preregistered.yaml` are frozen in Phase 0. Changing any of them needs (a) the team's explicit written OK in chat, (b) an entry in `docs/deviations.md` with date, reason, and whether results had been seen. Code must enforce this (§6.8 test-set lock).
3. **"Unobservable" is missing, never negative.** A segment in a scene where a contrail could not have been seen gets label `NaN`/`None`, is excluded from training and scoring, and is never silently coerced to 0. A dedicated test guards this.
4. **No leakage.** Segments from the same flight, and detections from the same satellite image, never appear on both sides of a split. Tuning only touches validation data carved out of the training seasons.
5. **Labels must not depend on the model being evaluated.** Matching and labelling run on all formation-criterion segments, independent of any persistence prediction.
6. **Reproducible by default.** Pinned environment, fixed seeds, every output written with a run manifest (git commit, config hash, input file hashes, timestamps, software versions).
7. **Tests before "done".** `pytest`, `ruff`, `mypy` (strict on `stratum/`) and the web test suite must pass before you call any phase done. Physics has known-answer tests (§4.3).
8. **Ask, don't guess, on anything listed in §2.4.** Asking is cheap for this team; a wrong silent assumption costs them the competition.
9. **Explain as you go.** The students must be able to defend every line to a judge. Every module gets a top docstring in plain English: what it does, the physics or statistics behind it, and the paper section it implements. Non-obvious choices get a comment with the reason.
10. **Honesty in outputs.** Everything public says that STRATUM is a computational estimate, that no real flight was changed, that ATC feasibility is not modelled, and states ADS-B coverage. Show uncertainty ranges, not single numbers, wherever the paper says ranges.
11. **Privacy.** The public web app shows commercial airline flights only. Never publish tracks of private, state, military or unidentified aircraft (§3.6).
12. **Secrets never touch git.** API keys live in `.env` locally (gitignored) and in Colab Secrets in Colab. A pre-commit hook scans for keys.
13. **Keep the team in the loop.** Keep `docs/progress.md` (what was done, what's next, blockers) and `docs/decisions.md` (one line per decision: date, decision, reason, who OK'd it) updated as you work, not at the end.

---

## 2. Compute, storage and the Colab handoff protocol

### 2.1 Resources the team has

| Resource | Details | Use it for |
|---|---|---|
| Team laptops | Ask in Phase 0: OS, RAM, free disk, Python version, whether Google Drive for Desktop is installed | Code, tests, small fixtures, one-day runs, web app dev |
| **Google Colab (Shrugal)** | **T4 GPU (16 GB VRAM), High-RAM runtime (~50 GB system RAM), ~70–100 GB ephemeral local disk** | All heavy downloads, ERA5 processing, CoCiP over months, Meteosat processing, model training, bulk exports |
| **Google Drive (Shrugal)** | **2 TB** | Persistent storage for all raw/processed data, models, reports |
| GitHub | Repo + Actions (free tier) | Code, CI, web hosting (GitHub Pages) |

**Be honest about the GPU.** Most of this pipeline is CPU/IO-bound (`pycontrails` is NumPy; the detector is classical image filtering; gradient-boosted trees on ~10⁶ rows train in minutes on CPU). The T4 helps with: XGBoost `device="cuda"` training and hyperparameter search, the optional exploratory CNN detector (Phase 3, §5.6), and occasionally CuPy-accelerated filtering. The **High-RAM** setting matters more than the GPU for most jobs. Do not request a GPU runtime when it's not needed (it burns Colab compute units). Say which runtime each notebook needs.

### 2.2 How code gets to Colab

- Code lives only in the GitHub repo. Colab notebooks in `colab/` are **thin launchers**: mount Drive, `git clone` (or `git pull`) the repo at a pinned commit, `pip install -e .`, load secrets, call functions from the `stratum` package. **No pipeline logic inside notebooks.** That way the same code runs locally, in CI and in Colab.
- Private repo access from Colab: use a fine-grained GitHub token (read-only, this repo only) stored in Colab Secrets as `GITHUB_TOKEN`. Explain to the team how to create it in Phase 0.
- Each notebook's first cell prints: repo commit, `pip freeze` hash, runtime type (GPU name via `nvidia-smi` if any), RAM, disk free.
- Use `google.colab.userdata.get("CDSAPI_KEY")` etc. for secrets. Never print them.

### 2.3 Drive layout (create in Phase 0, document in README)

```
/content/drive/MyDrive/STRATUM/
  raw/
    era5/pl/YYYY-MM/            # pressure-level zarr per month
    era5/sl/YYYY-MM/            # single-level (radiation, etc.)
    era5/tropo_T/YYYY-MM/       # temperature-only upper levels for tropopause
    adsb/opensky/YYYY-MM-DD/    # parquet, already bbox-filtered
    adsb/adsbx/YYYY-MM-DD/
    meteosat/l15_crop/YYYY-MM-DD/   # cropped IR_108, IR_120 (+ others), zarr
    meteosat/clm/YYYY-MM-DD/        # EUMETSAT cloud mask, cropped
    aircraft_db/
  interim/
    segments/YYYY-MM/           # cleaned 1-min segments (parquet)
    segments_met/YYYY-MM/       # segments + interpolated ERA5 + SAC/ISSR flags
    cocip/<scaling>/YYYY-MM/    # CoCiP outputs per humidity-scaling variant
    detections/YYYY-MM-DD/      # detector output (parquet of line objects)
    matches/YYYY-MM/            # segment-level labels + observability
  labels/
    scenes/                     # 200 sampled scenes (PNG + metadata)
    raw/<labeller>/             # per-labeller JSON
    adjudicated/
  models/<run_id>/
  reports/<run_id>/
  web_exports/<build_id>/
  manifests/                    # one JSON per pipeline run
  _locks/                       # preregistration lock, final-run log
```

**Drive I/O rules:**
- Drive FUSE is slow for many small files. Work on Colab local disk (`/content/work`), then copy finished, consolidated outputs to Drive (Zarr with consolidated metadata, Parquet partitioned by month, zip for many PNGs).
- Every job is **resumable and idempotent**: it checks a manifest of completed units (e.g. days) and skips them. Colab sessions can disconnect (idle timeouts, runtime limits around 12–24 h). Assume they will.
- Write a `_SUCCESS` marker plus manifest only after a unit is fully written. Treat a unit without `_SUCCESS` as not done.
- Keep a storage budget table in `docs/storage.md` and update it after each big job. Warn the team at 60% (1.2 TB) of Drive use.

**Laptop access to Drive.** If the team has Google Drive for Desktop, ask for the local mount path (e.g. `~/Library/CloudStorage/GoogleDrive-<email>/My Drive/STRATUM` on macOS, `G:\My Drive\STRATUM` on Windows) and set it as `STRATUM_DRIVE_ROOT` in `.env`. Then you can read **small** outputs (manifests, metrics, reports, web exports) directly. Never pull raw data to the laptop through it. Set the folder to stream, not mirror.

### 2.4 When you MUST stop and ask the team

Ask in chat, clearly marked. Batch questions where you can. Always ask for:
- **Credentials**: CDS (ERA5), EUMETSAT Data Store, OpenSky (historical access), GitHub token. Explain step by step how to get each; never ask them to paste a key into chat, ask them to put it into `.env` / Colab Secrets and confirm.
- **A Colab run** (use the protocol in §2.5).
- **Any value not given here or in the paper** (e.g. Driver et al. detection-efficiency thresholds, GWP/metric conversion factors, aircraft mass fraction). Ask them for the source PDF if you need it.
- **Any decision flagged `⚑ DECISION` in this document.** Give 2–3 options, a recommendation and the trade-off, then wait.
- **Ground truth only humans can provide**: scheduled flight counts for the coverage audit, hand labels, adjudication of disagreements.
- **Anything that costs money or is irreversible**: paid data, making the repo public, publishing the website, releasing data, minting a DOI.
- **Anything that would change pre-registered settings.**

### 2.5 Colab handoff protocol (use exactly this format)

When a job is too big for the laptop (rule of thumb: >5 GB download, >30 min CPU, >8 GB RAM, or needs GPU), write the launcher notebook, push it, then print:

```
════════════ COLAB RUN NEEDED ════════════
Job:            <short name>  (Phase N, task N.x)
Notebook:       colab/<NN_name>.ipynb   @ commit <sha>
Open link:      https://colab.research.google.com/github/<owner>/stratum/blob/<sha>/colab/<NN_name>.ipynb
Runtime:        <CPU High-RAM | T4 GPU High-RAM>   (Runtime → Change runtime type)
Secrets needed: <CDSAPI_KEY, EUMETSAT_KEY, EUMETSAT_SECRET, GITHUB_TOKEN, ...>
Inputs (Drive): <paths that must already exist>
Writes (Drive): <paths>
Approx. size:   <GB written>      Approx. time: <h>   Resumable: yes
Steps:          1. Open link  2. Set runtime  3. Runtime → Run all
                4. If it disconnects, just Run all again (it resumes)
When finished:  paste back the block printed by the LAST cell
                (starts with "=== STRATUM RUN SUMMARY ===")
If it fails:    paste the last ~40 lines of the error output
═════════════════════════════════════════
```

Every launcher's last cell prints a **JSON run summary**: job name, commit, config hash, units completed/skipped/failed, bytes written, wall time, key sanity metrics (e.g. flights counted, % segments with met data, NaN fraction), and the manifest path. Design summaries so you can **verify the run from the summary alone**. When the team pastes it back, check it against expectations and say clearly whether it passed.

Before handing off, **always test the same code path locally on a tiny slice** (one hour or one day) so Colab runs fail rarely.

---

## 3. Data sources (what, where, how, gotchas)

> APIs and dataset identifiers change. For every source, **check the current official documentation and the installed library version before writing download code**, and record the version/URL in `docs/data_sources.md`. If something here is out of date, tell the team what changed.

### 3.1 Study domain and periods (pre-registered)

- Domain: **6–37°N, 68–98°E**. Cruise segments **≥ FL250** (≈ 376 hPa in the ISA).
- Development corridor: **Delhi (VIDP) – Mumbai (VABB)**. Define the corridor as a polygon: a 75 km buffer either side of the great-circle VIDP–VABB, documented in `configs/domain.yaml`.
- Development month: **January 2026**.
- Evaluation year: **March 2025 – February 2026** in four seasonal folds: pre-monsoon Mar–May, monsoon Jun–Sep, post-monsoon Oct–Nov, winter Dec–Feb.
- ⚑ **DECISION (raise in Phase 0): January 2026 is both the development month and inside the winter test fold.** Anything tuned on January 2026 (detector thresholds, matching tolerances, pipeline debugging) would leak into the winter fold. Options: (a) exclude January 2026 from winter-fold *scoring* and report it; (b) report winter both with and without January; (c) move development to a month outside the evaluation year (e.g. Jan 2025 or Mar 2026). Recommend (b) plus a note in `docs/deviations.md` if anything changes. Get the team's decision before Phase 2 tuning.

### 3.2 ERA5 (atmosphere)

- **What**: ERA5 hourly, 0.25°, pressure levels. Variables needed by CoCiP: query `pycontrails.models.cocip.Cocip.met_variables` and `Cocip.rad_variables` in code. Don't hard-code a list. Expect at least temperature, specific humidity, u, v, vertical velocity (ω), specific cloud ice water content, geopotential, plus single-level top-of-atmosphere net solar and thermal radiation. For observability and features, also fraction of cloud cover (`cc`).
- **Levels**: 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 hPa for the full variable set (CoCiP needs room above and below cruise for advection and sedimentation). Also **temperature only** at 50, 70 hPa, because the tropical tropopause over India sits near 100 hPa and the WMO definition needs about 2 km above it.
- **Domain padding**: download 2° larger than the study domain on every side (contrails drift). That's 4–39°N, 66–100°E.
- **Routes**:
  1. **Copernicus CDS** via `cdsapi` (new CDS; requires accepting the ERA5 licence on the website). Queue times can be hours. Request one month × one variable group per request.
  2. **ARCO-ERA5 on Google Cloud** (public analysis-ready Zarr). Fast from Colab because it's on Google's network. Verify the current bucket path and its variables. `pycontrails` has ERA5 helpers for this. Prefer this in Colab if it has the needed variables and levels. Validate that its values match a CDS download for one day (max abs diff ≈ 0) before switching.
- **Use `pycontrails.datalib.ecmwf.ERA5`** (or its ARCO counterpart) where possible, since it handles variable naming and the time shift of accumulated radiation fields. If you download yourself, reproduce that handling and test it.
- **Size estimate** (check and update): ≈ 30–60 GB/year for the pressure-level set over the padded domain. Small for 2 TB.
- **Gotchas**: ERA5's cloud scheme limits supersaturation under cloud. That's the bias we're studying, so don't "fix" it. ERA5T (preliminary) vs final ERA5: record which you got. Latency is ~5 days.

### 3.3 ADS-B (flights)

Two sources, chosen by the **pre-registered coverage-audit rule** (§4.1):

- **OpenSky Network historical data** (Trino interface; the `pyopensky` library). Needs a research account with historical-data access. The team requests it with Dr. Pant's support. Query state vectors by time and bounding box, server-side filtered. Expect receiver coverage over India to be patchy. The audit measures it.
- **ADS-B Exchange free sample days**: historical 5-second "readsb-hist" snapshots, free for the 1st of each month (12 days a year). Files are large global JSON snapshots. **Stream** them (gzip → JSON → filter to bbox → Parquet) and never load a whole day into memory. Check the current terms of use and record them. Raw redistribution is likely restricted (affects Phase 8 release).
- **Aircraft metadata**: OpenSky aircraft database (ICAO24 → registration, typecode, operator, owner). Snapshot the version you use into `raw/aircraft_db/` with its date.
- **Normalised schema** (`stratum/io/adsb_schema.py`, enforced with `pandera`): `icao24 (str, lower hex)`, `callsign (str, stripped)`, `time (UTC, datetime64[ns, UTC])`, `lat`, `lon`, `baro_alt_ft`, `geo_alt_ft (nullable)`, `gs_kt`, `track_deg`, `vrate_fpm`, `on_ground (bool)`, `source (opensky|adsbx)`. Each source has an adapter to this schema.

### 3.4 Meteosat-9 IODC (satellite)

- **What**: SEVIRI Level 1.5 High Rate image data, **Indian Ocean coverage**, every 15 min, ~3 km at nadir, sub-satellite point **45.5°E**. Channels needed: **IR_108 and IR_120** (the split window for the brightness-temperature difference). Also download IR_087, WV_062, WV_073 and IR_134 for optional features and labeller context, if the size budget allows. Also the **EUMETSAT cloud mask product for IODC**.
- **Access**: EUMETSAT Data Store via `eumdac` (Python). Use the **Data Tailor** (server-side customisation) to **crop to the padded domain and keep only the needed channels** before download. Full-disk native files are roughly 200+ MB per slot. A year at 96 slots/day uncropped would be ~8–10 TB, which does not fit in 2 TB. Cropped to the domain, 2–6 channels, stored as `uint16`/`float16` Zarr, it's on the order of 100–300 GB/year. **Compute and report the real estimate from a one-day test before bulk download.** ⚑ If cropping isn't available for this collection, ask the team. A fallback is downloading only the slots needed for matching windows (20–120 min after flagged segments) plus a sampled set for labelling.
- **Reading**: `satpy` reader `seviri_l1b_native` (or the matching reader for the tailored output format) → calibrated brightness temperatures (K). Keep native geostationary geometry for detection, and keep the `pyresample` area definition so you can map lat/lon ↔ pixel.
- **Verify availability**: confirm that Meteosat-9 IODC data exist in the archive for **every month of Mar 2025 – Feb 2026** and that the service hasn't moved satellites or longitude in that window. If there's a gap or a satellite change, stop and tell the team. Fallbacks to evaluate (don't implement unless asked): INSAT-3D/3DR imager split window from MOSDAC; Himawari-9 for the far east of the domain (very high viewing angle).
- **Viewing geometry (computed, include in docs)**: viewing zenith angle (VZA) from 45.5°E is about 38° at Mumbai, 40° Bangalore, 48° Delhi, 55° Kolkata, 59° Guwahati, and over 60° in the far east and northeast of the domain. Pixels are much larger than 3 km there. The pre-registered observability rule excludes VZA ≥ 60°.
- **⚠ Parallax**: a contrail at ~11 km viewed at VZA θ appears displaced away from the sub-satellite point by ≈ h·tan θ: **~9 km at Mumbai, ~12 km at Delhi, ~15 km at Kolkata, ~18 km at Guwahati.** That is **larger than the 2-pixel matching tolerance.** Matching (§6.2) must project each predicted contrail position at its altitude along the satellite line of sight before comparing. This is part of the geometric model, not a change to the pre-registered tolerance. Note it in `docs/decisions.md` and show the before/after effect in Phase 5.

### 3.5 Aircraft performance and emissions

- **OpenAP** (`openap`): aircraft properties (MTOW, ceiling, engines) and fuel flow by phase. This is the pre-registered source for **fuel flow and fuel cost of altitude changes**.
- **Engine overall propulsion efficiency η** for SAC: derive from aircraft performance (η = thrust × TAS / (fuel flow × Q)). Check whether `pycontrails` gives η from its built-in Poll–Schumann model (`PSFlight`) for the type. Use OpenAP-based η as primary, as pre-registered, and PS-based η as a sensitivity check. Clip η to a physically plausible range (≈0.2–0.45) with a logged warning.
- **Aircraft mass**: a fixed fraction of MTOW (pre-registered as "fixed fraction, varied in sensitivity tests"). ⚑ **DECISION**: the paper doesn't state the fraction. Ask the team. Suggest 0.80 default with 0.70/0.90 sensitivity runs.
- **nvPM (soot) number emission index**: CoCiP needs it (it controls initial ice crystal number). Use `pycontrails`' emissions model (ICAO engine emissions databank lookup) and record the engine UID mapping. Unknown types → documented fallback, flagged in outputs.
- **Type mapping**: ICAO24 → typecode (OpenSky DB) → OpenAP type. Keep a hand-checked `configs/type_map.yaml` for types OpenAP lacks (e.g. map A20N to A320 if needed), and list every fallback in the run summary.

### 3.6 Which flights are "commercial airline" (privacy and scope)

`stratum/flights/classify.py`:
- Commercial if the callsign matches `^[A-Z]{3}\d{1,4}[A-Z]{0,2}$` **and** the 3-letter prefix is in an ICAO airline-designator allowlist (`configs/airlines.yaml`: Indian carriers such as IGO, AIC, AXB, AKJ, SEJ, plus foreign carriers seen overflying or arriving; built from the data and **reviewed by a human**), **and** the aircraft DB typecode is a transport-category type.
- Everything else (no callsign, private-registration patterns, state or military operators, unknown) is excluded from public outputs. It may still be kept in private research tables, since it also flies through ISSRs, but **never** exported to the web or released.
- India's ICAO24 address block is 0x800000–0x83FFFF ("VT-" registrations). Useful for reporting the share of Indian-registered aircraft, not as a filter.

---

## 4. Physics and core science: exact definitions

These definitions are shared by Phases 2–7. Implement each once, in one place, with tests.

### 4.1 Coverage-audit decision rule (pre-registered)

For a sample of days, count Delhi–Mumbai flights with a **continuous cruise track** (no gap > 10 min above FL250) and divide by **scheduled flights** on the route that day. **If OpenSky captures ≥ 50% of scheduled corridor flights with continuous cruise tracks → use OpenSky for all months. Otherwise → use the 12 free ADS-B Exchange days, accept the smaller sample, and say so in every result.**

Scheduled counts come from humans (airline timetables or flight-tracker history pages). Build `data/reference/scheduled_flights_template.csv` with columns `date, direction (DEL-BOM|BOM-DEL), airline, flight_number, sched_dep_utc, source_url, checked_by` and ask the team to fill it in for at least 7 sample days (mix of weekdays/weekends, including at least one ADS-B Exchange free day, so both sources can be compared on the same day).

### 4.2 Thermodynamics (`stratum/physics/thermo.py`)

Units are SI inside the package: K, Pa, kg/kg, m/s. Convert only at I/O boundaries.

- Saturation vapour pressure over **liquid water**, Murphy & Koop (2005):
  `ln e_w = 54.842763 − 6763.22/T − 4.210 ln T + 0.000367 T + tanh(0.0415 (T − 218.8)) · (53.878 − 1331.22/T − 9.44523 ln T + 0.014025 T)`  (e_w in Pa, T in K; valid ~123–332 K)
- Saturation vapour pressure over **ice**, Murphy & Koop (2005):
  `ln e_i = 9.550426 − 5723.265/T + 3.53068 ln T − 0.00728332 T`  (valid T > 110 K)
- Vapour pressure from specific humidity: `e = q·p / (ε + (1 − ε)·q)`, with ε = 0.622.
- `RHi = e / e_i(T)`, `RHw = e / e_w(T)`.
- Cross-check every function against the equivalent in `pycontrails.physics.thermo` on a grid of T and p. Assert agreement to <0.1% where the formulas are the same. If `pycontrails` uses a different formula, document the difference and keep Murphy & Koop as pre-registered.
- Flight level ↔ pressure: ISA barometric formula (cross-check `pycontrails.physics.units`). Test: FL250 → ≈376 hPa; FL340 → ≈250 hPa.

### 4.3 Schmidt–Appleman criterion (`stratum/physics/sac.py`)

- Mixing-line slope (paper eq. 1): `G = EI_H2O · c_p · p / (ε · Q · (1 − η))` with **EI_H2O = 1.23 kg/kg, c_p = 1004 J kg⁻¹ K⁻¹, ε = 0.622, Q = 43.2 × 10⁶ J/kg**.
- Threshold temperature T_LM (paper eq. 2): solve `de_w/dT |_(T_LM) = G` with Brent's method on [180 K, 260 K], using an analytic derivative of Murphy & Koop (not finite differences in production; a finite-difference check in tests is fine).
- Critical temperature for ambient humidity RHw < 1: T_LC is the root of `e_w(T_LM) − G·(T_LM − T_LC) = RHw · e_w(T_LC)` on (150 K, T_LM]. For RHw ≥ 1, T_LC = T_LM. (Geometric meaning: the mixing line through the ambient point just touches the water-saturation curve.)
- **Formation**: `T_ambient ≤ T_LC`. **Persistence**: formation **and** `RHi ≥ 1.0`.
- Vectorise over arrays (NumPy). It must handle 10⁷ segments without Python loops. Use a vectorised Newton iteration with a Brent fallback, or a precomputed lookup table in (p, η) with a documented error bound < 0.01 K.
- Cross-check against `pycontrails.physics.sac` (functions for the mixing-line slope and critical temperatures). Document any differences.

**Known-answer tests (`tests/physics/test_sac.py`). These values were computed independently for this prompt and match the paper:**

| Case | Input | Expected |
|---|---|---|
| Slope | p = 250 hPa, η = 0.3 | G = 1.641 ± 0.002 Pa/K |
| Threshold | same | T_LM = −41.91 ± 0.03 °C |
| Point A (paper Fig. 1) | T = −52 °C, RHi = 60%, 250 hPa, η = 0.3 | RHw ≈ 0.368, T_LC ≈ −49.9 °C → **forms, not persistent** |
| Point B | T = −50 °C, RHi = 112% | RHw ≈ 0.698, T_LC ≈ −47.9 °C → **forms, persistent** |
| Point C | T = −38 °C, RHi = 58% | RHw ≈ 0.401, T_LC ≈ −49.7 °C → **does not form** |
| Monotonicity | η ↑ | G ↑ and T_LM ↑ (newer engines form contrails at warmer T) |
| Limits | RHw = 1 | T_LC = T_LM exactly |

If an implementation fails these, the implementation is wrong. Don't edit the tests to pass.

### 4.4 Tropopause (`stratum/physics/tropopause.py`)

WMO lapse-rate tropopause from each ERA5 temperature profile (all levels 500→50 hPa): the lowest level at which the lapse rate falls to ≤ 2 K/km, provided the average lapse rate between that level and every level within the next 2 km above stays ≤ 2 K/km. Interpolate in log-p, convert pressure to geometric height with the hypsometric equation (or ERA5 geopotential). Output tropopause pressure and height per grid cell and hour. Test on synthetic profiles with a known answer and on a standard tropical sounding (expected ~95–110 hPa). Feature = segment pressure altitude minus tropopause altitude (m), signed.

### 4.5 Interpolation of ERA5 to segments (`stratum/met/interp.py`)

Linear in time, linear in log-pressure vertically, bilinear horizontally (paper §4.3). Implement with `xarray`/NumPy, vectorised. Prefer `pycontrails`' `MetDataset`/`intersect_met` if it matches these rules, but verify the vertical coordinate it uses. Test on an analytic field (e.g. T = a + b·lon + c·lat + d·ln p + e·t) where interpolation must be exact. Out-of-domain or missing → NaN plus a counter in the run summary. Never extrapolate silently.

### 4.6 CoCiP (`stratum/physics/cocip_runner.py`)

- Wrap `pycontrails` `Cocip` with `met` (pressure levels) and `rad` (single level) `MetDataset`s and a `Flight` per trajectory carrying aircraft type, η, fuel flow, mass and nvPM EI.
- Humidity scaling is a parameter. Read the `pycontrails` humidity-scaling classes from the installed version and map them to baselines:
  - **B1 raw**: no scaling (constant scaling with factor 1.0)
  - **B2 constant**: RHi divided by **0.95**
  - **B3 latitude-dependent**: the exponential-boost latitude-correction scaling (Teoh et al. 2022/2024) as implemented in `pycontrails`. **Use the library's implementation; don't reimplement it from the paper.**
  - **STRATUM** (Phase 7): our learned scaling.
  
  Confirm what each class's parameters mean (divide vs multiply) by reading the source, and write a test that checks the RHi actually changes as intended.
- Outputs per flight segment: whether a persistent contrail formed, contrail age/lifetime, mean width, optical depth, **energy forcing EF (J)**, shortwave/longwave split. Also the **contrail evolution table** (positions at each model time step), used for advection in matching.
- Uncertainty: `pycontrails` offers Monte Carlo uncertainty parameters for CoCiP. Use them for EF ranges (5th–95th percentile) with N members (start with N = 20 for development, ⚑ decide final N with the team based on Colab time).
- Performance: batch by day; cache by (day, scaling, config hash); expect Colab jobs.

---

## 5. PHASE MAP

| Phase | Name | Target done | Heavy Colab? |
|---|---|---|---|
| 0 | Setup: repo, environment, CI, secrets, Colab bridge, pre-registration lock | 27 Oct 2026 | No |
| 1 | Data access, ingestion and coverage audit | 22 Nov 2026 | Yes |
| 2 | Physics baseline: trajectories → ERA5 → SAC/ISSR → CoCiP (B1) for Jan 2026 corridor | 6 Dec 2026 | Yes |
| 3 | Satellite contrail detector + prediction-on-satellite overlays | 13 Dec 2026 | Yes |
| 4 | **Web app v0**: dashboard + Innovation Website (demo for the video) | **18 Dec 2026** | No |
| 5 | Labelling tool, labelled set, matching and observability → segment labels for the full year | 7 Feb 2027 | Yes |
| 6 | Evaluation harness, baselines B0–B4, **H1** | 28 Feb 2027 | Yes |
| 7 | Correction model (**H2**) + avoidance/decision layer (**H3, H4**) | 31 Mar 2027 | Yes (GPU optional) |
| 8 | **Web app v1**, offline expo build, reports, open release | 14 Apr 2027 (Summit) → May 2027 (release) | Some |

Phases 2–4 overlap with each other on purpose: Phase 4 (web) can start as soon as Phase 2 exports its first day. Run them in parallel if the team has the bandwidth, but keep gates separate.

---

## PHASE 0 — Setup and guard-rails

**Goal**: a repo where it's easy to do the right thing and hard to do the wrong one.

### 0.1 Ask first (one batched message)
- Laptop OS/RAM/disk/Python for each person who will run code. Is Google Drive for Desktop installed? Mount path?
- GitHub owner/org name; who are collaborators.
- Confirm Colab plan (High-RAM + T4 available?) and that Shrugal's Drive has ≥ 1.5 TB free.
- ⚑ DECISION on the January 2026 dev-month leakage (§3.1).
- ⚑ DECISION on aircraft mass fraction (§3.5).
- Who are labellers (two independent ones per scene) and the adjudicator.

### 0.2 Repository structure

```
stratum/
  BUILD_PROMPT.md            # this file
  CLAUDE.md                  # standing rules (§1) + how to run things, kept short
  README.md                  # human quick-start: setup, data access, running each phase
  LICENSE                    # ⚑ ask: suggest Apache-2.0 for code
  pyproject.toml             # package + tool config (ruff, mypy, pytest)
  uv.lock                    # pinned env (use uv); export requirements-colab.txt too
  .env.example               # names of all secrets, no values
  .pre-commit-config.yaml    # ruff, ruff-format, mypy, detect-secrets, nbstripout
  Makefile                   # setup, lint, test, test-fast, web-dev, web-test, export
  configs/
    preregistered.yaml       # FROZEN (§0.4)
    domain.yaml              # bbox, padded bbox, corridor polygon, FL range
    data_sources.yaml        # chosen ADS-B source, collection IDs, versions
    pipeline.yaml            # non-preregistered engineering knobs (batch sizes etc.)
    airlines.yaml            # airline designator allowlist (human-reviewed)
    type_map.yaml            # typecode → OpenAP fallback map (human-reviewed)
    web.yaml                 # export settings
  stratum/
    __init__.py
    config.py                # pydantic models loading configs/*.yaml; config hashing
    paths.py                 # resolves local vs Drive vs Colab roots from env
    manifest.py              # run manifests, _SUCCESS markers, resumability helpers
    lock.py                  # pre-registration lock (§6.8)
    io/        adsb_opensky.py, adsb_adsbx.py, adsb_schema.py, era5.py, meteosat.py, aircraft_db.py
    flights/   clean.py, resample.py, classify.py, performance.py
    met/       interp.py, features.py
    physics/   thermo.py, sac.py, tropopause.py, cocip_runner.py, units.py
    detect/    btd.py, line_filters.py, objects.py, confidence.py, cnn_exploratory/ (Phase 3 optional)
    match/     geometry.py (parallax, lat/lon↔pixel), advect.py, observability.py, labels.py
    labelling/ sampling.py, export_scenes.py, agreement.py
    baselines/ b0_climatology.py, b1_raw.py, b2_constant.py, b3_latitude.py, b4_quantile.py
    model/     dataset.py, features.py, train.py, calibrate.py, scaling_feedback.py, explain.py
    decide/    alternatives.py, fuel.py, climate_metric.py, uncertainty.py, rank.py
    evaluate/  splits.py, metrics.py, bootstrap.py, hypotheses.py, reliability.py, report.py
    export/    web_export.py, schemas.py
    cli.py                   # `stratum <command>` via typer
  colab/                     # thin launcher notebooks, numbered by phase
  notebooks/                 # exploration only; never imported; outputs stripped
  tests/                     # mirrors stratum/; fixtures in tests/fixtures (tiny, committed)
  web/                       # the web app (Phase 4/8)
  labeller/                  # static labelling app (Phase 5)
  docs/
    progress.md  decisions.md  deviations.md  data_sources.md  storage.md
    methods/     # one markdown per module, plain-English explanations for the team
    phase_reports/
  reports/                   # generated, small, committed only when final
```

### 0.3 Tooling
- Python 3.11, environment managed by `uv`. Core deps: numpy, scipy, pandas, pyarrow, xarray, zarr, dask, netCDF4, pycontrails (with extras needed for ERA5/ecmwf), openap, cdsapi, eumdac, satpy, pyresample, pyproj, shapely, scikit-image, opencv-python-headless, scikit-learn, lightgbm, xgboost, shap, pandera, pydantic, typer, rich, matplotlib, pytest, hypothesis, ruff, mypy. Add pyopensky (or the current OpenSky client) once access is granted.
- Pin exact versions. Write `requirements-colab.txt` from the lock (Colab preinstalls many packages; install pinned versions over them and print versions in the first cell).
- `stratum` CLI with subcommands that later phases add: `download-era5`, `ingest-adsb`, `audit-coverage`, `build-segments`, `run-cocip`, `detect`, `export-scenes`, `match`, `evaluate`, `train`, `rank`, `export-web`, `lock-preregistration`, `verify-lock`.
- GitHub Actions CI: lint, type-check, unit tests on every push (fixtures only, no network); web build/test (Phase 4+). CI must finish in < 10 min.
- `detect-secrets` baseline + pre-commit; `nbstripout` on notebooks.

### 0.4 Pre-registration file (`configs/preregistered.yaml`)

Populate from the paper (Sections 3–6). Every key gets a comment citing the paper section.

```yaml
domain: {lat: [6, 37], lon: [68, 98], min_flight_level: 250}
periods:
  development_month: "2026-01"
  evaluation: ["2025-03-01", "2026-02-28"]
  seasonal_folds: {pre_monsoon: [3,4,5], monsoon: [6,7,8,9], post_monsoon: [10,11], winter: [12,1,2]}
spatial_split: {boundary_lon: 80.0}           # west trains, east tests
coverage_rule: {min_fraction_continuous: 0.50, max_gap_min: 10}
trajectory:
  max_vertical_rate_fpm: 6000
  max_groundspeed_jump_kt: 100
  resample_min: 1
  max_fill_gap_min: 10
sac: {EI_H2O: 1.23, c_p: 1004.0, epsilon: 0.622, Q: 43.2e6, persistence_rhi: 1.0}
detection:
  btd: "T108 - T120"
  labelled_scenes: 200
  scene_size_px: 256
  pilot_scenes: 20
matching:
  min_age_min: 20
  max_age_min: 120
  max_distance_px: 2
  max_angle_deg: 20
observability:
  max_high_cloud_fraction: 0.5
  require_no_opaque_cloud_in_window: true
  max_viewing_zenith_deg: 60
baselines:
  B0: climatology_monthly_cell_level
  B1: raw_era5
  B2: {constant_scaling_divisor: 0.95}
  B3: pycontrails_latitude_correction
  B4: {optional: true, method: wolf2025_bivariate_quantile_mapping}
metrics:
  primary: brier_skill_score_vs_B3_heldout_seasons
  secondary: [hit_rate, false_alarm_ratio, csi, auroc, brier, reliability]
bootstrap: {unit: day, n_resamples: 1000, ci: 0.95}
hypotheses:
  H1: {test: ratio_pred_over_obs_B1, supported_if: "upper_ci < 1"}
  H2: {test: mean_bss_vs_B3, supported_if: "mean >= 0.10 and lower_ci > 0"}
  H3: {test: distance_share_for_80pct_positive_EF, supported_if: "share <= 0.10"}
  H4: {test: night_EF_share_minus_distance_share, night_lst: [18, 6], supported_if: "lower_ci > 0"}
min_labels: {matched_observed_contrails: 300}
correction_model:
  type: gradient_boosted_trees
  monotone: {rhi: increasing, temp_margin_above_TLM: decreasing}
  calibration: isotonic
  sanity_baseline: logistic_on_rhi
  feedback_preference: scaling_factor_by_season_latband   # option (b), unless (a) clearly better
avoidance:
  alternatives_ft: [-4000, -2000, 2000, 4000]
  co2_per_kg_fuel: 3.16
  metric_horizons_years: [20, 100]
  rank_by: lower_bound_net_warming_avoided
  alert_if: "lower_bound > 0"
```

Open questions that the paper leaves unspecified go in `configs/preregistered_open_questions.md`, each with a ⚑ and an owner. **Settle them before the relevant results are seen.** Known ones:
1. H1: is "observed occurrence" the raw detected fraction, or divided by an estimated detection efficiency? (They test different things; raw detections understate true contrails.) Recommend: **pre-specify the raw detectable-contrail comparison as primary**, because the model also predicts *detectable* contrails per paper §4.5, with the efficiency-adjusted ratio as secondary. Get sign-off before Phase 6 runs.
2. How per-image matches aggregate to one label per segment (§6.2.4).
3. How "object-level Cohen's κ" is operationalised (§5.4).
4. Detection-efficiency thresholds from Driver et al. 2025 (need the paper's actual numbers).
5. Climate-metric conversion factors for 20- and 100-year horizons (need a cited source).
6. Aircraft mass fraction.
7. The dev-month leakage decision.

`stratum lock-preregistration` writes `_locks/preregistration.lock` (SHA-256 of `preregistered.yaml` plus the settled open questions, timestamp, git commit). It's committed and also copied to Drive.

### 0.5 Done when
- [ ] `make setup && make test` works on a fresh clone on at least one team laptop **and** in a Colab smoke-test notebook (`colab/00_smoke_test.ipynb`: mounts Drive, creates the Drive layout, clones repo, installs, imports `stratum`, prints environment, writes and reads a test file on Drive).
- [ ] CI is green. Pre-commit blocks a fake key in a test commit (show it).
- [ ] `preregistered.yaml` is populated with paper citations. The team has reviewed it and said "approved" in chat. The lock is written.
- [ ] `docs/data_sources.md` lists every account the team must create, with step-by-step instructions written for a 16-year-old.
- [ ] Phase Gate Report delivered.

---

## PHASE 1 — Data access, ingestion and coverage audit

**Goal**: every data source opens, parses and lands on Drive in the normalised format; the coverage audit gives a firm answer; the physics constants are reproduced.

### 1.1 ERA5 (`stratum/io/era5.py`, `colab/01a_era5_download.ipynb`)
1. Write a downloader that takes (month, variable group, levels, padded bbox) and writes **one consolidated Zarr per month per group** on Drive, with variables named as `pycontrails` expects. Resumable per month, with `_SUCCESS` markers.
2. Local test: download **one day** (2026-01-15) for the padded domain. Plot T at 250 hPa and RHi at 250 hPa (`notebooks/01_era5_look.ipynb`). Check that ranges are sane (T ~ 215–240 K at 250 hPa over India in January; RHi mostly < 1 with patches above).
3. Implement both routes (CDS and ARCO) behind one interface. Prove equivalence on one day.
4. **COLAB RUN**: January 2026 first, then the full evaluation year (Mar 2025 – Feb 2026), plus T-only upper levels. Run summary includes per-month variables present, NaN fraction, min/max per variable, bytes written.

### 1.2 ADS-B (`stratum/io/adsb_*.py`, `colab/01b_adsb_ingest.ipynb`)
1. **ADS-B Exchange adapter**: stream a free sample day, filter to the padded bbox and ≥ FL200 (keep a little below FL250 so climbs into cruise survive; the FL250 cut happens in Phase 2), normalise to schema, write Parquet partitioned by hour. Start with the most recent free 1st-of-month day available, then every 1st-of-month in the evaluation year.
2. **OpenSky adapter**: once access is granted, query state vectors for sample days, bbox-limited, server-side. Respect rate limits and their usage policy. Cache queries.
3. Validate with `pandera`. Report per day: messages, unique ICAO24, unique callsigns, flights reaching ≥ FL250, median report interval.
4. Aircraft DB ingest: ICAO24 → typecode/operator, snapshot dated.

### 1.3 Meteosat-9 IODC (`stratum/io/meteosat.py`, `colab/01c_meteosat_ingest.ipynb`)
1. `eumdac` search for the IODC High Rate SEVIRI collection and the IODC cloud mask collection. Print collection IDs and archive date coverage. **Confirm all 12 evaluation months exist.**
2. Data Tailor: crop to padded domain, channels IR_108 + IR_120 (+ optional set), output format readable by `satpy`. Measure the real size per slot.
3. Read one slot → calibrated brightness temperatures → BTD image → save PNG with a coastline overlay (`cartopy` or a GeoJSON coastline). **Verify geolocation** by checking that the coastline overlay sits on the land/sea contrast in IR_108 on a clear night.
4. Compute and store per-pixel lat, lon, **VZA** and pixel area for the crop (static; compute once).
5. **COLAB RUN**: 3 clear-sky days in Jan 2026 first (for Phase 3), then the bulk download plan, **only after** you show the team the size estimate and they approve it.

### 1.4 Physics reproduction (no Colab)
- Implement `thermo.py` and `sac.py` (§4.2–4.3) with all known-answer tests passing.
- Reproduce **paper Figure 1** (Schmidt–Appleman diagram at 250 hPa, η = 0.3: water and ice saturation curves, threshold mixing line tangent at −41.9 °C, the ISSR region shaded between ice and water saturation, points A/B/C) as `reports/figures/fig1_sac.png` + `.svg`. It should visually match the paper's figure.
- Install `pycontrails` and run its own CoCiP example end to end locally (or in Colab if it's too heavy). Record versions.

### 1.5 Coverage audit (`stratum/flights/coverage.py`, `stratum audit-coverage`)
1. Prepare the scheduled-flights template (§4.1) and **ask the team to fill it**.
2. For each sample day and source: reconstruct flights (group by ICAO24 + callsign, split at gaps > 30 min or callsign change). Count corridor flights with a continuous cruise track (no gap > 10 min above FL250 inside the corridor polygon). Match to scheduled flights by callsign/flight number and time window.
3. Output `reports/coverage_audit/coverage_audit.md` + CSV: per day × source × direction: scheduled, observed, continuous, fraction, plus a map of track density and a histogram of gap lengths. Then apply the rule (§4.1) **mechanically**, print the decision, and write it to `configs/data_sources.yaml` and `docs/decisions.md`.
4. Generate a **two-page memo** draft for Dr. Pant (`docs/memos/coverage_audit_memo.md`): question, method, numbers, decision, implications. Plain English.

### 1.6 Done when
- [ ] ERA5 Jan 2026 on Drive; full-year ERA5 on Drive (or the download is running, with a clear ETA).
- [ ] ADS-B sample days normalised on Drive for the sources available; aircraft DB snapshot stored.
- [ ] Meteosat: collection coverage confirmed for all 12 months; 3 Jan 2026 days on Drive; geolocation verified with a figure; size estimate approved; bulk plan agreed.
- [ ] All physics known-answer tests pass; Figure 1 reproduced.
- [ ] Coverage audit memo with the mechanical decision. Data source recorded.
- [ ] Three exploration notebooks (ERA5, ADS-B, Meteosat) each end with a sanity plot.
- [ ] Phase Gate Report.

---

## PHASE 2 — Physics baseline (B1) for the Delhi–Mumbai corridor, January 2026

**Goal**: raw data → per-segment SAC/ISSR flags and CoCiP EF, end to end, for one month on one corridor, then scalable to the year.

### 2.1 Trajectory processing (`stratum/flights/clean.py`, `resample.py`)
Pre-registered rules (paper §4.2), in this order, each step logging how many points/flights it removed:
1. Drop `on_ground`, nulls in time/lat/lon/alt, duplicates; sort by (icao24, time).
2. Flight reconstruction: split on gap > 30 min or callsign change. `flight_id = f"{icao24}_{first_time:%Y%m%dT%H%M}"`.
3. Implausibility filter: vertical rate > **6,000 ft/min** or ground-speed jump > **100 kt** between consecutive reports → drop the point (recompute after dropping; iterate until stable, max 3 passes).
4. Keep altitude ≥ **FL250** (barometric; convert pressure altitude properly).
5. Resample to **1-minute** segments (time-weighted interpolation of position along the great circle, altitude linear).
6. Gap filling: gaps **≤ 10 min** filled along the great circle at **constant altitude** (the altitude before the gap); flag `filled=True`. Gaps > 10 min split the flight (`flight_id` gets a suffix).
7. Segment geometry: start/end lat/lon, mid-point, heading, length (km), duration, TAS (from GS and ERA5 wind at Phase 2.2 time), `segment_id = f"{flight_id}_{idx:04d}"`.
8. Join type → OpenAP props, η, fuel flow at cruise, mass (fraction of MTOW), nvPM EI. Record fallbacks.
9. Classify commercial / non-commercial (§3.6).

Tests: synthetic tracks with injected spikes, gaps of 5 and 15 min, a ground segment and a callsign change, each with an exact expected output.

### 2.2 Atmosphere on segments (`stratum/met/interp.py`, `features.py`)
For each segment mid-point and time: T, q, u, v, ω, ciwc, cc, geopotential at the segment level and at the **ERA5 levels immediately above and below**; derived RHi, RHw, vertical RHi gradient (per km), wind shear (vertical, per km), tropopause height and distance-to-tropopause, local solar time (`UTC + lon/15 h`), month. Store as `segments_met` Parquet.

### 2.3 Flags and CoCiP
- SAC with the segment's η → `T_LM`, `T_LC`, `forms`, `persists_raw` (RHi ≥ 1), `temp_margin_K = T_LC − T` (positive = colder than threshold), and `T − T_LM`.
- CoCiP with **B1 raw** scaling on all flights (CoCiP needs whole flights, not isolated segments). Persist segment-level CoCiP outputs and the contrail evolution table.
- Also run B2 and B3 scalings now (cheap to add here and needed later) and store them separately under `cocip/<scaling>/`.

### 2.4 Outputs and sanity
- `stratum build-segments --month 2026-01 --corridor DEL-BOM` and `stratum run-cocip --month 2026-01 --scaling B1|B2|B3`.
- Sanity report (`reports/phase2_sanity/`): number of flights/segments; share of segments with `forms`, with `persists_raw`, and with CoCiP persistent contrails by scaling; EF distribution (log scale, positive and negative separate); top 20 segments by EF with flight, time and level; maps of persistent-contrail frequency by flight level; diurnal cycle of EF. Flag anything implausible (e.g. > 50% of segments persistent, or EF magnitudes far from published per-flight ranges in Teoh et al.).
- **COLAB RUN** for the month (and later for the full year once Phase 1's decision is final).

### 2.5 Done when
- [ ] Trajectory tests pass; each cleaning step's removals are logged.
- [ ] Every segment in Jan 2026 corridor has met features, SAC/ISSR flags and CoCiP outputs for B1, B2, B3 (or a documented reason it doesn't).
- [ ] The sanity report is reviewed by the team, and nothing in it is unexplained.
- [ ] A full-year run is possible with one command per month. Estimated Colab time is documented.
- [ ] Phase Gate Report.

---

## PHASE 3 — Satellite contrail detector and overlays

**Goal**: a transparent, tunable contrail detector on Meteosat-9 BTD imagery with a confidence score, plus overlay figures of predicted contrails on real imagery for the video.

### 3.1 Detector (`stratum/detect/`). Classical, explainable, day and night
Follow the lineage of Mannstein et al. (1999) line-filter detection and Santos Gabriel et al. (2026) for SEVIRI (paper §4.4):
1. **Inputs**: T10.8, T12.0 (K) in native geometry. BTD = T10.8 − T12.0.
2. **Normalise**: subtract a local background (median/Gaussian filter, e.g. 15–25 px) and divide by a local robust std → normalised BTD (nBTD). Do the same for T12.0 (contrails are also colder than their surroundings).
3. **Oriented line filters**: a bank of elongated kernels (e.g. 16 orientations × 2 lengths, matched-filter style: positive narrow core, negative flanks), applied to nBTD (and optionally to the T12.0 anomaly). Take the max response and argmax orientation per pixel.
4. **Threshold + objects**: hysteresis threshold on the max response; connected components; keep objects with length ≥ L_min px, high linearity (eccentricity, or residual of a line fit), width ≤ W_max px, and an orientation consistent along the object.
5. **Confidence score** in [0, 1]: a logistic combination of mean filter response, length, linearity, BTD contrast and a cold-T10.8 check. Fit the weights on the **tuning half** of the labelled set (Phase 5). Until then use hand-set weights, documented as provisional.
6. **Output** per object: `image_time, object_id, pixel_coords (polyline), lat/lon polyline, centroid, length_km, orientation_deg (geographic), mean_btd, confidence, vza`.
7. Parameters live in `configs/pipeline.yaml` under `detector:`. **Tuning only on the labelled tuning split and/or the dev month (respecting the §3.1 decision).** Record every parameter change in `docs/decisions.md`.

Tests: synthetic images with straight and slightly curved bright lines at known positions, angles and SNRs, plus noise and a cirrus-like blob; the detector must find the lines (recall ≥ 0.9 at SNR ≥ 3) and reject the blob.

### 3.2 Performance
Vectorise with OpenCV/scikit-image; process a day of slots in minutes on Colab CPU. CuPy is optional only if profiling says filtering dominates.

### 3.3 Overlays (`stratum/detect/overlay.py`)
For 3 chosen days in Jan 2026 (pick clear days with flagged segments; ask the team to approve the choice):
- Advect CoCiP-predicted persistent contrails (from the evolution table) to image times; apply **parallax correction** (§3.4); draw as coloured polylines on the BTD image, with detected objects in a second colour, coastline and corridor outline, timestamp and legend. Export high-res PNG + an MP4/GIF time-lapse for the video (with captions: what the colours mean, the time, "computational prediction vs satellite observation").
- These are **illustrations, not results**. Label them so. No scoring in Phase 3.

### 3.4 Optional, exploratory: CNN detector on T4 (only after 3.1–3.3 are done and only if the team says yes)
- U-Net (small, e.g. ResNet-18 encoder) on BTD + T12.0 + T10.8 patches. Pretraining option: the public OpenContrails dataset (GOES-16 ABI). Note the domain shift (different sensor, resolution and band centres) and fine-tune on our labels.
- **This is not part of the pre-registered method.** It can only appear as a clearly labelled exploratory comparison. The pre-registered labels come from the classical detector.
- **COLAB RUN** on T4 GPU.

### 3.5 Done when
- [ ] Detector tests pass; it runs on the 3 Jan 2026 days; per-day object counts and a confidence histogram are reported.
- [ ] 3 overlay figures + 1 time-lapse approved by the team for brief/video/website.
- [ ] Detector parameters documented with reasons.
- [ ] Phase Gate Report.

---

## PHASE 4 — Web app v0 + Innovation Website (deadline 18 Dec 2026)

**Goal**: a fast, honest, good-looking static web app that (a) shows the physics-only contrail map for the Delhi–Mumbai corridor, January 2026, as the Innovation Model for the video, and (b) serves as the Conrad **Innovation Website** (home, how it works, progress log, team, contact).

### 4.1 Architecture
- **Fully static**: no server, no database, no paid APIs, no API keys in the client. Heavy computation is offline; the web app reads precomputed files. Host on **GitHub Pages** (or Cloudflare Pages, ⚑ ask).
- **Stack** (recommended; justify any change): **Vite + TypeScript + Preact** (small, fast), **MapLibre GL JS** for the map (open source, no token), **Observable Plot** or uPlot for charts, plain CSS with design tokens (no heavy UI framework). Strict TypeScript.
- **Basemap**: default to a **self-hosted vector basemap** that works offline: country/state boundaries, coastlines, major cities and airports as small GeoJSON/PMTiles. ⚠ **Boundaries of India**: for an India-facing publication use a boundary dataset consistent with the official Survey of India depiction (e.g. Natural Earth's India point-of-view boundary files). Ask the team to confirm with Dr. Pant. Optional online raster/vector tiles only if their terms allow free use.
- **Routes**:
  - `/` Home: one-sentence hook, a real contrail photo the team took over Bangalore (they provide it), the problem, the India gap, a CTA to the map.
  - `/map`: the dashboard (§4.2).
  - `/how-it-works`: pipeline diagram (SVG, accessible) + plain-English steps (ADS-B → ERA5 → Schmidt–Appleman → CoCiP → satellite check → correction → decision).
  - `/progress`: progress log, rendered from `web/content/progress/*.md` (dated entries; the team writes them).
  - `/methods`: v0 says the correction model is coming and links to the research paper PDF; v1 adds full results.
  - `/team`: four members + supervisor, roles, one line each (team provides text and photos).
  - `/contact`: `mailto:` link and the team email (no form that collects data, unless the team asks).
  - `/about-data`: data sources, licences, coverage caveats, privacy policy (commercial flights only), AI-use statement (matching the paper's).
- Same name, tagline and numbers as the brief, Lean Canvas and video. Keep all copy in `web/content/*.md` or `copy.json` so the team edits text without touching code. **Run a consistency check script** (`web/scripts/check_numbers.ts`) that pulls every number shown on the site from data or `copy.json` and lists them for the team's cross-check against the brief.

### 4.2 Dashboard (`/map`): v0 scope
- **Map view**: persistent-contrail probability by flight level as a raster overlay. In v0 (physics only) this is the B1 **persistent-contrail condition** (SAC ∧ RHi ≥ 1) per ERA5 cell, shown as a binary or "fraction of the hour" field. **Label it "physics-only (uncorrected) — B1".** Controls: **date** (Jan 2026 days), **hour (UTC, with IST shown)**, **flight level** selector (FL280–FL420 in 2,000 ft steps, interpolated in log-p from ERA5 levels; show the pressure).
- **Flights layer**: the day's commercial flights on the corridor as lines (at the selected hour ± 30 min, or the full day with a time fade), coloured by whether the segment is flagged. Hover: callsign, FL, time.
- **Ranked list panel**: flagged segments for the selected day, sorted by CoCiP EF (v0; in v1 by lower-bound net warming avoided). Filters: direction, airline, night only.
- **Segment card** (paper Table 3 fields): flight, route, segment time (UTC + IST), planned FL, P(persistent contrail), contrail EF range (5th–95th pct), best alternative level, extra fuel (kg) and CO₂ (kg), net warming avoided range (20- and 100-year), confidence note. **In v0, fields without real values show "— (Phase 7)" in a muted style, with a tooltip explaining what's coming.** Never show made-up numbers.
- **Overlay viewer**: the 3 Phase-3 overlay figures/time-lapse in a gallery with captions.
- **Persistent banners**: "Computational estimate — no real flight was changed", "Physics-only prototype (v0)", "ADS-B coverage: X% of scheduled corridor flights" (from the audit).
- URL state: date/hour/FL/selected segment are encoded in the URL, so a judge can be sent a deep link.

### 4.3 Data export contract (`stratum/export/web_export.py`, `schemas.py`)
Versioned, typed, documented in `web/DATA_CONTRACT.md`. JSON Schema is generated from pydantic models and **validated in both Python (on export) and TypeScript (on load, with zod)**.

```
web/public/data/<build_id>/
  manifest.json                 # build_id, git commit, config hash, created_at, pipeline version,
                                # model_version ("B1-physics-v0"), days[], flight_levels[], bbox, coverage stats
  days/2026-01-15/
    day.json                    # summary: n_flights, n_segments, n_flagged, EF totals, data quality flags
    flights.geojson             # simplified LineStrings (Douglas–Peucker, 200 m), commercial only,
                                # props: flight_id(hash), callsign, airline, type, dep/arr if known
    segments_flagged.json       # ranked list rows: segment_id, flight_id, time, FL, lat/lon, EF p5/p50/p95, fields of Table 3
    grids/FL{nnn}_{HH}.png      # 8-bit quantised probability (0–255 → 0–1), georeferenced by manifest bbox
    grids/FL{nnn}_{HH}.u8       # raw uint8 array for hover lookup (same grid), optional
  overlays/*.png|*.mp4
```

- Flight IDs in public files are **salted hashes** (salt kept private), not raw ICAO24. Callsigns of commercial flights are fine to show.
- Size budget: initial page load ≤ 1.5 MB (gzipped JS ≤ 250 KB). Per-day data lazy-loaded ≤ 3 MB. The exporter prints sizes and fails if a budget is exceeded.
- Colour map: perceptually uniform and colour-blind safe (e.g. cividis/viridis), with a legend and units. Never rainbow.

### 4.4 Design and quality
- Clean engineering-report aesthetic consistent with the team's documents: one ink colour plus one blue accent (#2a4a8f), IBM Plex Sans/Mono/Serif (self-hosted, so it works offline). Light and dark mode via CSS variables, and `prefers-color-scheme` respected.
- Responsive: works at 360 px phone width with no horizontal scroll. Map and list stack on mobile.
- Accessibility: WCAG 2.1 AA contrast, keyboard navigation for all controls, focus states, ARIA labels, `prefers-reduced-motion`, alt text for every figure.
- Performance: Lighthouse (mobile) ≥ 90 for performance, accessibility, best practices and SEO on `/` and `/map`.
- Tests: Vitest unit tests (data loaders, schema validation, URL state, quantisation decode); **Playwright** end-to-end (load home → go to map → change FL and hour → open a segment card → check that the placeholder fields say pending → deep link restores state), run at desktop 1280×800 and phone 390×844. Run them in CI.
- No analytics, cookies or trackers unless the team asks (and then only privacy-friendly ones).

### 4.5 Deploy
GitHub Actions: on push to `main`, build → test → deploy to Pages. Set the correct `base` path. A `preview` workflow on PRs. ⚑ Ask before the first public deploy, since the site becomes public.

### 4.6 Done when
- [ ] The live URL opens on a phone and a laptop; Playwright passes in CI; Lighthouse ≥ 90.
- [ ] The map shows real B1 data for all Jan 2026 days on the corridor; the ranked list and cards work; pending fields are clearly marked.
- [ ] All Innovation Website pages exist with the team's copy. The number-consistency list has been sent to the team for checking against the brief.
- [ ] A 4-minute demo script path is tested (the exact clicks for the video), with a screen recording on a clean browser profile.
- [ ] Phase Gate Report. **Due 18 Dec 2026.**

---

## PHASE 5 — Labelling, matching and observability → segment labels for the full year

**Goal**: (a) a hand-labelled validation set of 200 Meteosat scenes with measured inter-labeller agreement; (b) automatic segment-level labels (observed / not observed / unknown) for the full evaluation year.

### 5.1 Scene sampling (`stratum/labelling/sampling.py`)
- Sample 200 scenes of **256 × 256 px**, stratified across the 12 months, time of day (4 bins in local solar time: night/dawn/day/dusk), and **predicted contrail density** (terciles of B1 persistent-segment density in the scene from Phase 2). Not dominated by easy clear-sky cases.
- Also record per scene: VZA (mean/max), ERA5 high-cloud fraction, cloud-mask cloudy fraction, west/east of 80°E.
- Pilot set: **20 scenes**, separate from the 200, used to refine the guide.
- Split the 200 into **tuning (100) / held-out (100)**, stratified the same way, fixed by seed and recorded. The detector's confidence weights and threshold are fitted on tuning only. Detector precision and recall are reported on held-out.
- Exported scene packages: BTD PNG (fixed contrast stretch + an adjustable one), T10.8 PNG, optional false-colour composite, and **the 2 adjacent time slots (±15 min)** so labellers can use motion. Plus metadata JSON. **No predictions or detector output in labeller packages**, so labellers aren't biased.

### 5.2 Labelling app (`labeller/`, static web app; works offline; runs on any laptop)
- Built with the same web stack as Phase 4. Loads a scene package folder (via the File System Access API, or a zip upload fallback).
- Tools: draw **polylines** (click points, double-click to end) on top of the BTD image; zoom/pan; contrast slider; toggle T10.8/false colour; flip through adjacent time slots; undo/redo; mark scene "no contrails", "unsure/unusable (reason)"; per-object confidence (sure/probably).
- Autosave to localStorage (wrapped in try/catch) and **explicit export** to `labels/raw/<labeller>/<scene_id>.json` (schema: scene_id, labeller, app version, objects[{id, polyline_px, confidence}], flags, timestamps, time spent).
- Labeller ID entered at start. Each labeller sees **only their own** labels. Scene order randomised per labeller.
- Guide: render `docs/labelling_guide.md` (v0.1 drafted from paper Appendix B if the team provides it; otherwise draft one and mark it as a draft for review) inside the app's help panel.
- Tests: Playwright draws a polyline, exports, and the JSON validates.

### 5.3 Pilot → guide revision
Run the 20-scene pilot with two labellers. Compute agreement (§5.4). Generate a **disagreement gallery** (side-by-side overlays of both labellers' objects) for the team's discussion. Revise the guide (version bump, changelog). Only then label the 200.

### 5.4 Agreement (`stratum/labelling/agreement.py`)
- Object matching between labellers: two polylines match if the mean perpendicular distance ≤ 2 px over their overlap, the overlap is ≥ 50% of the shorter, and the orientation difference ≤ 20°. Use Hungarian assignment for one-to-one matching.
- Report: object-level precision/recall/F1 of labeller A vs B (symmetric F1), **Cohen's κ** under the operationalisation chosen in the pre-registration open questions. ⚑ Recommend: κ on a fixed grid of 16 × 16-px cells (cell positive if any object passes through it), plus object-level F1. Object-only κ is ill-defined without true negatives. Bootstrap CIs by scene.
- Adjudication: the adjudicator resolves disagreements in a small adjudication mode of the labeller app (shows both, choose/merge/delete). Produces `labels/adjudicated/`.

### 5.5 Matching (`stratum/match/`), the core of the labels (paper §4.5)
1. **Candidate segments**: all segments satisfying **SAC formation** (independent of persistence or any model). Correction-model training data is restricted to these.
2. **Advection**: for each candidate segment at time t₀, compute positions at every Meteosat slot time t with **20 ≤ t − t₀ ≤ 120 min**. Use the segment's ERA5 wind at its pressure level, integrated in time steps of ≤ 5 min with time-interpolated winds (RK2). Where CoCiP has an evolution table for that segment, compare both and log the discrepancy. Pre-registration says ERA5-wind advection, so **use that as primary**.
3. **Parallax correction**: convert each advected position (lat, lon, altitude) to the satellite's apparent position (line-of-sight projection from the satellite at 45.5°E, geostationary) → pixel coordinates. Unit-test against `satpy`/`pyresample` geometry for known points.
4. **Matching test**: segment matched at time t if a detected object (above the detector's operating threshold) has any part within **2 px** of the parallax-corrected advected segment line and orientation within **20°** of the advected segment heading.
5. **Observability** at (segment, t): observable iff **ERA5 high-cloud fraction at and above the segment level < 0.5** (max over levels ≥ the segment's), **and the EUMETSAT cloud mask shows no opaque cloud in the matching window** (⚑ define "opaque" from the product's categories with the team; record it), **and VZA < 60°**. Also record whether the scene was night or day.
6. **Segment-level label** (⚑ settle in open questions before Phase 6): recommended **y = 1** if matched at any observable time in the window; **y = 0** if observable at ≥ 2 slot times (of the ~7 in the window) and matched at none; **y = missing** otherwise. Store per-time details so other rules can be tested as sensitivity analyses.
7. **Detection efficiency**: estimate the probability that a persistent contrail is detectable, from CoCiP optical depth and width, using the thresholds in Driver et al. (2025) (**ask the team for the numbers; do not invent**). Store it per segment as a separate uncertainty term, never folded into y.
8. Sensitivity hooks: age window, distance and angle tolerances, and the observed/unobserved aggregation rule are parameters, so Phase 6 can run the pre-registered values plus sensitivity variants.

**Critical tests**:
- `test_unobservable_is_missing_not_zero`: build a fixture where the scene is cloudy/high VZA and the segment has no match, and assert the label is missing (NaN) and the segment is excluded from the training/eval table.
- Synthetic end-to-end: plant a synthetic line in a synthetic image at the parallax-corrected, advected position of a synthetic segment, and assert y = 1. Shift it by 3 px and assert y = 0 (if observable).
- Leakage guard: label table keys include `flight_id` and `image_time`, used by the splitter.

### 5.6 Full-year run
**COLAB RUNS** (by month, resumable): detection on all slots needed, then matching for all candidate segments. Run summary per month: candidates, observable fraction, y = 1 count, y = 0 count, missing count, by season, by west/east, by VZA band, by day/night.

### 5.7 Minimum-sample check (pre-registered)
If **matched observed contrails in observable scenes < 300**, H1/H2 cannot be tested with useful power. Stop and report to the team with options: label more scenes / extend the period / add a second satellite. Don't proceed to final tests silently.

### 5.8 Done when
- [ ] Pilot done, guide revised; 200 scenes double-labelled; agreement reported with CIs; adjudicated set stored.
- [ ] Detector precision/recall on the held-out labelled half reported (with CIs), and the operating threshold chosen on tuning only.
- [ ] Segment labels for all 12 months on Drive; label counts table; parallax before/after figure; the ≥ 300 check passed or escalated.
- [ ] All critical tests pass.
- [ ] Phase Gate Report.

---

## PHASE 6 — Evaluation harness, baselines B0–B4, and H1

**Goal**: one evaluation harness that every model goes through identically; baseline scores with honest uncertainty; the H1 result, written up whichever way it goes.

### 6.1 Evaluation table
One row per labelled segment (y ∈ {0, 1}, missing excluded) with: keys (segment_id, flight_id, day, image_times), season, west/east, VZA band, day/night, FL band, and every model's prediction column (B0–B4, later STRATUM) as a probability in [0, 1] (binary baselines → 0/1).

### 6.2 Splits (`stratum/evaluate/splits.py`)
- **Seasonal leave-one-season-out**: train on 3 seasons, test on the 4th, rotating. Groups = flight_id **and** satellite image (connected components of the segment–image graph, so neither crosses a split). Assert no group overlap in a test.
- Inside training seasons: a **validation fold** (grouped by day) for tuning and calibration.
- **Spatial**: train west of 80°E, test east (and report the reverse as a diagnostic).
- Apply the January-2026 decision from §3.1 (e.g. report winter with and without January).

### 6.3 Baselines (`stratum/baselines/`)
- **B0 Climatology**: monthly frequency of persistent-contrail conditions per ERA5 grid cell and flight-level band, estimated **from training months only** for each fold (no peeking at the test season). As a probability.
- **B1 Raw ERA5**: SAC formation ∧ RHi ≥ 1 with no correction → 0/1. (Also report CoCiP-B1 "persistent contrail formed" as a variant.)
- **B2 Constant scaling**: RHi / 0.95 → 0/1.
- **B3 Latitude-dependent correction** (`pycontrails` implementation) → 0/1, or a probability if the implementation gives one (document which).
- **B4 Quantile mapping** (optional): Wolf et al. (2025) bivariate quantile mapping of T and RH, only if its coefficients can be applied to our domain. Otherwise a `NotImplementedError` with a documented reason, and B4 is reported as not run.

### 6.4 Metrics (`stratum/evaluate/metrics.py`)
Hit rate (POD), false alarm ratio (FAR), critical success index (CSI), AUROC (probabilistic models only), **Brier score**, **reliability diagram** (10 equal-count bins, with bin counts) and the **primary metric: Brier skill score vs B3 on held-out seasons**, `BSS = 1 − BS_model / BS_B3`, computed per held-out season and as the mean across seasons. Implement against reference values (scikit-learn where it exists, plus hand-computed fixtures).

### 6.5 Bootstrap (`stratum/evaluate/bootstrap.py`)
**Resample whole days with replacement, 1,000 resamples**, paired across models (the same resampled days for every model in a comparison), percentile 95% CIs. Seeded. Vectorised (precompute per-day sufficient statistics so 1,000 resamples × all metrics take seconds). Test the CI coverage on synthetic data with a known answer (coverage ≈ 95% over repeated simulations).

### 6.6 H1 (`stratum/evaluate/hypotheses.py`)
Ratio = (B1-predicted persistent-contrail occurrence) / (observed occurrence) over observable labelled segments, with day-bootstrap 95% CI. **Supported iff the whole CI < 1**; a CI containing 1 → not supported. Primary vs secondary definition as settled in the open questions (raw detectable vs efficiency-adjusted). Also break down by season, west/east, VZA band, FL band and day/night (descriptive, not tests).

### 6.7 Report (`stratum/evaluate/report.py`)
Auto-generated `reports/<run_id>/evaluation_report_v1.html` + `.md`: data summary, label counts, baseline table (all metrics with CIs), reliability diagrams, the H1 result in one sentence, sensitivity analyses (matching tolerances, aggregation rule, age window), and **the full list of deviations** from `docs/deviations.md`. Figures in the documents' style. Written for Dr. Pant and an outside scientist.

### 6.8 Test-set lock (`stratum/lock.py`)
- `stratum evaluate --final` refuses to run unless the current `preregistered.yaml` + settled open questions hash equals `_locks/preregistration.lock` **or** every difference is listed in `docs/deviations.md` with a team OK.
- Every final run appends to `_locks/final_runs.jsonl` (time, commit, config hash, which hypotheses were evaluated, results hash). **Final runs are never deleted.** If a bug is found after a final run, fix it, rerun, and report both runs.
- Non-final runs on held-out seasons are blocked by default (the `--peek` flag needs a typed confirmation and is logged as a deviation).

### 6.9 Done when
- [ ] Split leakage tests pass; metrics and bootstrap tests pass.
- [ ] B0–B3 (and B4 or a documented skip) scored with CIs on every held-out season and the spatial split.
- [ ] H1 final run logged; the H1 paragraph drafted for the paper, stating the outcome plainly whichever way it went.
- [ ] Evaluation report v1 delivered (for the 28 Feb checkpoint).
- [ ] Phase Gate Report.

---

## PHASE 7 — Correction model (H2) and the avoidance decision layer (H3, H4)

**Goal**: a monotone, calibrated, explainable correction model that is tested honestly against B3; a conservative decision layer that ranks flights by lower-bound net warming avoided.

### 7.1 Training data
Formation-criterion segments with y ∈ {0, 1} from Phase 5, joined with features (§2.2). Class balance reported per season. No features that leak the label (e.g. no detector outputs or CoCiP outputs computed with humidity that already used the labels).

### 7.2 Features (paper §4.6), exactly this set, in `stratum/model/features.py`
ERA5 RHi at the segment level and at the levels above and below; vertical RHi gradient; temperature; temperature margin relative to T_LM/T_LC; pressure; cloud ice water content; high-cloud fraction; vertical velocity; vertical wind shear; distance to the tropopause; latitude; longitude; month (sin/cos); local solar time (sin/cos). A feature-documentation table (name, unit, source, why it might matter) goes into `docs/methods/features.md` and the web Methods page.

### 7.3 Models (`stratum/model/train.py`)
1. **Sanity baseline**: logistic regression on RHi alone (plus intercept). Report it beside everything else. If the boosted model can't beat it, say so plainly.
2. **Main model**: gradient-boosted trees, **LightGBM or XGBoost** (⚑ pick one; recommend LightGBM on CPU locally and XGBoost `device="cuda"` in Colab if search is slow, but keep one primary). Native **monotone constraints**: +1 on RHi at the segment level, −1 on (T − T_LM) (warmer relative to threshold → lower probability). Don't do post-hoc clipping.
3. **Hyperparameter search**: small budget (e.g. Optuna, 50–100 trials) on **inner grouped validation within the training seasons only**, optimising Brier. Fixed seeds. Log every trial.
4. **Calibration**: isotonic regression fitted on the validation fold (never on test). Reliability diagram before/after.
5. **Outer loop**: leave-one-season-out exactly as in Phase 6 (the model is retrained per outer fold). Then the spatial split.
6. **Explainability**: TreeSHAP global importance and dependence plots (RHi, temperature margin, distance to tropopause, local solar time), shown on the Methods page. Check that monotonicity holds in the dependence plots.

Tests: monotonicity property test (Hypothesis library): for random feature rows, increasing RHi never decreases the calibrated prediction, and increasing T − T_LM never increases it. Isotonic calibration preserves this if applied after; verify it.

### 7.4 Feeding the correction back into physics (paper §4.6)
- **(a) Direct**: use calibrated P(detectable persistent contrail) for ranking.
- **(b) Scaling factor** (preferred unless (a) is clearly better): learn an RHi scaling factor **per season × latitude band** (⚑ band edges, e.g. 6–15, 15–25, 25–37°N, decide with the team). Implementation: for each (season, band) on training data, fit `s` (RHi_scaled = RHi / s) and a smoothing width τ by maximum likelihood of `y ~ Bernoulli(σ((RHi/s − 1)/τ) · 1[formation])`, with a bounded search s ∈ [0.80, 1.20]. Rerun CoCiP with a custom `pycontrails` humidity-scaling class that applies the learned s → corrected EF.
- Decide (a) vs (b) on **validation data**, with a pre-stated rule: choose (b) unless (a)'s validation Brier is better by > 0.005 and (a)'s explanation is still defensible. Record it in `docs/decisions.md` before looking at test seasons.

### 7.5 H2
Mean BSS of STRATUM vs B3 on held-out seasons (paired day bootstrap). **Supported iff mean ≥ 0.10 and the lower 95% CI > 0.** Final run logged via the lock. Also report vs the logistic sanity baseline and vs B1/B2.

### 7.6 Decision layer (`stratum/decide/`)
For every segment flagged by the corrected model on held-out days:
1. **Alternatives**: ±2,000 ft and ±4,000 ft (pre-registered). Note in the docs: ±2,000 ft keeps the same direction-of-flight level parity under RVSM, which is why it's the natural first option. Reject alternatives above the aircraft's OpenAP ceiling or below FL250, and record the reason.
2. **Re-run physics** at each alternative level (SAC, persistence with the corrected humidity, CoCiP EF with Monte Carlo uncertainty) for the affected portion of the flight. Avoid one level and you might enter another ISSR: the rerun handles that.
3. **Fuel** (`fuel.py`): OpenAP fuel flow at the alternative level over the affected portion, plus climb/descent transition costs (step climb/descent at typical rates, with fuel from OpenAP's climb/descent models). Same Mach assumption; document it. Extra fuel = alternative − planned. **CO₂ = 3.16 kg per kg fuel.**
4. **Climate metric** (`climate_metric.py`): convert contrail EF and extra CO₂ to a common basis under **20-year and 100-year horizons**. ⚑ **Ask the team for the conversion source** (e.g. a published GWP/ATR-based contrail-EF-to-CO₂e method) and put the factors with their citation in `configs/preregistered_open_questions.md` **before** computing anything. Don't invent factors.
5. **Uncertainty** (`uncertainty.py`): Monte Carlo over (i) humidity (the correction model's bootstrap distribution of s, or probability), (ii) detection efficiency, (iii) CoCiP parameter uncertainty, (iv) metric horizon. Net warming avoided = (EF_planned − EF_alt in CO₂e) − extra CO₂. Report p5, p50, p95.
6. **Ranking** (`rank.py`): best alternative = max lower bound (p5) of net warming avoided across alternatives. **Alert only if p5 > 0 under both horizons** (conservative, by design; false alarms burn fuel and destroy dispatcher trust). Also store the counterfactual "would have alerted under a single horizon" for the report.
7. Output: a ranked list per day (Table 3 fields fully populated) + a confidence note: "well covered by validation data" if the segment's (season, lat band, FL band, VZA band, day/night) cell had ≥ N labelled examples (⚑ N, recommend 50), else "extrapolating".

### 7.7 H3 and H4
- **H3**: sort segments by positive EF (corrected); find the smallest share of **cruise flight distance** that accounts for ≥ 80% of total positive EF. **Supported iff ≤ 10%.** Bootstrap by day for a CI (descriptive). Plot the Lorenz-style concentration curve.
- **H4**: night = 18:00–06:00 **local solar time**. Statistic = (night share of positive EF) − (night share of flight distance). **Supported iff the lower 95% CI > 0** (day bootstrap).
- Final runs logged via the lock.

### 7.8 Done when
- [ ] Monotonicity property tests pass; calibration is improved on validation; SHAP plots produced.
- [ ] H2 final run logged, with a clear verdict and CIs.
- [ ] (a) vs (b) decision recorded with the validation numbers.
- [ ] Ranked avoidance lists for every held-out day; alert counts; fuel/CO₂ sums; H3 and H4 verdicts.
- [ ] Evaluation report v2 (adds H2–H4, model card, decision-layer summary).
- [ ] Phase Gate Report.

---

## PHASE 8 — Web app v1, Summit expo build, and open release

**Goal**: the full dashboard with real corrected results, an offline expo build for Houston, a model card, and an open, citable release.

### 8.1 Dashboard v1 (extends Phase 4)
- **Model switcher**: B1 (physics) / B3 (published correction) / STRATUM (corrected), the same map and list for each. A judge can see the difference. Default: STRATUM.
- **Map**: calibrated P(persistent contrail) by FL and hour; toggle "show uncertainty" (p95 − p5 width map) and "observability" (where the satellite could have checked). Flights coloured by alert status.
- **Ranked list**: sorted by lower-bound net warming avoided; filters (airline, direction, night only, alerts only, confidence level); CSV download of the visible list (commercial flights only).
- **Segment card**: every Table-3 field populated. A small vertical-profile chart of RHi vs FL at that location/time with the ISSR shaded and planned/alternative levels marked (mirrors paper Figure 3). Fuel/CO₂ and net-warming ranges under both horizons. Confidence note. The card itself carries the "ATC feasibility not modelled" caveat.
- **Results page** (`/results`): H1–H4 each as a card with the pre-registered criterion, the result with CI, a verdict badge (supported / not supported, **styled neutrally; a refuted hypothesis isn't shown as failure**), and the figure. The baseline comparison table. Reliability diagrams. A link to the final-runs log.
- **Methods page**: plain-English pipeline, features table, SHAP plots, model card (intended use, out-of-scope uses, data, metrics, limitations, ethical considerations), the threats-to-validity table from the paper, the deviations list, and "what didn't work".
- **Data & code page**: download links, licences, how to reproduce, citation (DOI once minted).
- Days: the held-out season(s) plus the January 2026 demo month. Day picker with a calendar heat strip (alerts per day).

### 8.2 Offline expo build (for the booth in Houston, no reliable internet)
- `npm run build:expo` → a self-contained folder with all assets, fonts, basemap and a curated set of days, plus `start-expo.command` (macOS) / `start-expo.bat` (Windows) / `start-expo.sh` that launches a local static server and opens the browser in kiosk/full-screen mode. Also a PWA service worker so a visited site works offline.
- **"Booth mode"**: auto-cycling tour (map → a good flagged flight → its card → results) that pauses on any interaction and resumes after 60 s idle.
- Test on a laptop with Wi-Fi off. Write `docs/expo_checklist.md` (chargers, a backup laptop, the build on a USB stick, the printed poster's QR code pointing to the live site).

### 8.3 Reproducibility and release
- `make reproduce-figures` regenerates every paper figure from released derived data.
- A release bundle on Drive and GitHub Releases: **derived** data only where raw redistribution isn't allowed: segment-level predictions and labels (commercial flights only; hashed IDs), hand labels + adjudicated set, scene packages if the EUMETSAT licence allows (⚑ check and tell the team), model weights, configs, the lock and final-runs log, evaluation reports, plus **scripts to re-download raw data**. Data licence ⚑ (suggest CC-BY-4.0 for our derived data, where upstream terms allow).
- `CITATION.cff`; GitHub → Zenodo integration for a DOI (⚑ ask before minting; it's permanent).
- A data card (`docs/data_card.md`): collection, coverage, biases (ADS-B coverage, satellite observability by season/VZA), known label noise (κ), intended uses.
- README "reproduce from scratch" path tested by someone who didn't write the code (ask one team member to try it in a fresh Colab).

### 8.4 Optional after the Summit (only if the team asks)
- Expand from the corridor to the full Indian domain (Colab-heavy; estimate first).
- A weekly update notebook to add recent weeks (ERA5 latency ~5 days; this is not real-time and the site must say so).
- Overnight cargo-route analysis.

### 8.5 Done when
- [ ] v1 live: model switcher, populated cards, results page with H1–H4, methods page with model card; Playwright + Lighthouse pass.
- [ ] Expo build runs with Wi-Fi off on the booth laptop; booth mode works; checklist done.
- [ ] Release bundle, data card, CITATION.cff ready; DOI minted only after the team's OK.
- [ ] Final Phase Gate Report, with a list of everything that didn't work and why (the paper promises this).

---

## 9. Testing strategy (applies to all phases)

| Layer | What | Where |
|---|---|---|
| Known-answer physics | §4.3 table, ISA conversions, tropopause on synthetic profiles | `tests/physics/` |
| Property tests | Monotonicity, interpolation exactness on linear fields, bootstrap coverage | `tests/` with `hypothesis` |
| Data contracts | pandera schemas for ADS-B, segments, labels; pydantic/zod for web exports | `tests/io/`, `web/src/**/*.test.ts` |
| Leakage | No flight or image group crosses a split; climatology uses training months only | `tests/evaluate/` |
| Invariants | Unobservable → missing; labels independent of predictions; public exports contain no non-commercial flights and no raw ICAO24 | `tests/match/`, `tests/export/` |
| Synthetic end-to-end | Synthetic flight + synthetic met + synthetic image with a planted contrail → y = 1 → shows up in the web export | `tests/e2e/` |
| Regression | Tiny real-data fixture (1 hour, corridor) with stored expected outputs; changes need a reason in the commit | `tests/regression/` |
| Web | Vitest + Playwright (desktop + phone) + Lighthouse CI | `web/` |

Coverage target: ≥ 85% lines on `stratum/physics`, `stratum/match`, `stratum/evaluate`, `stratum/decide`. Lower is fine for I/O wrappers.

---

## 10. Coding standards

- Type hints everywhere; `mypy --strict` on `stratum/`. Small pure functions for science; I/O at the edges.
- Units in names when not SI (`alt_ft`, `gs_kt`, `ef_J`). Docstrings state units and the paper equation/section.
- No silent `except:`. Errors say what failed, for which unit (day/flight), and what to do.
- Logging via `rich`/`logging`; every CLI command prints a final summary table.
- Vectorise; no Python loops over segments or pixels in hot paths. Profile before optimising.
- Deterministic: seeds set for NumPy, scikit-learn, LightGBM/XGBoost, PyTorch (if used); `PYTHONHASHSEED`.
- Configs, not constants, for anything that's a choice. Physical constants live in one module with citations.
- Commit messages: imperative, reference the phase/task (e.g. `phase2: add gap filling along great circle (2.1.6)`).

---

## 11. Explain-it-to-the-team deliverables (judges will ask)

At the end of each phase, add a page to `docs/methods/` (≤ 1 page each, plain English, one figure) that a team member can read in 5 minutes and then explain to a judge:
- P1: Where our data come from and what the coverage audit found.
- P2: How a contrail forms (the Schmidt–Appleman criterion) and when it persists; what CoCiP adds.
- P3: How we spot a contrail in a satellite image, day and night.
- P4: How the website works (and why it's static).
- P5: How we decide whether the satellite "saw" a predicted contrail, and why cloudy scenes count as unknown.
- P6: Why we bootstrap by day, and what a Brier skill score means.
- P7: What the correction model learns, why it's monotone, and how a flight gets an alert.
- P8: What we release, and what we can't release and why.

Also maintain `docs/hard_questions.md`: likely judge questions with short, honest answers backed by our numbers. Start with: "Isn't India's contrail problem small?", "What if air traffic control says no?", "How do you know the satellite really saw that contrail?", "Why not just use Google's/others' tools?", "What happens under monsoon cloud?", "How much fuel does this cost?".

---

## 12. Phase Gate Report template (print at the end of every phase)

```
═══ PHASE N GATE REPORT — <name> — <date> ═══
Status:          READY FOR REVIEW | BLOCKED (<why>)
Calendar:        on track | at risk (<days>) → proposed cuts: <...>

Done-when checklist:
  [x] item ... (evidence: file/link/test name)
  [ ] item ... (why not, what's needed, who)

What was built:  <5–10 bullets, plain English>
Key numbers:     <counts, sizes, metrics; each with where it came from>
Tests:           pytest <n passed>/<n>, coverage <x%>, ruff/mypy clean, web tests <...>
Colab runs:      <job, commit, summary verdict>
Storage:         Drive used <x GB> (+<y GB> this phase)
Decisions made:  <links to docs/decisions.md lines>
Deviations:      <none | list with team OK>
Open questions:  <⚑ items needing the team, with a recommended answer each>
Risks:           <new or changed>
Next phase:      <first 3 tasks>; what I need from you first: <...>
════════════════════════════════════════════
```

---

## 13. Final reminders to Claude Code

- Read this whole file at the start of every session. Re-read the current phase before starting each task.
- One phase at a time; finish its gate before starting the next (except the Phase 2–4 overlap noted in §5).
- When unsure: stop, ask, recommend. The team would rather answer five questions than discover one silent assumption in front of a judge.
- A refuted hypothesis is a valid, publishable result. Never tune, re-split, re-define or re-run until something "works". The paper promises to publish every outcome, and the code must make that promise easy to keep.
