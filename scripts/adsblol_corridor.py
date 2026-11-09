"""Coverage audit: one adsb.lol day, cut down to the Delhi <-> Mumbai box at cruise.

Usage (in .github/workflows/audit.yml): the day's archive tar on stdin, e.g.
    { curl -sL .../tar.aa; curl -sL .../tar.ab; } | python3 scripts/adsblol_corridor.py OUT.csv.gz

adsb.lol (github.com/adsblol/globe_history_2026, ODbL 1.0) publishes every day's readsb
"trace_full" files, one per aircraft (~3.8 GB a day). The tar is read as a stream, nothing is
written to disk, and only positions inside the corridor's bounding box at or above FL200 are
kept, in the normalised ADS-B columns (stratum/io/adsb_schema.py). Aircraft addresses are
replaced by a 6-hex pseudonym from a random salt made for this run and never saved, so the
output identifies no aircraft beyond its callsign.

readsb trace rows: [seconds after ``timestamp``, lat, lon, baro alt ft | "ground" | null,
ground speed kt, track deg, flags, vertical rate fpm, aircraft details (has ``flight``, the
callsign) | null, source type, geometric alt ft, ...].
"""

from __future__ import annotations

import csv
import datetime as dt
import gzip
import hashlib
import json
import secrets
import sys
import tarfile

# the corridor polygon (configs/domain.yaml, 75 km either side of VIDP-VABB) fits in this box
LAT = (18.0, 29.6)
LON = (71.8, 78.4)
MIN_ALT_FT = 20_000  # as the ADS-B Exchange ingest: FL200, so climbs into cruise survive
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


def rows(d: dict, pid: str) -> list[list]:
    """The trace's corridor positions at cruise, each with the latest callsign seen so far."""
    t0 = float(d["timestamp"])
    out, cs = [], ""
    for p in d["trace"]:
        det = p[8] if len(p) > 8 else None
        if isinstance(det, dict) and det.get("flight"):
            cs = det["flight"].strip()
        alt, lat, lon = p[3], p[1], p[2]
        if not isinstance(alt, (int, float)) or alt < MIN_ALT_FT:
            continue
        if not (LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]):
            continue
        t = dt.datetime.fromtimestamp(t0 + p[0], dt.UTC).isoformat()
        geo = p[10] if len(p) > 10 else None
        out.append([pid, cs, t, lat, lon, alt, geo, p[4], p[5], p[7], False, "adsblol"])
    return out


def main() -> None:
    salt = secrets.token_bytes(16)
    n_ac = n_kept = 0
    with gzip.open(sys.argv[1], "wt", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(COLS)
        with tarfile.open(fileobj=sys.stdin.buffer, mode="r|") as tf:
            for m in tf:
                if not (m.isfile() and m.name.rsplit("/", 1)[-1].startswith("trace_full_")):
                    continue
                data = tf.extractfile(m).read()  # type: ignore[union-attr]
                if data[:2] == b"\x1f\x8b":
                    data = gzip.decompress(data)
                d = json.loads(data)
                n_ac += 1
                r = rows(d, hashlib.sha256(salt + d["icao"].encode()).hexdigest()[:6])
                w.writerows(r)
                n_kept += len(r)
    print(f"{n_ac} aircraft read, {n_kept} corridor positions kept", file=sys.stderr)


if __name__ == "__main__":
    main()
