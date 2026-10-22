// Helpers of the /api/live route (worker/index.js), kept out of the entry module: a Worker's
// main module may only export handlers. Unit-tested in tests/worker.test.ts.
//
// Three live sources, merged: the OpenSky Network (one request covers all of India; the best
// coverage over India), adsb.fi and adsb.lol (community feeders, near the visitor). The ICAO24
// address is used only here, to drop duplicates, and is never sent to the browser.

// adsb.lol and adsb.fi refuse generic clients: say who we are and where to reach us
export const USER_AGENT = "STRATUM-research/1.0 (+https://stratum.aerospaceonyx.workers.dev/contact)";
export const MIN_ALT_FT = 20000;
export const INDIA_BOX = { lamin: 4, lomin: 66, lamax: 39, lomax: 100 };
// airline flights: 3-letter ICAO operator + a flight number (private and military calls are not)
export const COMMERCIAL = /^[A-Z]{3}[0-9][0-9A-Z]{0,3}$/;
const FT_PER_M = 3.28084;
const KT_PER_MS = 1.943844;

/** Round to a 0.5° cell centre so nearby visitors share one cached answer. */
export function cell(v, lo, hi) {
  const x = Number(v);
  if (!Number.isFinite(x) || x < lo || x > hi) return null;
  return Math.round(x * 2) / 2;
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** adsb.lol / adsb.fi aircraft (readsb JSON) → cruising airline flights, with the match key. */
export function fromReadsb(ac, now) {
  const out = [];
  for (const a of ac ?? []) {
    const cs = String(a.flight ?? "").trim();
    const alt = typeof a.alt_baro === "number" ? a.alt_baro : null;
    if (!COMMERCIAL.test(cs) || alt == null || alt < MIN_ALT_FT || typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    out.push({
      key: String(a.hex ?? cs).toLowerCase().replace(/^~/, ""),
      cs,
      type: typeof a.t === "string" ? a.t : null,
      alt,
      lat: r4(a.lat),
      lon: r4(a.lon),
      trk: typeof a.track === "number" ? Math.round(a.track) : null,
      gs: typeof a.gs === "number" ? Math.round(a.gs) : null,
      t: Math.round(now - 1000 * (Number(a.seen_pos) || 0)),
    });
  }
  return out;
}

/** OpenSky /states/all → the same records. Fields: [icao24, callsign, country, time_position,
 *  last_contact, lon, lat, baro_altitude m, on_ground, velocity m/s, true_track, …]. */
export function fromOpenSky(states) {
  const out = [];
  for (const s of states ?? []) {
    const cs = String(s[1] ?? "").trim();
    const altM = typeof s[7] === "number" ? s[7] : null;
    if (s[8] || !COMMERCIAL.test(cs) || altM == null || typeof s[5] !== "number" || typeof s[6] !== "number") continue;
    const alt = Math.round(altM * FT_PER_M);
    if (alt < MIN_ALT_FT) continue;
    out.push({
      key: String(s[0]).toLowerCase(),
      cs,
      type: null,
      alt,
      lat: r4(s[6]),
      lon: r4(s[5]),
      trk: typeof s[10] === "number" ? Math.round(s[10]) : null,
      gs: typeof s[9] === "number" ? Math.round(s[9] * KT_PER_MS) : null,
      t: 1000 * (typeof s[3] === "number" ? s[3] : s[4]),
    });
  }
  return out;
}

/** One record per aircraft: the freshest position, the aircraft type from whichever source has
 *  it; the match key is dropped. */
export function merge(...lists) {
  const by = new Map();
  for (const list of lists)
    for (const a of list) {
      const b = by.get(a.key);
      if (!b) by.set(a.key, a);
      else by.set(a.key, { ...(a.t > b.t ? a : b), type: a.type ?? b.type });
    }
  return [...by.values()].map(({ key: _key, ...rest }) => rest);
}

/** Back-compatible: adsb.lol aircraft → the browser's records (no match key). */
export function slim(ac, now) {
  return merge(fromReadsb(ac, now));
}
