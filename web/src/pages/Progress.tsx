import { useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { progress } from "../content/site";
import { T, tx } from "../i18n";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MON_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const day = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d} ${tx(MON, MON_HI)[Number(m) - 1]} ${y}`;
};

export function Progress() {
  const [phase, setPhase] = useState<number | null>(null);
  const phases = [...new Set(progress.map((p) => p.phase))].sort((a, b) => a - b);
  const items = progress.filter((p) => phase === null || p.phase === phase);
  return (
    <div class="page">
      <PageHead
        label="Logbook"
        note={tx(`${progress.length} entries · newest first`, `${progress.length} प्रविष्टियाँ · नई पहले`)}
        lines={["Progress."]}
        lede="Entries are added when something is finished, not when it is promised."
      />
      <div class="wrap">
        <div class="chips rv rv-fade" role="group" aria-label={T("Filter by phase")}>
          <button class={phase === null ? "on" : ""} aria-pressed={phase === null} onClick={() => setPhase(null)}>
            {T("All")}
          </button>
          {phases.map((p) => (
            <button class={phase === p ? "on" : ""} aria-pressed={phase === p} onClick={() => setPhase(p)}>
              P{p}
            </button>
          ))}
        </div>
        <div class="logbook rv rv-fade" role="table" aria-label={T("Progress log")}>
          <div class="lb-row lb-head" role="row">
            <span role="columnheader">{T("Date")}</span>
            <span role="columnheader">{T("Phase")}</span>
            <span role="columnheader">{T("Entry")}</span>
          </div>
          {items.map((e, i) => (
            <div class="lb-row lb-item" role="row" key={`${phase}-${e.date}-${e.title}`} style={{ "--i": i }}>
              <span role="cell" class="mono">
                <time dateTime={e.date}>{day(e.date)}</time>
              </span>
              <span role="cell" class="mono red">
                P{e.phase}
              </span>
              <span role="cell">
                <b>{T(e.title)}</b>
                <span class="muted">{T(e.body)}</span>
              </span>
            </div>
          ))}
          {[0, 1].map(() => (
            <div class="lb-row lb-blank" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
