import { useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { progress } from "../content/site";

export function Progress() {
  const [phase, setPhase] = useState<number | null>(null);
  const phases = [...new Set(progress.map((p) => p.phase))].sort((a, b) => b - a);
  const items = progress.filter((p) => phase === null || p.phase === phase);
  return (
    <>
      <PageHead eyebrow="Progress / Lab diary" title="What we did, when we did it." side={<p>Dated entries from the project log. Newest first.</p>} />
      <div class="wrap progress">
        <aside aria-label="Filter by phase">
          <p class="eyebrow">Filter by phase</p>
          <button class={phase === null ? "on" : ""} onClick={() => setPhase(null)}>
            All phases
          </button>
          {phases.map((p) => (
            <button class={phase === p ? "on" : ""} onClick={() => setPhase(p)}>
              Phase {p}
            </button>
          ))}
        </aside>
        <ol class="timeline">
          {items.map((e) => (
            <li class="reveal">
              <time class="mono muted" dateTime={e.date}>
                {e.date}
              </time>
              <div>
                <span class="badge">Phase {e.phase}</span>
                <h2 class="h3" style="margin-top:14px">
                  {e.title}
                </h2>
                <p class="muted">{e.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
