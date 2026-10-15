"""Generate the Colab launcher notebooks in this folder.

Every launcher shares the same tested setup cells (runtime report → mount Drive → clone repo
at REF → install pinned env → `stratum info`) and ends with a JSON run summary
(build prompt §2.2, §2.5). Notebooks contain NO pipeline logic: they only call `stratum`
CLI commands. Edit this file, then run:  python colab/make_notebooks.py
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent


def md(s: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": s.strip("\n").splitlines(True)}


def code(s: str) -> dict:
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": s.strip("\n").splitlines(True),
    }


def settings(job: str, extra: str = "") -> dict:
    return code(f'''
# ── 1. Settings ─────────────────────────────────────────────────────────────
REPO = "ShrugalVinod/stratum"
REF = "main"          # branch or exact commit SHA (Claude's handoff block says which)
JOB = "{job}"
{extra}''')


SETUP = [
    code("""
# ── 2. Runtime report: GPU, RAM, disk ───────────────────────────────────────
import hashlib, json, os, shutil, subprocess, sys, time
t0 = time.time()
SECRETS = []  # strings that must never be printed
def _redact(text):
    for s in SECRETS:
        text = text.replace(s, "***")
    return text
def sh(cmd, check=True):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(_redact(r.stdout[-3000:]), _redact(r.stderr[-3000:]))
        raise RuntimeError("command failed: " + _redact(cmd)[:120])
    return r.stdout.strip()

gpu = sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", check=False) or "none (CPU runtime)"
ram_gb = round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9, 1)
disk_free_gb = round(shutil.disk_usage("/content").free / 1e9, 1)
print(f"GPU: {gpu}\\nRAM: {ram_gb} GB\\nLocal disk free: {disk_free_gb} GB")
"""),
    code("""
# ── 3. Mount Google Drive ───────────────────────────────────────────────────
from google.colab import drive
drive.mount("/content/drive")
DRIVE_ROOT = "/content/drive/MyDrive/STRATUM"
os.makedirs(DRIVE_ROOT, exist_ok=True)
print("Drive root:", DRIVE_ROOT)
"""),
    code("""
# ── 4. Clone (or update) the private repo at REF ───────────────────────────
# The token comes from Colab Secrets, is passed only on the command line, and is never printed
# or stored in .git/config.
from google.colab import userdata
token = userdata.get("GITHUB_TOKEN")
SECRETS.append(token)
auth_url = f"https://x-access-token:{token}@github.com/{REPO}.git"
SRC = "/content/stratum"
if not os.path.isdir(f"{SRC}/.git"):
    sh(f"git clone --quiet {auth_url} {SRC}")
    sh(f"git -C {SRC} remote set-url origin https://github.com/{REPO}.git")
sh(f"git -C {SRC} fetch --quiet {auth_url} {REF}")
sh(f"git -C {SRC} checkout --quiet --force FETCH_HEAD")
del token, auth_url
COMMIT = sh(f"git -C {SRC} rev-parse HEAD")
print("Repo commit:", COMMIT)
"""),
    code("""
