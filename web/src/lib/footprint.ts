// "Your flight's hidden footprint": the cruise part of one flight, minute by minute, checked
// against the forecast's lasting-contrail air (B1) at its own flight level and at the levels
// around it, with the flight's CO₂ and a rough range for the warming its contrail could cause.
//
// Every number comes from the project's own sources, not from new assumptions:
//  * CO₂ per minute of cruise: OpenAP fuel flow at 0.80 × MTOW (the pre-registered mass) and
//    3.16 kg CO₂ per kg of fuel (preregistered.yaml); see CO2_PER_MIN below.
//  * Contrail warming per minute: the energy forcing (EF) per minute of the warming contrails
//    in our CoCiP runs over India (B1, raw ERA5, 12 days, 3,284 flight pieces; 25th / 50th / 75th
//    percentile), converted to CO₂e like the decision layer (stratum/decide/climate_metric.py):
//    CO₂e = EF × efficacy 0.42 / (AGWP_CO₂(H) × A_earth × s_yr), IPCC AR5.
// It is a physics-only estimate; the page says so, and that physics flags about six times more
// lasting contrails than the satellite sees (H1).

import { distBearing, move } from "./geo";

export type Airport = { code: string; city: string; lat: number; lon: number };

/** Airports inside the forecast domain (6–37°N, 68–98°E). */
export const AIRPORTS: Airport[] = [
  { code: "DEL", city: "Delhi", lat: 28.556, lon: 77.1 },
  { code: "BOM", city: "Mumbai", lat: 19.089, lon: 72.868 },
  { code: "BLR", city: "Bengaluru", lat: 13.199, lon: 77.706 },
  { code: "MAA", city: "Chennai", lat: 12.994, lon: 80.171 },
  { code: "CCU", city: "Kolkata", lat: 22.654, lon: 88.447 },
  { code: "HYD", city: "Hyderabad", lat: 17.231, lon: 78.43 },
  { code: "AMD", city: "Ahmedabad", lat: 23.077, lon: 72.635 },
  { code: "COK", city: "Kochi", lat: 10.152, lon: 76.402 },
  { code: "GOI", city: "Goa", lat: 15.381, lon: 73.831 },
  { code: "PNQ", city: "Pune", lat: 18.582, lon: 73.92 },
  { code: "GAU", city: "Guwahati", lat: 26.106, lon: 91.586 },
  { code: "JAI", city: "Jaipur", lat: 26.824, lon: 75.812 },
  { code: "LKO", city: "Lucknow", lat: 26.761, lon: 80.889 },
  { code: "TRV", city: "Thiruvananthapuram", lat: 8.482, lon: 76.92 },
  { code: "PAT", city: "Patna", lat: 25.591, lon: 85.088 },
  { code: "BBI", city: "Bhubaneswar", lat: 20.244, lon: 85.818 },
  { code: "IXC", city: "Chandigarh", lat: 30.673, lon: 76.788 },
  { code: "SXR", city: "Srinagar", lat: 33.987, lon: 74.774 },
  { code: "NAG", city: "Nagpur", lat: 21.092, lon: 79.047 },
  { code: "VTZ", city: "Visakhapatnam", lat: 17.721, lon: 83.225 },
  { code: "IXB", city: "Bagdogra", lat: 26.681, lon: 88.329 },
  { code: "ATQ", city: "Amritsar", lat: 31.71, lon: 74.797 },
  { code: "IDR", city: "Indore", lat: 22.722, lon: 75.801 },
  { code: "CJB", city: "Coimbatore", lat: 11.03, lon: 77.044 },
  { code: "VNS", city: "Varanasi", lat: 25.452, lon: 82.859 },
  { code: "IXR", city: "Ranchi", lat: 23.314, lon: 85.322 },
  { code: "RPR", city: "Raipur", lat: 21.18, lon: 81.739 },
  { code: "IXE", city: "Mangaluru", lat: 12.961, lon: 74.89 },
  { code: "CMB", city: "Colombo", lat: 7.181, lon: 79.884 },
  { code: "KTM", city: "Kathmandu", lat: 27.697, lon: 85.359 },
  { code: "DAC", city: "Dhaka", lat: 23.843, lon: 90.398 },
];
export const airport = (code: string | null | undefined) => AIRPORTS.find((a) => a.code === code) ?? null;

export const FLS = [280, 300, 320, 340, 360, 380, 400, 420];

/** kg CO₂ per minute of level cruise (OpenAP, mass 0.80 × MTOW, Mach 0.78–0.85; null = above the
 *  type's ceiling). A20N / A21N: OpenAP's neo model burns ~40 % less than the A320, more than the
 *  ~15 % Airbus states, so they are the A320 / A321 values × 0.85. */
