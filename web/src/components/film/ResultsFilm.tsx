// Results: the four pre-registered answers, played as a film. Every number is read from
// results.json (the logged final runs) or the second-analysis constants the tables below use.
import { detectorCheck as DC, secondAnalysis as SA } from "../../content/site";
import { useLang } from "../../i18n";
import { clamp, easeIo, easeOut, Film, type Frame, lerp, nf, Num, type Scene, seg } from "./kit";

type R = Record<string, any>;
type Est = { value: number; lo: number; hi: number };
const f2 = (v?: number) => (v == null ? "–" : v.toFixed(2));
const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)} %`;

export function ResultsFilm({ r, skipTo }: { r: R; skipTo: string }) {
  useLang();
  const H = (id: string) => r.hypotheses.find((h: R) => h.id === id) as R;
  const h1 = H("H1"), h2 = H("H2"), h3 = H("H3"), h4 = H("H4");
  const e1 = h1.estimate as Est;
  const b1share = h3.context?.B1?.share?.value as number;
  const nightEf = h4.details?.night_share_positive_ef as number;
  const nightDist = h4.details?.night_share_distance as number;
  const dec = r.decisions ?? {};
  const v3 = DC.rows[DC.rows.length - 1];

  const scenes: Scene[] = [
    {
      k: "H1 · logged 18 Oct 2026",
      t: `We expected too few. Physics predicted ${f2(e1.value)}× too many.`,
      b: `Raw-ERA5 physics against what Meteosat-9 saw, 12 days: ratio ${f2(e1.value)} (95 % CI ${f2(e1.lo)}–${f2(e1.hi)}). Not supported. Allowing for contrails too thin to see, it is ${f2(h1.secondary?.ratio?.value)}.`,
    },
    {
      k: "H2 · primary endpoint",
      t: `Skill ${f2(h2.estimate?.value)} against the pycontrails latitude correction. With a catch.`,
      b: `Supported. But B3 only says yes or no, and a constant guess of the average contrail rate does as well; against that constant the model scores ${f2(h2.vs_RATE?.value)}. Where it clearly wins is ranking.`,
    },
    {
      k: "H3 · concentration",
      t: `${pc(b1share, 2)} of cruise distance carries 80 % of the warming.`,
      b: "Supported. Sort every flight stretch by its contrail warming and add them up: the curve hits 80 % almost at once. We zoom in to the first 2 % of all flying to see it.",
    },
    {
      k: "H4 · night flights",
      t: `Night: ${pc(nightDist)} of the distance, ${pc(nightEf)} of the warming.`,
      b: `Not supported as logged: with the too-dry corrected physics the interval reaches below zero (${f2(h4.estimate?.lo)} to ${f2(h4.estimate?.hi)}). With standard physics the night excess is clear.`,
    },
    {
      k: "Second analysis · D-005",
      t: "A detector close to a human expert.",
      b: `On ${DC.scenes} expert scenes it never saw: pixel Dice ${v3.dice}, against about ${DC.expertPixelDiceMax} for a single expert at most; it finds ${v3.unanimous} of the contrails all three experts agreed on. Chance matches fall from ${SA[0].chance} to ${SA[SA.length - 1].chance}.`,
    },
    {
      k: "Decisions · 12 held-out days",
      t: `${nf(dec.alerts ?? 0)} alerts. Most of them on one humid day.`,
      b: `Every alert needs a positive cautious estimate at 20 and 100 years. Together they avoid about ${nf(Math.round((dec.alerts_net_warming_avoided_h100_p50_kgCO2e ?? 0) / 1000))} t CO₂e (100 yr, median), and ${nf(dec.alerts_per_day?.["2026-02-01"] ?? 0)} fall on 1 Feb 2026. We say so rather than hide it.`,
    },
  ];

  return (
    <Film id="results-film" label={"The findings, in one scroll"} scenes={scenes} vh={130} skipTo={skipTo}>
      {(f) => <Stage f={f} r={r} />}
    </Film>
  );
}

function Stage({ f, r }: { f: Frame; r: R }) {
  const { p, n } = f;
  const pres = (k: number) => Math.min(k === 0 ? 1 : seg(p, (k - 0.04) / n, (k + 0.1) / n), k === n - 1 ? 1 : 1 - seg(p, (k + 0.9) / n, (k + 1.02) / n));
  const lt = (k: number) => seg(p, (k + 0.04) / n, (k + 0.84) / n);
  const H = (id: string) => r.hypotheses.find((h: R) => h.id === id) as R;
  const panel = (k: number, node: any) => {
    const o = pres(k);
    return o <= 0.001 ? null : (
      <div class="pf-panel" style={{ opacity: o, transform: `translate3d(0, ${((1 - o) * 26).toFixed(1)}px, 0) scale(${lerp(0.97, 1, o)})` }}>
        {node}
      </div>
    );
  };
  return (
    <div class="pf">
      <div class="pf-sky rf-sky" aria-hidden="true" />
      <div class="pf-box">
        {panel(0, <H1 t={lt(0)} h={H("H1")} r={r} />)}
        {panel(1, <H2 t={lt(1)} h={H("H2")} />)}
        {panel(2, <H3 t={lt(2)} h={H("H3")} curves={r.concentration_curves} />)}
        {panel(3, <H4 t={lt(3)} h={H("H4")} />)}
        {panel(4, <Det t={lt(4)} />)}
        {panel(5, <Dec t={lt(5)} dec={r.decisions ?? {}} />)}
      </div>
    </div>
  );
}

function Verdict({ t, yes, x, y }: { t: number; yes: boolean; x: number; y: number }) {
  const k = clamp(t * 4);
  return (
    <g transform={`translate(${x} ${y}) rotate(-6) scale(${lerp(1.8, 1, easeOut(k))})`} style={{ opacity: k }}>
      <rect x="-104" y="-18" width="208" height="30" class={`rf-stamp ${yes ? "yes" : "no"}`} />
      <text y="3" text-anchor="middle" class={`rf-stamp-t ${yes ? "yes" : "no"}`}>
        {yes ? "SUPPORTED" : "NOT SUPPORTED"}
      </text>
    </g>
  );
}

/* H1: the ratio on a log axis, travelling from 1 to where it landed */
function H1({ t, h, r }: { t: number; h: R; r: R }) {
  const e = h.estimate as Est;
  const W = 640, x0 = 60, x1 = 600;
  const lx = (v: number) => x0 + ((Math.log10(v) + 0.5) / 2.2) * (x1 - x0); // 0.32 … 50
  const go = easeIo(seg(t, 0.12, 0.5));
  const v = Math.exp(lerp(0, Math.log(e.value), go));
  const ci = easeOut(seg(t, 0.45, 0.62));
  const sec = h.secondary?.ratio as Est | undefined;
  const secT = seg(t, 0.62, 0.78);
  const seasons = ((r.h1_breakdowns?.season ?? []) as R[]).filter((s) => s.season !== "monsoon");
  const mon = ((r.h1_breakdowns?.season ?? []) as R[]).find((s) => s.season === "monsoon");
  const sT = seg(t, 0.75, 0.92);
  const SN: Record<string, string> = { winter: "winter", pre_monsoon: "pre-monsoon", post_monsoon: "post-monsoon" };
  return (
    <svg viewBox={`0 0 ${W} 440`} class="pf-svg" role="img" aria-label={`H1 ratio ${f2(e.value)}, interval ${f2(e.lo)} to ${f2(e.hi)}`}>
      <rect x={x0} y="150" width={lx(1) - x0} height="90" class="rf-hyp" />
      <text x={x0 + 8} y="168" class="pf-lab t">
        {"H1 expected: below 1"}
      </text>
      <line x1={lx(1)} x2={lx(1)} y1="130" y2="262" class="pf-ref" />
      <text x={lx(1)} y="124" text-anchor="middle" class="pf-lab big">
        1 = {"physics matches the satellite"}
      </text>
      <line x1={x0} x2={x1} y1="262" y2="262" class="pf-axis" />
      {[0.5, 1, 2, 5, 10, 20, 50].map((k) => (
        <text x={lx(k)} y="280" text-anchor="middle" class="pf-lab">
          {k}
        </text>
      ))}
      <line x1={lerp(lx(e.value), lx(e.lo), ci)} x2={lerp(lx(e.value), lx(e.hi), ci)} y1="205" y2="205" class="rf-ci" />
      <circle cx={lx(v)} cy="205" r="10" class="rf-dot" />
      <text x={lx(v)} y="70" text-anchor="middle" class="rf-big">
        {v.toFixed(2)}×
      </text>
      {sec && (
        <g style={{ opacity: secT }}>
          <line x1={lx(sec.lo)} x2={lx(sec.hi)} y1="232" y2="232" class="rf-ci c" />
          <circle cx={lx(sec.value)} cy="232" r="6" class="rf-dot c" />
          <text x={lx(sec.hi) + 10} y="236" class="pf-lab c">
            {f2(sec.value)} · {"allowing for detectability"}
          </text>
        </g>
      )}
      <g style={{ opacity: sT }}>
        <text x={x0} y="318" class="pf-ax-t">
          {"By season (physics ÷ satellite)"}
        </text>
        {seasons.map((s, i) => (
          <g transform={`translate(${x0 + i * 140} 346)`}>
            <text class="pf-lab">{SN[s.season] ?? s.season}</text>
            <text y="26" class="rf-mid">
              {(s.ratio_value as number).toFixed(1)}×
            </text>
          </g>
        ))}
        {mon && (
          <g transform={`translate(${x0 + seasons.length * 140} 346)`}>
            <text class="pf-lab">{"monsoon"}</text>
            <text y="26" class="rf-mid r">
              {`${mon.observed_y1} seen in ${nf(mon.segments)}`}
            </text>
          </g>
        )}
      </g>
      <Verdict t={seg(t, 0.55, 0.75)} yes={false} x={480} y={110} />
    </svg>
  );
}

/* H2: skill against four references, bars growing from zero */
function H2({ t, h }: { t: number; h: R }) {
  const rows: [string, Est | undefined][] = [
    ["vs B3 (pre-registered)", h.estimate],
    ["vs climatology", h.vs_B0],
    ["vs humidity only", h.vs_LOGIT],
    ["vs constant rate", h.vs_RATE],
  ];
  const x0 = 250, x1 = 610;
  const x = (v: number) => x0 + ((clamp(v, -1.1, 1) + 1.1) / 2.1) * (x1 - x0);
  return (
    <svg viewBox="0 0 640 440" class="pf-svg" role="img" aria-label={"STRATUM skill against four references"}>
      <text x="20" y="40" class="pf-ax-t">
        {"Brier skill score, mean of 4 held-out seasons [95 % CI]"}
      </text>
      <line x1={x(0)} x2={x(0)} y1="64" y2="372" class="pf-ref" />
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <text x={x(v)} y="392" text-anchor="middle" class="pf-lab">
          {v}
        </text>
      ))}
      <text x={x(0) + 6} y="412" class="pf-lab">
        {"0 = no better than the reference"}
      </text>
      {rows.map(([en, e], i) => {
        if (!e) return null;
        const g = easeOut(clamp(seg(t, 0.05, 0.75) * 1.8 - i * 0.3));
        const y = 100 + i * 70;
        const neg = e.value < 0;
        const v = e.value * g;
        return (
          <g>
            <text x={x0 - 14} y={y + 5} text-anchor="end" class="pf-lab big">
              {en}
            </text>
            <rect x={Math.min(x(0), x(v))} y={y - 10} width={Math.abs(x(v) - x(0))} height="20" rx="3" class={`rf-bar ${neg ? "neg" : ""}`} />
            <line x1={x(e.lo)} x2={x(e.hi)} y1={y + 18} y2={y + 18} class="rf-whisk" style={{ opacity: g }} />
            <text x={neg ? x(v) - 8 : x(v) + 8} y={y + 5} text-anchor={neg ? "end" : "start"} class={`rf-val ${neg ? "r" : ""}`}>
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}
      <Verdict t={seg(t, 0.6, 0.8)} yes x={500} y={446} />
    </svg>
  );
}

/* H3: the concentration curves, with the x-axis zooming from all flying to its first 2 % */
function H3({ t, h, curves }: { t: number; h: R; curves?: Record<string, { distance_share: number[]; ef_share: number[] } | null> }) {
  if (!curves) return null;
  const draw = easeOut(seg(t, 0.02, 0.35));
  const zoom = easeIo(seg(t, 0.35, 0.75));
  const xmax = Math.exp(lerp(Math.log(1), Math.log(0.02), zoom));
  const x0 = 60, x1 = 600, y0 = 370, y1 = 50;
  const X = (v: number) => x0 + (v / xmax) * (x1 - x0);
  const Y = (v: number) => y0 - v * (y0 - y1);
  const cls = ["c0", "c1", "c2"];
  const names: Record<string, string> = {
    "STRATUM-corrected (logged)": "corrected physics (logged)",
    "B1 (descriptive)": "raw ERA5 (B1)",
    "B3 (descriptive)": "pycontrails latitude correction (B3)",
  };
  const share = h.context?.B1?.share?.value as number;
  const mark = seg(t, 0.72, 0.9);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => q * xmax);
  return (
    <svg viewBox="0 0 640 440" class="pf-svg" role="img" aria-label={"Share of contrail warming against share of cruise distance"}>
      <defs>
        <clipPath id="rf-h3">
          <rect x={x0} y={y1 - 4} width={x1 - x0 + 2} height={y0 - y1 + 8} />
        </clipPath>
      </defs>
      <line x1={x0} x2={x1} y1={y0} y2={y0} class="pf-axis" />
      <line x1={x0} x2={x0} y1={y0} y2={y1} class="pf-axis" />
      <line x1={x0} x2={x1} y1={Y(0.8)} y2={Y(0.8)} class="pf-ref" />
      <text x={x0 - 8} y={Y(0.8) + 4} text-anchor="end" class="pf-lab big">
        80 %
      </text>
      {ticks.map((v) => (
        <text x={X(v)} y={y0 + 18} text-anchor="middle" class="pf-lab">
          {v === 0 ? "0" : `${(v * 100).toPrecision(v * 100 < 1 ? 1 : 2)} %`}
        </text>
      ))}
      <text x={(x0 + x1) / 2} y={y0 + 40} text-anchor="middle" class="pf-lab">
        {"share of cruise distance, largest warming first"}
      </text>
      <text x={x0} y={y1 - 16} class="pf-ax-t">
        {"share of contrail warming"}
      </text>
      <g clip-path="url(#rf-h3)">
        {Object.entries(curves).map(([, c], i) =>
          c ? (
            <path
              class={`rf-curve ${cls[i % 3]}`}
              d={c.distance_share.map((dd, j) => `${j ? "L" : "M"}${X(dd).toFixed(1)},${Y(c.ef_share[j]).toFixed(1)}`).join("")}
              pathLength={1}
              style={{ strokeDasharray: 1, strokeDashoffset: 1 - draw }}
            />
          ) : null,
        )}
        <g style={{ opacity: mark }}>
          <line x1={X(share)} x2={X(share)} y1={Y(0.8)} y2={y0} class="rf-drop" />
          <circle cx={X(share)} cy={Y(0.8)} r="7" class="rf-dot" />
        </g>
      </g>
      <g style={{ opacity: mark }}>
        <text x={Math.min(x1 - 10, X(share) + 14)} y={Y(0.8) + 40} class="rf-big s">
          <Num to={share * 100} t={mark} d={2} /> %
        </text>
      </g>
      <g transform="translate(330 300)">
        {Object.keys(curves).map((k, i) => (
          <g transform={`translate(0 ${i * 20})`}>
            <line x1="0" x2="22" y1="-4" y2="-4" class={`rf-curve ${cls[i % 3]}`} />
            <text x="30" class="pf-lab">
              {names[k] ?? k}
            </text>
          </g>
        ))}
      </g>
      <Verdict t={seg(t, 0.8, 0.95)} yes x={480} y={250} />
    </svg>
  );
}

/* H4: night shares, then the logged interval crossing zero */
function H4({ t, h }: { t: number; h: R }) {
  const d = h.details ?? {};
  const rows: [string, number, number][] = [
    ["logged (corrected physics)", d.night_share_positive_ef, d.night_share_distance],
    ["raw ERA5 (B1, descriptive)", h.context?.B1?.night_share_positive_ef, h.context?.B1?.night_share_distance],
  ];
  const x0 = 60, x1 = 600, X = (v: number) => x0 + v * (x1 - x0);
  const diff = h.estimate as Est;
  const dx = (v: number) => 140 + ((v + 0.2) / 0.8) * 440;
  const ci = easeOut(seg(t, 0.55, 0.78));
  return (
    <svg viewBox="0 0 640 440" class="pf-svg" role="img" aria-label={"Night share of warming and distance"}>
      {rows.map(([en, ef, dist], i) => {
        const g = easeOut(clamp(seg(t, 0.03, 0.5) * 1.6 - i * 0.35));
        const y = 60 + i * 110;
        return (
          <g>
            <text x={x0} y={y} class="pf-lab big">
              {en}
            </text>
            <rect x={x0} y={y + 12} width={(X(ef) - x0) * g} height="22" class="rf-bar night" />
            <text x={X(ef * g) + 8} y={y + 28} class="rf-val">
              {pc(ef * g)} {"of warming"}
            </text>
            <rect x={x0} y={y + 40} width={(X(dist) - x0) * g} height="12" class="rf-bar dist" />
            <text x={X(dist * g) + 8} y={y + 51} class="pf-lab">
              {pc(dist * g)} {"of distance"}
            </text>
          </g>
        );
      })}
      <g style={{ opacity: seg(t, 0.5, 0.6) }}>
        <text x={x0} y="300" class="pf-ax-t">
          {"Logged test: night excess (warming − distance), 95 % CI"}
        </text>
        <line x1="140" x2="580" y1="350" y2="350" class="pf-axis" />
        <line x1={dx(0)} x2={dx(0)} y1="322" y2="366" class="rf-zero" />
        {[-0.2, 0, 0.2, 0.4, 0.6].map((v) => (
          <text x={dx(v)} y="384" text-anchor="middle" class="pf-lab">
            {v}
          </text>
        ))}
        <line x1={lerp(dx(diff.value), dx(diff.lo), ci)} x2={lerp(dx(diff.value), dx(diff.hi), ci)} y1="340" y2="340" class="rf-ci" />
        <circle cx={dx(diff.value)} cy="340" r="7" class="rf-dot" />
        <circle cx={dx(diff.lo)} cy="340" r="5" class="rf-lo" style={{ opacity: ci }} />
        <text x={dx(diff.lo) - 8} y="326" text-anchor="end" class="pf-lab r" style={{ opacity: ci }}>
          {f2(diff.lo)} {"< 0"}
        </text>
      </g>
      <Verdict t={seg(t, 0.75, 0.92)} yes={false} x={480} y={420} />
    </svg>
  );
}

/* Detector: Dice against the expert ceiling, F1 from line filter to v3 */
function Det({ t }: { t: number }) {
  const v3 = DC.rows[DC.rows.length - 1];
  const dice = parseFloat(v3.dice);
  const g = easeOut(seg(t, 0.05, 0.5));
  const R0 = 120, cx = 170, cy = 210;
  const arc = (v: number) => {
    const a = Math.PI * (1 - v);
    return [cx + R0 * Math.cos(a), cy - R0 * Math.sin(a)];
  };
  const [ex, ey] = arc(dice * g);
  const [mx, my] = arc(DC.expertPixelDiceMax);
  const bars = DC.rows.map((d) => ({ name: d.name, f1: parseFloat(d.f1) }));
  const bT = seg(t, 0.45, 0.85);
  return (
    <svg viewBox="0 0 640 440" class="pf-svg" role="img" aria-label={"Detector quality against expert level"}>
      <path d={`M${cx - R0},${cy} A${R0},${R0} 0 0 1 ${cx + R0},${cy}`} class="rf-gauge" />
      <path d={`M${cx - R0},${cy} A${R0},${R0} 0 0 1 ${ex},${ey}`} class="rf-gauge on" />
      <line x1={cx} y1={cy} x2={mx} y2={my} class="rf-exp" />
      <text x={mx + 8} y={my - 8} class="pf-lab big">
        {`one expert ≤ ${DC.expertPixelDiceMax}`}
      </text>
      <text x={cx} y={cy - 18} text-anchor="middle" class="rf-big s">
        <Num to={dice} t={g} d={2} />
      </text>
      <text x={cx} y={cy + 22} text-anchor="middle" class="pf-lab">
        {"pixel Dice, learned v3"}
      </text>
      <text x="360" y="90" class="pf-ax-t">
        F1 [{"contrail-level"}]
      </text>
      {bars.map((b, i) => {
        const k = easeOut(clamp(bT * 1.6 - i * 0.3));
        const y = 120 + i * 62;
        return (
          <g>
            <text x="360" y={y} class="pf-lab big">
              {b.name}
            </text>
            <rect x="360" y={y + 10} width={b.f1 * 400 * k} height="16" rx="3" class={`rf-bar ${i ? "c" : "o"}`} />
            <text x={360 + b.f1 * 400 * k + 8} y={y + 23} class="rf-val">
              {(b.f1 * k).toFixed(2)}
            </text>
          </g>
        );
      })}
      <g style={{ opacity: seg(t, 0.75, 0.9) }}>
        <text x="40" y="320" class="rf-mid c">
          {v3.unanimous}
        </text>
        <text x="40" y="344" class="pf-lab">
          {"of contrails all three experts agreed on"}
        </text>
        <text x="360" y="320" class="rf-mid">
          {SA[0].chance} → {SA[SA.length - 1].chance}
        </text>
        <text x="360" y="344" class="pf-lab">
          {"chance matches (wrong-day test)"}
        </text>
      </g>
    </svg>
  );
}

/* Decisions: alerts per study day */
function Dec({ t, dec }: { t: number; dec: R }) {
  const months = ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];
  const per = (dec.alerts_per_day ?? {}) as Record<string, number>;
  const vals = months.map((m) => per[`${m}-01`] ?? 0);
  const max = Math.max(...vals, 1);
  const x0 = 60, x1 = 600, bw = (x1 - x0) / months.length;
  const H0 = 330, Hh = 250;
  const sq = (v: number) => v / max;
  const g = seg(t, 0.05, 0.7);
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <svg viewBox="0 0 640 440" class="pf-svg" role="img" aria-label={"Alerts per study day"}>
      <text x={x0} y="40" class="pf-ax-t">
        {"Alerts per study day"}
      </text>
      <line x1={x0} x2={x1} y1={H0} y2={H0} class="pf-axis" />
      {vals.map((v, i) => {
        const k = easeOut(clamp(g * 1.8 - i * 0.07));
        const h = sq(v) * Hh * k;
        const big = v === max;
        return (
          <g>
            <rect x={x0 + i * bw + 4} y={H0 - h} width={bw - 8} height={h} rx="3" class={`rf-bar ${big ? "neg" : "c"}`} />
            <text x={x0 + i * bw + bw / 2} y={H0 - h - 8} text-anchor="middle" class={`rf-val ${big ? "r" : ""}`} style={{ opacity: k }}>
              {Math.round(v * k)}
            </text>
            <text x={x0 + i * bw + bw / 2} y={H0 + 18} text-anchor="middle" class="pf-lab">
              {months[i].slice(2).replace("-", "/")}
            </text>
          </g>
        );
      })}
      <g style={{ opacity: seg(t, 0.6, 0.85) }} transform={`translate(${x0} 392)`}>
        <text class="rf-mid">
          <Num to={total} t={seg(t, 0.6, 0.85)} /> {"alerts"}
        </text>
        <text x="200" class="rf-mid o">
          {nf(Math.round((dec.alerts_net_warming_avoided_h100_p50_kgCO2e ?? 0) / 1000))} t CO₂e
        </text>
        <text y="24" class="pf-lab">
          {"logged decision layer · 100-yr median warming avoided"}
        </text>
      </g>
    </svg>
  );
}
