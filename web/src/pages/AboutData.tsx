import { useEffect } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { dataSources } from "../content/site";
import { T, tx } from "../i18n";

export function AboutData() {
  // lazy page: jump to #privacy / #ai-use once it exists
  useEffect(() => {
    if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);
  return (
    <div class="page">
      <PageHead
        label="About the data"
        note={tx(`${dataSources.length} sources`, `${dataSources.length} स्रोत`)}
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
                "Flight data cover the first day of each month from March 2025 to February 2026 — twelve days, not a continuous year. How many scheduled flights the receivers capture over India is being audited in November 2026. ERA5 humidity at cruise height is a model estimate, not a measurement; correcting it with satellite evidence is the point of the project. This is a computational study: no real flight was changed. The results are those of the logged final runs (Results page); the map shows uncorrected physics, the published correction and STRATUM side by side.",
              )}
            </p>
          </section>
          <section class="note rv" id="privacy">
            <p class="label red">§3 · {T("Privacy")}</p>
            <p>
              {T(
                'Only commercial airline flights are shown. Aircraft identifiers are replaced by salted hashes; business jets, private and government flights never appear. No login, no forms, no cookies, no analytics, no trackers. Live sky: if you choose "use my location", your position stays in your browser; our server only receives it rounded to half a degree (about 50 km), to fetch the aircraft nearby, and keeps nothing. Live aircraft addresses (ICAO24) are never shown or stored. Spot a contrail: your photo is never uploaded; its time and place are read on your device and only the rounded location is sent. Your language choice (English or Hindi) is remembered in your browser only.',
              )}
            </p>
          </section>
          <section class="note rv" id="ai-use">
            <p class="label red">§4 · {T("AI use")}</p>
            <p>
              {T(
                "The research question, hypotheses, pre-registered analysis plan, and every foundational design decision were entirely conceived and directed by the team. To execute the project, we worked openly with Anthropic Claude as an engineering and development assistant. Under our direct supervision, Claude generated and tested a significant portion of the analysis codebase, co-built the project website, assisted with literature summarization, verified calculations, and drafted documentation. Additionally, the Hindi translation of the website was generated via AI and checked by the team. The team reviewed and tested the work and takes responsibility for everything published.",
              )}
            </p>
            <p>
              <b>{T("Data integrity and validation")}.</b>{" "}
              {T(
                "Absolute data integrity was prioritized across all pipelines. The primary validation of the contrail detector relies strictly on independent, human-expert labels from the DLR dataset. For a secondary cross-check on 100 regional India satellite scenes, we implemented a hybrid pipeline where Claude generated baseline geometric drafts of the contrail lines. To minimize algorithmic bias and ensure accuracy, a team member manually audited, overrode, and corrected every single scene (documented under pre-result deviation D-003). No unreviewed AI observations or synthetic data points are presented in our final results.",
              )}
            </p>
          </section>
          <section class="note rv" id="code">
            <p class="label red">§5 · {T("Code, data and how to cite")}</p>
            {tx(
              null,
              <p>
                <b>हिंदी में सार:</b> कोड Apache-2.0 के तहत है। हमारा व्युत्पन्न डेटा (छिपी ID वाली व्यावसायिक उड़ानों के हिस्सों के अनुमान और लेबल, मॉडल फ़ाइलें,
                मूल्यांकन रिपोर्ट, पूर्व-पंजीकरण लॉक और अंतिम-रन लॉग) CC BY 4.0 के तहत जारी है (DLR विशेषज्ञ लेबलों से बने हिस्से: CC BY-NC 4.0)। कच्चा डेटा
                दोबारा वितरित नहीं किया जाता; उसे रिपॉज़िटरी की स्क्रिप्ट से फिर डाउनलोड किया जाता है। नीचे लाइसेंस, दोबारा करने और उद्धरण का पूरा विवरण
                अंग्रेज़ी में है।
              </p>,
            )}
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
