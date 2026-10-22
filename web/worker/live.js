// Helpers of the /api/live route (worker/index.js), kept out of the entry module: a Worker's
// main module may only export handlers. Unit-tested in tests/worker.test.ts.

// adsb.lol refuses generic clients: say who we are and where to reach us
export const USER_AGENT = "STRATUM-research/1.0 (+https://stratum.aerospaceonyx.workers.dev/contact)";
export const MIN_ALT_FT = 20000;
// airline flights: 3-letter ICAO operator + a flight number (private and military calls are not)
export const COMMERCIAL = /^[A-Z]{3}[0-9][0-9A-Z]{0,3}$/;

/** Round to a 0.5° cell centre so nearby visitors share one cached answer. */
export function cell(v, lo, hi) {
  const x = Number(v);
  if (!Number.isFinite(x) || x < lo || x > hi) return null;
  return Math.round(x * 2) / 2;
}

/** adsb.lol aircraft → what the page needs (commercial, cruising, no ICAO24). */
export function slim(ac, now) {
  const out = [];
  for (const a of ac ?? []) {
    const cs = String(a.flight ?? "").trim();
    const alt = typeof a.alt_baro === "number" ? a.alt_baro : null;
    if (!COMMERCIAL.test(cs) || alt == null || alt < MIN_ALT_FT || typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    out.push({
      cs,
      type: typeof a.t === "string" ? a.t : null,
      alt,
      lat: Math.round(a.lat * 1e4) / 1e4,
      lon: Math.round(a.lon * 1e4) / 1e4,
      trk: typeof a.track === "number" ? Math.round(a.track) : null,
      gs: typeof a.gs === "number" ? Math.round(a.gs) : null,
      t: Math.round(now - 1000 * (Number(a.seen_pos) || 0)),
    });
  }
  return out;
}
