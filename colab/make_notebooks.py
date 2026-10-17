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
and B3 (pycontrails latitude correction), each with **100 Monte Carlo members** (Q12 as
amended by deviation D-001). Then it runs the N = 100 vs 200 convergence check and writes the
Phase 2 sanity report. `FORCE = True` recomputes the day once after the 15 Oct tropopause fix.

Reads (already on Drive): `raw/adsb/adsbx/2026-01-01`, `raw/era5/{pl,sl,tropo_T}/2026-01`,
`raw/aircraft_db`. Writes: `interim/segments_met/2026-01/…`, `interim/cocip/{B1,B2,B3}/2026-01/…`,
`interim/cocip/convergence/2026-01.csv`, `reports/phase2_sanity/2026-01/` (report + figures).

* **Runtime:** CPU, **High-RAM** if offered (*Runtime → Change runtime type*). No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** well under 1 GB.
* **Time:** about 1–1.5 h (≈ 7 s per CoCiP run on Colab: 101 runs × 3 scalings plus the
  300-run convergence check).
* **If it disconnects:** *Runtime → Run all* again. Finished days and scalings are skipped.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "02_physics_baseline",
        'MONTH = "2026-01"     # development month (pre-registered)\n'
        "MEMBERS = 100         # Monte Carlo members (Q12 amended by deviation D-001)\n"
        "MAX_AGE_H = 24        # CoCiP maximum contrail age (hours)\n"
        "FORCE = True          # recompute days already done (needed once after the 15 Oct fixes)\n",
    ),
    *SETUP,
    code('''
# ── 7. Segments + ERA5 features + η + SAC flags (per ADS-B day in the month) ──
rc_seg = stratum(f"build-segments --month {MONTH} --corridor DEL-BOM" + (" --force" if FORCE else ""), live=True)
print("exit code:", rc_seg)
'''),
    code('''
# ── 8. CoCiP for B1, B2, B3 with Monte Carlo ranges ─────────────────────────
rc_cocip = stratum(f"run-cocip --month {MONTH} --scaling all --members {MEMBERS} --max-age-h {MAX_AGE_H}" + (" --force" if FORCE else ""), live=True)
print("exit code:", rc_cocip)
'''),
    code('''
# ── 9. Convergence check (N = 100 vs 200, B1, first day) + sanity report ──
import glob
first_day = sorted(glob.glob(f"{DRIVE_ROOT}/interim/segments_met/{MONTH}/*/_SUCCESS"))[0].split("/")[-2]
rc_conv = stratum(f"cocip-convergence --day {first_day} --scaling B1 --max-age-h {MAX_AGE_H} --n-small {MEMBERS} --n-large {2 * MEMBERS}", live=True)
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


DETECT = [
    header(
        "03 · Contrail detector + overlay figures (Phase 3, tasks 3.1–3.3)",
        """
**What this does:** runs the STRATUM contrail detector on every 15-minute Meteosat-9 image of
the January 2026 satellite days already on Drive (1, 13 and 14 Jan), then draws the CoCiP
predicted contrails (B1, from Phase 2) and the detected lines on the satellite images for the
only January day that has flights (1 Jan). It ranks every image time by how many predicted
contrails are visible in clear sky and makes the top 3 overlay figures plus a time-lapse, and
detector-only "showcase" figures for 13 and 14 Jan (no flights on those days).
These are **illustrations for the brief, video and website, not results**.

Reads (already on Drive): `raw/meteosat/{l15_crop,clm}/2026-01-{01,13,14}`,
`raw/meteosat/static_grid.zarr`, `interim/cocip/B1/2026-01/2026-01-01/contrail.parquet`.
Writes: `interim/detections/<day>/objects.parquet`, `reports/phase3_overlays/2026-01-01/`
(overlay PNGs, `timelapse.mp4` + `.gif`, `slot_scores.csv`, `summary.json`).

* **Runtime:** CPU (default is fine). No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** under 100 MB.
* **Time:** first run ≈ 25 min (≈ 6–7 min per detection day). A re-run skips finished
  detection days and only redraws the figures: ≈ 8–10 min.
* **If it disconnects:** *Runtime → Run all* again. Finished days are skipped.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "03_detector_overlays",
        'DETECT_DAYS = "2026-01-01,2026-01-13,2026-01-14"   # January satellite days on Drive\n'
        'OVERLAY_DAY = "2026-01-01"   # the January day with flights (ADS-B Exchange free day)\n'
        "TOP = 3                      # candidate overlay times (at least 1 h apart)\n"
        "LAPSE_HOURS = 4              # time-lapse length around the best time\n"
        'SHOWCASE_DAYS = "2026-01-13,2026-01-14"   # detector-only figures (no flights)\n'
        "FORCE = False                # recompute detection days already done\n",
    ),
    *SETUP,
    code('''
# ── 7. Detector on every slot of each day ────────────────────────────────────
rc_det = stratum(f"detect --days {DETECT_DAYS}" + (" --force" if FORCE else ""), live=True)
print("exit code:", rc_det)
'''),
    code('''
# ── 8. Overlay figures + time-lapse for the flight day ──────────────────────
rc_ov = stratum(f"phase3-overlays --day {OVERLAY_DAY} --top {TOP} --lapse-hours {LAPSE_HOURS}", live=True)
print("exit code:", rc_ov)
'''),
    code('''
# ── 8b. Detector showcase figures for the satellite days without flights ─────
rc_sc = stratum(f"phase3-showcase --days {SHOWCASE_DAYS} --per-day 2", live=True)
print("exit code:", rc_sc)
'''),
    code('''
# ── 9. Collect manifests and the overlay summary ─────────────────────────────
import glob
det_stats = {}
for m in sorted(glob.glob(f"{DRIVE_ROOT}/interim/detections/*/manifest.json")):
    with open(m) as f:
        j = json.load(f)
    det_stats[j.get("unit")] = j.get("stats")
ov_path = f"{DRIVE_ROOT}/reports/phase3_overlays/{OVERLAY_DAY}/summary.json"
overlay = json.load(open(ov_path)) if os.path.exists(ov_path) else None
if overlay:
    overlay = {k: v for k, v in overlay.items() if k != "figures"} | {
        "figures": [{k: v for k, v in f.items() if k != "png"} for f in overlay.get("figures", [])]
    }
'''),
    summary_cell("""    "exit_codes": {"detect": rc_det, "overlays": rc_ov, "showcase": rc_sc},
    "showcase_pngs": sorted(os.path.basename(p) for p in glob.glob(f"{DRIVE_ROOT}/reports/phase3_overlays/showcase/*.png")),
    "detections": det_stats,
    "overlay": overlay,
"""),
]


WEB_EXPORT = [
    header(
        "04 · Web data export: contrail map grids + 1 Jan flights (Phase 4, task 4.3)",
        """
**What this does:** builds the data files the STRATUM website reads, for **every day of
January 2026**: a contrail-condition grid for each hour (00–23 UTC) and flight level
(FL280–FL420), plus, for 1 Jan, the commercial corridor flights and the segments CoCiP (B1)
flags as making a persistent contrail. Aircraft ids are replaced by salted hashes; only
commercial airline flights are exported. At the end it zips the build so you can download it.

Reads (already on Drive): `raw/era5/pl/2026-01` (+ 1 Feb for the last hour),
`interim/segments_met/2026-01/…`, `interim/cocip/B1/2026-01/…`.
Writes: `web_exports/<build_id>/` and `web_exports/<build_id>.zip` (a few MB).

* **Runtime:** CPU (default). No GPU.
* **Secrets** (🔑): `GITHUB_TOKEN` and **`STRATUM_ID_SALT`**: add a NEW secret with that exact
  name and any long random text as the value (40+ letters/numbers; make it up, keep it
  private, never share it). Turn on notebook access for both.
* **Time:** about 5–10 minutes.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude,
  then download `web_exports/<build_id>.zip` from Drive into your Downloads folder.
""",
    ),
    settings(
        "04_web_export",
        'MONTH = "2026-01"     # the dashboard month (development month)\n',
    ),
    *SETUP,
    code('''
# ── 7. Salt for hashed flight ids, from Colab Secrets (never printed) ───────
salt = userdata.get("STRATUM_ID_SALT")
assert salt and len(salt) >= 16, "Add a Colab secret STRATUM_ID_SALT (16+ characters) and enable notebook access"
SECRETS.append(salt)
run_env["STRATUM_ID_SALT"] = salt
del salt
print("Salt loaded.")
'''),
    code('''
# ── 8. Export ────────────────────────────────────────────────────────────────
rc_exp = stratum(f"export-web --month {MONTH}", live=True)
print("exit code:", rc_exp)
'''),
    code('''
# ── 9. Zip the newest build for download + collect the summary ──────────────
import glob, shutil
builds = sorted(glob.glob(f"{DRIVE_ROOT}/web_exports/{MONTH}-*/manifest.json"), key=os.path.getmtime)
build_dir = os.path.dirname(builds[-1]) if builds else None
zip_path, man = None, None
if build_dir:
    zip_path = shutil.make_archive(build_dir, "zip", build_dir)
    man = json.load(open(f"{build_dir}/manifest.json"))
    day_sizes = {d: round(sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(f"{build_dir}/days/{d}") for f in fs) / 1e6, 3)
                 for d in man["days"]}
