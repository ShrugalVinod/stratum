"""Scheduled Delhi <-> Mumbai flights for the coverage audit, from FlightStats route pages.

Usage: python scripts/flightstats_schedule.py 2026-11-05 2026-11-06 ... [--out FILE] [--append]

FlightStats' free route pages list every flight on a route for a day (in 6-hour local-time
windows), but only for about three days either side of today, so run this soon after the
audit days. Codeshares are dropped (the operating airline's number is kept once), and a
flight belongs to the UTC day of its scheduled departure (``sortTime``). Each row keeps the
page it came from. Output columns follow data/reference/README.md, plus ``notes``.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
BASE = "https://www.flightstats.com/v2"
# FlightStats carrier code -> the IATA code written in the schedule (coverage.IATA_TO_ICAO)
CARRIERS = {"6E": "6E", "AI": "AI", "IX": "IX", "SG": "SG", "AKJ": "QP", "CD": "9I", "BZ*": "BZ"}
CARGO = {"BZ"}


def route_page(frm: str, to: str, day: dt.date, hour: int) -> list[dict]:
    q = f"year={day.year}&month={day.month}&date={day.day}&hour={hour}"
    url = f"{BASE}/flight-tracker/route/{frm}/{to}/?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    s = html[html.index("__NEXT_DATA__ = ") + 16 :]
    data = json.loads(s[: s.index(";__NEXT_LOADED_PAGES__")])
    flights = data["props"]["initialState"]["flightTracker"]["route"]["flights"] or []
    return [{**f, "page": url, "dir": f"{frm}-{to}"} for f in flights]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("days", nargs="+", help="UTC audit days, YYYY-MM-DD")
    ap.add_argument("--out", default="data/reference/scheduled_flights.csv")
    ap.add_argument("--append", action="store_true", help="keep the file's rows for other days")
    ap.add_argument("--by", default="Claude (FlightStats route pages), for Shrugal Vinod")
    a = ap.parse_args()
    days = sorted(dt.date.fromisoformat(d) for d in a.days)
    # a UTC day spans two local (IST) days: fetch from the first day to the day after the last
    local = [days[0] + dt.timedelta(n) for n in range((days[-1] - days[0]).days + 2)]
    seen: dict[tuple, dict] = {}
    for frm, to in (("DEL", "BOM"), ("BOM", "DEL")):
        for day in local:
            for hour in (0, 6, 12, 18):
                for f in route_page(frm, to, day, hour):
                    if f.get("operatedBy"):
                        continue  # codeshare: the operating flight is listed too
                    key = (
                        f["dir"],
                        f["carrier"]["fs"],
                        f["carrier"]["flightNumber"],
                        f["sortTime"],
                    )
                    seen.setdefault(key, f)
                time.sleep(0.5)
    want = {d.isoformat() for d in days}
    rows, skipped = [], set()
    for (d, fs, num, t), f in sorted(seen.items(), key=lambda kv: (kv[0][3], kv[0][0])):
        if t[:10] not in want:
            continue
        if fs not in CARRIERS:
            skipped.add(f"{fs} {f['carrier']['name']}")
            continue
        iata = CARRIERS[fs]
        rows.append(
            {
                "date": t[:10],
                "direction": d,
                "airline": iata,
                "flight_number": num,
                "sched_dep_utc": t.replace(".000Z", "Z"),
                "source_url": f"{BASE}{f['url']}",
                "checked_by": a.by,
                "notes": "cargo" if iata in CARGO else "",
            }
        )
    if a.append:
        with open(a.out, newline="") as fh:
            rows = [r for r in csv.DictReader(fh) if r["date"] not in want] + rows
        rows.sort(key=lambda r: (r["sched_dep_utc"], r["direction"]))
    with open(a.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(
        f"{len(rows)} flights -> {a.out}; carriers skipped: {sorted(skipped) or 'none'}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