const OPENAP: Record<string, (number | null)[]> = {
  A320: [158.2, 151.0, 144.9, 139.8, 135.8, 132.9, 131.2, null],
  A321: [180.4, 173.5, 167.9, 163.6, 160.5, 158.8, 158.5, null],
  A319: [153.2, 144.4, 136.8, 130.4, 125.1, 121.1, 118.2, null],
  B738: [157.6, 149.7, 143.0, 137.5, 133.2, 130.1, 128.3, null],
  B38M: [128.8, 122.9, 117.9, 113.7, 110.5, 108.2, 106.9, null],
  B739: [158.7, 151.5, 145.4, 140.5, 136.8, 134.4, 133.2, null],
  E190: [119.0, 113.6, 108.8, 104.7, 101.3, 98.7, 96.8, null],
  B77W: [700.1, 667.5, 639.6, 616.5, 598.3, 585.3, 577.7, 575.3],
  B788: [327.1, 309.4, 293.7, 280.1, 268.5, 259.1, 252.1, 247.3],
  B789: [449.3, 424.8, 403.0, 384.0, 367.8, 354.7, 344.8, 338.0],
  A333: [375.6, 351.3, 330.3, 312.7, 298.2, 286.9, 278.9, null],
  A359: [506.3, 478.0, 452.5, 430.0, 410.6, 394.5, 381.9, 372.8],
  A388: [840.2, 804.5, 774.5, 750.2, 731.9, 720.1, 714.7, 715.9],
};
const neo = (base: (number | null)[]) => base.map((v) => (v == null ? null : Math.round(v * 0.85 * 10) / 10));
export const CO2_PER_MIN: Record<string, (number | null)[]> = { ...OPENAP, A20N: neo(OPENAP.A320), A21N: neo(OPENAP.A321) };

/** The aircraft types offered when planning a trip (most Indian domestic flying is A320 family). */
export const PLAN_TYPES = ["A20N", "A21N", "A320", "A321", "B738", "B38M", "E190", "A333", "B788", "B789", "A359", "B77W", "A388"];

/** An ADS-B type code → the closest type in the fuel table (default: A320 family). */
export function fuelType(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase();
  if (CO2_PER_MIN[c]) return c;
  if (/^A21|^A32[12]N/.test(c)) return "A21N";
  if (/^A3[12]/.test(c)) return "A320";
  if (/^B3[789]M|^B37M/.test(c)) return "B38M";
  if (/^B73/.test(c)) return "B738";
  if (/^B77/.test(c)) return "B77W";
  if (/^B78/.test(c)) return "B789";
  if (/^A33|^A34/.test(c)) return "A333";
  if (/^A35/.test(c)) return "A359";
  if (/^A38/.test(c)) return "A388";
  if (/^E1/.test(c)) return "E190";
  return "A20N";
}
export const co2PerMin = (type: string, fl: number): number | null => CO2_PER_MIN[fuelType(type)][FLS.indexOf(fl)] ?? null;

// contrail warming per minute of a warming contrail (J of EF; CoCiP B1 over India, 12 days)
export const EF_PER_MIN_J = { p25: 5.95e11, p50: 2.15e12, p75: 5.76e12 };
const EFFICACY = 0.42;
const AGWP_CO2 = { 20: 2.49e-14, 100: 9.17e-14 } as const; // W m⁻² yr (kg CO₂)⁻¹, IPCC AR5
const A_EARTH_M2 = 5.101e14;
const S_PER_YEAR = 31_536_000;
/** kg CO₂e of ``ef`` joules of contrail energy forcing over ``h`` years (as in climate_metric.py). */
export const co2eKg = (ef: number, h: 20 | 100 = 100) => (ef * EFFICACY) / (AGWP_CO2[h] * A_EARTH_M2 * S_PER_YEAR);

export const CRUISE_KMH = 830; // ~450 kt ground speed, typical airliner cruise
const CLIMB_KM = 150; // reaching cruise level
const DESCENT_KM = 180; // leaving it

export type Point = { lat: number; lon: number; t: number }; // t: ms
/** The cruise part of a trip, one point per minute: great circle from ``a`` to ``b`` leaving at
 *  ``dep`` (ms), less the climb and the descent. Empty when the trip is too short to cruise. */
export function cruisePath(a: { lat: number; lon: number }, b: { lat: number; lon: number }, dep: number, kmh = CRUISE_KMH): Point[] {
  const [total] = distBearing(a.lat, a.lon, b.lat, b.lon);
  const step = kmh / 60;
  const out: Point[] = [];
  let [lat, lon] = [a.lat, a.lon];
  for (let km = 0, i = 0; km < total - DESCENT_KM; km += step, i++) {
    if (km >= CLIMB_KM) out.push({ lat, lon, t: dep + i * 60_000 });
    const brg = distBearing(lat, lon, b.lat, b.lon)[1]; // re-aim every minute: follows the great circle
    [lat, lon] = move(lat, lon, brg, step);
  }
  return out;
}
/** From an aircraft already cruising: to ``b`` (stopping before the descent) or, without a
 *  destination, straight ahead for ``minutes``. */
export function aheadPath(from: { lat: number; lon: number; trk: number; t: number }, b: { lat: number; lon: number } | null, kmh: number, minutes = 60): Point[] {
  const step = kmh / 60;
  const out: Point[] = [];
  let [lat, lon] = [from.lat, from.lon];
  for (let i = 0; i < (b ? 600 : minutes); i++) {
    if (b && distBearing(lat, lon, b.lat, b.lon)[0] < DESCENT_KM) break;
    out.push({ lat, lon, t: from.t + i * 60_000 });
    const brg = b ? distBearing(lat, lon, b.lat, b.lon)[1] : from.trk;
    [lat, lon] = move(lat, lon, brg, step);
  }
  return out;
}

