import { useEffect } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { dataSources } from "../content/site";

export function AboutData() {
  // lazy page: jump to #privacy / #ai-use once it exists
  useEffect(() => {
    if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);
  return (
    <div class="page">
      <PageHead
        label="About the data"
        note={`${dataSources.length} sources`}
        lines={["Sources & limits."]}
        lede="Every dataset, what we use it for, who to credit, and where it falls short."
      />
      <div class="wrap">
        <div class="table-wrap rv rv-fade">
          <table class="src-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">What it is</th>
                <th scope="col">How we use it</th>
                <th scope="col">Credit</th>
                <th scope="col">Limits</th>
              </tr>
            </thead>
            <tbody class="rv stagger">
              {dataSources.map((d, i) => (
                <tr style={{ "--i": i }}>
                  <th scope="row" class="display">
                    {d.source}
                  </th>
                  <td>{d.what}</td>
                  <td>{d.use}</td>
                  <td class="mono">{d.credit}</td>
                  <td class="muted">{d.limits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div class="notes">
          <section class="note rv">
            <p class="label red">§2 · Limits</p>
            <p>
              Flight data cover the first day of each month from March 2025 to February 2026 — twelve days, not a continuous year. How many
              scheduled flights the receivers capture over India is being audited in November 2026. ERA5 humidity at cruise height is a model
              estimate, not a measurement; correcting it with satellite evidence is the point of the project. This is a computational study:
              no real flight was changed, and nothing on this site is a result until Phase 7.
            </p>
          </section>
          <section class="note rv" id="privacy">
            <p class="label red">§3 · Privacy</p>
            <p>
              Only commercial airline flights are shown. Aircraft identifiers are replaced by salted hashes; business jets, private and
              government flights never appear. No login, no forms, no cookies, no analytics, no trackers.
            </p>
          </section>
          <section class="note rv" id="ai-use">
            <p class="label red">§4 · AI use</p>
            <p>
              The team used AI assistants (Anthropic Claude) to find and summarise literature, check calculations, write and test analysis
              code, build this website and draft documents. Every pre-registered value and design decision was made and approved by the team.
              One exception to "humans label the data": for the 100 India satellite scenes used as a secondary check of the contrail detector,
              Claude drew draft contrail lines and a team member reviewed and corrected every scene (deviation D-003, logged before any result).
              These labels are reported as AI-assisted. The primary detector check uses labels by human contrail experts (DLR dataset), and
              no AI-generated observations or results are presented as data.
            </p>
          </section>
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
