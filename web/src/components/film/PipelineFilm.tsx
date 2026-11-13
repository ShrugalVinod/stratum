// How it works: the whole pipeline, following one real flight. Qatar Airways QTR959 on 1 Jan 2026
// is one of that day's alerts, so the build carries everything about it: its track and minute
// stamps, the ERA5 profile above and below it, its raw-ERA5 CoCiP stretch, and the decision
// layer's alternatives. The satellite stage uses ALK266 (a confirmed contrail) and says so.
import { useEffect, useMemo, useState } from "preact/hooks";
import { detectorCheck as DC, secondAnalysis as SA } from "../../content/site";
import type { ContrailEvent } from "../../data/contract";
import { contrailImg } from "../../data/load";
import { useLang } from "../../i18n";
import { eIce, eWater, isaPressure, sac } from "../../lib/sac";
import { at, type Flight, type Land, loadLand, loadProof, loadStoryDay, PROOF_DAY, type Seg, type StoryDay } from "./data";
import { Line, Morph, Segs } from "./HomeFilm";
import { clamp, easeIo, easeOut, Film, type Frame, lerp, nf, Num, type Scene, seg } from "./kit";

const CS = "QTR959";
const ETA = 0.35; // overall propulsion efficiency used for the illustration (the sandbox default)
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const sci = (v: number) => {
  if (!v) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  const sup = String(e)
    .split("")
    .map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c] ?? c)
    .join("");
  return `${(v / 10 ** e).toFixed(1)} × 10${sup}`;
};

/** ERA5 profile at a flight level: linear in ln p between the bracketing levels (as pre-registered). */
function interp(prof: NonNullable<Seg["profile"]>, fl: number) {
  const p = isaPressure(fl) / 100;
  const P = prof.pressure_hpa;
  for (let i = 1; i < P.length; i++)
    if (p <= P[i] && p >= P[i - 1]) {
      const w = (Math.log(p) - Math.log(P[i - 1])) / (Math.log(P[i]) - Math.log(P[i - 1]));
      const f = (a: (number | null)[]) => (a[i - 1] ?? 0) + ((a[i] ?? 0) - (a[i - 1] ?? 0)) * w;
      return { p, T: f(prof.temperature_k), rhi: f(prof.rhi_raw), rhiS: f(prof.rhi_stratum) };
    }
  return null;
}