/** Lasting-contrail fraction of the hour (B1) at a point, or null outside the forecast. */
export type Lookup = (p: Point, fl: number) => Promise<number | null>;
export type LevelResult = { fl: number; lasting: number; known: number; co2: number | null; cells: (number | null)[] };
/** A level option: central contrail warming of its lasting minutes, and that plus its fuel CO₂
 *  relative to the planned level (kg CO₂e, 100 years). */
export type Option = LevelResult & { warmP50: number; netP50: number };
export type Footprint = {
  minutes: number;
  type: string;
  planned: LevelResult;
  levels: LevelResult[]; // every FL from FL280 to FL420, for the side view
  options: Option[]; // planned ± 2,000 / 4,000 ft the aircraft can fly
  best: Option | null; // the option with the least estimated warming + fuel, if it beats the planned level
  warm: { p25: number; p50: number; p75: number; p50h20: number }; // kg CO₂e of the planned level's lasting minutes
};

export const LASTING = 0.5; // a minute counts as in lasting-contrail air when B1 ≥ 0.5 (as on Spot a contrail)

export async function footprint(path: Point[], plannedFl: number, type: string, lookup: Lookup): Promise<Footprint> {
  const levels: LevelResult[] = [];
  for (const fl of FLS) {
    const cells = await Promise.all(path.map((p) => lookup(p, fl)));
    const per = co2PerMin(type, fl);
    levels.push({
      fl,
      cells,
      lasting: cells.filter((v) => v != null && v >= LASTING).length,
      known: cells.filter((v) => v != null).length,
      co2: per == null ? null : per * path.length,
    });
  }
  const at = (fl: number) => levels.find((l) => l.fl === fl)!;
  const planned = at(plannedFl);
  const kgPerMin = (q: keyof typeof EF_PER_MIN_J) => co2eKg(EF_PER_MIN_J[q]);
  const warm = (n: number) => n * kgPerMin("p50");
  const options = levels
    .filter((l) => Math.abs(l.fl - plannedFl) <= 40 && l.co2 != null)
    .map((l) => ({ ...l, warmP50: warm(l.lasting), netP50: warm(l.lasting) + (l.co2! - (planned.co2 ?? l.co2!)) }));
  const base = options.find((o) => o.fl === plannedFl);
  // contrail advice only: a level that cuts lasting-contrail minutes and lowers warming + fuel
  const better = options.filter((o) => o.fl !== plannedFl && base && o.lasting < base.lasting && o.netP50 < base.netP50 - 1);
  const best = better.sort((x, y) => x.netP50 - y.netP50)[0] ?? null;
  return {
    minutes: path.length,
    type: fuelType(type),
    planned,
    levels,
    options,
    best,
    warm: {
      p25: planned.lasting * kgPerMin("p25"),
      p50: warm(planned.lasting),
      p75: planned.lasting * kgPerMin("p75"),
      p50h20: planned.lasting * co2eKg(EF_PER_MIN_J.p50, 20),
    },
  };
}

/** The flight level nearest an altitude in feet. */
export const nearestFl = (altFt: number) => FLS.reduce((b, f) => (Math.abs(f * 100 - altFt) < Math.abs(b * 100 - altFt) ? f : b), FLS[0]);

/** The airports the forecast scan checks (the busiest domestic ones). */
export const SCAN_AIRPORTS = ["DEL", "BOM", "BLR", "MAA", "CCU", "HYD", "AMD", "COK", "GOI", "PNQ", "GAU", "LKO"];
export type Hot = { from: string; to: string; dep: number; lasting: number; minutes: number };
/** The trips with the most lasting-contrail minutes at ``fl`` among every pair of ``codes`` and
 *  every departure in ``deps`` (ms). Positions are worked out once per pair; only times change. */
export async function hottest(codes: string[], deps: number[], fl: number, lookup: Lookup, n = 6): Promise<Hot[]> {
  const out: Hot[] = [];
  for (const f of codes)
    for (const t of codes) {
      const a = airport(f);
      const b = airport(t);
      if (!a || !b || f === t) continue;
      const base = cruisePath(a, b, 0);
      if (!base.length) continue;
      for (const dep of deps) {
        let lasting = 0;
        for (const p of base) {
          const v = await lookup({ ...p, t: p.t + dep }, fl);
          if (v != null && v >= LASTING) lasting++;
        }
        if (lasting) out.push({ from: f, to: t, dep, lasting, minutes: base.length });
      }
    }
  // the strongest first, one entry per route (its worst departure)
  const seen = new Set<string>();
  return out
    .sort((x, y) => y.lasting - x.lasting || x.dep - y.dep)
    .filter((h) => (seen.has(h.from + h.to) ? false : (seen.add(h.from + h.to), true)))
    .slice(0, n);
}
