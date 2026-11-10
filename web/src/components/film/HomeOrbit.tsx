// The Home film on the orbital stage (three/orbit.ts): the opening shot and all nine scenes are
// one camera move over one Earth, driven by the scroll position. This file is the "director":
// where the camera is at each moment, what the clock and the sun say, which layers are lit, and
// the instrument read-outs laid over the picture. The picture itself never invents anything:
// flights, lasting contrails, the satellite's position and the sun are all real.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ContrailEvent } from "../../data/contract";

import type { OrbitHandle, OrbitInput, OrbitState } from "../../three/orbit";
import { type Flight, PROOF_DAY, type StoryDay } from "./data";
import { type Box, cropGeo, type H1, H1Panel, layout, SatPanel, slotAt, type Stats, useSize } from "./HomeFilm";
import { clamp, easeIo, easeOut, type Frame, lerp, nf, Num, seg } from "./kit";

type OrbitModule = typeof import("../../three/orbit");
type Cam = { lon: number; lat: number; dist: number; pitch: number; bearing: number };
type Env = { w: number; h: number; box: Box; geo: { lon: number; lat: number; span: number }; date: string };
type V3 = [number, number, number];

const RAD = Math.PI / 180;
const FOV_K = 2 * Math.tan(17 * RAD); // the stage camera's vertical field of view is 34°
const two = (n: number) => String(Math.floor(n)).padStart(2, "0");
const hhmm = (min: number) => `${two((min / 60) % 24)}:${two(min % 60)}`;

/** The film's timeline in scene units: −1…0 is the opening shot, k…k+1 is scene k. */
const uOf = (f: Frame) => (f.intro < 1 ? f.intro - 1 : f.p * f.n);

/** The camera's flight plan. Distances grow on narrow screens so the subject still fits. */
function flightPlan(env: Env): [number, Cam][] {
  const have = (env.box.w / env.w) * FOV_K * (env.w / env.h);
  const k = Math.max(1, 0.625 / have);
  const g = env.geo;
  const wide = env.w >= 900;
  const panel = Math.min(env.box.w * 0.82, env.box.h * 0.84);
  const dCrop = (g.span * RAD * env.h) / (FOV_K * panel);
  const C = (lon: number, lat: number, dist: number, pitch: number, bearing: number, fit = true): Cam => ({ lon, lat, dist: fit ? dist * k : dist, pitch, bearing });
  return [
    [-1, C(79, 18.5, 1.22, 56, -11)], // the opening shot: India under the limb, before dawn
    [-0.28, C(79.5, 20, 1.13, 50, -6)],
    [0.14, C(80.5, 21.5, 1.08, 18, 0)], // 1 · one day of flights
    [0.96, C(80.5, 21.5, 1.0, 25, -5)],
    [1.36, C(78.5, 9.8, 0.42, 36, 14)], // 2 · the lasting contrails, all in the south
    [1.96, C(78.5, 9.8, 0.37, 40, 8)],
    [2.4, C(78.5, 9.6, 0.33, 52, -14)], // 3 · the few
    [2.96, C(78.5, 9.6, 0.31, 55, -22)],
    [3.36, wide ? C(47.6, 1.4, 6.5, 0, 0, false) : C(46.3, 1.3, 7.1, 0, 0, false)], // 4 · out to Meteosat-9 …
    [3.56, wide ? C(47.9, 1.6, 6.42, 0, 0, false) : C(46.4, 1.4, 7.0, 0, 0, false)],
    [3.7, C(g.lon, g.lat, 2.3, 0, 0, false)], // … turn to Kerala while still far out …
    [3.97, C(g.lon, g.lat, dCrop, 0, 0, false)], // … and fall straight down
    [6.92, C(g.lon, g.lat, dCrop, 0, 0, false)], // 5–7 · the crop
    [7.32, C(79.5, 20, 1.5, 30, 6)], // 8 · the finding
    [7.96, C(79.5, 20, 1.42, 34, 2)],
    [8.4, C(73.6, 12.4, 0.2, 74, 58, false)], // 9 · dawn over the Arabian Sea
    [9, C(73.9, 12.2, 0.17, 76, 50, false)],
  ];
}

function camAt(u: number, plan: [number, Cam][]): Cam {
  if (u <= plan[0][0]) return plan[0][1];
  for (let i = 1; i < plan.length; i++)
    if (u <= plan[i][0]) {
      const [u0, a] = plan[i - 1], [u1, b] = plan[i];
      const t = easeIo((u - u0) / Math.max(1e-6, u1 - u0));
      return {
        lon: lerp(a.lon, b.lon, t),
        lat: lerp(a.lat, b.lat, t),
        dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)),
        pitch: lerp(a.pitch, b.pitch, t),
        bearing: lerp(a.bearing, b.bearing, t),
      };
    }
  return plan[plan.length - 1][1];
}