# ── 5. Install the pinned environment (uv.lock) into its own virtualenv ─────
# A separate venv avoids clashes with Colab's preinstalled packages. Python 3.12 is
# downloaded by uv if Colab's default differs.
sh("pip install --quiet uv")
VENV = "/content/venv"
env = {**os.environ, "UV_PROJECT_ENVIRONMENT": VENV}
r = subprocess.run(f"cd {SRC} && uv sync --frozen --python 3.12", shell=True, env=env, capture_output=True, text=True)
print(r.stderr[-1500:])
assert r.returncode == 0, "uv sync failed — paste the output above to Claude"
FREEZE_SHA = hashlib.sha256(sh(f"uv pip freeze --python {VENV}/bin/python").encode()).hexdigest()[:16]
PY = f"{VENV}/bin/python"
print("Python:", sh(f"{PY} --version"), "| pip-freeze hash:", FREEZE_SHA)
"""),
    code('''
# ── 6. `stratum` helpers; print environment; make sure the Drive layout exists ─
run_env = {**os.environ, "STRATUM_DRIVE_ROOT": DRIVE_ROOT, "STRATUM_WORK_DIR": "/content/work",
           "COLUMNS": "120", "PYTHONUNBUFFERED": "1", "MPLBACKEND": "agg"}
def stratum(args, live=False):
    """Run a stratum CLI command. live=True streams output (for long jobs)."""
    if not live:
        r = subprocess.run(f"{VENV}/bin/stratum {args}", shell=True, cwd=SRC, env=run_env,
                           capture_output=True, text=True)
        print(_redact(r.stdout[-4000:]), _redact(r.stderr[-2000:]))
        return r.returncode
    p = subprocess.Popen(f"{VENV}/bin/stratum {args}", shell=True, cwd=SRC, env=run_env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in p.stdout:
        if "ecCodes" in line or "cfgrib" in line or "external_backend" in line:
            continue
        print(_redact(line), end="")
    return p.wait()
assert stratum("info") == 0
assert stratum("init-drive") == 0
'''),
]


def summary_cell(fields: str) -> dict:
    return code(f"""
# ── Run summary — copy everything between the === lines back to Claude ──────
# (no `du` over the whole Drive folder: on Drive FUSE it takes many minutes)
summary = {{
    "job": JOB,
    "commit": COMMIT,
    "ref_requested": REF,
    "pip_freeze_hash": FREEZE_SHA,
    "runtime": {{"gpu": gpu, "ram_gb": ram_gb}},
    "wall_time_min": round((time.time() - t0) / 60, 1),
{fields}}}
print("=== STRATUM RUN SUMMARY ===")
print(json.dumps(summary, indent=2, default=str))
print("=== END SUMMARY ===")
""")


def header(title: str, body: str) -> dict:
    return md(
        f"# STRATUM · {title}\n\n{body.strip()}\n\nNo pipeline logic lives here: every step calls the `stratum` package."
    )


# ── 00 · smoke test ──────────────────────────────────────────────────────────

SMOKE = [
    header(
        "00 · Colab smoke test (Phase 0)",
        """
**What this does:** checks that the STRATUM code runs on Colab exactly as on a laptop. Mounts
Google Drive, creates the folder layout, clones the repo, installs the pinned environment, runs
the tests, and writes + reads back a test file on Drive.

* **Runtime:** standard CPU (*Runtime → Change runtime type → CPU*).
* **Secrets** (🔑, Notebook access ON): `GITHUB_TOKEN`
* **Writes to Drive:** folder layout + `MyDrive/STRATUM/manifests/smoke_test_*.json` (KB).
* **Time:** 3–5 min. Safe to re-run.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings("00_smoke_test"),
    *SETUP,
    code("""
# ── 7. Run the test suite (same as `make test` on a laptop) ────────────────
r = subprocess.run(f"cd {SRC} && {PY} -m pytest -q -m 'not network' -p no:cacheprovider", shell=True, env=run_env, capture_output=True, text=True)
print(r.stdout[-2500:])
TESTS_LINE = [l for l in r.stdout.splitlines() if " passed" in l or " failed" in l or " error" in l][-1:]
TESTS_OK = r.returncode == 0
"""),
    code("""
# ── 8. Write a test file to Drive, read it back; copy the pre-registration lock ─
probe = subprocess.run(
    f"{PY} -c \\"from stratum.manifest import RunManifest; import sys; m = RunManifest.start('{JOB}'); m.finish(); sys.stdout.write(m.model_dump_json())\\"",
    shell=True, cwd=SRC, env=run_env, capture_output=True, text=True)
assert probe.returncode == 0, probe.stderr
payload = probe.stdout
path = f"{DRIVE_ROOT}/manifests/smoke_test_{time.strftime('%Y%m%dT%H%M%S')}.json"
with open(path, "w") as f:
    f.write(payload)
with open(path) as f:
    roundtrip_ok = f.read() == payload
lock_src = f"{SRC}/_locks/preregistration.lock"
lock_copied = os.path.exists(lock_src)
if lock_copied:
    shutil.copy2(lock_src, f"{DRIVE_ROOT}/_locks/preregistration.lock")
print("Drive write/read OK:", roundtrip_ok, "->", path)
"""),
    summary_cell("""    "drive_write_read_ok": roundtrip_ok,
    "drive_test_file": path,
    "lock_copied_to_drive": lock_copied,
    "tests_ok": TESTS_OK,
    "tests": TESTS_LINE,
"""),
]


