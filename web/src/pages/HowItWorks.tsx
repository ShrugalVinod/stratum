import { useEffect, useRef, useState } from "preact/hooks";
import { SideView } from "../components/Figures";
import { PageHead } from "../components/PageHead";
import { pipeline } from "../content/site";
import { T, tx } from "../i18n";

export function HowItWorks() {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const list = useRef<HTMLOListElement>(null);

  // the route fills in red as you scroll; each waypoint lights up when the aircraft reaches it
  useEffect(() => {
    const el = list.current!;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const mark = innerHeight * 0.62;
      const p = Math.max(0, Math.min(1, (mark - r.top) / r.height));
      el.style.setProperty("--p", p.toFixed(4));
      el.querySelectorAll<HTMLElement>(":scope > li").forEach((li) => li.classList.toggle("reached", li.getBoundingClientRect().top + 40 < mark));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, []);

  const toggle = (i: number) => {
    const n = new Set(open);
    n.has(i) ? n.delete(i) : n.add(i);
    setOpen(n);
  };

  return (
    <div class="page">
      <PageHead
        label={tx(`Flight plan · ${pipeline.length} waypoints`, `उड़ान योजना · ${pipeline.length} पड़ाव`)}
        note={
          <>
            ROUTE: {pipeline.map((s) => s.code).join(" DCT ")}
          </>
        }
        lines={["From a ping", "to a decision."]}
        lede="Every prediction STRATUM makes follows the same route. Each waypoint takes something in and hands something on."
      />
      <div class="wrap">
        <ol class="wpts" ref={list}>
          <span class="wpts-fill" aria-hidden="true" />
          {pipeline.map((s, i) => (
            <li class="wpt-row">
              <div class="wpt-mark">
                <span class="diamond" aria-hidden="true" />
                <span class="mono">WPT {String(i + 1).padStart(2, "0")}</span>
              </div>
              <div class="wpt-title rv">
                <p class="mono-s muted">{s.code}</p>
                <h2 class="display d-m">{T(s.title)}</h2>
                <p class="muted">{T(s.sub)}</p>
              </div>
              <div class="wpt-io rv" style={{ "--d": 120 }}>
                <dl>
                  <div>
                    <dt class="label teal">{T("In")}</dt>
                    <dd>{T(s.input)}</dd>
                  </div>
                  <div>
                    <dt class="label red">{T("Out")}</dt>
                    <dd>{T(s.output)}</dd>
                  </div>
                </dl>
                <button class={`sci-btn ${open.has(i) ? "on" : ""}`} aria-expanded={open.has(i)} onClick={() => toggle(i)}>
                  <i aria-hidden="true" /> {T("For scientists")}
                </button>
                <div class={`sci-wrap ${open.has(i) ? "open" : ""}`}>
                  <div>
                    <p class="sci">{T(s.sci)}</p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <section class="section" aria-labelledby="layer-title">
          <div class="sec-head rv">
            <p class="label red" id="layer-title">
              {T("§2 · The cold-humid layer, side view")}
            </p>
            <span class="mono-s">{T("Illustration")}</span>
          </div>
          <SideView />
          <p class="field-note rv">
            {T(
              "A flight inside a cold, ice-supersaturated layer can leave a contrail that lasts for hours. The same route 2,000 ft above it may leave one that vanishes in seconds. The hard part is knowing where those layers are — that is what STRATUM checks against satellites.",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
