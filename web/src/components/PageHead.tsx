import type { ComponentChildren } from "preact";
import { Split } from "./Split";

/** Inner-page title block: red label, mono note on the right, huge split title, lede. */
export function PageHead(p: { label: string; note?: ComponentChildren; lines: string[]; lede?: ComponentChildren; id?: string }) {
  let k = 0;
  return (
    <header class="wrap page-head">
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