# ── 01a · ERA5 download ──────────────────────────────────────────────────────

ERA5 = [
    header(
        "01a · ERA5 download (Phase 1, task 1.1.4)",
        """
**What this does:** downloads hourly ERA5 for the padded study box (4–39°N, 66–100°E) from the
Copernicus CDS, cropped on CDS's server, into
`MyDrive/STRATUM/raw/era5/{pl,sl,tropo_T}/YYYY-MM/data.zarr`. Each month gets a manifest and
a `_SUCCESS` marker; finished months are skipped; a half-finished month keeps the variables
it already has. January 2026 was run and checked first; this run does the whole
evaluation year (`MONTHS = "2025-03:2026-02"`; months already done are skipped).

* **Runtime:** standard CPU (no GPU, no High-RAM). Most of the time is waiting in CDS's queue.
* **Secrets** (🔑, Notebook access ON): `GITHUB_TOKEN`, `CDSAPI_KEY`
* **Writes to Drive:** ≈ 3.2 GB per month (≈ 3.1 GB `pl` + 0.06 GB `sl` + 0.08 GB `tropo_T`).
* **Time:** CDS queue dependent: roughly 0.5–2 h per month. Keep this tab open (Colab Pro
  keeps running a while if you close it, but don't rely on it).
* **If it disconnects:** *Runtime → Run all* again: it resumes.
* **Never re-run while it is still running.** To restart on purpose: *Runtime → Restart
  session* first (this stops the old process), then *Runtime → Run all*.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings("01a_era5_download", 'MONTHS = "2025-03:2026-02"   # whole evaluation year; finished months are skipped\n'),
    *SETUP,
    code("""
# ── 7. CDS key from Colab Secrets (never printed) ──────────────────────────
cds_key = userdata.get("CDSAPI_KEY")
SECRETS.append(cds_key)
run_env["CDSAPI_URL"] = "https://cds.climate.copernicus.eu/api"
run_env["CDSAPI_KEY"] = cds_key
del cds_key
print("CDS key loaded.")
"""),
    code("""
# ── 8. Download (long; streams progress; resumable) ────────────────────────
rc = stratum(f"download-era5 --month {MONTHS}", live=True)
print("exit code:", rc)
"""),
    code("""
# ── 9. Collect per-month results from the manifests on Drive ───────────────
import pandas as pd
a, _, b = MONTHS.partition(":")
months = [str(p) for p in pd.period_range(a, b or a, freq="M")]
units, done, missing, sizes = {}, 0, [], {}
for g in ["pl", "sl", "tropo_T"]:
    for m in months:
        d = f"{DRIVE_ROOT}/raw/era5/{g}/{m}"
        ok = os.path.exists(f"{d}/_SUCCESS")
        if not ok:
            missing.append(f"{g}/{m}")
            continue
        done += 1
        st = json.load(open(f"{d}/manifest.json"))["stats"]
        sizes[f"{g}/{m}"] = round(int(sh(f"du -sb '{d}' | cut -f1")) / 1e9, 3)
        keep = {k: v for k, v in st.items() if k.endswith(":nan_frac") and v} or {}
        units[f"{g}/{m}"] = {
            "expver": st.get("expver"), "dims": st.get("dims"), "time_range": st.get("time_range"),
            "T_min_max": [st.get("air_temperature:min"), st.get("air_temperature:max")] if "air_temperature:min" in st else None,
            "nonzero_nan_fractions": keep, "gb": sizes[f"{g}/{m}"],
        }
print(json.dumps(units, indent=1)[:3000])
"""),
    summary_cell("""    "exit_code": rc,
    "months_requested": MONTHS,
    "units_done": done,
    "units_missing": missing,
    "gb_written_total": round(sum(sizes.values()), 2),
    "units": units,
"""),
]


# ── 01b · ADS-B Exchange free days ───────────────────────────────────────────

ADSBX = [
    header(
        "01b · ADS-B Exchange free sample days (Phase 1, task 1.2.1)",
        """
**What this does:** streams the free ADS-B Exchange "readsb-hist" snapshots (one every 5 s,
the 1st of each month) and keeps only aircraft over the padded India box at or above FL200.
Writes `MyDrive/STRATUM/raw/adsb/adsbx/YYYY-MM-DD/hour=HH.parquet` (+ manifest, `_SUCCESS`).
Also stores the dated OpenSky aircraft-database snapshot in `raw/aircraft_db/`.

* **Runtime:** standard CPU. The work is downloading (~12 GB per day over the network,
  nothing large is stored) and parsing JSON.
* **Secrets** (🔑, Notebook access ON): `GITHUB_TOKEN`
* **Writes to Drive:** ≈ 0.1 GB per day → ≈ 1.2 GB for the 12 days.
* **Time:** ≈ 10–25 min per day → ≈ 2–5 h for all 12. Finished hours/days are skipped on re-run.
* **If it disconnects:** *Runtime → Run all* again: it resumes at the first missing hour.
* **Never re-run while it is still running.** To restart on purpose: *Runtime → Restart
  session* first (this stops the old process), then *Runtime → Run all*.
* **Terms:** free samples are for testing/evaluation; raw data are never redistributed.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "01b_adsb_ingest",
        '# The 1st of every month of the evaluation year (Mar 2025 – Feb 2026).\n'
        'DAYS = ["2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01", "2025-08-01",\n'
        '        "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]\n'
        "WORKERS = 32\n",
    ),
    *SETUP,
    code('''
# ── 7. Aircraft database snapshot (once; skipped if already on Drive) ──────
assert stratum("ingest-aircraft-db --snapshot 2025-08") == 0
'''),
    code('''
# ── 8. Ingest each day (long; streams progress; resumable) ─────────────────
codes = {}
for d in DAYS:
    print(f"\\n===== {d} =====")
    codes[d] = stratum(f"ingest-adsb --day {d} --workers {WORKERS}", live=True)
print("exit codes:", codes)
'''),
    code('''
# ── 9. Collect per-day results from the manifests on Drive ─────────────────
days_out, missing = {}, []
for d in DAYS:
    p = f"{DRIVE_ROOT}/raw/adsb/adsbx/{d}"
    if not os.path.exists(f"{p}/_SUCCESS"):
        missing.append(d)
        continue
    st = json.load(open(f"{p}/manifest.json"))["stats"]
    days_out[d] = {k: st.get(k) for k in ("snapshots_ok", "snapshots_missing", "rows_kept", "dropped_non_icao")}
    days_out[d]["gb"] = round(int(sh(f"du -sb '{p}' | cut -f1")) / 1e9, 3)
print(json.dumps(days_out, indent=1))
'''),
    summary_cell('''    "exit_codes": codes,
    "days_done": len(days_out),
    "days_missing": missing,
    "gb_written_total": round(sum(v["gb"] for v in days_out.values()), 3),
    "days": days_out,
'''),
]