const nlerp = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The opening shot plays an evening over India on a loop (15:00 → 22:00 UTC). */
function heroTime(time: number) {
  const ph = (time * 3.2) % 420;
  return { clock: 900 + ph, fade: Math.min(seg(ph, 0, 10), 1 - seg(ph, 408, 420)) };
}

/** Everything the stage draws at one moment of the film. */
function stateOf(f: Frame, time: number, env: Env, sunDir: OrbitModule["sunDir"], ev: ContrailEvent | null): OrbitState {
  const { p, n, intro } = f;
  const u = uOf(f);
  const S = (k: number, a = 0, b = 1) => seg(p, (k + a) / n, (k + b) / n);
  const cam = camAt(u, flightPlan(env));
  const hero = heroTime(time);
  const dayClock = 1440 * easeIo(S(0, 0.06, 0.9));
  const inHero = intro < 1;

  // the sun: the real one for the minute shown (and, over the crop, for the image's own morning)
  let sun: V3;
  if (inHero) sun = sunDir(env.date, lerp(hero.clock, 1440, easeIo(seg(intro, 0.5, 1))));
  else if (u < 1) sun = sunDir(env.date, dayClock);
  else if (u < 3) sun = sunDir(env.date, 1440 + 35 * seg(u, 1, 3));
  else if (u < 8) {
    const frame = ev ? seg(p, (6 + 0.42) / n, (6 + 0.95) / n) * (ev.slots.length - 1) : 0;
    const t = easeIo(seg(u, 3.08, 3.5)) * (1 - easeIo(seg(u, 6.95, 7.3)));
    sun = nlerp(sunDir(env.date, 1475), sunDir(PROOF_DAY, 45 + 15 * frame), t);
  } else sun = sunDir(env.date, 1475 + 62 * seg(u, 8, 9));

  // composition: the subject sits in the picture box, right of (or above) the words
  const wide = env.w >= 900;
  const bx = env.box.x + env.box.w / 2 - env.w / 2, by = env.box.y + env.box.h / 2 - env.h / 2;
  const hx = wide ? env.w * 0.19 : 0, hy = wide ? -env.h * 0.17 : -env.h * 0.2;
  const k = easeIo(seg(intro, 0.45, 1));

  const out3 = 1 - S(3, 0.04, 0.3);
  return {
    ...cam,
    ox: lerp(hx, bx, k),
    oy: lerp(hy, by, k) + (u > 8 ? env.h * 0.1 * seg(u, 8, 8.5) : 0),
    clock: inHero ? hero.clock : u < 1 ? dayClock : 1440,
    sun,
    trails: inHero ? hero.fade * (1 - seg(intro, 0.8, 0.96)) : u < 1 ? seg(S(0), 0, 0.07) : u < 3 ? lerp(1, 0.5, seg(u, 1, 1.4)) : u < 7 ? 0.5 * out3 : u < 8 ? 0.3 * S(7, 0.1, 0.4) : 0.3 * (1 - S(8, 0, 0.25)),
    memory: inHero ? 38 : 75,
    residual: inHero ? 0.035 : 0.17,
    heads: inHero ? hero.fade * (1 - seg(intro, 0.8, 0.96)) : u < 1 ? seg(S(0), 0, 0.07) * (1 - seg(dayClock, 1425, 1440)) : 0,
    flagged: inHero ? 0.9 * hero.fade * (1 - seg(intro, 0.8, 0.96)) : u < 3 ? 1 : u < 7 ? out3 : u < 8 ? 0.45 * S(7, 0.1, 0.4) : 0.45 * (1 - S(8, 0, 0.25)),
    all: inHero || u < 1 ? 0 : easeOut(seg(u, 1.04, 1.5)),
    top: u < 2 ? 0 : u < 7 ? S(2, 0.05, 0.6) : 1,
    sat: S(3, 0.16, 0.3) * (1 - S(3, 0.6, 0.76)),
    aim: [env.geo.lon, env.geo.lat],
    dim: u < 3.9 ? 0 : u < 7 ? 0.32 * seg(u, 3.9, 4.1) : u < 8 ? lerp(0.32, 0.8, S(7, 0, 0.3)) : lerp(0.8, 0.08, S(8, 0, 0.35)),
    dawn: u < 8 ? 0 : S(8, 0.04, 0.22),
    dawnT: easeIo(S(8, 0.08, 0.86)),
    time,
  };
}

const inAir = (flights: Flight[], t: number) => {
  let c = 0;
  for (const fl of flights) if (fl.m[0] <= t && fl.m[fl.m.length - 1] > t) c++;
  return c;
};