'''),
    summary_cell("""    "exit_codes": {"export": rc_exp},
    "build_id": man and man["build_id"],
    "days": man and len(man["days"]),
    "days_with_flights": man and man["days_with_flights"],
    "grid": man and man["grid"],
    "day_sizes_MB": man and day_sizes,
    "zip": zip_path and os.path.basename(zip_path),
    "zip_MB": zip_path and round(os.path.getsize(zip_path) / 1e6, 2),
"""),
]


SEGMENTS_YEAR = [
    header(
        "05a · Flight segments for the whole study domain, all 12 flight days (Phase 5)",
        """
**What this does:** rebuilds the 1-minute flight segments (cleaning, ERA5 weather at flight level,
engine efficiency, Schmidt–Appleman flags) for **every flight in the study domain** on the 12
ADS-B Exchange days (1st of each month, Mar 2025 – Feb 2026). Phase 2 kept only Delhi–Mumbai
corridor flights; the confirmatory tests are scored on the whole domain, and Phase 5 needs these
segments to (a) stratify the 200 labelling scenes by predicted contrail density and (b) build the
segment labels. Corridor flights stay flagged (`in_corridor`), so Phase 2 and the web export are
unchanged. 1 Jan 2026 is recomputed once in whole-domain mode.

Reads (already on Drive): `raw/adsb/adsbx/<12 days>`, `raw/era5/{pl,tropo_T}/<months>`,
`raw/aircraft_db`. Writes: `interim/segments_met/<YYYY-MM>/<YYYY-MM-01>/…` (one folder per day).

* **Runtime:** CPU, **High-RAM** if offered. No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** about 0.5–1 GB.
* **Time:** about 30–60 min (≈ 30 s compute per day locally, plus Drive reads).
* **If it disconnects:** *Runtime → Run all* again. Finished days are skipped.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings(
        "05a_segments_year",
        'MONTHS = ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08",\n'
        '          "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]\n'
        'FORCE_MONTHS = ["2026-01"]   # rebuilt once in whole-domain mode (was corridor-only)\n',
    ),
    *SETUP,
    code('''
