import { PageHead } from "../components/PageHead";
import { dataSources } from "../content/site";

export function AboutData() {
  return (
    <>
      <PageHead
        eyebrow="About the data"
        title="Know what the evidence can carry."
        side={<p>The dataset is a set of inputs and constraints, not a claim of certainty.</p>}
      />
      <div class="wrap">
        <div class="table-wrap reveal">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">What it is</th>
                <th scope="col">How we use it</th>
                <th scope="col">Licence / credit</th>
                <th scope="col">Limits</th>
              </tr>
            </thead>
            <tbody>
              {dataSources.map((d) => (
                <tr>
                  <th scope="row">{d.source}</th>
                  <td>{d.what}</td>
                  <td>{d.use}</td>
                  <td>{d.credit}</td>
                  <td>{d.limits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="about-grid reveal">
          <div>
            <p class="eyebrow">Limits we are honest about</p>
            <h2 class="h3" style="font-size:clamp(26px,3vw,40px)">
              12 flight days, coverage and reanalysis humidity all matter.
            </h2>
          </div>
          <div class="about-text">
            <p>
              Flight data cover the first day of each month from March 2025 to February 2026 — twelve days, not a continuous year. How many
              scheduled flights the receivers capture over India is being audited in November 2026. ERA5 humidity at cruise height is a
              model estimate, not a measurement; correcting it with satellite evidence is the point of the project.
            </p>
            <h3 id="privacy">Privacy</h3>
            <p>
              Only commercial airline flights are shown. Aircraft identifiers are replaced by salted hashes; business jets, private and
              government flights never appear. This site uses no cookies, analytics or trackers.
            </p>
            <h3 id="ai-use">Use of AI tools</h3>
            <p>
              The team used AI assistants (Anthropic Claude) to find and summarise literature, check calculations, write and test analysis
              code, build this website and draft documents. Every pre-registered value and design decision was made and approved by the
              team, and no AI-generated labels, observations or results are presented as data.
            </p>
          </div>
        </div>
      </div>
      <div style="height:96px" />
    </>
  );
}