export function Stage3D({
  f,
  orbit,
  input,
  day,
  st,
  ev,
  h1,
  ratio,
  onFail,
}: {
  f: Frame;
  orbit: OrbitModule | null;
  input: OrbitInput | null;
  day: StoryDay | null;
  st: Stats | null;
  ev: ContrailEvent | null;
  h1: H1 | null;
  ratio?: number;
  onFail: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<OrbitHandle | null>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const time = useRef(0);
  const latest = useRef<{ f: Frame; env: Env } | null>(null);
  const [ready, setReady] = useState(false);
  const [W, H] = useSize(wrap);
  const geo = useMemo(() => (ev ? cropGeo(ev) : { lon: 76.6, lat: 9.9, span: 3.4 }), [ev]);

  // build the scene once its code and the day's data are both in
  useEffect(() => {
    if (!orbit || !input || !canvas.current || handle.current) return;
    try {
      handle.current = orbit.createOrbit(canvas.current, input);
      setReady(true);
    } catch {
      onFail();
    }
  }, [orbit, input]);
  useEffect(
    () => () => {
      handle.current?.dispose();
      handle.current = null;
    },
    [],
  );
  useEffect(() => handle.current?.resize(), [W, H, ready]);

  const w = W || 1280, h = H || 720;
  const box = layout(w, h, f.still);
  const env: Env = { w, h, box, geo, date: input?.date ?? "2026-01-01" };
  latest.current = { f, env };
  const { p, n, intro } = f;
  const u = uOf(f);
  const S = (k: number, a = 0, b = 1) => seg(p, (k + a) / n, (k + b) / n);

  // draw in step with the captions, so the read-outs below sit exactly on the picture
  const state = orbit ? stateOf(f, time.current, env, orbit.sunDir, ev) : null;
  const eng = ready ? handle.current : null;
  if (state && eng) eng.render(state);

  // between scroll frames the opening shot keeps flying and the satellite keeps turning
  useEffect(() => {
    if (!ready || !orbit) return;
    let raf = 0, last = performance.now(), visible = true, wrote = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (wrap.current) io.observe(wrap.current);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = latest.current;
      if (!visible || document.hidden || !L || !handle.current) return;
      time.current += dt;
      const uu = uOf(L.f);
      if (!(uu < 0.02 || (uu > 3.1 && uu < 3.85))) return;
      const s = stateOf(L.f, time.current, L.env, orbit.sunDir, ev);
      handle.current.render(s);
      if (readout.current && day && now - wrote > 300) {
        wrote = now;
        readout.current.textContent = `${hhmm(s.clock)} UTC · ${`${nf(inAir(day.flights, s.clock))} airliners in the air`}`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [ready, orbit, day, ev]);

  // read-outs laid over the picture
  const dayClock = 1440 * easeIo(S(0, 0.06, 0.9));
  const clock = hhmm(Math.min(dayClock, 1439));
  const airborne = day ? day.flights.filter((fl) => fl.m[0] <= dayClock).length : 0;
  const flagT = S(1, 0.05, 0.55);
  let rect: { x: number; y: number; size: number } | null = null;
  let satXY: { x: number; y: number; front: boolean } | null = null;
  if (eng && u > 2.9 && u < 7.6) {
    const c = eng.project(geo.lon, geo.lat);
    const e = eng.project(geo.lon + geo.span / 2, geo.lat);
    const half = Math.max(9, Math.abs(e.x - c.x));
    if (c.front) rect = { x: c.x - half, y: c.y - half, size: half * 2 };
    if (state && state.sat > 0.01) satXY = eng.projectSat();
  }
  const panelO = S(3, 0.86, 0.99) * (1 - S(7, 0, 0.2));
  const reticleO = S(3, 0.3, 0.42) * (1 - S(3, 0.9, 1));

  return (
    <div ref={wrap} class={`hf hf-3d ${ready ? "ready" : ""}`}>
      <div class="hf-poster" aria-hidden="true" />
      <canvas ref={canvas} class="hf-gl" role="img" aria-label={"The Earth from orbit with the real flights of 1 January 2026 over India"} />
      <div class="hf-grain" aria-hidden="true" />

      {intro < 1 && (
        <div class="hf-live mono-s" style={{ opacity: (ready ? 1 : 0) * (1 - seg(intro, 0.25, 0.6)) }}>
          <i class="dot" aria-hidden="true" />
          <b>{"Replay · 1 Jan 2026"}</b>
          <span ref={readout} />
          <em>{"real ADS-B tracks"}</em>
        </div>
      )}

      <div class="hf-hud mono-s" style={{ left: `${box.x + 18}px`, top: `${box.y + 18}px`, opacity: (intro < 1 ? 0 : S(0, 0, 0.08)) * (1 - S(2, 0.7, 1)) }}>
        <b>{clock}</b> UTC · {nf(airborne)} {"flights"}
        {flagT > 0 && st && (
          <span class="hf-hud-o">
            {" "}
            · <Num to={st.flaggedFlights} t={flagT} /> {"with a lasting contrail"}
          </span>
        )}
      </div>

      {st && S(2) > 0 && S(3, 0, 0.3) < 1 && <FewBars st={st} t={S(2, 0.05, 0.6)} box={box} stageH={h} opacity={S(2, 0, 0.12) * (1 - S(3, 0, 0.25))} />}

      {satXY && satXY.front && state && (
        <div class="hf-satlabel mono-s" style={{ left: `${satXY.x}px`, top: `${satXY.y}px`, opacity: state.sat }}>
          <b>METEOSAT-9</b>
          <span>45.5°E · {"36,000 km up"}</span>
          <em>{"drawn far too big to be seen"}</em>
        </div>
      )}

      {rect && reticleO > 0.01 && (
        <div class="hf-reticle" style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.size}px`, height: `${rect.size}px`, opacity: reticleO }}>
          <i class="hf-corner tl" />
          <i class="hf-corner tr" />
          <i class="hf-corner bl" />
          <i class="hf-corner br" />
          <span class="mono-s">{ev?.callsign ?? "ALK266"} · 1 Nov 2025 · 00:45 UTC</span>
        </div>
      )}

      {ev && rect && panelO > 0.001 && <SatPanel ev={ev} f={f} rect={rect} opacity={panelO} />}
      {ev && rect && panelO > 0.5 && S(6, 0.42, 1) > 0 && S(7) <= 0 && (
        <div class="hf-dawn mono-s" style={{ left: `${rect.x}px`, top: `${rect.y + rect.size + 12}px`, width: `${rect.size}px` }}>
          {`Frame ${slotAt(ev, f) + 1} of ${ev.slots.length} · the sun is rising over Kerala`}
        </div>
      )}
      {h1 && S(7) > 0 && <H1Panel h1={h1} ratio={ratio} f={f} box={box} />}
      {eng && state && state.dawn > 0.01 && (
        <>
          {([0, 1] as const).map((i) => {
            const at = eng.projectDawn(i);
            if (!at.front) return null;
            return (
              <div class={`hf-dawnlab ${i ? "b" : "a"}`} style={{ left: `${at.x}px`, top: `${at.y}px`, opacity: state.dawn * S(8, 0.2, 0.4) }}>
                <b>{i ? "2,000 ft higher · FL380" : "As planned · FL360, in the humid layer"}</b>
                <span>{i ? "the trail is gone in seconds" : "the contrail spreads and lasts for hours"}</span>
              </div>
            );
          })}
          <p class="hf-illus mono-s" style={{ left: `${box.x + 18}px`, top: `${box.y + box.h - 14}px`, opacity: state.dawn }}>
            Illustration · two flights on one route at dawn · neither flew
          </p>
        </>
      )}
    </div>
  );
}

/** Scene 3: every lasting-contrail stretch of the day ranked by its energy forcing. */
function FewBars({ st, t, box, stageH, opacity }: { st: Stats; t: number; box: Box; stageH: number; opacity: number }) {
  const m = st.ranked.length;
  const max = st.ranked[0]?.ef_J ?? 1;
  const Wv = 600, Hv = 110;
  const narrow = box.w < 560;
  return (
    <div class="hf-few" style={{ left: `${box.x + box.w * 0.06}px`, width: `${box.w * 0.88}px`, top: `${Math.min(stageH - 196, box.y + box.h - 176)}px`, opacity }}>
      <p class="mono-s">
        {narrow
          ? `${m} stretches · largest first`
          : `${m} lasting-contrail stretches · energy forcing, largest first`}
      </p>
      <svg viewBox={`0 0 ${Wv} ${Hv}`} preserveAspectRatio="none" role="img" aria-label={`${st.k80} of ${m} flights make 80 % of the day's contrail warming`}>
        {st.ranked.map((s, i) => {
          const g = easeOut(clamp(t * 1.6 - (i / m) * 0.6));
          const hh = Math.max(0.6, ((s.ef_J ?? 0) / max) * Hv * g);
          return <rect x={(i * Wv) / m} y={Hv - hh} width={Math.max(0.6, (Wv / m) * 0.74)} height={hh} class={i < st.k80 ? "top" : ""} />;
        })}
      </svg>
      <p class="mono-s red">{`red: ${st.k80} flights = 80 % of the warming`}</p>
    </div>
  );
}