# ── 7. Segments for every flight in the domain, month by month (resumable per day) ──
rcs = {}
for m in MONTHS:
    flag = " --force" if m in FORCE_MONTHS and not os.path.exists(f"{DRIVE_ROOT}/interim/segments_met/{m}/.domain_done") else ""
    rcs[m] = stratum(f"build-segments --month {m} --corridor DEL-BOM --scope domain" + flag, live=True)
    if m in FORCE_MONTHS and rcs[m] == 0:
        open(f"{DRIVE_ROOT}/interim/segments_met/{m}/.domain_done", "w").write("ok")
print("exit codes:", rcs)
'''),
    code('''
# ── 8. Collect per-day manifests for the summary ─────────────────────────────
import glob
days = {}
for mf in sorted(glob.glob(f"{DRIVE_ROOT}/interim/segments_met/*/*/manifest.json")):
    j = json.load(open(mf))
    st = j.get("stats") or {}
    steps, met = st.get("steps") or {}, st.get("met") or {}
    days[j.get("unit")] = {
        "scope": (j.get("params") or {}).get("scope"),
        "flights": met.get("flights"), "commercial": steps.get("step9_commercial_flights"),
        "segments": met.get("segments"), "corridor_flights": steps.get("corridor_flights"),
        "share_forms": met.get("share_forms") and round(met["share_forms"], 4),
        "share_persists_raw": met.get("share_persists_raw") and round(met["share_persists_raw"], 5),
        "met_out_of_domain": met.get("met_out_of_domain"),
    }
