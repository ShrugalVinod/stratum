import { PageHead } from "../components/PageHead";
import { ip, tools, updated, whatsNew } from "../content/judges";

/** /innovation — what STRATUM does that others don't, a comparison with tools that exist, and
 *  what can and cannot be protected. Every tool listed was checked, with its source. */
export function Innovation() {
  return (
    <div class="page">
      <PageHead
        label="What's new"
        note={`Updated ${updated}`}
        lines={["What only", "STRATUM does."]}
        lede="Other teams forecast contrails. Nobody we found checks those forecasts over India against what a satellite sees. Here is what is new, how it compares with tools that already exist, and what can be protected."
      />
      <div class="wrap">
        <section class="section pt0" aria-labelledby="new">
          <div class="sec-head rv">
            <p class="label red" id="new">
              §1 · What is new
            </p>
            <span class="mono-s">"that we found": we searched, we cannot prove a negative</span>
          </div>
          <div class="j-grid rv stagger">
            {whatsNew.map(([t, b], i) => (
              <article class="j-card" style={{ "--i": i }}>
                <span class="j-k mono-s red">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="section" aria-labelledby="cmp">
          <div class="sec-head rv">
            <p class="label red" id="cmp">
              §2 · What already exists
            </p>
            <span class="mono-s">only tools we checked, with sources</span>
          </div>
          <div class="table-wrap rv rv-fade">
            <table class="src-table j-table">
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  <th scope="col">What it does</th>
                  <th scope="col">Built or tested over</th>
                  <th scope="col">Checked by satellite over India?</th>
                  <th scope="col">Open?</th>
                  <th scope="col">Where STRATUM differs</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr>
                    <th scope="row" class="display">
                      {t.name}
                      <br />
                      <a class="mono-s" href={t.href} target="_blank" rel="noopener">
                        {t.src} ↗
                      </a>
                    </th>
                    <td>{t.what}</td>
                    <td>{t.where}</td>
                    <td class="mono">{t.satIndia}</td>
                    <td>{t.open}</td>
                    <td>{t.vs}</td>
                  </tr>
                ))}
                <tr class="j-us">
                  <th scope="row" class="display">
                    STRATUM
                  </th>
                  <td>Forecasts lasting contrails over India, checks them against Meteosat-9, learns where they go wrong, and advises a level change only when the cautious estimate still helps.</td>
                  <td>India, 6–37°N, 68–98°E</td>
                  <td class="mono">Yes</td>
                  <td>Code and research data open</td>
                  <td>Small: 12 flight days, no airline trial yet, no monsoon test.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section" aria-labelledby="ip">
          <div class="sec-head rv">
            <p class="label red" id="ip">
              §3 · Can it be protected?
            </p>
            <span class="mono-s">intellectual property and defensibility</span>
          </div>
          <div class="j-grid rv stagger">
            {ip.map(([t, b], i) => (
              <article class="j-card" style={{ "--i": i }}>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
          <p class="small muted rv">
            Next: <a href="/business">the business plan</a> · <a href="/next">what's next</a> · <a href="/references">references</a>
          </p>
        </section>
      </div>
      <div class="spacer" />
    </div>
  );
}
