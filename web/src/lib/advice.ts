// Live contrail advice (/now): for airliners over India right now and for the flights expected
// in the next hours, where their cruise crosses air in which contrails last (today's ECMWF
// forecast, physics only: the outlook's B1 layer) and whether a level 2,000 or 4,000 ft away
// would avoid it for less CO₂ than the contrail's warming.
//
// The same numbers as "Your flight" (lib/footprint.ts): OpenAP CO₂ per minute, the energy
// forcing per lasting-contrail minute from our CoCiP runs over India, CO₂e like the decision
// layer. Differences, each to keep the advice honest:
//  * The level change covers only the stretches in lasting-contrail air (5 minutes either side;
//    stretches less than 10 minutes apart are joined), as in the decision layer, so its extra
//    fuel is those stretches', not the whole flight's.
//  * Odd flight levels (eastbound under the semicircular rule) are interpolated between the
//    forecast's 2,000 ft levels, so an aircraft is judged at the level it actually flies.
//  * An alert needs even the cautious estimate (25th percentile of the warming per minute) to
//    beat the extra fuel's CO₂; the central estimate is what the page adds up.

import type { LiveAircraft, Manifest, ScheduledFlight } from "../data/contract";
import { aheadPath, co2eKg, co2PerMin, CRUISE_KMH, cruisePath, EF_PER_MIN_J, FLS, fuelType, LASTING, type Point } from "./footprint";
import { distBearing, move } from "./geo";

export const MIN_FL = FLS[0];
export const MAX_FL = FLS[FLS.length - 1];
const PAD_MIN = 5; // the level change starts / ends this many minutes around the lasting stretch
const HOUR = 3_600_000;
const CO2_PER_FUEL = 3.16;
// turboprops cruise below the forecast's levels (and are not in the fuel table)
const TURBOPROP = /^(AT[4-7]|DH8|B19|BE[0-9]|PC1|C20|D[23]2|SF3|SW4|J[S3]|L41|F50|Q[34])/;

// certified ceilings below FL420: the A320 family's is 39,800 ft (FL390 is the highest level)
const CEILING: Record<string, number> = { A319: 390, A320: 390, A321: 390, A20N: 390, A21N: 390, A333: 410 };
export const ceiling = (type: string) => CEILING[fuelType(type)] ?? MAX_FL;

type Sprite = { data: Uint8Array; width: number; height: number };
/** B1 (share of the hour with lasting-contrail conditions, 0–1) at a forecast level, or null. */
export type Sample = (t: number, fl: number, lat: number, lon: number) => number | null;

