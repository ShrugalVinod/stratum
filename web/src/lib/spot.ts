// "Spot a contrail": which airliner most likely drew the contrail in a photo.
//
// A contrail seen at time T was drawn by an aircraft that crossed that part of the sky some
// minutes earlier (a lasting contrail is visible for up to an hour or more). Starting from each
// aircraft's live position, we fly it backwards along its track at its ground speed (straight
// line: good for cruising flights over an hour) and find when it passed closest to where the
// photographer was looking. Candidates passed within the look area during the hour before the
// photo; they are ranked by how close and how recent the pass was.

import type { LiveAircraft } from "../data/contract";
import { distBearing, move } from "./geo";

export type Look = { bearing: number | null; height: "overhead" | "high" | "mid" | "low" };
export type Candidate = LiveAircraft & {
  passKm: number; // closest distance between the aircraft and the look point
  passLat: number;
  passLon: number;
  passAt: number; // ms, time of the closest pass
  ageMin: number; // minutes between the pass and the photo
  bearing: number; // from the viewer to the pass point
  distKm: number; // viewer → pass point
  score: number; // lower is better
  path: [number, number][]; // the back-propagated track over the window
};

const WINDOW_MIN = 60;
// how far away a contrail at that height in the sky is, and how wide an area to search
export const LOOK: Record<Look["height"], { km: number; tol: number }> = {
  overhead: { km: 0, tol: 25 },
  high: { km: 12, tol: 28 },
  mid: { km: 30, tol: 35 },
  low: { km: 60, tol: 45 },
};
export const ANY_TOL_KM = 60;

/** Where an aircraft was at time ``t`` (ms): its reported position moved along its track. */
export function positionAt(a: LiveAircraft, t: number): [number, number] {
  if (a.gs == null || a.trk == null) return [a.lat, a.lon];
  const km = (a.gs * 1.852 * (t - a.t)) / 3_600_000; // negative = back in time
  return move(a.lat, a.lon, a.trk, km);
}

export function candidates(ac: LiveAircraft[], lat: number, lon: number, photoT: number, look: Look): Candidate[] {
  const area = look.bearing == null ? null : LOOK[look.height];
  const [la, lo] = area ? move(lat, lon, look.bearing!, area.km) : [lat, lon];
  const tol = area ? area.tol : ANY_TOL_KM;
  const out: Candidate[] = [];
  for (const a of ac) {
    if (a.gs == null || a.trk == null) continue;
    let best = { d: Infinity, t: 0, p: [a.lat, a.lon] as [number, number] };
    const path: [number, number][] = [];
    for (let m = WINDOW_MIN; m >= 0; m -= 1) {
      const t = photoT - m * 60_000;
      const p = positionAt(a, t);
      path.push(p);
      const d = distBearing(la, lo, p[0], p[1])[0];
      if (d < best.d) best = { d, t, p };
    }
    // refine around the closest minute (an airliner covers ~14 km a minute)
    const t0 = best.t;
    for (let dt = -60_000; dt <= 60_000; dt += 5_000) {
      const t = Math.min(photoT, Math.max(photoT - WINDOW_MIN * 60_000, t0 + dt));
      const p = positionAt(a, t);
      const d = distBearing(la, lo, p[0], p[1])[0];
      if (d < best.d) best = { d, t, p };
    }
    if (best.d > tol) continue;
    const [distKm, bearing] = distBearing(lat, lon, best.p[0], best.p[1]);
    const ageMin = (photoT - best.t) / 60_000;
    out.push({ ...a, passKm: best.d, passLat: best.p[0], passLon: best.p[1], passAt: best.t, ageMin, bearing, distKm,
      score: best.d / tol + (0.5 * ageMin) / WINDOW_MIN, path }); // prettier-ignore
  }
  return out.sort((x, y) => x.score - y.score);
}
