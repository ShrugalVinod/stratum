// The 3D sky, live (/3d, "Live now"): today's real airliners (the live feed) on their paths
// ahead, today's forecast, the lasting contrails each would leave where its path crosses
// lasting-contrail air, and STRATUM's advice for them (lib/advice.ts, as on /now). Times are
// minutes after 00:00 UTC today, like the past days in the 3D sky.

import type { SkyContrail, SkyFlight, SkyMove } from "../three/sky";
import { type Advice, advise, type Live, LIFE_H, type Sample, track, type Upcoming } from "./advice";
import { type Airport, CRUISE_KMH, cruisePath, type Point } from "./footprint";
import { distBearing, move } from "./geo";

/** One live alert, in the shape the 3D page counts. */
export type LiveAlert = { flight: string; cs: string; t0: number; t1: number; fl: number; alt: number; low: number; p50: number; fuelKg: number };

const PIECE_MIN = 8; // contrail ribbons are straight: long stretches are cut into pieces

export function buildLiveSky(ac: Live[], at: number, sample: Sample): { flights: SkyFlight[]; contrails: SkyContrail[]; alerts: LiveAlert[] } {
  const day0 = Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate());
  const minute = (t: number) => (t - day0) / 60_000;
  const flights: SkyFlight[] = [];
  const contrails: SkyContrail[] = [];
  const alerts: LiveAlert[] = [];
  for (const a of ac) {
    const t = track(a, at, sample);
    const id = `live-${t.cs}`;
    // its path ahead (the cruise checked by the advice), else an hour on its heading
    let mins: number[];
    let xy: [number, number][];
    if (t.path.length > 1) {
      mins = t.path.map((p) => minute(p.t));
      xy = t.path.map((p) => [p.lon, p.lat]);
    } else {
      const [lat, lon] = move(t.lat, t.lon, t.trk, t.kmh);
      mins = [minute(at), minute(at) + 60];
      xy = [
        [t.lon, t.lat],
        [lon, lat],
      ];
    }
    const adv = t.advice;
    const moves: SkyMove[] = adv?.alert ? adv.spans.map(([i, j]) => ({ t0: mins[i], t1: mins[j - 1], dFl: adv.alt! - adv.fl })) : [];
    flights.push({ id, cs: t.cs, type: t.type, mins, xy, fl: t.fl, makesContrail: !!adv?.nLasting, moves });
    if (adv?.alert)
      alerts.push({ flight: id, cs: t.cs, t0: mins[adv.from], t1: mins[adv.to - 1], fl: adv.fl, alt: adv.alt!, low: adv.avoided.low, p50: adv.avoided.p50, fuelKg: adv.extraFuelKg });
    // the lasting contrails it would leave: each run of lasting minutes, in pieces
    if (!adv?.nLasting) continue;
    const inSpan = (i: number) => adv.alert && adv.spans.some(([a0, b0]) => i >= a0 && i < b0);
    for (let i = 0; i < adv.lasting.length; ) {
      if (!adv.lasting[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < adv.lasting.length && adv.lasting[j + 1] && j + 1 - i < PIECE_MIN) j++;
      const k = Math.min(j + 1, t.path.length - 1);
      contrails.push({
        flight: id,
        a: [t.path[i].lon, t.path[i].lat],
        b: [t.path[k].lon, t.path[k].lat],
        fl: t.fl,
        t0: mins[i],
        t1: mins[k],
        lifeMin: LIFE_H.p50 * 60,
        moved: inSpan(i),
      });
      i = j + 1;
    }
  }
  return { flights, contrails, alerts };
}

// ── "Your flight, in 3D": one planned trip, runway to runway, on the forecast ─────────────

export type MyTrip = { from: Airport; to: Airport; dep: number; type: string; fl: number };
export type MyFlight = { flight: SkyFlight; contrails: SkyContrail[]; alert: LiveAlert | null; advice: Advice | null; path: Point[]; arr: number };

/** The whole trip: the take-off and climb from ``from``, the cruise (one point a minute, as on
 *  Your flight), the descent to ``to``; the advice for its cruise and the contrails it would leave. */
