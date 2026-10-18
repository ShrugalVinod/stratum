import { PageHead } from "../components/PageHead";
import { Split } from "../components/Split";
import { hypotheses, methods, site } from "../content/site";

export function Methods() {
  return (
    <div class="page">
      <PageHead
        label="Protocol · pre-registered"
        note="Locked 13 Oct 2026 · SHA-256 fingerprint"
        lines={["Written down", "before results."]}
        lede="Our analysis plan was locked on 13 Oct 2026. Nothing here is a finding."
      />
      <div class="wrap">
        <ol class="mrows">
          {methods.map((m, i) => (
            <li class="rv">
              <span class="mono red">M{i + 1}</span>
              <div>
                <h2 class="display d-m">{m.title}</h2>
                <p>{m.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section class="section" aria-labelledby="hyp">
          <div class="sec-head rv">
            <p class="label red" id="hyp">
              §2 · Hypotheses · NOTAM
            </p>
            <span class="mono-s">{hypotheses.length} notices in force</span>
          </div>
          <div class="notams">
            {hypotheses.map((h, i) => (
              <article class="notam rv" style={{ "--d": (i % 2) * 120 }}>
                <header>
                  <span class="mono">A000{i + 1}/26 NOTAMN</span>
                  <b class="mono">{h.id}</b>
                </header>
                <div class="notam-body">
                  <p class="mono notam-q">
                    Q) VIDF/QSTRATUM/IV/NBO/E/280/420
                    <br />
                    A) VIDF VABF B) 2610130000 C) PERM
                  </p>
                  <p class="notam-e">E) {h.plain}</p>
                  <p class="notam-test">
                    <span class="label">Test</span> {h.test}
                  </p>
                  {h.result && (
                    <p class="notam-test notam-result">
                      <span class="label">Result</span> <b>{h.result.verdict}.</b> {h.result.body}
                    </p>
                  )}
                </div>
                <footer class="mono-s">
                  {h.result ? `Pre-registered · tested ${h.result.date} · ${h.result.verdict.toLowerCase()}` : "Pre-registered · not yet tested"}
                </footer>
              </article>
            ))}
          </div>
          <p class="muted notam-note rv">
            H1 and H2 are interpreted only if at least 300 matched satellite-observed contrails exist; otherwise they are reported as
            underpowered. Scored on the full study domain (6–37°N, 68–98°E); the Delhi–Mumbai corridor is the development area. VIDF and VABF
            are the Delhi and Mumbai flight information regions.
          </p>
        </section>
      </div>
      <a class="dl-bar" href={site.paperPdf} target="_blank" rel="noopener">
        <span class="wrap dl-inner">
          <span class="display d-l">
            <Split text="Download the research protocol (PDF)" />
          </span>
          <span class="mono-s">PDF · 19 pp ↓</span>
        </span>
      </a>
    </div>
  );
}