/** A synchronous B1 lookup over the outlook's hour sprites (keyed "date|fl"). */
export function sampler(m: Manifest, sprites: Map<string, Sprite>): Sample {
  const g = m.grid;
  const scale = (m.layers?.find((l) => l.id === "B1")?.full_scale ?? 1) / 255;
  const dates = new Map<number, string>(); // day number → "YYYY-MM-DD" (called ~10⁶ times a refresh)
  return (t, fl, lat, lon) => {
    const day = Math.floor(t / 86_400_000);
    let date = dates.get(day);
    if (!date) dates.set(day, (date = new Date(day * 86_400_000).toISOString().slice(0, 10)));
    const s = sprites.get(`${date}|${fl}`);
    const r = Math.round((g.lat_north - lat) / g.step_deg);
    const c = Math.round((lon - g.lon_west) / g.step_deg);
    if (!s || r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
    const hour = Math.floor(t / HOUR) - day * 24;
    return s.data[r * s.width + hour * g.cols + c] * scale;
  };
}

/** Between the forecast's levels: linear in flight level. */
function between<T>(fl: number, get: (f: number) => T | null, mix: (a: T, b: T, w: number) => T): T | null {
  if (FLS.includes(fl)) return get(fl);
  const lo = [...FLS].reverse().find((f) => f < fl);
  const hi = FLS.find((f) => f > fl);
  if (lo == null || hi == null) return null;
  const a = get(lo);
  const b = get(hi);
  return a == null || b == null ? null : mix(a, b, (fl - lo) / (hi - lo));
}
const lerp = (a: number, b: number, w: number) => a + (b - a) * w;
export const b1At = (sample: Sample, p: Point, fl: number) => between(fl, (f) => sample(p.t, f, p.lat, p.lon), lerp);
export const co2At = (type: string, fl: number) => between(fl, (f) => co2PerMin(type, f), lerp);

export type Advice = {
  fl: number; // the level flown or planned
  minutes: number; // minutes of cruise checked
  known: number; // of which inside the forecast
  lasting: boolean[]; // per minute: in lasting-contrail air at ``fl``
  nLasting: number;
  alt: number | null; // the advised level (null: none helps)
  spans: [number, number][]; // the stretches flown at the advised level, path indices [from, to)
  from: number; // first stretch's start
  to: number; // last stretch's end
  altLasting: number; // lasting minutes left in that stretch at the advised level
  extraFuelKg: number; // for the stretch at the advised level (negative = saves fuel)
  avoided: { p50: number; low: number }; // kg CO₂e (100 years), net of the extra fuel's CO₂
  alert: boolean; // the cautious estimate is positive too
};

/** Contrail advice for one cruise path at flight level ``fl``. */
export function advise(path: Point[], fl: number, type: string, sample: Sample): Advice {
  const vals = path.map((p) => b1At(sample, p, fl));
  const lasting = vals.map((v) => v != null && v >= LASTING);
  const nLasting = lasting.filter(Boolean).length;
  const base: Advice = {
    fl,
    minutes: path.length,
    known: vals.filter((v) => v != null).length,
    lasting,
    nLasting,
    alt: null,
    spans: [],
    from: 0,
    to: 0,
    altLasting: 0,
    extraFuelKg: 0,
    avoided: { p50: 0, low: 0 },
    alert: false,
  };
  const co2Here = co2At(type, fl);
  if (!nLasting || co2Here == null) return base;
  const spans = stretches(lasting, PAD_MIN);
  const winMin = spans.reduce((n, [a, b]) => n + b - a, 0);
  const [from, to] = [spans[0][0], spans[spans.length - 1][1]];
  const perMin = { p50: co2eKg(EF_PER_MIN_J.p50), low: co2eKg(EF_PER_MIN_J.p25) };
  let best: Advice | null = null;
  for (const d of [-20, 20, -40, 40]) {
    const alt = fl + d;
    const co2Alt = co2At(type, alt);
    if (alt < MIN_FL || alt > Math.min(MAX_FL, ceiling(type)) || co2Alt == null) continue;
    let altLasting = 0;
    for (const [a, b] of spans)
      for (let i = a; i < b; i++) {
        const v = b1At(sample, path[i], alt);
        if (v == null || v >= LASTING) altLasting++; // unknown counts as lasting: no credit for it
      }
    const cut = nLasting - altLasting;
    if (cut <= 0) continue;
    const extraCo2 = (co2Alt - co2Here) * winMin;
    const o: Advice = {
      ...base,
      alt,
      spans,
      from,
      to,
      altLasting,
      extraFuelKg: extraCo2 / CO2_PER_FUEL,
      avoided: { p50: cut * perMin.p50 - extraCo2, low: cut * perMin.low - extraCo2 },
      alert: cut * perMin.low - extraCo2 > 0,
    };
    // the most warming avoided; 2,000 ft before 4,000 ft when equal (tried in that order)
    if (o.avoided.p50 > 0 && (!best || o.avoided.p50 > best.avoided.p50 + 1)) best = o;
  }
  return best ?? base;
}

/** The stretches around lasting minutes: ``pad`` minutes either side, joined where they touch. */
export function stretches(lasting: boolean[], pad: number): [number, number][] {
  const out: [number, number][] = [];
  lasting.forEach((on, i) => {
    if (!on) return;
    const [a, b] = [Math.max(0, i - pad), Math.min(lasting.length, i + 1 + pad)];
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = b;
    else out.push([a, b]);
  });
  return out;
}

// ── airliners in the air now ────────────────────────────────────────────────

export type Stop = [string, number, number, ...string[]]; // [code, lat, lon, city?]
export type Live = LiveAircraft & { route?: Stop[] | null; vs?: number | null };
export type Tracked = {
  cs: string;
  type: string | null;
  lat: number; // now (moved on from the last report)
  lon: number;
  trk: number;
  kmh: number;
  fl: number; // flight level now (nearest 1,000 ft)
  from: Stop | null; // the route leg it is on, when the route fits
  to: Stop | null;
  path: Point[]; // the cruise ahead, one point a minute
  status: "cruise" | "climb" | "low" | "high" | "turboprop" | "landing";
  advice: Advice | null;
  timing: Timing | null; // when it left and lands (route known)
};

/** A trip's times (ms) and typical block time (minutes); estimates, see ``blockMin``. */
export type Timing = { dep: number; arr: number; total: number };

/** Typical block time between two airports: great circle at 780 km/h plus 15 minutes (as
 *  scripts/schedule.py uses for the expected flights). */
export const blockMin = (a: Stop, b: Stop) => (distBearing(a[1], a[2], b[1], b[2])[0] / 780) * 60 + 15;

/** How long a lasting contrail stayed in the sky in our CoCiP runs over India (B1, raw ERA5,
 *  12 days, 3,284 contrail pieces; 25th / 50th / 75th percentile, hours; the same by day and
 *  night). The live forecast says only whether a contrail would last, not for how long. */
export const LIFE_H = { p25: 2.45, p50: 3.82, p75: 5.25, n: 3284 };

/** Until when the contrails of the lasting minutes ahead could stay in the sky (typical range,
 *  ms), or null without any. */
export function contrailsUntil(a: Advice | null, path: Point[]): [number, number] | null {
  if (!a?.nLasting) return null;
  const t = path[a.lasting.lastIndexOf(true)].t;
  return [t + LIFE_H.p25 * HOUR, t + LIFE_H.p75 * HOUR];
}

const flOf = (ft: number) => Math.round(ft / 1000) * 10;

/** The leg of a route that an aircraft is flying: it lies near the great circle between two
 *  consecutive stops and is heading for the second. Null if none fits (route unknown or stale). */
export function legOf(route: Stop[] | null | undefined, lat: number, lon: number, trk: number | null): [Stop, Stop] | null {
  if (!route || route.length < 2) return null;
  let best: [Stop, Stop] | null = null;
  let bestExcess = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const ab = distBearing(a[1], a[2], b[1], b[2])[0];
    const ap = distBearing(a[1], a[2], lat, lon)[0];
    const [pb, brg] = distBearing(lat, lon, b[1], b[2]);
    const excess = ap + pb - ab;
    const turn = trk == null ? 0 : Math.abs(((brg - trk + 540) % 360) - 180);
    if (excess <= 0.15 * ab + 120 && (turn <= 50 || pb < 250) && excess < bestExcess) {
      best = [a, b];
      bestExcess = excess;
    }
  }
  return best;
}

