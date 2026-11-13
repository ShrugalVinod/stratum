import { PageHead } from "../components/PageHead";
import { costNote, costsNow, costsService, customers, funding, market, marketMath, offer, priceNote, reach, updated } from "../content/judges";

/** /business — who STRATUM is for, how we would reach them, the market, what we would sell and
 *  for how much, what it costs to run, and the money we need. Proposals are labelled as such. */
export function Business() {
  return (
    <div class="page">
      <PageHead
        label="Business plan"
        note={`Updated ${updated}`}
        lines={["Who pays,", "who uses it,", "what it costs."]}
        lede="STRATUM is a research project today. This page is our plan for turning it into a service: who it is for, how we would reach them, what we would charge, and what it costs to run. No airline has agreed to anything yet, and our price is a proposal."
      />
      <div class="wrap">
        <section class="section pt0" aria-labelledby="who">
          <div class="sec-head rv">
            <p class="label red" id="who">
              §1 · Who it's for
            </p>
            <span class="mono-s">the buyer and the user are often different people</span>
          </div>
          <div class="table-wrap rv rv-fade">
            <table class="src-table j-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Why they need it</th>
                  <th scope="col">Who pays</th>
                  <th scope="col">Who uses it</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr>
                    <th scope="row" class="display">
                      {c.who}
                    </th>
                    <td>{c.why}</td>
                    <td>{c.pays}</td>
                    <td>{c.uses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="small muted rv">
            The EU rule and its dates: <a href="/airlines">For airlines</a>.
          </p>
        </section>

        <section class="section" aria-labelledby="reach">
          <div class="sec-head rv">
            <p class="label red" id="reach">
              §2 · How we'd reach them
            </p>
            <span class="mono-s">free science first, then a shadow trial</span>
          </div>
          <div class="j-grid rv stagger">
            {reach.map(([t, b], i) => (
              <article class="j-card" style={{ "--i": i }}>
                <span class="j-k mono-s red">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="section" aria-labelledby="market">
          <div class="sec-head rv">
            <p class="label red" id="market">
              §3 · Market size
            </p>
            <span class="mono-s">cited numbers only</span>
          </div>
          <div class="j-nums rv stagger">
            {market.map((m) => (
              <div>
                <b>{m.n}</b>
                <span>{m.what}</span>
                <a class="mono-s" href={m.href} target="_blank" rel="noopener">
                  {m.src} ↗
                </a>
              </div>
            ))}
          </div>
          <p class="lede rv" style={{ "margin-top": "22px" }}>
            {marketMath}
          </p>
        </section>

        <section class="section" aria-labelledby="model">
          <div class="sec-head rv">
            <p class="label red" id="model">
              §4 · What we'd sell, and for how much
            </p>
            <span class="mono-s">proposed price · not yet tested with an airline</span>
          </div>
          <div class="table-wrap rv rv-fade">
            <table class="src-table j-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">What it is</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {offer.map(([a, b, c]) => (
                  <tr>
                    <th scope="row" class="display">
                      {a}
                    </th>
                    <td>{b}</td>
                    <td class="mono">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="small muted rv">{priceNote}</p>
        </section>

        <section class="section" aria-labelledby="costs">
          <div class="sec-head rv">
            <p class="label red" id="costs">
              §5 · What it costs to run
            </p>
            <span class="mono-s">today, and as a daily service</span>
          </div>
          <div class="j-stack">
            <div class="table-wrap rv rv-fade">
              <table class="src-table j-table">
                <caption class="label" style={{ "text-align": "left", "padding-bottom": "8px" }}>
                  Today (research)
                </caption>
                <tbody>
                  {costsNow.map(([a, b, c]) => (
                    <tr>
                      <th scope="row" class="j-rowh">{a}</th>
                      <td class="mono">{b}</td>
                      <td class="muted">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="table-wrap rv rv-fade">
              <table class="src-table j-table">
                <caption class="label" style={{ "text-align": "left", "padding-bottom": "8px" }}>
                  As a daily service for a first airline
                </caption>
                <tbody>
                  {costsService.map(([a, b, c]) => (
                    <tr>
                      <th scope="row" class="j-rowh">{a}</th>
                      <td class="mono">{b}</td>
                      <td class="muted">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p class="small muted rv">{costNote}</p>
        </section>

        <section class="section" aria-labelledby="fund">
          <div class="sec-head rv">
            <p class="label red" id="fund">
              §6 · Funding we need
            </p>
            <span class="mono-s">to reach a first pilot</span>
          </div>
          <div class="j-mv">
            <div class="j-card rv">
              <span class="j-k label">How much, and for what</span>
              <p>{funding.need}</p>
              <ul class="small" style={{ "margin-top": "10px", "padding-left": "1.1em" }}>
                {funding.goesTo.map((g) => (
                  <li>{g}</li>
                ))}
              </ul>
            </div>
            <div class="j-card rv">
              <span class="j-k label">Where it would come from</span>
              <ul class="small" style={{ margin: 0, "padding-left": "1.1em" }}>
                {funding.sources.map((g) => (
                  <li>{g}</li>
                ))}
              </ul>
            </div>
          </div>
          <p class="small muted rv">
            Want to talk about a pilot? Write to <a href="mailto:aerospaceonyx@gmail.com">aerospaceonyx@gmail.com</a>. See also{" "}
            <a href="/innovation">what's new</a> and <a href="/next">what's next</a>.
          </p>
        </section>
      </div>
      <div class="spacer" />
    </div>
  );
}
