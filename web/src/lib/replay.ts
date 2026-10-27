// "What if we'd listened?" (/replay): one real day over India twice, as flown and as if every
// STRATUM alert had been followed. The stretches are the day's 60 strongest contrail stretches
// from the decision layer redone with STRATUM's probabilities (second analysis D-006,
// data/weighted/days/<date>/segments_STRATUMw.json): each has its time, path, planned level, and,
// when it is an alert, the advised level, the extra fuel and the net warming avoided (kg CO₂e,
// 100 years; 5th / 50th / 95th percentile). How long each contrail lasts comes from CoCiP for the
// same flight (segments_B1.json, contrail_age_h). Contrails are drawn where they formed; real
// ones drift with the wind.

import type { FlaggedSegment, FlightFeature } from "../data/contract";

export type Stretch = {
  id: string;
  cs: string;
  t0: number; // minutes after 00:00 UTC
  t1: number;
  a: [number, number]; // [lon, lat] start
  b: [number, number]; // end
  fl: number;
  alert: boolean;
  alt: number | null; // advised flight level (alerts)
  fuelKg: number; // extra fuel of the advised level (negative = saves fuel)
  avoided: [number, number, number]; // net warming avoided, kg CO₂e, 100 yr (p05, p50, p95)
  lifeH: number; // how long the contrail lasts (CoCiP), hours
};
export type Track = { mins: number[]; xy: [number, number][] };

const minuteOf = (iso: string, day: string) => (Date.parse(iso) - Date.parse(`${day}T00:00:00Z`)) / 60_000;
export const DEFAULT_LIFE_H = 3;

/** The day's stretches, with each contrail's lifetime taken from CoCiP for the same flight (the
 *  longest lifetime among that flight's contrail segments overlapping the stretch, else the
 *  flight's longest, else DEFAULT_LIFE_H). */
export function stretches(day: string, weighted: FlaggedSegment[], b1: FlaggedSegment[]): Stretch[] {
  const byFlight = new Map<string, FlaggedSegment[]>();
  for (const s of b1) (byFlight.get(s.flight_id) ?? byFlight.set(s.flight_id, []).get(s.flight_id)!).push(s);
  return weighted
    .map((w) => {
      const t0 = minuteOf(w.time_utc, day);
      const t1 = w.time_end_utc ? minuteOf(w.time_end_utc, day) : t0 + (w.n_segments ?? 1);
      const mine = byFlight.get(w.flight_id) ?? [];
      const ages = (list: FlaggedSegment[]) => list.map((s) => s.contrail_age_h).filter((v): v is number => v != null && v > 0);
      const overlap = mine.filter((s) => {
        const s0 = minuteOf(s.time_utc, day);
        const s1 = s.time_end_utc ? minuteOf(s.time_end_utc, day) : s0 + 1;
        return s1 >= t0 && s0 <= t1;
      });
      const life = Math.max(0, ...ages(overlap)) || Math.max(0, ...ages(mine)) || DEFAULT_LIFE_H;
      const r = w.net_warming_avoided_100y_range;
      return {
        id: w.segment_id,
        cs: w.callsign,
        t0,
        t1: Math.max(t1, t0 + 1),
        a: [w.lon_start, w.lat_start] as [number, number],
        b: [w.lon_end, w.lat_end] as [number, number],
        fl: w.fl,
        alert: !!w.alert,
        alt: w.best_alternative_fl ?? null,
        fuelKg: w.extra_fuel_kg ?? 0,
        avoided: (r && r.length === 3 ? [r[0], r[1], r[2]] : [0, 0, 0]) as [number, number, number],
        lifeH: life,
      };
    })
    .sort((x, y) => x.t0 - y.t0);
}

export function tracks(flights: FlightFeature[]): Track[] {
  return flights
    .filter((f) => f.geometry.type === "LineString" && f.properties.minutes?.length === f.geometry.coordinates.length)
    .map((f) => ({ mins: f.properties.minutes, xy: f.geometry.coordinates as [number, number][] }));
}

/** Where a flight is at minute ``m`` (straight between its track points), or null if not flying. */
export function position(t: Track, m: number): [number, number] | null {
  const n = t.mins.length;
  if (!n || m < t.mins[0] || m > t.mins[n - 1]) return null;
  let i = 1;
  while (i < n - 1 && t.mins[i] < m) i++;
  const [m0, m1] = [t.mins[i - 1], t.mins[i]];
  const f = m1 > m0 ? (m - m0) / (m1 - m0) : 0;
  const [a, b] = [t.xy[i - 1], t.xy[i]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** A contrail's look at minute ``m``: how far along its stretch it has been drawn (0–1), and once
 *  the plane has passed, how old it is as a share of its life (0–1); null before or after. */
export function contrailAt(s: Stretch, m: number): { drawn: number; age: number } | null {
  if (m < s.t0) return null;
  const life = s.lifeH * 60;
  const since = m - s.t1;
  if (since > life) return null;
  return { drawn: Math.min(1, (m - s.t0) / (s.t1 - s.t0)), age: Math.max(0, since) / life };
}

export type Tally = { alerts: number; fuelKg: number; avoided: [number, number, number]; lasting: number; lastingIfListened: number };
/** Running totals by minute ``m``: advice given (alerts whose stretch has started), its extra
 *  fuel and warming avoided, and how many lasting contrails are in the sky on each side. */
export function tally(list: Stretch[], m: number): Tally {
  const out: Tally = { alerts: 0, fuelKg: 0, avoided: [0, 0, 0], lasting: 0, lastingIfListened: 0 };
  for (const s of list) {
    if (s.alert && m >= s.t0) {
      out.alerts++;
      out.fuelKg += s.fuelKg;
      out.avoided = [out.avoided[0] + s.avoided[0], out.avoided[1] + s.avoided[1], out.avoided[2] + s.avoided[2]];
    }
    if (contrailAt(s, m)) {
      out.lasting++;
      if (!s.alert) out.lastingIfListened++;
    }
  }
  return out;
}
