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
              no real flight was changed. The results are those of the logged final runs (Results page); the map shows uncorrected physics, the published
              correction and STRATUM side by side.
            </p>
          </section>
          <section class="note rv" id="privacy">
            <p class="label red">§3 · Privacy</p>
            <p>
              Only commercial airline flights are shown. Aircraft identifiers are replaced by salted hashes; business jets, private and
              government flights never appear. No login, no forms, no cookies, no analytics, no trackers. Live sky: if you choose "use my
              location", your position stays in your browser; our server only receives it rounded to half a degree (about 50 km), to fetch the
              aircraft nearby, and keeps nothing. Live aircraft addresses (ICAO24) are never shown or stored. Spot a contrail: your
              photo is never uploaded; its time and place are read on your device and only the rounded location is sent.
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
          <section class="note rv" id="code">
            <p class="label red">§5 · Code, data and how to cite</p>
            <p>
              <b>Code:</b> Apache-2.0. <b>Our derived data</b> (segment-level predictions and labels for commercial flights with hashed ids, model
              files, evaluation reports, the pre-registration lock and the final-runs log) are released under CC BY 4.0 (parts derived from the DLR
              expert labels: CC BY-NC 4.0) as <a href="https://github.com/ShrugalVinod/stratum/releases/tag/v1.0.0">stratum-release-1.0.0.zip</a>.
              Raw data are not redistributed: ERA5 (Copernicus licence), Meteosat imagery (EUMETSAT), ADS-B Exchange tracks and the DLR expert
              labels (CC BY-NC 4.0) are re-downloaded with the scripts in the repository.
            </p>
            <p>
              <b>Reproduce:</b> open <a href="https://colab.research.google.com/github/ShrugalVinod/stratum/blob/main/colab/reproduce_results.ipynb">the
              one-click Colab notebook</a> (every results figure, then H1 and H2 recomputed from the released data, ≈ 5 min, no keys), or follow
              "Reproduce the results" in the <a href="https://github.com/ShrugalVinod/stratum">repository</a>. Every final result can be checked
              against <code>_locks/final_runs.jsonl</code>.
            </p>
            <p>
              <b>Cite:</b> Vinod S., Harsoda A., Kupnur I., Shah A. (2026). <i>STRATUM: how well can persistent contrails be predicted over India?</i>{" "}
              Version 1.0.0, Zenodo.{" "}
              <a href="https://doi.org/10.5281/zenodo.23480202">doi.org/10.5281/zenodo.23480202</a>
            </p>
          </section>
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