export function buildMyFlight(t: MyTrip, day0: number, sample: Sample): MyFlight | null {
  const path = cruisePath(t.from, t.to, t.dep);
  if (!path.length) return null;
  const minute = (ms: number) => (ms - day0) / 60_000;
  const last = path[path.length - 1];
  const descentMin = (distBearing(last.lat, last.lon, t.to.lat, t.to.lon)[0] / CRUISE_KMH) * 60 + 6;
  const arr = last.t + descentMin * 60_000;
  const adv = advise(path, t.fl, t.type, sample);
  const id = "you";
  const mins = [minute(t.dep), ...path.map((p) => minute(p.t)), minute(arr)];
  const xy: [number, number][] = [[t.from.lon, t.from.lat], ...path.map((p) => [p.lon, p.lat] as [number, number]), [t.to.lon, t.to.lat]];
  const alt = [0, ...path.map(() => t.fl), 0];
  // the path's indices are one less than the flight's (the runway point comes first)
  const moves: SkyMove[] = adv.alert ? adv.spans.map(([i, j]) => ({ t0: minute(path[i].t), t1: minute(path[j - 1].t), dFl: adv.alt! - adv.fl })) : [];
  const flight: SkyFlight = { id, cs: `${t.from.code} → ${t.to.code}`, type: t.type, mins, xy, fl: t.fl, makesContrail: adv.nLasting > 0, moves, alt };
  const alert = adv.alert
    ? { flight: id, cs: flight.cs, t0: minute(path[adv.from].t), t1: minute(path[adv.to - 1].t), fl: adv.fl, alt: adv.alt!, low: adv.avoided.low, p50: adv.avoided.p50, fuelKg: adv.extraFuelKg }
    : null;
  const contrails: SkyContrail[] = [];
  const inSpan = (i: number) => adv.alert && adv.spans.some(([a0, b0]) => i >= a0 && i < b0);
  for (let i = 0; i < adv.lasting.length; ) {
    if (!adv.lasting[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < adv.lasting.length && adv.lasting[j + 1] && j + 1 - i < PIECE_MIN) j++;
    const k = Math.min(j + 1, path.length - 1);
    contrails.push({ flight: id, a: [path[i].lon, path[i].lat], b: [path[k].lon, path[k].lat], fl: t.fl, t0: minute(path[i].t), t1: minute(path[k].t), lifeMin: LIFE_H.p50 * 60, moved: inSpan(i) });
    i = j + 1;
  }
  return { flight, contrails, alert, advice: adv, path, arr };
}

/** Tonight's other expected flights (lib/advice upcoming) as 3D flights, with their contrails. */
export function fromUpcoming(list: Upcoming[], day0: number): { flights: SkyFlight[]; contrails: SkyContrail[] } {
  const minute = (ms: number) => (ms - day0) / 60_000;
  const flights: SkyFlight[] = [];
  const contrails: SkyContrail[] = [];
  list.forEach((u, n) => {
    if (u.path.length < 2) return;
    const id = `up-${u.cs}-${n}`;
    flights.push({ id, cs: u.cs, type: u.type, mins: u.path.map((p) => minute(p.t)), xy: u.path.map((p) => [p.lon, p.lat]), fl: u.fl, makesContrail: !!u.advice?.nLasting });
    const adv = u.advice;
    if (!adv?.nLasting) return;
    for (let i = 0; i < adv.lasting.length; i++) {
      if (!adv.lasting[i]) continue;
      let j = i;
      while (j + 1 < adv.lasting.length && adv.lasting[j + 1] && j + 1 - i < PIECE_MIN) j++;
      const k = Math.min(j + 1, u.path.length - 1);
      contrails.push({ flight: id, a: [u.path[i].lon, u.path[i].lat], b: [u.path[k].lon, u.path[k].lat], fl: u.fl, t0: minute(u.path[i].t), t1: minute(u.path[k].t), lifeMin: LIFE_H.p50 * 60 });
      i = j;
    }
  });
  return { flights, contrails };
}