'''),
    summary_cell("""    "exit_codes": rcs,
    "days": days,
    "n_days_domain": sum(1 for d in days.values() if d["scope"] == "domain"),
"""),
]


SCENES = [
    header(
        "05b · Sample the 220 labelling scenes + make the labeller packages (Phase 5, task 5.1)",
        """
**What this does:** draws the scenes the team labels by hand, **once**, with the pre-registered
seed (Q16 = 20261017): 200 main scenes (100 tuning / 100 held-out) + 20 pilot scenes, stratified
by month × time of day × predicted contrail density. Then it writes the packages the labellers
open in the labelling app: for each scene the BTD and 10.8 µm images at t − 15, t, t + 15 min
(north-up) and a small metadata file. **No predictions or flight tracks** go into a package.

Needs Colab `05a_segments_year` finished first (whole-domain segments for all 12 days).

Reads: `interim/segments_met/*/*`, `raw/meteosat/{l15_crop,clm}/*`, `raw/meteosat/static_grid.zarr`,
`raw/era5/pl/*`. Writes: `labels/scenes/scenes.csv` (team-internal: has the split),
`labels/scenes/candidates.parquet`, `labels/scenes/pilot.zip`, `labels/scenes/main.zip`.

* **Runtime:** CPU, **High-RAM** if offered. No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** about 50–80 MB.
* **Time:** about 15–30 min.
* **If it disconnects:** *Runtime → Run all* again. Sampling never re-draws once `scenes.csv` exists.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude, then share
  the Drive folder `STRATUM/labels/scenes/` with Aditya and Ishaan (**pilot.zip and main.zip only**,
  not scenes.csv).
""",
    ),
    settings("05b_scenes"),
    *SETUP,
    code('''
# ── 7. Draw the scenes (once) ────────────────────────────────────────────────
rc_sample = stratum("sample-scenes", live=True)
print("exit code:", rc_sample)
'''),
    code('''
# ── 8. Labeller packages ─────────────────────────────────────────────────────
rc_pkg = stratum("export-scene-packages", live=True) if rc_sample == 0 else None
print("exit code:", rc_pkg)
'''),
    code('''
# ── 9. Collect for the summary ───────────────────────────────────────────────
import glob
sdir = f"{DRIVE_ROOT}/labels/scenes"
man = json.load(open(f"{sdir}/manifest.json")) if os.path.exists(f"{sdir}/manifest.json") else {}
zips = {os.path.basename(z): round(os.path.getsize(z) / 1e6, 1) for z in glob.glob(f"{sdir}/*.zip")}
'''),
    summary_cell("""    "exit_codes": {"sample": rc_sample, "packages": rc_pkg},
    "sampling": man.get("stats"),
    "zips_MB": zips,
"""),
]


LABEL_SETS = [
    header(
        "05c · Labelling sets for three labellers: India test set + expert calibration set (D-002)",
        """
**What this does** (deviation D-002, Team OK 17 Oct 2026):
1. **test.zip**: the 100 India *held-out* scenes, copied from `main.zip` (the scenes drawn by 05b;
   nothing is re-sampled). Each scene will be labelled by 2 of the 3 labellers.
2. **calibration.zip**: 20 expert-labelled MSG/SEVIRI scenes from the DLR dataset (Santos Gabriel et
   al. 2026, ESSD; Zenodo 10.5281/zenodo.17669443, CC BY-NC 4.0), drawn with seed 20261017 from the
   dataset's evaluation scenes. All three labellers label them; their accuracy against the experts
   is reported. The experts' answers go to `labels/calibration/` (**not** shared with labellers).

Downloads the DLR dataset (≈ 450 MB) from Zenodo to the Colab disk (not to Drive).

* **Runtime:** CPU (standard is fine). **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** about 25 MB. **Time:** about 10 min (mostly the download).
* **When finished:** paste the `=== STRATUM RUN SUMMARY ===` block, then share **test.zip** and
  **calibration.zip** from `STRATUM/labels/scenes/` with Aditya, Ishaan and Abeer.
""",
    ),
    settings("05c_label_sets"),
    *SETUP,
    code('''
# ── 7. DLR expert dataset (Zenodo, CC BY-NC 4.0) → Colab disk ───────────────
import urllib.request, zipfile
DLR = "/content/work/dlr"
os.makedirs(DLR, exist_ok=True)
for name in ["data.zip", "geojson.zip"]:
    dst = f"{DLR}/{name}"
    if not os.path.exists(dst):
        urllib.request.urlretrieve(f"https://zenodo.org/api/records/23008709/files/{name}/content", dst)
    zipfile.ZipFile(dst).extractall(DLR)
print(sorted(os.listdir(DLR)), len(os.listdir(f"{DLR}/data")), "scene files")
'''),
    code('''
# ── 8. test.zip + calibration.zip ────────────────────────────────────────────
rc_sets = stratum(f"make-labelling-sets --dlr-dir {DLR}", live=True)
print("exit code:", rc_sets)
'''),
    code('''
