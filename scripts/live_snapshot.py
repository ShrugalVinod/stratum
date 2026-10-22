"""Live airliners over India for the website (GitHub Action `live.yml`, every 5 minutes).

One OpenSky Network request covers the whole country (the Worker cannot ask OpenSky itself:
OpenSky does not answer Cloudflare's servers). Only cruising airline flights are kept, with
callsign, position, level, track and speed; no ICAO24 address is written. With the team's
OpenSky API client (secrets OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET) the request is
authenticated; without it, it is anonymous. Standard library only (no environment to install).

    python scripts/live_snapshot.py OUT.json
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BOX = {"lamin": 4, "lomin": 66, "lamax": 39, "lomax": 100}
STATES = "https://opensky-network.org/api/states/all"
TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
COMMERCIAL = re.compile(r"^[A-Z]{3}[0-9][0-9A-Z]{0,3}$")
MIN_ALT_FT = 20000
UA = "STRATUM-research/1.0 (+https://stratum.aerospaceonyx.workers.dev/contact)"


def bearer() -> str | None:
    cid, sec = os.environ.get("OPENSKY_CLIENT_ID"), os.environ.get("OPENSKY_CLIENT_SECRET")
    if not cid or not sec:
        return None
    body = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}
    ).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN, data=body), timeout=30) as r:
        return str(json.load(r)["access_token"])


def snapshot() -> dict[str, object]:
    tok = bearer()
    headers = {"User-Agent": UA, **({"Authorization": f"Bearer {tok}"} if tok else {})}
    url = f"{STATES}?{urllib.parse.urlencode(BOX)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
        d = json.load(r)
    ac = []
    for s in d.get("states") or []:
        cs = (s[1] or "").strip()
        if s[8] or not COMMERCIAL.match(cs) or s[7] is None or s[5] is None or s[6] is None:
            continue
        alt = round(s[7] * 3.28084)
        if alt < MIN_ALT_FT:
            continue
        ac.append({
            "cs": cs, "type": None, "alt": alt, "lat": round(s[6], 4), "lon": round(s[5], 4),
            "trk": round(s[10]) if s[10] is not None else None,
            "gs": round(s[9] * 1.943844) if s[9] is not None else None,
            "t": 1000 * (s[3] or s[4]),
        })  # fmt: skip
    return {"t": int(time.time() * 1000), "source": "The OpenSky Network",
            "authenticated": tok is not None, "ac": ac}  # fmt: skip


if __name__ == "__main__":
    snap = snapshot()
    with open(sys.argv[1], "w") as fh:
        json.dump(snap, fh, separators=(",", ":"))
    print(f"{len(snap['ac'])} airliners, authenticated={snap['authenticated']}")  # type: ignore[arg-type]
