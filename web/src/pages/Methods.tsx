import { ExtIcon } from "../components/Footer";
import { PageHead } from "../components/PageHead";
import { hypotheses, methods, site } from "../content/site";

export function Methods() {
  return (
    <>
      <PageHead
        eyebrow="Methods / Protocol"
        title="The protocol before the result."
        side={<p>A compact account of what the first version does — and what it cannot claim yet.</p>}
      />
      <div class="wrap">
        <div class="callout" role="note">
          <span class="dot">Results arrive in Phase 7 — nothing here is a result yet.</span>
          <span class="badge">Pre-registered 13 Oct 2026</span>
        </div>
        <div class="rows">
          {methods.map((m, i) => (
            <div class="row">
              <span class="n">{String(i + 1).padStart(2, "0")}</span>
              <h2 class="h3">{m.title}</h2>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
        <section class="section" style="padding-bottom:0" aria-labelledby="hyp">
          <p class="eyebrow" id="hyp">
            Pre-registered hypotheses
          </p>
          <div class="hyp-grid">
            {hypotheses.map((h) => (
              <article class="card hyp">
                <h3>{h.id}</h3>
                <p>{h.plain}</p>
                <p class="test">{h.test}</p>
                <span class="state">Pre-registered · not yet tested</span>
              </article>
            ))}
          </div>
          <p class="muted" style="margin-top:20px;font-size:14.5px">
            H1 and H2 are interpreted only if at least 300 matched satellite-observed contrails exist; otherwise they are reported as
            underpowered. Scored on the full study domain (6–37°N, 68–98°E); the Delhi–Mumbai corridor is the development area.
          </p>
          <a class="download" href={site.paperPdf} target="_blank" rel="noopener">
            Download the research protocol (PDF) <ExtIcon />
          </a>
        </section>
      </div>
      <div style="height:96px" />
    </>
  );
}
