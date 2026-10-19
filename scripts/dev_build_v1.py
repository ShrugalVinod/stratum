"""A local web-data v2 build for developing the Phase 8 site without Drive.

Uses the fake Drive root of tests/export/test_web_v1.py (real ERA5 for 15 Jan 2026, small
synthetic models and decisions, the real final-runs log). Writes web/public/data/dev-v1/
(git-ignored); open the site with ?build=dev-v1.

    uv run python scripts/dev_build_v1.py
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "export"))
os.chdir(ROOT)
os.environ.setdefault("STRATUM_ID_SALT", "dev-build-salt-not-the-real-one")

import test_web_v1 as t  # noqa: E402

from stratum.export import web_v1 as wv  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    root, pre = t.fake_root(Path(tmp))
    res = wv.export_web_v1(root, Path(tmp) / "out", "dev-v1", [t.DAY], pre, demo_month=None)
    dest = ROOT / "web" / "public" / "data" / "dev-v1"
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(Path(tmp) / "out" / "dev-v1", dest)
print({k: v for k, v in res.items() if k != "sizes"}, "->", dest)
