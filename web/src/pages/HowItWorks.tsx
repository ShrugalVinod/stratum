import { useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { pipeline } from "../content/site";

export function HowItWorks() {
  const [openIdx, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHead
        eyebrow="How it works / Pipeline"
        title="A chain of evidence, not a black box."
        side={<p>Seven stages connect a flight track to a question about warming. Each stage has a clear input and output.</p>}
      />
      <div class="wrap">
        <ol class="pipe">
          {pipeline.map((s, i) => (
            <li>
              <span class="num">{String(i + 1).padStart(2, "0")}</span>
              <div class="pipe-body">
                <h2 class="h3">{s.title}</h2>
                <p class="muted pipe-sub">{s.sub}</p>
                <div class="chips">
                  <span class="chip">IN · {s.input}</span>
                  <span class="chip">OUT · {s.output}</span>
                </div>
                <button class="sci-toggle" aria-expanded={openIdx === i} onClick={() => setOpen(openIdx === i ? null : i)}>
                  For scientists
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ transform: openIdx === i ? "rotate(180deg)" : "none" }}>
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                </button>
                {openIdx === i && <p class="sci">{s.sci}</p>}
              </div>
            </li>
          ))}
        </ol>

        <section class="field-note card" aria-labelledby="fn-title">
          <div>
            <p class="eyebrow">Field note</p>
            <h2 id="fn-title" class="h3" style="font-size:clamp(26px,3vw,40px)">
              Cold, humid layers make the difference.
            </h2>
            <p class="muted" style="font-size:17px">
              A flight inside a cold, ice-supersaturated layer can leave a contrail that lasts for hours. The same route 2,000 ft above it may
              leave one that vanishes in seconds. The hard part is knowing where those layers are — that is what STRATUM checks against
              satellites.
            </p>
          </div>
          <SideView />
        </section>
      </div>
    </>
  );
}

function SideView() {
  return (
    <svg viewBox="0 0 600 260" class="sideview" role="img" aria-label="Side view: a plane inside a cold humid layer leaves a long contrail; a plane 2,000 ft above leaves a short one.">
      <rect x="0" y="0" width="600" height="260" fill="var(--raised)" />
      <rect x="0" y="120" width="600" height="70" fill="color-mix(in srgb, var(--cyan) 10%, transparent)" />
      <line x1="0" y1="120" x2="600" y2="120" stroke="var(--cyan)" stroke-dasharray="5 5" />
      <line x1="0" y1="190" x2="600" y2="190" stroke="var(--cyan)" stroke-dasharray="5 5" />
      <text x="12" y="138" fill="var(--cyan)" font-family="var(--font-mono)" font-size="11" letter-spacing="1">COLD / HUMID LAYER (RHi ≥ 100 %)</text>
      <text x="470" y="40" fill="var(--muted)" font-family="var(--font-mono)" font-size="11">+2,000 FT</text>
      <text x="200" y="240" fill="var(--muted)" font-family="var(--font-mono)" font-size="11">PLANNED LEVEL</text>
      <path d="M150 158 C 260 152, 380 150, 520 152" stroke="var(--pred)" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9" />
      <text x="128" y="163" fill="var(--ink)" font-size="18">✈</text>
      <path d="M420 74 C 445 72, 470 71, 490 72" stroke="var(--det)" stroke-width="2.5" fill="none" stroke-linecap="round" />
      <text x="398" y="79" fill="var(--ink)" font-size="18">✈</text>
    </svg>
  );
}