/** One live aircraft: where it is now, where it is going, and the advice for its cruise ahead. */
export function track(a: Live, now: number, sample: Sample): Tracked {
  const kmh = (a.gs ?? 450) * 1.852;
  const [lat, lon] = a.trk == null ? [a.lat, a.lon] : move(a.lat, a.lon, a.trk, (kmh * Math.max(0, now - a.t)) / HOUR);
  const fl = flOf(a.alt);
  const leg = legOf(a.route, lat, lon, a.trk);
  // on a known leg: lands after the distance left at its ground speed plus ~10 minutes of approach
  let timing: Timing | null = null;
  if (leg) {
    const total = blockMin(leg[0], leg[1]);
    const arr = now + (distBearing(lat, lon, leg[1][1], leg[1][2])[0] / kmh) * HOUR + 10 * 60_000;
    timing = { dep: Math.min(now, arr - total * 60_000), arr, total };
  }
  const out: Tracked = { cs: a.cs, type: a.type, lat, lon, trk: a.trk ?? 0, kmh, fl, from: leg?.[0] ?? null, to: leg?.[1] ?? null, path: [], status: "cruise", advice: null, timing };
  if (a.type && TURBOPROP.test(a.type)) return { ...out, status: "turboprop" };
  if (a.vs != null && Math.abs(a.vs) > 500) return { ...out, status: "climb" };
  if (fl < MIN_FL) return { ...out, status: "low" };
  if (fl > MAX_FL) return { ...out, status: "high" };
  const dest = leg ? { lat: leg[1][1], lon: leg[1][2] } : null;
  const path = aheadPath({ lat, lon, trk: a.trk ?? 0, t: now }, dest, kmh, 60).slice(0, 360);
  if (!path.length) return { ...out, status: "landing" };
  return { ...out, path, advice: advise(path, fl, a.type ?? "", sample) };
}

// ── flights expected in the next hours ─────────────────────────────────────

/** Initial great-circle bearing: eastbound (0–179°) or westbound. */
const eastbound = (a: Stop, b: Stop) => distBearing(a[1], a[2], b[1], b[2])[1] < 180;
const band = (km: number) => (km < 700 ? 0 : km < 1400 ? 1 : 2);

/** The level a trip is likely planned at: what airliners on the same route are flying now, else
 *  on trips of the same direction and length now, else FL350 eastbound / FL360 westbound. */
