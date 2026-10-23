// The opening sequence. Plane A cruises in at FL380 with a trail that vanishes in seconds
// ("MOVE THE PLANE." rises in its wake); plane B then crosses inside the ice-supersaturated
// layer at FL360 and leaves a contrail that spreads into cloud ("LOSE THE CLOUD." is wiped in
// exactly as it passes); finally the +2,000 ft bracket draws between the two levels.
// The flight levels are measured from the two headline lines, so the sky lines up with the
// type at every screen width. All motion is transform/opacity (compositor only).
import { useLayoutEffect, useRef } from "preact/hooks";
import { site } from "../content/site";
import { T } from "../i18n";
import { Arrow } from "./Footer";
import { Plane } from "./Plane";
import { Split } from "./Split";
import "../styles/hero.css";

const B_START = 1250; // ms, plane B enters
const B_DUR = 2300; // ms, crossing time (same easing as its contrail, so the two stay locked)
const B_OVER = 160; // px plane B flies past the right edge

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const l1 = el.querySelector<HTMLElement>(".h-l1")!;
    const l2 = el.querySelector<HTMLElement>(".h-l2")!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const a = l1.getBoundingClientRect();
      const b = l2.getBoundingClientRect();
      const y380 = a.top + a.height / 2 - r.top;
      const y360 = b.top + b.height / 2 - r.top;
      const W = r.width;
      const s = el.style;
      s.setProperty("--y380", `${y380}px`);
      s.setProperty("--y360", `${y360}px`);
      s.setProperty("--gap", `${Math.max(40, y360 - y380)}px`);
      s.setProperty("--W", `${W}px`);
      s.setProperty("--ax", `${Math.min(W - 90, Math.max(a.right - r.left + 40, W * 0.8))}px`);
      // the red block and each word of line 2 appear exactly when plane B reaches them
      const span = W + B_OVER + 60;
      const at = (x: number) => B_START + ((x + 60) / span) * B_DUR;
      const blk = l2.querySelector<HTMLElement>(".block")!.getBoundingClientRect();
      s.setProperty("--blk-delay", `${at(blk.left - r.left)}ms`);
      s.setProperty("--blk-dur", `${at(blk.right - r.left) - at(blk.left - r.left)}ms`);
      // the layer label sits under the band on the right; hide it if the red block reaches it
      const lab = el.querySelector<HTMLElement>(".h-issr-label")!;
      const lr = lab.getBoundingClientRect();
      el.classList.toggle("label-clash", blk.right + 16 > lr.left && blk.bottom > lr.top);
      l2.querySelectorAll<HTMLElement>(".w > span").forEach((w) => {
        const wr = w.parentElement!.getBoundingClientRect();
        w.style.transitionDelay = `${at(wr.left + wr.width * 0.55 - r.left)}ms`;
      });
    };
    measure();
    el.classList.add("go");
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure);

    // gentle parallax: the sky drifts slower than the page
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.min(window.scrollY, innerHeight * 1.2);
        el.style.setProperty("--sy", String(y));
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section class="hero" ref={ref} aria-labelledby="hero-title" style={{ "--b-start": `${B_START}ms`, "--b-dur": `${B_DUR}ms`, "--b-over": `${B_OVER}px` }}>
      <div class="h-sky" aria-hidden="true">
        <div class="h-grid" />
        <div class="h-fl h-fl400" />
        <div class="h-fl h-fl380" />
        <div class="h-fl h-fl360" />
        <div class="h-fl h-fl340" />
        <div class="h-issr">
          <div class="h-hatch" />
        </div>
        <p class="h-issr-label mono-s">ISSR · RHi ≥ 100 %</p>
        <div class="h-trailB">
          <div class="h-haze" />
          <div class="h-core" />
        </div>
        <div class="h-planeB">
          <Plane width={54} />
        </div>
        <div class="h-planeA">
          <div class="h-bob">
            <span class="h-short" />
            <Plane width={58} />
          </div>
        </div>
        <div class="h-bracket">
          <i class="cap top" />
          <i class="bar" />
          <i class="cap bot" />
          <span class="mono">+2,000 FT</span>
        </div>
      </div>

      <div class="h-tape" aria-hidden="true">
        <span class="t400 mono">FL400 –</span>
        <span class="t380 mono">
          <b>FL380</b> –
        </span>
        <span class="t360 mono">FL360 –</span>
        <span class="t340 mono">FL340 –</span>
      </div>

      <div class="wrap h-inner">
        <p class="h-coords mono">{T("INDUS INTERNATIONAL SCHOOL · BENGALURU")} · 12.97°N 77.59°E · {T(site.competition).toUpperCase()}</p>
        <h1 id="hero-title" class="display h-title">
          <span class="h-l1">
            <Split text={T(site.heroTitle[0])} base={420} class="h-split1" />
          </span>
          <span class="h-l2">
            <span class="block">
              <Split text={T(site.heroTitle[1])} class="h-split2" />
            </span>
          </span>
        </h1>
        <div class="h-foot">
          <p class="h-lede">{T(site.heroLede)}</p>
          <div class="h-actions">
            <a class="btn primary" href="/map">
              {T("Open the contrail map")} <Arrow />
            </a>
            <a class="btn" href="/how-it-works">
              {T("How it works")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
