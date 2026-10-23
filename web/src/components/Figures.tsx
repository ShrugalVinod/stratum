// Animated explanatory figures (illustrations, not results).
import { useEffect, useRef } from "preact/hooks";
import { T } from "../i18n";
import { reduced } from "./motion";

const PLANE_PATHS = (
  <>
    <path d="M3 10.6c0-1.6 2-2.6 5.4-2.6h43.2c4.3 0 8.4 1.1 11.4 2.9-3 1.6-7 2.4-11.4 2.4H8.4C5 13.3 3 12.3 3 10.6Z" />
    <path d="M4.2 8.2 1.6 1.2h4.1l7.6 7Z" />
    <path d="M24.5 11.6h12.6l-8.4 6.6h-4.4Z" />
  </>
);

/** Fig. 1 — a contrail widening into cirrus inside the layer (t = 0 … +3 h). */
export function SpreadFigure() {
  const xs = [70, 185, 300, 415, 530, 645];
  return (
    <figure class="fig fig1 rv rv-fade">
      <div class="fig1-axis mono-s">
        <span>t = 0</span>
        <span>t = +3 h</span>
      </div>
      <svg viewBox="0 0 720 120" role="img" aria-label="A contrail cross-section growing wider and fainter from t = 0 to three hours later, inside the humid layer.">
        <rect x="0" y="30" width="720" height="60" class="f-band" />
        <line x1="0" y1="30" x2="720" y2="30" class="f-edge" />
        <line x1="0" y1="90" x2="720" y2="90" class="f-edge" />
        {xs.map((x, i) => (
          <ellipse cx={x} cy="60" rx={18 + i * 10} ry={3 + i * 4.6} class="f-puff" style={{ "--i": i, opacity: 0.32 + i * 0.04 }} />
        ))}
        <g class="f-plane">
          <svg x="-8" y="52" width="36" height="11.25" viewBox="0 0 64 20">
            {PLANE_PATHS}
          </svg>
        </g>
      </svg>
      <p class="mono-s fig1-label">ISSR · {T("~500 m thick")}</p>
      <figcaption class="caption">{T("Fig. 1 — A trail widening into cirrus inside the layer. Illustration.")}</figcaption>
    </figure>
  );
}

/** Fig. 2 — side view. One aircraft crosses the layer at FL360 and leaves a persistent contrail,
 *  climbs 2,000 ft to FL380 and its trail vanishes within seconds. Loops while on screen. */
export function SideView() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current!;
    const route = svg.querySelector<SVGPathElement>(".r-route")!;
    const pers = svg.querySelector<SVGPathElement>(".r-pers")!;
    const glow = svg.querySelector<SVGPathElement>(".r-glow")!;
    const short = svg.querySelector<SVGPathElement>(".r-short")!;
    const plane = svg.querySelector<SVGGElement>(".r-plane")!;
    const L = route.getTotalLength();
    const L1 = pers.getTotalLength();
    const climbEnd = L1 + 118;
    const TRAVEL = 5200; // ms for the whole route
    const PERIOD = 8200;
    short.style.strokeDasharray = `0 ${L}`;
    const place = (d: number) => {
      const p = route.getPointAtLength(Math.min(d, L));
      const q = route.getPointAtLength(Math.min(d + 2, L));
      const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      plane.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${ang})`);
    };
    const final = () => {
      pers.style.strokeDashoffset = "0";
      glow.style.strokeDashoffset = "0";
      glow.style.strokeWidth = "20";
      short.style.strokeDasharray = `110 ${L}`;
      short.style.strokeDashoffset = `${-(climbEnd + 140)}`;
      place(climbEnd + 250);
      svg.classList.add("done");
    };
    if (reduced()) return final();

    let raf = 0;
    let t0 = 0;
    let visible = false;
    const frame = (now: number) => {
      if (!t0) t0 = now;
      const t = (now - t0) % PERIOD;
      const k = Math.min(1, t / TRAVEL);
      const d = k * (L + 60);
      place(d);
      const drawn = Math.min(d, L1) / L1;
      pers.style.strokeDashoffset = String(1 - drawn);
      glow.style.strokeDashoffset = String(1 - drawn);
      glow.style.strokeWidth = String(5 + 16 * Math.min(1, Math.max(0, (t - 600) / 5200)));
      // after the climb the trail lives only ~110 units behind the aircraft
      if (d > L1) {
        const len = Math.min(110, d - L1);
        short.style.strokeDasharray = `${len} ${L}`;
        short.style.strokeDashoffset = String(-(d - len));
      } else short.style.strokeDasharray = `0 ${L}`;
      const fade = t > PERIOD - 700 ? (PERIOD - t) / 700 : t < 300 ? t / 300 : 1;
      svg.style.setProperty("--fade", String(fade));
      svg.classList.toggle("at380", d > climbEnd - 20);
      svg.classList.toggle("drawn", drawn > 0.6);
      if (visible) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    });
    io.observe(svg);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const Y = { 400: 70, 380: 150, 360: 230, 340: 310 } as const;
  return (
    <figure class="fig fig2">
      <div class="fig2-frame">
        <svg ref={ref} viewBox="0 0 1000 370" role="img" aria-label="Side view: an aircraft flying at FL360 inside the ice-supersaturated layer leaves a persistent contrail. It climbs 2,000 ft to FL380, above the layer, and its trail disappears within seconds.">
          <defs>
            <pattern id="hatch2" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" class="f-hatch" />
            </pattern>
          </defs>
          {([400, 380, 360, 340] as const).map((fl) => (
            <g>
              <text x="64" y={Y[fl] + 5} class="f-ax" text-anchor="end">
                FL{fl}
              </text>
              <line x1="80" y1={Y[fl]} x2="985" y2={Y[fl]} class="f-fl" />
            </g>
          ))}
          <rect x="80" y="198" width="905" height="64" fill="url(#hatch2)" class="f-issr" />
          <text x="975" y="290" class="f-teal" text-anchor="end">
            ISSR · RHi ≥ 100 %
          </text>
          <path class="r-route" d="M70 230 H690 C740 230 742 150 808 150 H1060" fill="none" stroke="none" />
          <path class="r-glow" d="M70 230 H690" pathLength="1" />
          <path class="r-pers" d="M70 230 H690" pathLength="1" />
          <path class="r-short" d="M70 230 H690 C740 230 742 150 808 150 H1060" />
          <text x="110" y="214" class="f-orange f-lab-pers">
            FL360 · persistent, hours
          </text>
          <text x="840" y="134" class="f-ink f-lab-short">
            FL380 · short-lived, seconds
          </text>
          <g class="f-bracket">
            <line x1="760" y1="150" x2="760" y2="230" />
            <line x1="752" y1="150" x2="768" y2="150" />
            <line x1="752" y1="230" x2="768" y2="230" />
            <text x="772" y="196">2,000 ft</text>
          </g>
          <g class="r-plane">
            <svg x="-52" y="-10" width="52" height="16.25" viewBox="0 0 64 20">
              {PLANE_PATHS}
            </svg>
          </g>
        </svg>
      </div>
      <figcaption class="caption">{T("Fig. 2 — The layer is thin. A small change of level can take a plane out of it. Illustration.")}</figcaption>
    </figure>
  );
}