# ── 9. Collect for the summary ───────────────────────────────────────────────
sdir = f"{DRIVE_ROOT}/labels/scenes"
import glob
zips = {os.path.basename(z): round(os.path.getsize(z) / 1e6, 1) for z in glob.glob(f"{sdir}/*.zip")}
cmap = f"{DRIVE_ROOT}/labels/calibration/calibration_map.json"
cal = json.load(open(cmap)) if os.path.exists(cmap) else {}
with zipfile.ZipFile(f"{sdir}/test.zip") as z:
    n_test = sum(1 for n in z.namelist() if n.endswith("meta.json"))
'''),
    summary_cell("""    "exit_code": rc_sets,
    "zips_MB": zips,
    "test_scenes": n_test,
    "calibration_scenes": len(cal),
    "calibration_expert_lines": sum(v["expert_lines"] for v in cal.values()),
    "calibration_dlr_scenes": sorted(v["dlr_scene"] for v in cal.values()),
"""),
]


MATCH_YEAR = [
    header(
        "05d · Full-year matching: detection, matching, segment labels (Phase 5, task 5.6)",
        """
**What this does:** for each of the 12 flight days:
1. runs the **tuned detector** (D-002; settings in `configs/pipeline.yaml`) on every stored
   Meteosat slot (detections made with other settings are recomputed automatically);
2. carries every contrail-forming segment with the ERA5 wind for 20–120 min, corrects parallax,
   and checks each satellite image: **matched** (detected line within 2 px and 20°) and
   **observable** (no high cloud above, no opaque cloud, viewing angle < 60°);
3. turns that into one label per segment: **y = 1 / y = 0 / missing** (missing never becomes 0);
4. **wrong-day null**: the same flights against the *next* flight day's images, so every match is
   chance; this measures how many y = 1 labels are coincidences.

Then the year summary: label counts (month, season, west/east, VZA band, day/night), the
pre-registered **≥ 300 matched contrails** check, and the parallax before/after figure.

Reads: `interim/segments_met/*/*`, `raw/meteosat/{l15_crop,clm}/*`, `raw/meteosat/static_grid.zarr`,
`raw/era5/pl/*`. Writes: `interim/detections/*`, `interim/matches/*/*`, `interim/matches_null/*`,
`reports/phase5/{labels_summary.json, label_counts.csv, parallax_before_after.png}`.

* **Runtime:** CPU, **High-RAM** if offered. No GPU needed.
* **Secrets** (🔑): `GITHUB_TOKEN` only.
* **Writes to Drive:** about 1–2 GB (per-image details for sensitivity analyses).
* **Time:** about 60–90 min (detection is most of it). **Resumable** per day: if it
  disconnects, *Runtime → Run all* again.
* **When finished:** copy the block starting `=== STRATUM RUN SUMMARY ===` back to Claude.
""",
    ),
    settings("05d_match_year"),
    *SETUP,
    code('''
# ── 7. Detection + matching + labels for every flight day, then the year summary ─
rc_match = stratum("match-year", live=True)
print("exit code:", rc_match)
'''),
    code('''
# ── 8. Collect for the summary ───────────────────────────────────────────────
import glob
rep = f"{DRIVE_ROOT}/reports/phase5/labels_summary.json"
ls = json.load(open(rep)) if os.path.exists(rep) else {}
per_day = {}
for mf in sorted(glob.glob(f"{DRIVE_ROOT}/interim/matches/*/*/manifest.json")):
    j = json.load(open(mf)); st = j.get("stats") or {}
    per_day[j.get("unit")] = {k: st.get(k) for k in ("candidates", "y1", "y0", "missing", "observable_fraction_of_slots")}
'''),
    summary_cell("""    "exit_code": rc_match,
    "per_day": per_day,
    "totals": {k: ls.get(k) for k in ("candidates", "y1", "y0", "missing", "known_fraction", "y1_events", "y1_flights")},
    "min_labels_check": ls.get("min_labels_check"),
    "wrong_day_null": {k: v for k, v in (ls.get("wrong_day_null") or {}).items() if k != "runs"},
    "parallax": ls.get("parallax"),
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
    write("03_detector_overlays.ipynb", DETECT)
    write("04_web_export.ipynb", WEB_EXPORT)
    write("05a_segments_year.ipynb", SEGMENTS_YEAR)
    write("05b_scenes.ipynb", SCENES)
    write("05c_label_sets.ipynb", LABEL_SETS)
    write("05d_match_year.ipynb", MATCH_YEAR)
    print("written:", sorted(p.name for p in HERE.glob("*.ipynb")))
