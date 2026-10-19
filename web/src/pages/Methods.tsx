import { PageHead } from "../components/PageHead";
import { Split } from "../components/Split";
import { useEffect, useState } from "preact/hooks";
import { deviations, didntWork, hypotheses, methods, modelCard, modelFeatures, site, threats } from "../content/site";
import { loadManifest, loadResults } from "../data/load";

/** Mean |SHAP| per input over the outer folds (from results.json; training rows only). */
function useShap(): [string, number][] | null {
  const [v, setV] = useState<[string, number][] | null>(null);
  useEffect(() => {
    loadManifest()
      .then(({ build, manifest }) => (manifest.results_file ? loadResults(build, manifest.results_file) : null))
      .then((r) => {
        const val = (r as Record<string, any> | null)?.validation as Record<string, { shap_importance?: Record<string, number> }> | undefined;
        if (!val) return;
        const acc: Record<string, number[]> = {};
        Object.values(val).forEach((f) => Object.entries(f.shap_importance ?? {}).forEach(([k, x]) => (acc[k] ??= []).push(x)));
        const mean = Object.entries(acc).map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / xs.length] as [string, number]);
        if (mean.length) setV(mean.sort((a, b) => b[1] - a[1]));
      })
      .catch(() => setV(null));
  }, []);
  return v;
}

const NICE: Record<string, string> = {
  rhi_at_level: "Humidity (RHi) at the level", rhi_level_below: "RHi one level below", rhi_level_above: "RHi one level above",
  rhi_vertical_gradient: "Vertical RHi gradient", temperature: "Temperature", temp_minus_TLM: "T − formation threshold", pressure: "Pressure",
  cloud_ice_water_content: "Cloud ice", high_cloud_fraction: "High cloud", vertical_velocity: "Vertical velocity", vertical_wind_shear: "Wind shear",
  distance_to_tropopause_wmo: "Distance to tropopause", latitude: "Latitude", longitude: "Longitude", month_sin: "Month (sin)", month_cos: "Month (cos)",
  local_solar_time_sin: "Local time (sin)", local_solar_time_cos: "Local time (cos)",
};

export function Methods() {
  const shap = useShap();
  return (
    <div class="page">
      <PageHead
        label="Protocol · pre-registered"
        note="Locked 13 Oct 2026 · SHA-256 fingerprint"
        lines={["Written down", "before results."]}
        lede="Our analysis plan was locked on 13 Oct 2026. A result appears only once its one logged final run exists."
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

        <section class="section" aria-labelledby="inputs">
          <div class="sec-head rv">
            <p class="label red" id="inputs">
              §3 · Correction model · inputs
            </p>
            <span class="mono-s">18 inputs · pre-registered</span>
          </div>
          <p class="rv">
            The correction model is a set of gradient-boosted trees (LightGBM) trained on flight segments that satellites could check. Every input
            is ERA5 weather at the segment or the flight's own position and time; nothing comes from the satellite detector or from the labels.
            Two inputs are constrained: more humidity can only raise the predicted chance of a lasting contrail (+), and air warmer than the
            formation threshold can only lower it (−).
          </p>
          <div class="table-wrap rv rv-fade">
            <table class="src-table">
              <thead>
                <tr>
                  <th scope="col">Input</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Why it might matter</th>
                  <th scope="col">Constraint</th>
                </tr>
              </thead>
              <tbody class="rv stagger">
                {modelFeatures.map((f, i) => (
                  <tr style={{ "--i": i }}>
                    <th scope="row" class="display">
                      {f.name}
                    </th>
                    <td class="mono">{f.unit}</td>
                    <td>{f.why}</td>
                    <td class="mono">{f.mono ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="muted notam-note rv">Month and local solar time each enter as a sine and cosine pair, so 16 rows describe 18 inputs.</p>
        </section>

        {shap && (
          <section class="section" aria-labelledby="shap">
            <div class="sec-head rv">
              <p class="label red" id="shap">
                §4 · What the model relies on
              </p>
              <span class="mono-s">mean |SHAP| over 6 trained models · training rows</span>
            </div>
            <div class="shap-bars rv">
              {shap.map(([k, v]) => (
                <div class="shap-row">
                  <span class="mono-s">{NICE[k] ?? k}</span>
                  <i style={{ "--w": v / shap[0][1] }} />
                  <span class="mono-s muted">{v.toFixed(3)}</span>
                </div>
              ))}
            </div>
            <p class="small muted">
              TreeSHAP, in log-odds of a satellite-seen contrail. Humidity at and around the flight level dominates; the model rises with humidity and
              falls as the air gets warmer than the formation threshold (checked: no wrong-way step in any model).
            </p>
          </section>
        )}

        <section class="section" aria-labelledby="card">
          <div class="sec-head rv">
            <p class="label red" id="card">
              §5 · Model card
            </p>
            <span class="mono-s">intended use · limits · ethics</span>
          </div>
          <div class="table-wrap rv rv-fade">
            <table class="src-table">
              <tbody>
                {modelCard.map(([k, v]) => (
                  <tr>
                    <th scope="row" class="display">
                      {k}
                    </th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section" aria-labelledby="threats">
          <div class="sec-head rv">
            <p class="label red" id="threats">
              §6 · Threats to validity
            </p>
            <span class="mono-s">paper Table 7 · and how each turned out</span>
          </div>
          <div class="table-wrap rv rv-fade">
            <table class="src-table">
              <thead>
                <tr>
                  <th scope="col">Risk</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Planned response</th>
                  <th scope="col">How it turned out</th>
                </tr>
              </thead>
              <tbody class="rv stagger">
                {threats.map((t, i) => (
                  <tr style={{ "--i": i }}>
                    <th scope="row" class="display">
                      {t.risk}
                    </th>
                    <td>{t.effect}</td>
                    <td class="muted">{t.mitigation}</td>
                    <td>{t.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section" aria-labelledby="devs">
          <div class="sec-head rv">
            <p class="label red" id="devs">
              §7 · Changes to the plan
            </p>
            <span class="mono-s">{deviations.length} deviations · each with the team's OK before results</span>
          </div>
          <ol class="mrows">
            {deviations.map((d) => (
              <li class="rv">
                <span class="mono red">{d.id}</span>
                <div>
                  <h3 class="display d-s">{d.title}</h3>
                  <p>
                    <span class="mono-s muted">{d.date} · </span>
                    {d.why}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section class="section" aria-labelledby="dnw">
          <div class="sec-head rv">
            <p class="label red" id="dnw">
              §8 · What didn't work
            </p>
            <span class="mono-s">the paper promises this list</span>
          </div>
          <ul class="dnw rv">
            {didntWork.map((d) => (
              <li>{d}</li>
            ))}
          </ul>
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