export function PipelineFilm({ skipTo }: { skipTo: string }) {
  useLang();
  const [day, setDay] = useState<StoryDay | null>(null);
  const [land, setLand] = useState<Land | null>(null);
  const [ev, setEv] = useState<ContrailEvent | null>(null);
  useEffect(() => {
    loadStoryDay().then(setDay).catch(() => {});
    loadLand().then(setLand).catch(() => {});
    loadProof().then(setEv).catch(() => {});
  }, []);
  const d = useMemo(() => {
    if (!day) return null;
    const fl = day.flights.find((f) => f.cs === CS);
    const b1 = day.b1.find((s) => s.callsign === CS);
    const st = day.stratum.find((s) => s.callsign === CS);
    if (!fl || !st?.profile) return null;
    const air = interp(st.profile, st.fl);
    const s = air ? sac(air.T, air.rhi, air.p * 100, ETA) : null;
    return { fl, b1, st, air, sac: s };
  }, [day]);

  const air = d?.air;
  const Tc = air ? `${(air.T - 273.15).toFixed(1)} °C` : "…";
  const RH = air ? `${Math.round(air.rhi * 100)} %` : "…";
  const mins = d ? Math.round(d.fl.m[d.fl.m.length - 1] - d.fl.m[0]) : 63;
  const age = d?.b1?.contrail_age_h != null ? d.b1.contrail_age_h.toFixed(1) : "…";
  const ef = d?.b1?.ef_J != null ? `${sci(d.b1.ef_J)} J` : "…";
  const alt = d?.st.alternatives?.find((a) => a.fl === d.st.best_alternative_fl);
  const save = alt?.extra_fuel_kg != null ? Math.round(-alt.extra_fuel_kg) : 16;

  const scenes: Scene[] = [
    {
      k: "01 · ADSB · flight tracks",
      t: `Follow one real flight: Qatar Airways ${CS}.`,
      b: `1 January 2026, ${d ? hhmm(d.fl.m[0]) : "05:24"} UTC: an A350 at FL400, over Sri Lanka and the tip of India and out over the Arabian Sea. Its position reports are cleaned and cut into ${mins} one-minute cruise segments.`,
    },
    {
      k: "02 · ERA5 · weather",
      t: "What was the air like up there?",
      b: `ERA5 gives temperature and humidity on 12 pressure levels. Interpolated to the aircraft's height, the air at FL400 was ${Tc}, with ${RH} relative humidity over ice: ice-supersaturated.`,
    },
    {
      k: "03 · SAC · Schmidt–Appleman",
      t: "Will a contrail form? Will it last?",
      b: "Hot, wet exhaust mixes with the cold air along a straight line. If that line crosses water saturation, droplets form and freeze: a contrail. If the air is also above ice saturation, it does not evaporate.",
    },
    {
      k: "04 · CoCiP · contrail model",
      t: "How long will it live, and how much will it warm?",
      b: `CoCiP follows the contrail as it spreads and drifts. Raw-ERA5 physics gives this stretch a ${age}-hour life and ${ef} of energy forcing. For decisions it is rerun 100 times with different humidity, model and climate-metric assumptions.`,
    },
    {
      k: "05 · SAT · satellite check",
      t: "Did a contrail actually appear?",
      b: `${CS}'s stretch was not caught on camera, so here is one that was: ALK266, 1 Nov 2025. Wind drift and parallax place the prediction; a match needs two images; a wrong-day test measures how often matches happen by chance.`,
    },
    {
      k: "06 · CORR · learned correction",
      t: "Learn where the physics is wrong.",
      b: "Gradient-boosted trees learn from the satellite labels: trained west of 80°E, tested east of it, one season held out at a time. They rank which flights make a visible contrail far better than physics rules.",
    },
    {
      k: "07 · DEC · decision",
      t: "Climb 2,000 ft. Save fuel. Lose the cloud.",
      b: `STRATUM tries ±2,000 and ±4,000 ft, adds the fuel and CO₂, and reruns the physics 100 times. Only FL${d?.st.best_alternative_fl ?? 420} keeps its cautious (5th-percentile) estimate above zero, partly because the higher level burns ${save} kg less fuel. Alert.`,
    },
  ];

  const extra = (
    <div class="film-cta">
      <a class="btn primary" href={`/flight`}>
        {"Check your own flight"} →
      </a>
      <a class="btn" href="/sandbox">
        {"Make a contrail"}
      </a>
    </div>
  );

  return (
    <Film id="pipeline-film" label={"One flight through the pipeline"} scenes={scenes} vh={135} skipTo={skipTo} extra={extra}>
      {(f) => <Stage f={f} d={d} land={land} ev={ev} />}
    </Film>
  );
}

type D = { fl: Flight; b1?: Seg; st: Seg; air: ReturnType<typeof interp>; sac: ReturnType<typeof sac> | null } | null;

function Stage({ f, d, land, ev }: { f: Frame; d: D; land: Land | null; ev: ContrailEvent | null }) {
  const { p, n } = f;
  const pres = (k: number) => {
    const a = k === 0 ? 1 : seg(p, (k - 0.04) / n, (k + 0.1) / n);
    const b = k === n - 1 ? 1 : 1 - seg(p, (k + 0.9) / n, (k + 1.02) / n);
    return Math.min(a, b);
  };
  const lt = (k: number) => seg(p, (k + 0.04) / n, (k + 0.84) / n);
  const panel = (k: number, node: any) => {
    const o = pres(k);
    if (o <= 0.001) return null;
    return (
      <div class="pf-panel" style={{ opacity: o, transform: `translate3d(0, ${((1 - o) * 26).toFixed(1)}px, 0) scale(${lerp(0.97, 1, o)})` }}>
        {node}
      </div>
    );
  };
  return (
    <div class="pf">
      <div class="pf-sky" aria-hidden="true" />
      <div class="pf-box">
        {panel(0, <Adsb t={lt(0)} d={d} land={land} />)}
        {panel(1, <Era5 t={lt(1)} d={d} />)}
        {panel(2, <SacPanel t={lt(2)} d={d} />)}
        {panel(3, <Cocip t={lt(3)} d={d} />)}
        {panel(4, <Sat t={lt(4)} ev={ev} />)}
        {panel(5, <Corr t={lt(5)} land={land} />)}
        {panel(6, <Dec t={lt(6)} d={d} />)}
      </div>
    </div>
  );
}

