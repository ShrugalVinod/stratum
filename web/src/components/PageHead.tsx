import type { ComponentChildren } from "preact";
import { T } from "../i18n";
import { Split } from "./Split";

/** Inner-page title block: red label, mono note on the right, huge split title, lede. */
export function PageHead(p0: { label: string; note?: ComponentChildren; lines: string[]; lede?: ComponentChildren; id?: string }) {
  // plain-text heads translate themselves (pages with richer text pass it already translated)
  const tr = (x: ComponentChildren) => (typeof x === "string" ? T(x) : x);
  const p = { ...p0, label: T(p0.label), lines: p0.lines.map(T), note: tr(p0.note), lede: tr(p0.lede) };
  let k = 0;
  return (
    <header class="wrap page-head">
      <div class="ph-sky" aria-hidden="true">
        <i class="l1" data-fl="FL380" />
        <span class="band" />
        <i class="l2" data-fl="FL360 · ISSR" />
        <i class="l3" data-fl="FL340" />
        <span class="fly" />
      </div>
      <div class="page-head-top rv rv-fade">
        <p class="label red">{p.label}</p>
        {p.note && <div class="mono-s muted page-note">{p.note}</div>}
      </div>
      <h1 class="display d-xl" id={p.id}>
        {p.lines.map((l, i) => {
          const start = k;
          k += l.split(" ").length;
          return (
            <>
              <Split text={l} start={start} base={60} />
              {i < p.lines.length - 1 && <br />}
            </>
          );
        })}
      </h1>
      {p.lede && (
        <p class="lede rv" style={{ "--d": 380 }}>
          {p.lede}
        </p>
      )}
    </header>
  );
}
