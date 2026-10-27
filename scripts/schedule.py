"""Expected airline flights for the website's live advice page (GitHub Action `schedule.yml`).

Airline flight numbers repeat daily, so a day's flights to, from and within India (OpenSky
Network flight records: callsign, departure and arrival airport, first and last time seen) are
the best free guide to the next day's. Kept per flight: callsign, aircraft type (looked up by
address in the Mictronics database; the address itself is not written), the two airports with
their positions, and the times first and last seen (minutes after 00:00 UTC). Routes OpenSky
could not place come from adsb.lol's route database. Needs the team's OpenSky API client
(OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET).

    python scripts/schedule.py OUT.json [YYYY-MM-DD]   # default: yesterday (UTC)
    python scripts/schedule.py --dry [YYYY-MM-DD]      # counts only, nothing written
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flightinfo import INDIA, UA, load_airports, load_types, routes
from live_snapshot import bearer

FLIGHTS = "https://opensky-network.org/api/flights/all?begin={b}&end={e}"
AIRLINE = re.compile(r"^[A-Z]{3}[0-9][0-9A-Z]{0,3}$")
# Indian airlines (their flights are kept even when OpenSky did not place an airport)
INDIAN_AIRLINES = ("IGO", "AIC", "AXB", "AKJ", "SEJ", "LLR", "SDG", "IAD", "VTI", "FLG")
WINDOW_S = 2 * 3600  # the longest interval OpenSky's /flights/all accepts


def fetch(day: dt.date, tok: str) -> list[dict]:
    start = int(dt.datetime(day.year, day.month, day.day, tzinfo=dt.UTC).timestamp())
    out: list[dict] = []
    for b in range(start, start + 86_400, WINDOW_S):
        url = FLIGHTS.format(b=b, e=b + WINDOW_S)
        for attempt in range(4):
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": UA, "Authorization": f"Bearer {tok}"}
                )
                with urllib.request.urlopen(req, timeout=180) as r:
                    out += json.load(r) or []
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:  # no flights in this window
                    break
                if attempt == 3 or e.code in (401, 403):
                    raise
                time.sleep(20 * (attempt + 1))
    return out


def _minutes(a: list, b: list) -> float:
    """Typical block time between two airports: great circle at 780 km/h plus 15 minutes."""
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[2], b[1], b[2]))
    h = math.sin((la2 - la1) / 2) ** 2
    h += math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) / 780 * 60 + 15


def build(day: dt.date, raw: list[dict], types: dict[str, str], airports: dict[str, list]) -> dict:
    start = dt.datetime(day.year, day.month, day.day, tzinfo=dt.UTC).timestamp()
    seen: dict[str, dict] = {}
    for f in raw:
        cs = (f.get("callsign") or "").strip()
        dep, arr = f.get("estDepartureAirport") or "", f.get("estArrivalAirport") or ""
        india = dep.startswith(INDIA) or arr.startswith(INDIA) or cs.startswith(INDIAN_AIRLINES)
        if not AIRLINE.match(cs) or not india or not f.get("firstSeen") or not f.get("lastSeen"):
            continue
        rec = {
            "cs": cs,
            "type": types.get((f.get("icao24") or "").lower()),
            "from": airports.get(dep),
            "to": airports.get(arr),
            "seen": (f["firstSeen"] - start) / 60,
            "last": (f["lastSeen"] - start) / 60,
            "placed": "from" if dep else "to" if arr else "",
        }
        # one record per callsign and day: the first leg seen
        if cs not in seen or rec["seen"] < seen[cs]["seen"]:
            seen[cs] = rec
    # fill unplaced airports from the route database (the stop list must contain the known one)
    gaps = [cs for cs, r in seen.items() if not (r["from"] and r["to"])]
    for cs, stops in routes(gaps).items():
        r = seen[cs]
        if not stops:
            continue
        codes = [s[0] for s in stops]
        if r["from"] and r["from"][0] in codes:
            i = codes.index(r["from"][0])
            r["to"] = stops[i + 1] if i + 1 < len(stops) else None
        elif r["to"] and r["to"][0] in codes:
            i = codes.index(r["to"][0])
            r["from"] = stops[i - 1] if i > 0 else None
        elif len(stops) == 2 and not r["from"] and not r["to"]:
            r["from"], r["to"] = stops
    flights = []
    for r in seen.values():
        a, b = r["from"], r["to"]
        if not a or not b or a[0] == b[0]:
            continue
        d = _minutes(a, b)
        # departure time: when OpenSky placed the departure airport it saw the take-off; when it
        # placed only the arrival, the landing less a typical block time; otherwise the aircraft
        # was first seen in flight and left between (last seen - block time) and first seen
        if r["placed"] == "from":
            dep, acc = r["seen"], 10
        elif r["placed"] == "to":
            dep, acc = min(r["seen"], r["last"] - d), 20
        else:
            lo = min(r["last"] - d, r["seen"])
            dep, acc = (lo + r["seen"]) / 2, max(15, (r["seen"] - lo) / 2)
        flights.append(
            {"cs": r["cs"], "type": r["type"], "from": a, "to": b}
            | {"dep": round(dep), "acc": round(acc), "block": round(d)}
        )
    flights.sort(key=lambda f: f["dep"])
    return {
        "day": day.isoformat(),
        "built": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%MZ"),
        "source": "The OpenSky Network (flight records); routes: adsb.lol (ODbL); "
        "types: Mictronics; airports: OurAirports",
        "n_records": len(seen),
        "flights": flights,
    }


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--dry"]
    dry = "--dry" in sys.argv
    out = None if dry else args.pop(0)
    day = (
        dt.date.fromisoformat(args[0])
        if args
        else dt.datetime.now(dt.UTC).date() - dt.timedelta(days=1)
    )
    tok = bearer()
    if not tok:
        sys.exit("OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET are not set")
    raw = fetch(day, tok)
    tmp = os.environ.get("RUNNER_TEMP", "/tmp")
    s = build(
        day,
        raw,
        load_types(os.path.join(tmp, "aircraft.csv.gz")),
        load_airports(os.path.join(tmp, "airports.csv")),
    )
    fl = s["flights"]
    typed = sum(1 for f in fl if f["type"])
    acc = [f["acc"] for f in fl]
    tight, mid = sum(a <= 10 for a in acc), sum(10 < a <= 20 for a in acc)
    print(
        f"departure time within ±10 min: {tight}, ±20 min: {mid}, wider: {len(acc) - tight - mid}"
    )
    print(f"{day}: {len(raw)} flight records worldwide, {s['n_records']} airline flights")
    print(f"touching India, {len(fl)} with both airports placed, {typed} with a type")
    if dry:
        for f in fl[:5]:
            print(
                f["cs"],
                f["type"],
                f["from"][0],
                "→",
                f["to"][0],
                f"{f['dep'] // 60:02d}:{f['dep'] % 60:02d}",
            )
    else:
        with open(out, "w") as fh:  # type: ignore[arg-type]
            json.dump(s, fh, separators=(",", ":"))