export function usualLevel(cruising: Tracked[]) {
  const mode = (fls: number[]) => {
    const n = new Map<number, number>();
    for (const f of fls) n.set(f, (n.get(f) ?? 0) + 1);
    return [...n.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;
  };
  const withLeg = cruising.filter((t) => t.from && t.to && t.status === "cruise");
  return (a: Stop, b: Stop): { fl: number; how: "route" | "similar" | "rule" } => {
    const same = mode(withLeg.filter((t) => t.from![0] === a[0] && t.to![0] === b[0]).map((t) => t.fl));
    if (same) return { fl: same, how: "route" };
    const e = eastbound(a, b);
    const k = band(distBearing(a[1], a[2], b[1], b[2])[0]);
    const like = mode(withLeg.filter((t) => eastbound(t.from!, t.to!) === e && band(distBearing(t.from![1], t.from![2], t.to![1], t.to![2])[0]) === k).map((t) => t.fl));
    if (like) return { fl: like, how: "similar" };
    return { fl: e ? 350 : 360, how: "rule" };
  };
}

export type Upcoming = {
  cs: string;
  type: string | null;
  from: Stop;
  to: Stop;
  dep: number; // expected departure today, ms
  acc: number; // ± minutes
  arr: number; // expected landing, ms
  total: number; // typical block time, minutes
  path: Point[];
  fl: number;
  flHow: "route" | "similar" | "rule";
  advice: Advice | null;
};

/** The flights expected to leave between ``now`` and ``now + hours`` (yesterday's flights, same
 *  flight numbers and clock times), each with its advice. Flights already in the air are left out. */
export function upcoming(list: ScheduledFlight[], now: number, hours: number, airborne: Set<string>, level: ReturnType<typeof usualLevel>, sample: Sample): Upcoming[] {
  const day0 = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const out: Upcoming[] = [];
  for (const f of list) {
    if (airborne.has(f.cs) || (f.type && TURBOPROP.test(f.type))) continue;
    for (const d of [day0, day0 + 24 * HOUR]) {
      const dep = d + f.dep * 60_000;
      if (dep < now || dep > now + hours * HOUR) continue;
      const a = { lat: f.from[1], lon: f.from[2] };
      const b = { lat: f.to[1], lon: f.to[2] };
      const path = cruisePath(a, b, dep);
      const lv = level(f.from, f.to);
      const total = f.block || blockMin(f.from, f.to);
      out.push({ cs: f.cs, type: f.type, from: f.from, to: f.to, dep, acc: f.acc, arr: dep + total * 60_000, total, path, fl: lv.fl, flHow: lv.how, advice: path.length ? advise(path, lv.fl, f.type ?? "", sample) : null });
    }
  }
  return out.sort((x, y) => x.dep - y.dep);
}

/** Where a planned flight is at time ``t``: on its cruise path, or on the straight climb from the
 *  departure airport / descent to the arrival one (at the same speed); [lon, lat, bearing], or
 *  null before departure or after arrival. Uses the same path as the advice. */
export function routePosition(u: Upcoming, t: number): [number, number, number] | null {
  const pts: Point[] = [{ lat: u.from[1], lon: u.from[2], t: u.dep }, ...u.path];
  const last = pts[pts.length - 1];
  const descentKm = distBearing(last.lat, last.lon, u.to[1], u.to[2])[0];
  pts.push({ lat: u.to[1], lon: u.to[2], t: last.t + (descentKm / CRUISE_KMH) * HOUR });
  if (t < pts[0].t || t > pts[pts.length - 1].t) return null;
  let k = 0;
  while (k < pts.length - 2 && pts[k + 1].t < t) k++;
  const [a, b] = [pts[k], pts[k + 1]];
  const w = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return [a.lon + (b.lon - a.lon) * w, a.lat + (b.lat - a.lat) * w, distBearing(a.lat, a.lon, b.lat, b.lon)[1]];
}

/** Sum of the alerts' central and cautious warming avoided and extra fuel. */
export function totals(list: (Advice | null)[]) {
  let n = 0;
  let p50 = 0;
  let low = 0;
  let fuel = 0;
  for (const a of list)
    if (a?.alert) {
      n++;
      p50 += a.avoided.p50;
      low += a.avoided.low;
      fuel += a.extraFuelKg;
    }
  return { n, p50, low, fuel };
}

/** "Be the controller" (/3d): what flying ``alt`` instead of ``fl`` would do over the stretches
 *  of ``path`` in lasting-contrail air — the same sums as advise(), for any one move. Null when the
 *  move is not possible (outside FL280–FL420 or above the type's ceiling) or there is nothing to avoid. */
export function levelChoice(path: Point[], fl: number, alt: number, type: string, sample: Sample) {
  const lasting = path.map((p) => {
    const v = b1At(sample, p, fl);
    return v != null && v >= LASTING;
  });
  const n = lasting.filter(Boolean).length;
  const co2Here = co2At(type, fl);
  const co2Alt = co2At(type, alt);
  if (!n || co2Here == null || co2Alt == null || alt < MIN_FL || alt > Math.min(MAX_FL, ceiling(type))) return null;
  const spans = stretches(lasting, PAD_MIN);
  let left = 0;
  let win = 0;
  for (const [a, b] of spans)
    for (let i = a; i < b; i++) {
      win++;
      const v = b1At(sample, path[i], alt);
      if (v == null || v >= LASTING) left++;
    }
  const extraCo2 = (co2Alt - co2Here) * win;
  return { net: (n - left) * co2eKg(EF_PER_MIN_J.p50) - extraCo2, fuelKg: extraCo2 / CO2_PER_FUEL, spans, lasting, left, n };
}