/* ── 01 ADS-B ─────────────────────────────────────────────── */
function Adsb({ t, d, land }: { t: number; d: D; land: Land | null }) {
  const W = 640, H = 440;
  const k = Math.min(W / 10.4, H / 7.4);
  const X = (lon: number) => W / 2 + (lon - 77.3) * k;
  const Y = (lat: number) => H / 2 - (lat - 8.8) * k * 1.01;
  if (!d) return <Loading />;
  const fl = d.fl;
  const pingT = seg(t, 0.02, 0.38);
  const lineT = seg(t, 0.36, 0.56);
  const tickT = seg(t, 0.55, 0.95);
  const m0 = fl.m[0], m1 = fl.m[fl.m.length - 1];
  const shown = Math.floor(pingT * fl.m.length + 0.0001);
  const nowM = lerp(m0, m1, tickT);
  const plane = at(fl, nowM);
  const ticks = Array.from({ length: m1 - m0 + 1 }, (_, i) => at(fl, m0 + i));
  const nTicks = Math.floor(tickT * ticks.length);
  const path = Array.from(fl.lon)
    .map((lo, i) => `${i ? "L" : "M"}${X(lo).toFixed(1)},${Y(fl.lat[i]).toFixed(1)}`)
    .join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={`Track of ${CS} with its position reports and one-minute segments`}>
      <defs>
        <clipPath id="pf-clip-a">
          <rect width={W} height={H} rx="6" />
        </clipPath>
      </defs>
      <g clip-path="url(#pf-clip-a)">
        <rect width={W} height={H} class="pf-ocean" />
        {land?.map((c) =>
          c.rings.map((r) => <path d={r.map(([lo, la], i) => `${i ? "L" : "M"}${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join("") + "Z"} class={c.iso === "IND" ? "pf-land in" : "pf-land"} />),
        )}
        {[74, 76, 78, 80, 82].map((lo) => (
          <line x1={X(lo)} x2={X(lo)} y1="0" y2={H} class="pf-grat" />
        ))}
        {[6, 8, 10, 12].map((la) => (
          <line y1={Y(la)} y2={Y(la)} x1="0" x2={W} class="pf-grat" />
        ))}
        <path d={path} class="pf-trk" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - lineT }} />
        {ticks.slice(0, nTicks).map((q) => (q ? <circle cx={X(q[0])} cy={Y(q[1])} r="1.7" class="pf-tick" /> : null))}
        {Array.from(fl.lon).map((lo, i) =>
          i < shown ? (
            <g class="pf-ping" style={{ animationDelay: "0s" }}>
              <circle cx={X(lo)} cy={Y(fl.lat[i])} r={lerp(14, 4, clamp(pingT * fl.m.length - i))} class="pf-ping-ring" style={{ opacity: 1 - clamp(pingT * fl.m.length - i) * 0.7 }} />
              <circle cx={X(lo)} cy={Y(fl.lat[i])} r="3.6" class="pf-ping-dot" />
              <text x={X(lo) + 8} y={Y(fl.lat[i]) - 8} class="pf-lab">
                {hhmm(fl.m[i])}
              </text>
            </g>
          ) : null,
        )}
        {plane && tickT > 0 && tickT < 1 && <circle cx={X(plane[0])} cy={Y(plane[1])} r="6" class="pf-plane" />}
      </g>
      <g class="pf-chip-g" transform="translate(16 18)">
        <text class="pf-chip-t">
          {CS} · A350-900 · FL{d.st.fl}
        </text>
        <text y="20" class="pf-lab">
          {"cruise ≥ FL250 · data box 4–39°N, 66–100°E · scored 6–37°N, 68–98°E · commercial only"}
        </text>
      </g>
      <g transform={`translate(${W - 16} ${H - 22})`} style={{ opacity: tickT }}>
        <text text-anchor="end" class="pf-count">
          <Num to={m1 - m0} t={tickT} /> {"one-minute segments"}
        </text>
      </g>
    </svg>
  );
}

/* ── 02 ERA5 profile ─────────────────────────────────────── */
function Era5({ t, d }: { t: number; d: D }) {
  if (!d?.st.profile || !d.air) return <Loading />;
  const pr = d.st.profile;
  const W = 640, H = 440;
  const y = (fl: number) => lerp(400, 36, (fl - 170) / (545 - 170));
  const bx = 92, bw = 300, rx = (v: number) => bx + (v / 1.3) * bw;
  const tx0 = 440, tw = 180, Tx = (k: number) => tx0 + ((k - 185) / (275 - 185)) * tw;
  const lineT = seg(t, 0.45, 0.8);
  const tPath = pr.fl
    .map((fl, i) => (pr.temperature_k[i] == null ? "" : `${i ? "L" : "M"}${Tx(pr.temperature_k[i]!).toFixed(1)},${y(fl).toFixed(1)}`))
    .join("");
  const planeT = seg(t, 0.6, 0.95);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={"ERA5 humidity and temperature above and below the flight"}>
      <text x={bx} y="22" class="pf-ax-t">
        {"Relative humidity over ice (ERA5)"}
      </text>
      <text x={tx0} y="22" class="pf-ax-t">
        {"Temperature"}
      </text>
      <rect x={rx(1)} y="30" width={rx(1.3) - rx(1)} height="376" class="pf-iss" />
      <line x1={rx(1)} x2={rx(1)} y1="30" y2="406" class="pf-ref" />
      <text x={rx(1) + 4} y="420" class="pf-lab">
        100 %
      </text>
      <text x={rx(0)} y="420" class="pf-lab">
        0
      </text>
      {pr.fl.map((fl, i) => {
        const v = pr.rhi_raw[i] ?? 0;
        const g = easeOut(clamp(t * 1.8 - (pr.fl.length - 1 - i) * 0.06));
        return (
          <g>
            <text x={bx - 8} y={y(fl) + 4} text-anchor="end" class="pf-lab">
              {pr.pressure_hpa[i]} hPa
            </text>
            <rect x={bx} y={y(fl) - 6} width={Math.max(0, (rx(v) - bx) * g)} height="12" class={v >= 1 ? "pf-bar iss" : "pf-bar"} />
            <text x={bx + (rx(v) - bx) * g + 6} y={y(fl) + 4} class="pf-val" style={{ opacity: g }}>
              {Math.round(v * 100)}
            </text>
          </g>
        );
      })}
      <path d={tPath} class="pf-tline" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - lineT }} />
      {[200, 230, 260].map((k) => (
        <text x={Tx(k)} y="420" text-anchor="middle" class="pf-lab">
          {k - 273} °C
        </text>
      ))}
      <g style={{ opacity: planeT }}>
        <line x1="20" x2={W - 6} y1={y(d.st.fl)} y2={y(d.st.fl)} class="pf-fl" />
        <rect x={rx(d.air.rhi) - 6} y={y(d.st.fl) - 6} width="12" height="12" class="pf-mark" transform={`rotate(45 ${rx(d.air.rhi)} ${y(d.st.fl)})`} />
        <circle cx={Tx(d.air.T)} cy={y(d.st.fl)} r="5.5" class="pf-mark" />
        <g transform={`translate(${rx(d.air.rhi) + 14} ${y(d.st.fl) - 22})`}>
          <rect x="-6" y="-14" width="262" height="22" rx="3" class="pf-tip" />
          <text class="pf-tip-t">
            FL{d.st.fl} · {(d.air.T - 273.15).toFixed(1)} °C · RHi {Math.round(d.air.rhi * 100)} %
          </text>
        </g>
      </g>
    </svg>
  );
}

/* ── 03 Schmidt–Appleman ─────────────────────────────────── */
function SacPanel({ t, d }: { t: number; d: D }) {
  if (!d?.air || !d.sac) return <Loading />;
  const s = d.sac;
  const Ta = d.air.T, ea = s.e;
  const W = 640, H = 440, x0 = 70, x1 = 610, y0 = 390, y1 = 40;
  const T0 = 205, T1 = 240, E1 = 24;
  const X = (T: number) => x0 + ((T - T0) / (T1 - T0)) * (x1 - x0);
  const Y = (e: number) => y0 - (e / E1) * (y0 - y1);
  const curve = (fn: (T: number) => number) =>
    Array.from({ length: 71 }, (_, i) => T0 + (i / 70) * (T1 - T0))
      .filter((T) => fn(T) <= E1)
      .map((T, i) => `${i ? "L" : "M"}${X(T).toFixed(1)},${Y(fn(T)).toFixed(1)}`)
      .join("");
  const curveT = seg(t, 0.02, 0.3);
  const ptT = seg(t, 0.28, 0.4);
  const mixT = easeIo(seg(t, 0.4, 0.75));
  // mixing line from ambient towards hot exhaust, clipped at the top of the plot
  const Tend = Math.min(T1, Ta + (E1 - ea) / s.G);
  const Tm = lerp(Ta, Tend, mixT);
  const resT = seg(t, 0.72, 0.95);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={"Schmidt–Appleman diagram for this flight"}>
      <line x1={x0} x2={x1} y1={y0} y2={y0} class="pf-axis" />
      <line x1={x0} x2={x0} y1={y0} y2={y1} class="pf-axis" />
      {[210, 220, 230, 240].map((T) => (
        <text x={X(T)} y={y0 + 18} text-anchor="middle" class="pf-lab">
          {T - 273} °C
        </text>
      ))}
      {[0, 10, 20].map((e) => (
        <text x={x0 - 8} y={Y(e) + 4} text-anchor="end" class="pf-lab">
          {e}
        </text>
      ))}
      <text x={x0} y={y1 - 14} class="pf-ax-t">
        {"water vapour pressure (Pa)"}
      </text>
      <path d={curve(eWater)} class="pf-cw" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - curveT }} />
      <path d={curve(eIce)} class="pf-ci" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - curveT }} />
      <text x={X(226) - 8} y={Y(eWater(226)) - 6} class="pf-lab cw" style={{ opacity: curveT }} text-anchor="end">
        {"water saturation"}
      </text>
      <text x={X(231) + 8} y={Y(eIce(231)) + 14} class="pf-lab ci" style={{ opacity: curveT }}>
        {"ice saturation"}
      </text>
      {/* T_LC */}
      <g style={{ opacity: resT }}>
        <line x1={X(s.TLC)} x2={X(s.TLC)} y1={y0} y2={y1 + 20} class="pf-ref" />
        <text x={X(s.TLC) - 6} y={y1 + 32} text-anchor="end" class="pf-lab">
          T_LC {(s.TLC - 273.15).toFixed(1)} °C
        </text>
      </g>
      <line x1={X(Ta)} y1={Y(ea)} x2={X(Tm)} y2={Y(ea + s.G * (Tm - Ta))} class="pf-mix" />
      {mixT > 0.5 && (
        <text x={X(lerp(Ta, Tend, 0.42)) - 10} y={Y(ea + s.G * (lerp(Ta, Tend, 0.42) - Ta))} text-anchor="end" class="pf-lab mx" style={{ opacity: seg(mixT, 0.5, 0.8) }}>
          {"exhaust mixing with ambient air"}
        </text>
      )}
      <circle cx={X(Ta)} cy={Y(ea)} r={lerp(0, 7, easeOut(ptT))} class="pf-amb" />
      <text x={X(Ta)} y={Y(ea) + 26} text-anchor="middle" class="pf-lab big" style={{ opacity: ptT }}>
        {"air at FL400"}
      </text>
      <g transform={`translate(${x1 - 210} ${y0 - 64})`} style={{ opacity: resT }}>
        <rect x="-12" y="-22" width="222" height="58" rx="4" class="pf-tip" />
        <text class={`pf-res ${s.forms ? "ok" : "no"}`}>
          {s.forms ? "✓" : "✗"} {"forms: T ≤ T_LC"}
        </text>
        <text y="24" class={`pf-res ${s.persists ? "ok" : "no"}`}>
          {s.persists ? "✓" : "✗"} {"lasts: RHi ≥ 100 %"}
        </text>
      </g>
      <text x={x1} y={H - 6} text-anchor="end" class="pf-note">
        {`same code as /sandbox · propulsion efficiency ${ETA} for illustration`}
      </text>
    </svg>
  );
}

/* ── 04 CoCiP ─────────────────────────────────────────────── */
function Cocip({ t, d }: { t: number; d: D }) {
  const b1 = d?.b1;
  if (!b1 || b1.contrail_age_h == null || b1.ef_J == null) return <Loading />;
  const life = b1.contrail_age_h;
  const W = 640, H = 440;
  const run = easeIo(seg(t, 0.05, 0.85));
  const hours = life * run;
  const xs = (h: number) => 70 + (h / life) * 500;
  const snaps = [0, 0.15, 0.35, 0.6, 0.85, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={"A contrail spreading over its lifetime"}>
      <defs>
        <radialGradient id="pf-plume">
          <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
          <stop offset="0.6" stop-color="#cfe6ff" stop-opacity="0.35" />
          <stop offset="1" stop-color="#cfe6ff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <text x="70" y="40" class="pf-ax-t">
        {"Contrail cross-section over its life (schematic)"}
      </text>
      <line x1="70" x2="570" y1="300" y2="300" class="pf-axis" />
      {snaps.map((q) =>
        q <= run + 0.001 ? (
          <ellipse cx={xs(q * life)} cy={190 + q * 34} rx={8 + q * 84} ry={5 + q * 26} fill="url(#pf-plume)" style={{ opacity: 1 - q * 0.4 }} />
        ) : null,
      )}
      {snaps.map((q) => (
        <text x={xs(q * life)} y="320" text-anchor="middle" class="pf-lab">
          {(q * life).toFixed(1)} h
        </text>
      ))}
      <line x1={xs(hours)} x2={xs(hours)} y1="80" y2="300" class="pf-now" />
      <g transform="translate(70 372)">
        <text class="pf-big-l">{"age"}</text>
        <text y="34" class="pf-big">
          {hours.toFixed(1)} h
        </text>
      </g>
      <g transform="translate(300 372)">
        <text class="pf-big-l">{"energy forcing (raw ERA5, central run)"}</text>
        <text y="34" class="pf-big o">
          {sci(b1.ef_J * run)} J
        </text>
      </g>
      <g transform="translate(70 70)" style={{ opacity: seg(t, 0.5, 0.75) }}>
        {["B1 raw", "B2 ÷0.95", "B3 latitude", "×100 Monte Carlo"].map((c, i) => (
          <g transform={`translate(${i * 128} 0)`}>
            <rect width="122" height="22" rx="11" class="pf-pill" />
            <text x="61" y="15" text-anchor="middle" class="pf-pill-t">
              {c}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ── 05 Satellite ─────────────────────────────────────────── */
function Sat({ t, ev }: { t: number; ev: ContrailEvent | null }) {
  if (!ev) return <Loading />;
  const n = ev.slots.length;
  const scrub = seg(t, 0.5, 0.75);
  const si = t < 0.5 ? 0 : Math.min(n - 1, Math.floor(scrub * n * 0.999));
  const s = ev.slots[si];
  const det = si > 0 ? 1 : seg(t, 0.05, 0.22);
  const drift = si > 0 ? 1 : easeIo(seg(t, 0.22, 0.45));
  const chance = seg(t, 0.75, 0.97);
  const seen = ev.slots.slice(0, si + 1).filter((x) => x.detected.some((q) => q.matched)).length;
  const rows = SA.map((a) => ({ name: a.labels, v: parseFloat(a.chance) }));
  return (
    <div class="pf-sat">
      <div class="pf-sat-img">
        {ev.slots.map((x, i) => (
          <img src={contrailImg(PROOF_DAY, x.img)} alt="" class="hf-img" style={{ opacity: i === si ? 1 : 0 }} />
        ))}
        <svg viewBox="0 0 96 96" preserveAspectRatio="none" role="img" aria-label={"Meteosat-9 crop with track, predicted contrail and detected line"}>
          <Segs segs={s.track} t={1} cls="hf-track" />
          <Morph from={s.track} to={s.drift} t={drift} cls="hf-drift" />
          {s.detected.map((q) => (
            <Line pts={q.pts} t={det} cls={q.matched ? "hf-det" : "hf-det off"} />
          ))}
        </svg>
        <div class="hf-sat-cap mono-s">
          <span>
            ALK266 · {s.t.slice(11, 16)} UTC · VZA {s.vza_deg?.toFixed(0)}°
          </span>
          <span>© EUMETSAT 2026</span>
        </div>
      </div>
      <div class="pf-sat-side">
        <ol class="pf-checks mono-s">
          <li class={det > 0.5 ? "on" : ""}>{"learned detector finds lines"}</li>
          <li class={drift > 0.5 ? "on" : ""}>{`wind drift ${Math.round(ev.slots[0].age_min)} min + parallax ${ev.slots[0].vza_deg?.toFixed(0)}°`}</li>
          <li class={seen >= 2 ? "on" : ""}>
            {"matched in ≥ 2 images"} · {seen}/{n}
          </li>
          <li class={chance > 0.2 ? "on" : ""}>{"wrong-day test: how much is chance?"}</li>
        </ol>
        <div class="pf-chance" style={{ opacity: chance }}>
          {rows.map((r, i) => (
            <div>
              <span class="mono-s">{r.name}</span>
              <i style={{ width: `${r.v * 2.2}%`, transform: `scaleX(${easeOut(clamp(chance * 1.6 - i * 0.25))})` }} class={i ? "c" : "o"} />
              <b class="mono-s">{r.v} %</b>
            </div>
          ))}
          <p class="mono-s">{`detector F1 on ${DC.scenes} expert scenes: 0.22 → 0.49`}</p>
        </div>
      </div>
    </div>
  );
}

/* ── 06 Correction ───────────────────────────────────────── */
function Corr({ t, land }: { t: number; land: Land | null }) {
  const W = 640, H = 440;
  const k = 7.2;
  const X = (lon: number) => 30 + (lon - 66) * k;
  const Y = (lat: number) => 60 + (37 - lat) * k * 1.03;
  const split = seg(t, 0.05, 0.35);
  const bars = seg(t, 0.4, 0.9);
  const india = land?.find((c) => c.iso === "IND");
  const ip = india?.rings.map((r) => r.map(([lo, la], i) => `${i ? "L" : "M"}${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join("") + "Z").join("");
  const ax = (v: number) => 330 + ((v - 0.4) / 0.5) * 280;
  const seasons = ["winter", "pre-monsoon", "monsoon", "post-monsoon"];
  const held = Math.min(3, Math.floor(seg(t, 0.1, 0.9) * 4));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={"Training and test split, and ranking skill"}>
      <defs>
        <clipPath id="pf-west">
          <rect x="0" y="0" width={X(80)} height={H} />
        </clipPath>
        <clipPath id="pf-east">
          <rect x={X(80)} y="0" width={W} height={H} />
        </clipPath>
      </defs>
      {ip && (
        <>
          <path d={ip} class="pf-land in" />
          <path d={ip} clip-path="url(#pf-west)" class="pf-west" style={{ opacity: split }} />
          <path d={ip} clip-path="url(#pf-east)" class="pf-east" style={{ opacity: split }} />
        </>
      )}
      <line x1={X(80)} x2={X(80)} y1="40" y2="330" class="pf-ref" style={{ opacity: split }} />
      <text x={X(80) - 6} y="52" text-anchor="end" class="pf-lab t" style={{ opacity: split }}>
        {"train"}
      </text>
      <text x={X(80) + 6} y="52" class="pf-lab o" style={{ opacity: split }}>
        {"test"} · 80°E
      </text>
      <g transform="translate(30 372)">
        {seasons.map((s, i) => (
          <g transform={`translate(${i * 70} 0)`}>
            <rect width="64" height="22" rx="11" class={`pf-pill ${i === held ? "hot" : ""}`} />
            <text x="32" y="15" text-anchor="middle" class="pf-pill-t">
              {s}
            </text>
          </g>
        ))}
        <text y="44" class="pf-lab">
          {"one season held out at a time"}
        </text>
      </g>
      <text x="330" y="80" class="pf-ax-t">
        {"Ranking skill on held-out seasons (AUROC)"}
      </text>
      <line x1={ax(0.5)} x2={ax(0.5)} y1="96" y2="250" class="pf-ref" />
      <text x={ax(0.5)} y="270" text-anchor="middle" class="pf-lab">
        0.5 {"= coin flip"}
      </text>
      {[0.4, 0.6, 0.8, 0.9].map((v) => (
        <text x={ax(v)} y="288" text-anchor="middle" class="pf-lab">
          {v.toFixed(1)}
        </text>
      ))}
      {(
        [
          ["physics rules (B1–B3)", 0.42, 0.66, "o"],
          ["STRATUM", 0.65, 0.83, "c"],
        ] as const
      ).map(([name, lo, hi, c], i) => {
        const g = easeOut(clamp(bars * 1.5 - i * 0.4));
        return (
          <g>
            <text x="330" y={130 + i * 70} class="pf-lab big">
              {name}
            </text>
            <rect x={ax(lo)} y={140 + i * 70} width={(ax(hi) - ax(lo)) * g} height="18" rx="9" class={`pf-rng ${c}`} />
            <text x={ax(lo) + (ax(hi) - ax(lo)) * g + 8} y={154 + i * 70} class="pf-val" style={{ opacity: g }}>
              {lo.toFixed(2)}–{hi.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── 07 Decision ─────────────────────────────────────────── */
function Dec({ t, d }: { t: number; d: D }) {
  const st = d?.st;
  if (!st?.alternatives) return <Loading />;
  const W = 640, H = 440;
  const lanes = [...st.alternatives.map((a) => a.fl), st.fl].sort((a, b) => b - a);
  const y = (fl: number) => 70 + (lanes.indexOf(fl) / (lanes.length - 1)) * 290;
  const sl = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 10);
  const ax = (v: number) => 330 + ((sl(v) - sl(-300)) / (sl(100000) - sl(-300))) * 290;
  const order = [...st.alternatives].sort((a, b) => Math.abs(a.delta_ft) - Math.abs(b.delta_ft) || b.delta_ft - a.delta_ft);
  const best = st.best_alternative_fl;
  const done = seg(t, 0.82, 0.98);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="pf-svg" role="img" aria-label={"Alternative flight levels with fuel and warming ranges"}>
      <text x="330" y="22" class="pf-ax-t">
        {"Warming avoided, 100 yr (kg CO₂e)"}
      </text>
      <text x="330" y="38" class="pf-lab">
        {"bar: 5th–95th percentile · dot: median"}
      </text>
      <line x1={ax(0)} x2={ax(0)} y1="48" y2="380" class="pf-ref" />
      {[-100, 0, 100, 1000, 10000].map((v) => (
        <text x={ax(v)} y="398" text-anchor="middle" class="pf-lab">
          {nf(v)}
        </text>
      ))}
      {lanes.map((fl) => (
        <g>
          <line x1="30" x2="300" y1={y(fl)} y2={y(fl)} class={fl === st.fl ? "pf-lane cur" : "pf-lane"} />
          <text x="30" y={y(fl) - 8} class={`pf-lab ${fl === best && done > 0 ? "g" : ""}`}>
            FL{fl} {fl === st.fl ? "· planned" : ""}
          </text>
        </g>
      ))}
      <circle cx="80" cy={y(st.fl)} r="7" class="pf-plane" />
      {order.map((a, i) => {
        const g = seg(t, 0.08 + i * 0.17, 0.25 + i * 0.17);
        if (g <= 0) return null;
        const r = a.net_100y;
        const ok = !!r && r[0] > 0 && !!a.net_20y && a.net_20y[0] > 0;
        const yy = y(a.fl);
        return (
          <g style={{ opacity: g }}>
            <path d={`M80,${y(st.fl)} C150,${y(st.fl)} 150,${yy} 230,${yy}`} class={`pf-alt ${a.fl === best && done > 0 ? "best" : ""}`} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - easeOut(g) }} />
            <text x="236" y={yy + 4} class="pf-lab">
              {a.feasible && a.extra_fuel_kg != null ? `${a.extra_fuel_kg > 0 ? "+" : ""}${a.extra_fuel_kg.toFixed(0)} kg ${"fuel"}` : ""}
            </text>
            {r ? (
              <>
                <line x1={ax(r[0])} x2={ax(r[0]) + (ax(r[2]) - ax(r[0])) * easeOut(g)} y1={yy} y2={yy} class={`pf-ci-l ${ok ? "ok" : ""}`} />
                <circle cx={ax(r[1])} cy={yy} r="4.5" class={`pf-ci-p ${ok ? "ok" : ""}`} />
                <circle cx={ax(r[0])} cy={yy} r="3.5" class={`pf-lo ${ok ? "ok" : "no"}`} />
                <text x={ax(r[0]) - 8} y={yy - 9} text-anchor="end" class={`pf-lab ${ok ? "g" : "r"}`}>
                  {ok ? "✓" : "✗"} {nf(r[0], r[0] % 1 ? 1 : 0)}
                </text>
              </>
            ) : (
              <text x="330" y={yy + 4} class="pf-lab r">
                ✗ {a.reason}
              </text>
            )}
          </g>
        );
      })}
      <g transform="translate(330 420)" style={{ opacity: done }}>
        <text class="pf-lab g">
          {"alert only if the 5th percentile > 0 at 20 and 100 yr"}
        </text>
      </g>
      <g transform={`translate(110 ${y(best ?? st.fl) - 34}) rotate(-6) scale(${lerp(1.7, 1, easeOut(clamp(done * 4)))})`} style={{ opacity: clamp(done * 4) }}>
        <rect x="-4" y="-17" width="196" height="28" class="pf-stamp" />
        <text x="92" y="2" text-anchor="middle" class="pf-stamp-t">
          {`ALERT · CLIMB TO FL${best}`}
        </text>
      </g>
    </svg>
  );
}

function Loading() {
  return <div class="pf-loading mono-s">{"Loading the real data…"}</div>;
}
