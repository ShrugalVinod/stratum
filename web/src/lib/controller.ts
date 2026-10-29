// "Be the controller" (/3d): one hour of a real evening, the airliners heading into air where
// contrails last, and the visitor choosing for each one: climb 2,000 ft, descend 2,000 ft or
// leave it. STRATUM chooses from the same three moves; both are scored with the same sums as
// Live advice (lib/advice.ts levelChoice): contrail warming avoided net of the extra fuel's CO₂.

import type { SkyContrail, SkyFlight, SkyMove } from "../three/sky";
import { LIFE_H, levelChoice, type Sample } from "./advice";
import type { Point } from "./footprint";

export type Move = "up" | "down" | "none";
type Choice = NonNullable<ReturnType<typeof levelChoice>>;
export type GamePlane = { f: SkyFlight; path: Point[]; n: number; up: Choice | null; down: Choice | null; best: Move };

/** The flight's position each minute between ``w0`` and ``w1`` (minutes UTC), from its track. */
function minutePath(f: SkyFlight, day0: number, w0: number, w1: number): Point[] {
  const out: Point[] = [];
  const ms = f.mins;
  for (let m = Math.max(w0, Math.ceil(ms[0])); m <= Math.min(w1, ms[ms.length - 1]); m++) {
    let k = 1;
    while (k < ms.length - 1 && ms[k] < m) k++;
    const u = ms[k] > ms[k - 1] ? (m - ms[k - 1]) / (ms[k] - ms[k - 1]) : 0;
    out.push({ lon: f.xy[k - 1][0] + (f.xy[k][0] - f.xy[k - 1][0]) * u, lat: f.xy[k - 1][1] + (f.xy[k][1] - f.xy[k - 1][1]) * u, t: day0 + m * 60_000 });
  }
  return out;
}

/** The hour's ``max`` planes where the choice matters most (the gap between the best and the
 *  worst of the three moves: a wrong call is costly), each with what climbing or descending
 *  2,000 ft would do, and STRATUM's pick (the best net, or leave it). */
export function gamePlanes(flights: SkyFlight[], day0: number, w0: number, w1: number, sample: Sample, max = 12): GamePlane[] {
  const out: GamePlane[] = [];
  for (const f of flights) {
    const path = minutePath(f, day0, w0, w1);
    if (path.length < 30) continue;
    const up = levelChoice(path, f.fl, f.fl + 20, f.type ?? "", sample);
    const down = levelChoice(path, f.fl, f.fl - 20, f.type ?? "", sample);
    const n = (up ?? down)?.n ?? 0;
    if (n < 4) continue;
    const best: Move = Math.max(up?.net ?? 0, down?.net ?? 0) <= 0 ? "none" : (up?.net ?? -Infinity) >= (down?.net ?? -Infinity) ? "up" : "down";
    out.push({ f, path, n, up, down, best });
  }
  const stake = (p: GamePlane) => {
    const v = [p.up?.net ?? -Infinity, p.down?.net ?? -Infinity, 0].filter(Number.isFinite);
    return Math.max(...v) - Math.min(...v);
  };
  // a mix of right answers (descend, climb, leave it), the highest stakes of each in turn, so
  // that no single rule ("descend everyone") wins
  const groups = (["down", "up", "none"] as Move[]).map((m) => out.filter((p) => p.best === m).sort((a, b) => stake(b) - stake(a)));
  const pick: GamePlane[] = [];
  for (let i = 0; pick.length < max && groups.some((g) => i < g.length); i++) for (const g of groups) if (i < g.length && pick.length < max) pick.push(g[i]);
  return pick;
}

/** The scene for a set of choices: each moved plane's level changes, and its lasting contrails,
 *  drawn from the same minutes, do not form where the new level is dry. */
export function applyMoves(planes: GamePlane[], choice: Record<string, Move>, day0: number): { moves: Map<string, SkyMove[]>; contrails: SkyContrail[] } {
  const minute = (t: number) => (t - day0) / 60_000;
  const moves = new Map<string, SkyMove[]>();
  const contrails: SkyContrail[] = [];
  for (const p of planes) {
    const c = choice[p.f.id] ?? "none";
    const opt = c === "up" ? p.up : c === "down" ? p.down : null;
    const any = p.up ?? p.down!;
    if (opt) moves.set(p.f.id, opt.spans.map(([a, b]) => ({ t0: minute(p.path[a].t), t1: minute(p.path[b - 1].t), dFl: c === "up" ? 20 : -20 })));
    const inSpan = (i: number) => !!opt && opt.spans.some(([a, b]) => i >= a && i < b);
    for (let i = 0; i < any.lasting.length; i++) {
      if (!any.lasting[i]) continue;
      let j = i;
      while (j + 1 < any.lasting.length && any.lasting[j + 1] && j + 1 - i < 8) j++;
      const k = Math.min(j + 1, p.path.length - 1);
      contrails.push({ flight: p.f.id, a: [p.path[i].lon, p.path[i].lat], b: [p.path[k].lon, p.path[k].lat], fl: p.f.fl, t0: minute(p.path[i].t), t1: minute(p.path[k].t), lifeMin: LIFE_H.p50 * 60, moved: inSpan(i) && (opt?.left ?? 1) < any.n });
      i = j;
    }
  }
  return { moves, contrails };
}

/** The score of a set of choices: warming avoided net of fuel (kg CO₂e, central), extra fuel (kg). */
export function score(planes: GamePlane[], choice: Record<string, Move>) {
  let net = 0;
  let fuel = 0;
  let moved = 0;
  for (const p of planes) {
    const c = choice[p.f.id] ?? "none";
    const opt = c === "up" ? p.up : c === "down" ? p.down : null;
    if (!opt) continue;
    net += opt.net;
    fuel += opt.fuelKg;
    moved++;
  }
  return { net, fuel, moved };
}
