// The 3D sky, live (/3d, "Live now"): today's real airliners (the live feed) on their paths
// ahead, today's forecast, the lasting contrails each would leave where its path crosses
// lasting-contrail air, and STRATUM's advice for them (lib/advice.ts, as on /now). Times are
// minutes after 00:00 UTC today, like the past days in the 3D sky.

import type { SkyContrail, SkyFlight, SkyMove } from "../three/sky";
import { type Live, LIFE_H, type Sample, track } from "./advice";
import { move } from "./geo";

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
