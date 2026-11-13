import { useEffect } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { dataSources } from "../content/site";
import { T } from "../i18n";

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
                <th scope="col">{T("Source")}</th>
                <th scope="col">{T("What it is")}</th>
                <th scope="col">{T("How we use it")}</th>
                <th scope="col">{T("Credit")}</th>
                <th scope="col">{T("Limits")}</th>
              </tr>
            </thead>
            <tbody class="rv stagger">
              {dataSources.map((d, i) => (
                <tr style={{ "--i": i }}>
                  <th scope="row" class="display">
                    {d.source}
                  </th>
                  <td>{T(d.what)}</td>
                  <td>{T(d.use)}</td>
                  <td class="mono">{d.credit}</td>
                  <td class="muted">{T(d.limits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div class="notes">
          <section class="note rv">
            <p class="label red">§2 · {T("Limits")}</p>
            <p>
              {T(
                "Flight data cover the first day of each month from March 2025 to February 2026: twelve days, not a continuous year. Our coverage audit (finished 11 Nov 2026) found that free trackers do not see enough Delhi–Mumbai flights from end to end to replace them, so the twelve days stay. ERA5 humidity at cruise height is a model estimate, not a measurement; checking it against the satellite is the point of the project. This is a computational study: no real flight was changed. The results are those of the logged final runs (Results page); the map shows uncorrected physics, the pycontrails latitude correction and STRATUM side by side.",
              )}
            </p>
          </section>
          <section class="note rv" id="privacy">
            <p class="label red">§3 · {T("Privacy")}</p>
            <p>
              {T(
                "Only commercial airline flights are shown; business jets, private, government and military flights never appear. In the research data and on the map, each flight's identity is replaced by a salted hash. On the live pages (Live advice, Your flight, Spot a contrail, the 3D sky) we show what airliners broadcast publicly: the callsign (such as AXB159), the aircraft type and the route. Aircraft addresses (ICAO24) are never shown or stored. No login, no forms, no cookies, no analytics, no trackers. If you choose to use your location, it stays in your browser; our server only receives it rounded to half a degree (about 50 km) to fetch the aircraft nearby, and keeps nothing. Spot a contrail: your photo is never uploaded; its time and place are read on your device.",
              )}
            </p>
            <p>
              {T(
                "Satellite images: we show Meteosat-9 pictures, always with the credit 'Meteosat-9 imagery © EUMETSAT', and we never publish the satellite's numerical data. That is what EUMETSAT allows for its imagery.",
              )}
            </p>
          </section>
          <section class="note rv" id="ai-use">
            <p class="label red">§4 · {T("AI use")}</p>
            <p>
              {T(
                "We used an AI assistant, Anthropic's Claude, throughout the project, and we want to be plain about how. Claude wrote much of the analysis code and built most of this website, following our instructions. It drafted the contrail lines on the 100 India satellite scenes, which Aditya, Ishaan and Abeer then reviewed and corrected (15 draft lines, 0 deleted, 5 moved, 21 added; deviation D-003). It translated the website into Hindi in October 2026 (that edition has since been retired), and it helped us find and summarise papers and edit our writing, including the Innovation Brief.",
              )}
            </p>
            <p>
              {T(
                "What is ours: the research question, the hypotheses and every decision. We approved each change to the plan, and each one is logged with a reason. The detector's main check uses contrails drawn by human experts (the DLR dataset), not by AI. We reviewed and tested the work, and we take responsibility for everything published.",
              )}
            </p>
          </section>
          <section class="note rv" id="code">
            <p class="label red">§5 · {T("Code, data and how to cite")}</p>
            <p>
              <b>Code:</b> Apache-2.0. <b>Our derived data</b> (segment-level predictions and labels for commercial flights with hashed ids, model
              files, evaluation reports, the pre-registration lock and the final-runs log) are released under CC BY 4.0 (parts derived from the DLR
              expert labels: CC BY-NC 4.0) as <a href="https://github.com/ShrugalVinod/stratum/releases/tag/v1.0.0">stratum-release-1.0.0.zip</a>.
              Raw data are not redistributed: ERA5 (Copernicus licence), Meteosat numerical data (EUMETSAT; we show images only, with credit), ADS-B Exchange tracks and the DLR expert
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
              Zenodo, all versions:{" "}
              <a href="https://doi.org/10.5281/zenodo.23480201">doi.org/10.5281/zenodo.23480201</a> (version 1.0.0:{" "}
              <a href="https://doi.org/10.5281/zenodo.23480202">10.5281/zenodo.23480202</a>)
            </p>
          </section>
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
