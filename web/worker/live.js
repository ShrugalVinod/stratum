// Helpers of the /api/live route (worker/index.js), kept out of the entry module: a Worker's
// main module may only export handlers. Unit-tested in tests/worker.test.ts.
//
// Live sources, merged: the OpenSky Network (all of India, the best coverage; fetched every 5 min
// by the `live` GitHub Action because OpenSky does not answer Cloudflare's servers) and adsb.lol
// (community feeders, live, near the visitor). Duplicates are matched by callsign; no ICAO24
// address is used or sent.

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
      key: cs,
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
      key: cs,
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

/** One record per aircraft (callsign): the freshest position, the aircraft type from whichever
 *  source has it; the match key is dropped. Snapshot records (no key) are keyed by callsign. */
export function merge(...lists) {
  const by = new Map();
  for (const list of lists)
    for (const a0 of list) {
      const a = a0.key ? a0 : { ...a0, key: a0.cs };
      const b = by.get(a.key);
      if (!b) by.set(a.key, a);
      else by.set(a.key, { ...(a.t > b.t ? a : b), type: a.type ?? b.type, route: a.route ?? b.route ?? null });
    }
  return [...by.values()].map(({ key: _key, ...rest }) => rest);
}

/** Back-compatible: adsb.lol aircraft → the browser's records (no match key). */
export function slim(ac, now) {
  return merge(fromReadsb(ac, now));
}

/** The forecast build is stale when it is not from today's 00 UTC run and today's open data are
 *  out (by about 08:00 UTC; the build is asked for from 09:30). ``run`` like "2026-10-22T00:00Z". */
export function outlookStale(run, now) {
  if (typeof run !== "string") return true;
  const d = new Date(now);
  const today = d.toISOString().slice(0, 10);
  return run.slice(0, 10) < today && d.getUTCHours() * 60 + d.getUTCMinutes() >= 9 * 60 + 30;
}

/** The expected-flights file is out of date: built from a day before yesterday (UTC), and it is
 *  after 02:00 UTC, when yesterday's flight records should be in. */
export function scheduleStale(day, now) {
  if (typeof day !== "string") return true;
  const d = new Date(now);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  return day < yesterday && d.getUTCHours() >= 2;
}
