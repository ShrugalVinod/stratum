import { useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { T, tx } from "../i18n";
import { eIce, eWater, isaPressure, sac } from "../lib/sac";

/** /sandbox — the physics behind every STRATUM forecast, as a toy: pick the flight level, the
 *  air's temperature and humidity and the engine, and see whether a contrail forms, and whether
 *  it lasts. Computed with the Schmidt–Appleman criterion exactly as in stratum/physics
 *  (lib/sac.ts, tested against the Python). The scenes are illustrations. */

const K = 273.15;
const ENGINES: [number, string][] = [
  [0.25, "Older engine (η 0.25)"],
  [0.35, "Typical today (η 0.35)"],
  [0.42, "Newest engine (η 0.42)"],
];
type Scene = { name: string; fl: number; t: number; rhi: number; eta: number };
const SCENES: Scene[] = [
  { name: "Winter night, humid layer", fl: 360, t: -57, rhi: 115, eta: 0.35 },
  { name: "Warm summer afternoon", fl: 360, t: -41, rhi: 70, eta: 0.35 },
  { name: "Cold but dry", fl: 380, t: -60, rhi: 60, eta: 0.35 },
  { name: "On the edge", fl: 340, t: -49, rhi: 105, eta: 0.35 },
];

export function Sandbox() {
  const [fl, setFl] = useState(360);
  const [tc, setTc] = useState(-57);
  const [rhi, setRhi] = useState(115);
  const [eta, setEta] = useState(0.35);

  const p = isaPressure(fl);
  const r = useMemo(() => sac(tc + K, rhi / 100, p, eta), [tc, rhi, p, eta]);
  const kind = r.persists ? "lasting" : r.forms ? "short" : "none";
  const apply = (s: Scene) => (setFl(s.fl), setTc(s.t), setRhi(s.rhi), setEta(s.eta));

  return (
    <div class="page sandbox">
      <PageHead
        label="Physics sandbox · try it"
        note="Schmidt–Appleman criterion · as in our model"
        lines={["Make a", "contrail."]}
        lede="Every STRATUM forecast starts with one test from 1953: is the air behind the engine cold enough for its water vapour to freeze, and is the air humid enough for the ice to stay? Move the sliders and find out."
      />
      <div class="wrap">
        <div class="sb-scenes rv" role="group" aria-label={T("Example skies")}>
          {SCENES.map((s) => (
            <button class="tool" onClick={() => apply(s)}>
              {T(s.name)}
            </button>
          ))}
        </div>

        <div class="sb-grid">
          <div class="sb-controls">
            <Slider label={T("Flight level")} value={fl} min={250} max={430} step={10} show={`FL${fl} · ${Math.round(p / 100)} hPa`} onChange={setFl} />
            <Slider label={T("Air temperature")} value={tc} min={-75} max={-25} step={1} show={`${tc} °C`} onChange={setTc} />
            <Slider label={T("Humidity over ice")} value={rhi} min={30} max={170} step={5} show={`${rhi} %`} onChange={setRhi} />
            <fieldset class="sb-eng">
              <legend class="label">{T("Engine")}</legend>
              <div class="seg-ctl">
                {ENGINES.map(([v, l]) => (
                  <button class={eta === v ? "on" : ""} aria-pressed={eta === v} onClick={() => setEta(v)}>
                    {T(l)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <figure class={`sb-sky k-${kind}`} aria-live="polite">
            <svg viewBox="0 0 400 200" role="img" aria-label={T(kind === "lasting" ? "A lasting contrail" : kind === "short" ? "A short-lived contrail" : "No contrail")}>
              <rect width="400" height="200" class="sb-air" />
              {kind === "lasting" && <path class="sb-cirrus" d="M0,92 C80,80 140,104 220,92 S330,86 340,96 L340,104 C300,112 240,118 160,112 S40,116 0,110 Z" />}
              {kind !== "none" && <line class={`sb-trail ${kind}`} x1={kind === "short" ? 270 : 0} y1="100" x2="336" y2="100" />}
              <g transform="translate(336 100)">
                <path class="sb-plane" d="M22,0 L-10,-4 L-14,-16 L-20,-16 L-16,-3 L-24,-2 L-28,-8 L-31,-8 L-29,0 L-31,8 L-28,8 L-24,2 L-16,3 L-20,16 L-14,16 L-10,4 Z" />
              </g>
            </svg>
            <figcaption>
              <b class={`sb-verdict k-${kind}`}>
                {T(kind === "lasting" ? "A lasting contrail: it spreads into cirrus and traps heat." : kind === "short" ? "A short contrail: it forms, then vanishes in seconds." : "No contrail: the air is too warm.")}
              </b>
              <span class="small">
                {kind === "none"
                  ? tx(
                      `For this humidity the air must be colder than ${(r.TLC - K).toFixed(1)} °C; it is ${tc} °C.`,
                      `इस नमी पर हवा ${(r.TLC - K).toFixed(1)} °C से ठंडी होनी चाहिए; वह ${tc} °C है।`,
                    )
                  : kind === "short"
                    ? tx(
                        `Cold enough (below ${(r.TLC - K).toFixed(1)} °C), but at ${rhi} % humidity over ice the ice crystals evaporate. Above 100 % they would grow.`,
                        `काफ़ी ठंडा (${(r.TLC - K).toFixed(1)} °C से नीचे), पर बर्फ़ के सापेक्ष ${rhi} % नमी पर बर्फ़ के कण भाप बन जाते हैं। 100 % से ऊपर वे बढ़ते।`,
                      )
                    : tx(
                        `Cold enough (below ${(r.TLC - K).toFixed(1)} °C) and ice-supersaturated (${rhi} % over ice): the crystals keep growing. This is the air STRATUM looks for.`,
                        `काफ़ी ठंडा (${(r.TLC - K).toFixed(1)} °C से नीचे) और बर्फ़-अतिसंतृप्त (बर्फ़ के सापेक्ष ${rhi} %): कण बढ़ते रहते हैं। STRATUM यही हवा खोजता है।`,
                      )}
              </span>
            </figcaption>
          </figure>
        </div>

        <section class="section" aria-labelledby="sac-d">
          <div class="sec-head rv">
            <p class="label red" id="sac-d">
              {T("The diagram behind it")}
            </p>
            <span class="mono-s">Schmidt 1941 · Appleman 1953 · Schumann 1996</span>
          </div>
          <Diagram tc={tc} e={r.e} G={r.G} TLM={r.TLM} kind={kind} />
          <p class="mono-s sb-legend">
            <span>
              <i class="sb-k water" /> {T("water saturation")}
            </span>
            <span>
              <i class="sb-k ice" /> {T("ice saturation")}
            </span>
            <span>
              <i class="sb-k thr" /> {T("threshold mixing line")}
            </span>
            <span>
              <i class="sb-k mix" /> {T("your air's mixing line")}
            </span>
            <span>
              <i class={`sb-k pt k-${kind}`} /> {T("your air")}
            </span>
          </p>
          <p class="small muted">
            {T(
              "Behind the engine, hot moist exhaust mixes with the cold air along a straight line (dashed; its slope depends on the pressure and the engine). If that line crosses the water-saturation curve, droplets form and freeze: a contrail. It lasts only if the air itself is above the ice-saturation curve. More efficient engines leave cooler exhaust, so they make contrails in slightly warmer air: try the engine buttons.",
            )}
          </p>
          <p class="small muted">
            {tx(
              `Pressure from the standard atmosphere at FL${fl}; mixing-line slope G = ${r.G.toFixed(2)} Pa/K; threshold in saturated air T_LM = ${(r.TLM - K).toFixed(1)} °C. Saturation over water and ice: Murphy & Koop (2005), as in our pre-registered physics.`,
              `FL${fl} पर मानक वायुमंडल से दबाव; मिश्रण-रेखा ढलान G = ${r.G.toFixed(2)} Pa/K; संतृप्त हवा में सीमा T_LM = ${(r.TLM - K).toFixed(1)} °C। पानी और बर्फ़ पर संतृप्ति: Murphy & Koop (2005), हमारी पहले से दर्ज भौतिकी की तरह।`,
            )}{" "}
            <a href="/how-it-works">{T("How STRATUM uses it")} →</a>
          </p>
        </section>
      </div>
    </div>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label class="sb-slider">
      <span class="label">{p.label}</span>
      <span class="mono sb-val">{p.show}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))} />
    </label>
  );
}

/** Vapour pressure against temperature: water and ice saturation, the threshold mixing line
 *  (tangent to the water curve at T_LM) and the ambient air. */
function Diagram({ tc, e, G, TLM, kind }: { tc: number; e: number; G: number; TLM: number; kind: string }) {
  const W = 900;
  const H = 360;
  const L = 52;
  const B = 34;
  const TOP = 28;
  const t0 = -75;
  const t1 = -25;
  const lo = -1; // log10 Pa: 0.1 … 100 Pa (contrail air holds very little vapour)
  const hi = 2;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - 12);
  const y = (v: number) => H - B - ((Math.log10(Math.min(Math.max(v, 10 ** lo), 10 ** hi)) - lo) / (hi - lo)) * (H - B - TOP);
  // a curve sampled across the chart, drawn only where it is inside the 0.1–100 Pa range
  const line = (f: (t: number) => number, from = t0) =>
    Array.from({ length: 121 }, (_, i) => from + ((t1 - from) * i) / 120)
      .filter((t) => f(t) > 10 ** lo)
      .map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(f(t)).toFixed(1)}`)
      .join("");
  // the threshold mixing line (tangent to the water curve at T_LM) and the ambient air's line
  const tm = TLM - K;
  const ewTm = eWater(TLM);
  const thr = line((t) => ewTm + G * (t - tm));
  const amb = line((t) => e + G * (t - tc), tc);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="sb-diag" role="img" aria-label={T("Vapour pressure against temperature, with the saturation curves and the mixing line")}>
      {[0.1, 1, 10, 100].map((v) => (
        <g>
          <line class="sb-gl" x1={L} x2={W - 12} y1={y(v)} y2={y(v)} />
          <text class="ax" x={L - 6} y={y(v) + 3} text-anchor="end">
            {v}
          </text>
        </g>
      ))}
      {[-70, -60, -50, -40, -30].map((t) => (
        <text class="ax" x={x(t)} y={H - B + 16} text-anchor="middle">
          {t} °C
        </text>
      ))}
      <text class="ax" x={L} y={12}>
        {T("vapour pressure, Pa (log scale)")}
      </text>
      <path class="sb-water" d={line((t) => eWater(t + K))} />
      <path class="sb-ice" d={line((t) => eIce(t + K))} />
      <path class="sb-thr" d={thr} />
      <path class={`sb-mix k-${kind}`} d={amb} />
      <circle class={`sb-pt k-${kind}`} cx={x(tc)} cy={y(e)} r={6} />
    </svg>
  );
}