# ── 01c · Meteosat-9 IODC, Plan A ────────────────────────────────────────────

METEOSAT = [
    header(
        "01c · Meteosat-9 IODC imagery, Plan A (Phase 1, task 1.3.5)",
        """
**What this does:** for each chosen day (+2 h past midnight), downloads every 15-minute
Meteosat-9 Indian Ocean full-disk image and its cloud mask from EUMETSAT, converts to
brightness temperatures with satpy, crops to the padded India box (native satellite grid)
and stores 6 infrared channels + the cloud mask on Drive:
`MyDrive/STRATUM/raw/meteosat/{l15_crop,clm}/YYYY-MM-DD/` plus `static_grid.zarr`
(lat, lon, viewing angle, pixel area).

**Days (Plan A, approved 14 Oct 2026):** 1 Jan 2026 + the 2 clearest January 2026 days
(chosen objectively from ERA5 high cloud, step 8) + the 12 ADS-B Exchange days.

* **Runtime:** standard CPU. Needs the ERA5 January 2026 data already on Drive (done).
* **Secrets** (🔑, Notebook access ON): `GITHUB_TOKEN`, `EUMETSAT_KEY`, `EUMETSAT_SECRET`
  (the NEW account's key).
* **Writes to Drive:** ≈ 0.6 GB per day → ≈ 9 GB in total (≈ 280 GB streamed, not stored).
* **Time:** ≈ 10–20 min per day → ≈ 3–5 h for 14 days.
* **If it disconnects:** *Runtime → Run all* again: finished days are skipped.
* **Never re-run while it is still running.** To restart on purpose: *Runtime → Restart
  session* first, then *Runtime → Run all*.
* **Licence:** EUMETSAT data; credit EUMETSAT; never redistribute the original data.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "01c_meteosat_ingest",
        'ADSBX_DAYS = ["2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01", "2025-08-01",\n'
        '              "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]\n'
        "EXTEND_HOURS = 2\n",
    ),
    *SETUP,
    code('''
# ── 7. EUMETSAT key from Colab Secrets (never printed) ─────────────────────
for name in ("EUMETSAT_KEY", "EUMETSAT_SECRET"):
    val = userdata.get(name)
    SECRETS.append(val)
    run_env[name] = val
del val
print("EUMETSAT key loaded.")
'''),
    code('''
# ── 8. Choose the 2 clearest January 2026 days from ERA5 (objective) ────────
r = subprocess.run(f"{VENV}/bin/stratum select-clear-days --month 2026-01 --n 2 --exclude 2026-01-01",
                   shell=True, cwd=SRC, env=run_env, capture_output=True, text=True)
print(r.stdout[-2500:])
assert r.returncode == 0, r.stderr[-1500:]
CLEAR_DAYS = next(l.split("=", 1)[1].strip() for l in r.stdout.splitlines() if l.startswith("CLEAR_DAYS=")).split(",")
DAYS = sorted(set(["2026-01-01", *CLEAR_DAYS, *ADSBX_DAYS]))
print("Days to ingest:", DAYS)
'''),
    code('''
# ── 9. Ingest each day (long; streams progress; resumable) ─────────────────
codes = {}
for d in DAYS:
    print(f"\\n===== {d} =====")
    codes[d] = stratum(f"meteosat-day --day {d} --extend-hours {EXTEND_HOURS}", live=True)
print("exit codes:", codes)
'''),
    code('''
# ── 10. Collect per-day results from the manifests on Drive ────────────────
days_out, missing = {}, []
for d in DAYS:
    p = f"{DRIVE_ROOT}/raw/meteosat/l15_crop/{d}"
    if not os.path.exists(f"{p}/_SUCCESS"):
        missing.append(d)
        continue
    st = json.load(open(f"{p}/manifest.json"))["stats"]
    gb = sum(int(sh(f"du -sb '{DRIVE_ROOT}/raw/meteosat/{k}/{d}' | cut -f1")) for k in ("l15_crop", "clm")) / 1e9
    days_out[d] = {"slots": f"{st['slots_kept']}/{st['slots_expected']}", "n_missing": len(st["missing"]),
                   "missing_first": st["missing"][:5], "cloudy_frac": st["clm_fraction"].get("cloudy"),
                   "gb": round(gb, 3)}
print(json.dumps(days_out, indent=1))
'''),
    summary_cell('''    "exit_codes": codes,
    "clear_days_chosen": CLEAR_DAYS,
    "days_done": len(days_out),
    "days_missing": missing,
    "static_grid_exists": os.path.exists(f"{DRIVE_ROOT}/raw/meteosat/static_grid.zarr"),
    "gb_written_total": round(sum(v["gb"] for v in days_out.values()), 2),
    "days": days_out,
'''),
]


# ── 01a2 · ERA5 via ARCO (Google's identical copy; no queue) ─────────────────

ERA5_ARCO = [
    header(
        "01a2 · ERA5 download via ARCO (Phase 1, task 1.1.4, fast route)",
        """
**What this does:** the same ERA5 download as `01a`, but from **Google's ARCO-ERA5 copy**
instead of the CDS queue. ARCO was checked to be **identical** to CDS (differences at GRIB
rounding level, `reports/phase1/era5_cds_vs_arco.csv`). Colab reads Google's whole-globe
chunks over Google's own network, keeps only the India box, and writes exactly the same files
as `01a`: `MyDrive/STRATUM/raw/era5/{pl,sl,tropo_T}/YYYY-MM/data.zarr`.

**Skips everything already done** (by CDS or ARCO). Works **newest month first** so it can run
**at the same time as the `01a` CDS tab** (which works oldest first); a per-month lock stops
them ever writing the same month. Each finished day is saved, so a disconnect loses ≤ 1 day.

* **Runtime:** CPU, **High-RAM** if offered (*Runtime → Change runtime type → CPU, High-RAM on*).
* **Secrets** (🔑): `GITHUB_TOKEN` only (ARCO needs no key).
* **Writes to Drive:** ≈ 3.3 GB per month. Streams ≈ 0.2–0.5 TB per month through Colab
  (Google network, not stored, not your home internet).
* **Time:** measured 134 s per day with 6 workers (~80 min/month); 16 workers ≈ 2× faster.
* **If it disconnects:** *Runtime → Restart session*, then *Runtime → Run all*.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "01a2_era5_arco",
        'MONTHS = "2025-03:2026-02"   # whole evaluation year; finished months are skipped\n'
        "WORKERS = 16                 # hours fetched in parallel (~0.3 GB RAM each)\n",
    ),
    *SETUP,
    code('''
# ── 7. Download from ARCO, newest month first (long; streams progress; resumable) ─
rc = stratum(f"download-era5 --month {MONTHS} --route arco --reverse --workers {WORKERS}", live=True)
print("exit code:", rc)
'''),
    ERA5[-2],   # same per-month collection cell as 01a
    ERA5[-1],   # same summary cell as 01a
]


