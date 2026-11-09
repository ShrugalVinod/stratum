"""Coverage audit: record OpenSky over the Delhi <-> Mumbai box, one request every 2 minutes.

Usage (in .github/workflows/audit.yml): python3 scripts/opensky_corridor.py OUT.csv.gz UNTIL
    UNTIL = ISO time to stop (UTC); the job also stops after 5 h 45 min (GitHub's 6 h limit).

OpenSky's REST API only answers for the last hour, so a past day cannot be fetched: the audit
day is recorded as it happens. The box (76.6 square degrees) costs 2 credits a request: 720 a
day = 1,440 credits, next to at most ~2,300 for the live page (limit 4,000 a day).

Kept: airliner callsigns (three letters then a digit) at or above FL200, each position once (by
its own fix time), in the normalised ADS-B columns (stratum/io/adsb_schema.py). No aircraft
address is written: a flight is identified by its callsign only (``icao24`` holds a 6-hex
hash of the callsign, so the cleaning code can group by it).
"""

from __future__ import annotations

import csv
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BOX = {"lamin": 18.0, "lomin": 71.8, "lamax": 29.6, "lomax": 78.4}  # as scripts/adsblol_corridor.py
STATES = "https://opensky-network.org/api/states/all"
TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
EVERY_S = 120
MAX_RUN_S = 5 * 3600 + 45 * 60
MIN_ALT_M = 20_000 * 0.3048
AIRLINER = re.compile(r"^[A-Z]{3}\d")
COLS = [
    "icao24",
    "callsign",
    "time",
    "lat",
    "lon",
    "baro_alt_ft",
    "geo_alt_ft",
    "gs_kt",
    "track_deg",
    "vrate_fpm",
    "on_ground",
    "source",
]


def bearer() -> str:
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": os.environ["OPENSKY_CLIENT_ID"],
            "client_secret": os.environ["OPENSKY_CLIENT_SECRET"],
        }
    ).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN, data=body), timeout=30) as r:
        return str(json.load(r)["access_token"])


def states(tok: str) -> list[list]:
    req = urllib.request.Request(
        f"{STATES}?{urllib.parse.urlencode(BOX)}", headers={"Authorization": f"Bearer {tok}"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("states") or []


def main() -> None:
    out, until = sys.argv[1], dt.datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))
    start = time.time()
    stop = min(start + MAX_RUN_S, until.timestamp())
    seen: set[tuple[str, int]] = set()
    tok, tok_at, n_req, n_fail = "", 0.0, 0, 0
    with gzip.open(out, "wt", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(COLS)
        while time.time() < stop:
            t_req = time.time()
            try:
                if time.time() - tok_at > 20 * 60:
                    tok, tok_at = bearer(), time.time()
                for s in states(tok):
                    cs = (s[1] or "").strip()
                    if (
                        not AIRLINER.match(cs)
                        or s[3] is None
                        or s[5] is None
                        or s[7] is None
                        or s[8]
                    ):
                        continue
                    if s[7] < MIN_ALT_M or (cs, s[3]) in seen:
                        continue
                    seen.add((cs, s[3]))
                    t = dt.datetime.fromtimestamp(s[3], dt.UTC).isoformat()
                    ft = lambda m: None if m is None else round(m / 0.3048)  # noqa: E731
                    kt = None if s[9] is None else round(s[9] * 1.943844, 1)
                    fpm = None if s[11] is None else round(s[11] * 196.8504)
                    pid = hashlib.sha256(cs.encode()).hexdigest()[:6]
                    w.writerow(
                        [
                            pid,
                            cs,
                            t,
                            s[6],
                            s[5],
                            ft(s[7]),
                            ft(s[13]),
                            kt,
                            s[10],
                            fpm,
                            False,
                            "opensky",
                        ]
                    )
                n_req += 1
                fh.flush()
            except Exception as e:  # keep recording through a failed request
                n_fail += 1
                print(
                    f"{dt.datetime.now(dt.UTC):%H:%M:%S} request failed: {e}",
                    file=sys.stderr,
                )
                if "401" in str(e):
                    tok_at = 0.0
            time.sleep(max(0.0, EVERY_S - (time.time() - t_req)))
    print(f"{n_req} requests ok, {n_fail} failed, {len(seen)} positions", file=sys.stderr)


if __name__ == "__main__":
    main()