# ── 02 · Physics baseline B1/B2/B3 (Phase 2) ─────────────────────────────────

PHYSICS = [
    header(
        "02 · Physics baseline: segments, SAC flags and CoCiP B1/B2/B3 (Phase 2, task 2.4)",
        """
**What this does:** turns the January 2026 flights (the free ADS-B Exchange day 1 Jan 2026)
into 1-minute cruise segments, attaches ERA5 weather, aircraft performance and the
Schmidt–Appleman flags, then runs CoCiP with the three humidity scalings B1 (raw), B2 (÷0.95)
and B3 (pycontrails latitude correction), each with **20 Monte Carlo members** (Q12). Then it
runs the N = 20 vs 40 convergence check and writes the Phase 2 sanity report.

Reads (already on Drive): `raw/adsb/adsbx/2026-01-01`, `raw/era5/{pl,sl,tropo_T}/2026-01`,
`raw/aircraft_db`. Writes: `interim/segments_met/2026-01/…`, `interim/cocip/{B1,B2,B3}/2026-01/…`,
`interim/cocip/convergence/2026-01.csv`, `reports/phase2_sanity/2026-01/` (report + figures).

* **Runtime:** CPU, **High-RAM** if offered (*Runtime → Change runtime type*). No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** well under 1 GB.
* **Time:** roughly 15–30 min (measured locally: 1,706 corridor flights through CoCiP in ~10 s
  per run; 21 runs × 3 scalings plus the 60-run convergence check).
* **If it disconnects:** *Runtime → Run all* again. Finished days and scalings are skipped.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "02_physics_baseline",
        'MONTH = "2026-01"     # development month (pre-registered)\n'
        "MEMBERS = 20          # Monte Carlo members (open question 12, settled)\n"
        "MAX_AGE_H = 24        # CoCiP maximum contrail age (hours)\n",
    ),
    *SETUP,
    code('''
# ── 7. Segments + ERA5 features + η + SAC flags (per ADS-B day in the month) ──
rc_seg = stratum(f"build-segments --month {MONTH} --corridor DEL-BOM", live=True)
print("exit code:", rc_seg)
'''),
    code('''
# ── 8. CoCiP for B1, B2, B3 with Monte Carlo ranges ─────────────────────────
rc_cocip = stratum(f"run-cocip --month {MONTH} --scaling all --members {MEMBERS} --max-age-h {MAX_AGE_H}", live=True)
print("exit code:", rc_cocip)
'''),
    code('''
# ── 9. Q12 convergence check (N = 20 vs 40, B1, first day) + sanity report ──
import glob
first_day = sorted(glob.glob(f"{DRIVE_ROOT}/interim/segments_met/{MONTH}/*/_SUCCESS"))[0].split("/")[-2]
rc_conv = stratum(f"cocip-convergence --day {first_day} --scaling B1 --max-age-h {MAX_AGE_H}", live=True)
rc_rep = stratum(f"phase2-report --month {MONTH}", live=True)
print("exit codes:", rc_conv, rc_rep)
'''),
    code('''
# ── 10. Collect per-day manifests for the summary ────────────────────────────
def _stats(pattern):
    out = {}
    for m in sorted(glob.glob(pattern)):
        with open(m) as f:
            j = json.load(f)
        out[j.get("unit")] = j.get("stats")
    return out
seg_stats = _stats(f"{DRIVE_ROOT}/interim/segments_met/{MONTH}/*/manifest.json")
cocip_stats = _stats(f"{DRIVE_ROOT}/interim/cocip/*/{MONTH}/*/manifest.json")
conv_path = f"{DRIVE_ROOT}/interim/cocip/convergence/{MONTH}.csv"
conv = open(conv_path).read() if os.path.exists(conv_path) else None
rep_path = f"{DRIVE_ROOT}/reports/phase2_sanity/{MONTH}/report.md"
report_flags = [l for l in open(rep_path).read().splitlines() if l.startswith("- ")][-6:] if os.path.exists(rep_path) else None
'''),
    summary_cell("""    "exit_codes": {"build_segments": rc_seg, "run_cocip": rc_cocip, "convergence": rc_conv, "report": rc_rep},
    "segments_met": seg_stats,
    "cocip": cocip_stats,
    "convergence_csv": conv,
    "report": rep_path,
    "report_tail": report_flags,
"""),
]


def write(name: str, cells: list[dict]) -> None:
    nb = {
        "cells": cells,
        "metadata": {
            "colab": {"provenance": []},
            "kernelspec": {"display_name": "Python 3", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 0,
    }
    (HERE / name).write_text(json.dumps(nb, indent=1) + "\n")


if __name__ == "__main__":
    write("00_smoke_test.ipynb", SMOKE)
    write("01a_era5_download.ipynb", ERA5)
    write("01a2_era5_arco.ipynb", ERA5_ARCO)
    write("01b_adsb_ingest.ipynb", ADSBX)
    write("01c_meteosat_ingest.ipynb", METEOSAT)
    write("02_physics_baseline.ipynb", PHYSICS)
    print("written:", sorted(p.name for p in HERE.glob("*.ipynb")))
