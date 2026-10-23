import { useEffect, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { Results as ResultsT } from "../data/contract";
import { loadManifest, loadResults, loadWeightedSummary } from "../data/load";
import { T, tx } from "../i18n";
import { detectorCheck as DC, hypotheses as HYP, literature as LIT, secondAnalysis as SA } from "../content/site";

type Est = { value?: number; lo?: number; hi?: number } | null | undefined;
type Curve = { distance_share: number[]; ef_share: number[] } | null | undefined;

const f2 = (v?: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
const pct = (v?: number, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toPrecision(d)} %`);
const ci = (e: Est, f: (v?: number) => string = f2) => (e ? `${f(e.value)} (95 % CI ${f(e.lo)} ${tx("to", "से")} ${f(e.hi)})` : "—");

/** /results — H1–H4 as pre-registered, with their figures, the baseline comparison, reliability
 *  and the final-runs log. Every number comes from results.json (copied from the logged runs). */
export function Results() {
  const [res, setRes] = useState<ResultsT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ws, setWs] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    loadWeightedSummary().then(setWs);
  }, []);
  useEffect(() => {
    loadManifest()
      .then(({ build, manifest }) => {
        if (!manifest.results_file) throw new Error("This data build has no results yet.");
        return loadResults(build, manifest.results_file);
      })
      .then(setRes)
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);
  const r = res as (ResultsT & Record<string, any>) | null;
  const h = (id: string) => r?.hypotheses.find((x) => x.id === id) as (Record<string, any> & { estimate?: Est }) | undefined;
  return (
    <div class="page results">
      <PageHead
        label="Results · logged final runs"
        note="Pre-registered 13 Oct 2026 · tested 18–19 Oct 2026"
        lines={["What we found."]}
        lede="Four hypotheses, each tested once with its rule fixed in advance. A hypothesis that is not supported is a result too, and we show it the same way."
      />
      <div class="wrap">
        {err && <p class="muted mono">{T(err)}</p>}
        {!r && !err && <p class="muted mono">{T("Loading results…")}</p>}
        {r && (
          <>
            <section class="section pt0" aria-labelledby="h-cards">
              <div class="sec-head rv">
                <p class="label red" id="h-cards">
                  {T("§1 · Hypotheses")}
                </p>
                <span class="mono-s">{tx(`${r.hypotheses.length} tested`, `${r.hypotheses.length} परखी गईं`)}</span>
              </div>
              <div class="res-cards">
                {r.hypotheses.map((x) => {
                  const pre = HYP.find((p) => p.id === x.id);
                  return (
                    <article class="res-card rv" id={x.id.toLowerCase()}>
                      <header>
                        <b class="mono">{x.id}</b>
                        <span class={`verdict mono-s ${x.verdict === "supported" ? "yes" : "no"}`}>{T(x.verdict)}</span>
                      </header>
                      <p class="res-claim">{T(pre?.plain ?? x.statistic)}</p>
                      <p class="small muted">
                        <span class="label">{T("Rule")}</span> {T(x.statistic)}: {T(x.rule)}
                      </p>
                      <p class="res-num mono">{x.id === "H3" ? ci(x.estimate, (v) => pct(v)) : ci(x.estimate)}</p>
                      {x.id === "H1" && <RatioBar e={x.estimate} />}
                      {x.id === "H2" && <SkillBars h={x} />}
                      {x.id === "H3" && <Lorenz curves={r.concentration_curves} />}
                      {x.id === "H4" && <NightBars h={x} />}
                      {pre?.result && <p class="small">{T(pre.result.body)}</p>}
                      <p class="mono-s muted">
                        {T("Final run")} {x.run_id ?? "—"}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section class="section" aria-labelledby="base">
              <div class="sec-head rv">
                <p class="label red" id="base">
                  {T("§2 · Baselines and STRATUM on held-out seasons")}
                </p>
                <span class="mono-s">{T("mean Brier skill score over 4 seasons [95 % CI]")}</span>
              </div>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">{T("Forecast")}</th>
                      <th scope="col">{T("vs B3 (pre-registered)")}</th>
                      <th scope="col">{T("vs constant rate")}</th>
                      <th scope="col">{T("vs climatology (B0)")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((r.h2_mean_over_seasons ?? {}) as Record<string, Record<string, Est>>).map(([m, v]) => (
                      <tr>
                        <th scope="row" class="mono">
                          {LABEL[m] ? T(LABEL[m]) : m}
                        </th>
                        <td class="mono">{m === "B3" ? T("reference") : ci(v.bss_vs_B3)}</td>
                        <td class="mono">{m === "RATE" ? T("reference") : ci(v.bss_vs_RATE)}</td>
                        <td class="mono">{m === "B0" ? T("reference") : ci(v.bss_vs_B0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="small muted">
                {T(
                  "Brier skill score: 1 = perfect, 0 = no better than the reference, negative = worse. B3 says only yes or no, so any sensible probability beats it; the constant rate (the training contrail rate everywhere) is the strictest reference.",
                )}
              </p>
              <Reliability rel={r.reliability?.phase7} />
            </section>

            {h("H1") && r.h1_sensitivity && (
              <section class="section" aria-labelledby="sens">
                <div class="sec-head rv">
                  <p class="label red" id="sens">
                    {T("§3 · Is H1 robust?")}
                  </p>
                  <span class="mono-s">{T("same test, other reasonable choices")}</span>
                </div>
                <div class="table-wrap rv rv-fade">
                  <table class="src-table res-table">
                    <thead>
                      <tr>
                        <th scope="col">{T("Variant")}</th>
                        <th scope="col">{T("Observed")}</th>
                        <th scope="col">{T("Ratio [95 % CI]")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(r.h1_sensitivity as Record<string, { observed_y1: number; ratio: Est }>).map(([k, v]) => (
                        <tr>
                          <th scope="row" class="mono">
                            {SENS[k] ? T(SENS[k]) : k}
                          </th>
                          <td class="mono">{v.observed_y1?.toLocaleString("en-IN")}</td>
                          <td class="mono">{ci(v.ratio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section class="section" aria-labelledby="second">
              <div class="sec-head rv">
                <p class="label red" id="second">
                  {T("§4 · Second analysis: a better contrail detector")}
                </p>
                <span class="mono-s">D-005 · {T("added after the logged runs · descriptive")}</span>
              </div>
              <p class="lede rv">
                {tx(
                  <>
                    Our pre-registered detector was the weakest link, so after the logged runs we trained a neural network on Google's OpenContrails
                    scenes and the expert-labelled Meteosat scenes, and checked it on {DC.scenes} expert scenes it never saw ({DC.expertLines} contrails).
                    A single expert matches the experts' consensus at a pixel Dice of about {DC.expertPixelDiceMax} at most.
                  </>,
                  <>
                    हमारा पहले से दर्ज डिटेक्टर सबसे कमज़ोर कड़ी था, इसलिए दर्ज रनों के बाद हमने Google के OpenContrails दृश्यों और विशेषज्ञ-लेबल वाले
                    Meteosat दृश्यों पर एक न्यूरल नेटवर्क प्रशिक्षित किया, और उसे {DC.scenes} ऐसे विशेषज्ञ दृश्यों पर जाँचा जो उसने कभी नहीं देखे
                    ({DC.expertLines} कंट्रेल)। एक अकेला विशेषज्ञ विशेषज्ञों की सहमति से ज़्यादा से ज़्यादा लगभग {DC.expertPixelDiceMax} के पिक्सेल Dice पर
                    मेल खाता है।
                  </>,
                )}
              </p>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">{T("Detector")}</th>
                      <th scope="col">Precision</th>
                      <th scope="col">Recall</th>
                      <th scope="col">F1 [95 % CI]</th>
                      <th scope="col">{T("Pixel Dice")}</th>
                      <th scope="col">{T("Unanimous contrails found")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DC.rows.map((d) => (
                      <tr>
                        <th scope="row">{T(d.name)}</th>
                        <td class="mono">{d.precision.toFixed(2)}</td>
                        <td class="mono">{d.recall.toFixed(2)}</td>
                        <td class="mono">{d.f1}</td>
                        <td class="mono">{d.dice}</td>
                        <td class="mono">{d.unanimous}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="lede rv">
                {T(
                  "Re-labelling the twelve flight days with the new detectors cuts chance matches from a third to about an eighth, and the answers stay the same: physics still predicts far more contrails than the satellite sees (H1), and the model still beats the published correction (H2).",
                )}
              </p>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">{T("Labels from")}</th>
                      <th scope="col">{T("Contrails seen")}</th>
                      <th scope="col">{T("Chance matches")}</th>
                      <th scope="col">{T("H1 ratio [95 % CI]")}</th>
                      <th scope="col">{T("H2 skill vs B3 [95 % CI]")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SA.map((a) => (
                      <tr>
                        <th scope="row">{T(a.labels)}</th>
                        <td class="mono">{a.seen}</td>
                        <td class="mono">{a.chance}</td>
                        <td class="mono">{a.h1}</td>
                        <td class="mono">{a.h2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {ws && <WeightedSection ws={ws} h3={h("H3")?.estimate} h4={h("H4")?.estimate} />}

            <section class="section" aria-labelledby="lit">
              <div class="sec-head rv">
                <p class="label red" id="lit">
                  §{ws ? 6 : 5} · {T("How this compares with published studies")}
                </p>
                <span class="mono-s">{T("abstracts checked 22 Oct 2026")}</span>
              </div>
              <p class="lede rv">
                {tx(
                  <>
                    Our numbers point the same way as studies of Japan, the North Atlantic and the whole world: a small share of flying makes most of
                    the contrail warming, and night flights matter most. One difference to keep in mind: those studies count <em>flights</em>, while
                    our pre-registered H3 counts <em>cruise distance</em>. Only the humid stretch of a flight warms, so a share of distance comes out
                    smaller than a share of flights.
                  </>,
                  <>
                    हमारे आँकड़े जापान, उत्तरी अटलांटिक और पूरी दुनिया के अध्ययनों की ही दिशा में हैं: उड़ान का छोटा हिस्सा ही कंट्रेल की ज़्यादातर गर्मी
                    पैदा करता है, और रात की उड़ानें सबसे ज़्यादा मायने रखती हैं। एक अंतर याद रखें: वे अध्ययन <em>उड़ानें</em> गिनते हैं, जबकि हमारी पहले
                    से दर्ज H3 <em>क्रूज़ दूरी</em> गिनती है। उड़ान का केवल नम हिस्सा गर्म करता है, इसलिए दूरी का हिस्सा उड़ानों के हिस्से से छोटा निकलता है।
                  </>,
                )}
              </p>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table lit-table">
                  <thead>
                    <tr>
                      <th scope="col">{T("Study")}</th>
                      <th scope="col">{T("Where")}</th>
                      <th scope="col">{T("They found")}</th>
                      <th scope="col">{T("STRATUM over India")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LIT.map((l) => (
                      <tr>
                        <th scope="row">
                          <a href={l.url} target="_blank" rel="noopener">
                            {l.study}
                          </a>
                          <span class="mono-s muted lit-ref">{l.ref}</span>
                        </th>
                        <td data-k={T("Where")}>{T(l.where)}</td>
                        <td data-k={T("They found")}>{T(l.theirs)}</td>
                        <td data-k={T("STRATUM over India")}>{T(l.ours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="section" aria-labelledby="runs">
              <div class="sec-head rv">
                <p class="label red" id="runs">
                  §{ws ? 7 : 6} · {T("Final-runs log")}
                </p>
                <span class="mono-s">{T("append-only")} · _locks/final_runs.jsonl</span>
              </div>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">{T("Run")}</th>
                      <th scope="col">{T("Hypotheses")}</th>
                      <th scope="col">{T("Time (UTC)")}</th>
                      <th scope="col">{T("Commit")}</th>
                      <th scope="col">{T("Results SHA-256")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.final_runs.map((x) => (
                      <tr>
                        <th scope="row" class="mono">
                          {String(x.run_id)}
                        </th>
                        <td class="mono">{(x.hypotheses as string[] | undefined)?.join(", ")}</td>
                        <td class="mono">{String(x.time_utc ?? "").slice(0, 19).replace("T", " ")}</td>
                        <td class="mono">{String(x.commit ?? "").slice(0, 7)}</td>
                        <td class="mono">{String(x.results_sha256 ?? "").slice(0, 12)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="small muted">
                {T(
                  "Each hypothesis was scored once, after the analysis plan was locked; a second final run would need a written reason and both would be listed here. Context runs (H3/H4 with B1 and B3 physics) are descriptive and not in this log.",
                )}
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = {
  B0: "B0 climatology",
  B1: "B1 raw ERA5",
  B2: "B2 RHi / 0.95",
  B3: "B3 published correction",
  B1_cocip: "CoCiP B1",
  RATE: "Constant rate",
  LOGIT: "Humidity only (logistic)",
  STRATUM_b: "STRATUM (b) scaling",
  STRATUM_raw: "STRATUM before calibration",
  STRATUM: "STRATUM",
};
const SENS: Record<string, string> = {
  y_k1: "1 matched image (original rule)",
  y_k3: "3 matched images",
  y_age_20_90: "contrail age 20–90 min",
  y_age_40_120: "contrail age 40–120 min",
  y_tol_dist1p5: "match within 1.5 px",
  y_tol_dist3: "match within 3 px",
  y_tol_ang15: "angle within 15°",
  y_tol_ang30: "angle within 30°",
};

/** H1: the ratio and its interval on a log axis, with 1 (physics = satellite) marked. */
function RatioBar({ e }: { e: Est }) {
  if (!e?.value) return null;
  const W = 300, x = (v: number) => 10 + ((Math.log10(v) + 0.5) / 2) * (W - 20);
  return (
    <svg viewBox={`0 0 ${W} 46`} class="res-fig" role="img" aria-label={tx(`Ratio ${f2(e.value)}, interval ${f2(e.lo)} to ${f2(e.hi)}; 1 means physics matches the satellite`, `अनुपात ${f2(e.value)}, दायरा ${f2(e.lo)} से ${f2(e.hi)}; 1 का मतलब भौतिकी उपग्रह से मेल खाती है`)}>
      <line x1={x(1)} x2={x(1)} y1="4" y2="30" class="ref" />
      <text x={x(1)} y="42" text-anchor="middle" class="ax">
        1
      </text>
      <line x1={x(e.lo ?? e.value)} x2={x(e.hi ?? e.value)} y1="17" y2="17" class="ci" />
      <circle cx={x(e.value)} cy="17" r="5" class="pt" />
      {[0.5, 3, 10, 30].map((v) => (
        <text x={x(v)} y="42" text-anchor="middle" class="ax">
          {v}
        </text>
      ))}
    </svg>
  );
}

function SkillBars({ h }: { h: Record<string, any> }) {
  const rows: [string, Est][] = [
    ["vs B3", h.estimate],
    ["vs climatology", h.vs_B0],
    ["vs humidity only", h.vs_LOGIT],
    ["vs constant rate", h.vs_RATE],
  ];
  const W = 300, x0 = 110, x = (v: number) => x0 + ((Math.max(-1, Math.min(1, v)) + 1) / 2) * (W - x0 - 10);
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * 20 + 18}`} class="res-fig" role="img" aria-label={T("STRATUM skill against four references")}>
      <line x1={x(0)} x2={x(0)} y1="2" y2={rows.length * 20} class="ref" />
      {rows.map(([k, e], i) =>
        e?.value == null ? null : (
          <g>
            <text x={x0 - 6} y={i * 20 + 13} text-anchor="end" class="ax">
              {T(k)}
            </text>
            <line x1={x(e.lo ?? e.value)} x2={x(e.hi ?? e.value)} y1={i * 20 + 9} y2={i * 20 + 9} class="ci" />
            <circle cx={x(e.value)} cy={i * 20 + 9} r="4" class="pt" />
          </g>
        ),
      )}
      {[-1, 0, 1].map((v) => (
        <text x={x(v)} y={rows.length * 20 + 14} text-anchor="middle" class="ax">
          {v}
        </text>
      ))}
    </svg>
  );
}

function Lorenz({ curves }: { curves?: Record<string, Curve> }) {
  if (!curves) return null;
  const W = 300, H = 170, L = 30, B = 22, x = (v: number) => L + v * (W - L - 8), y = (v: number) => H - B - v * (H - B - 8);
  const cls = ["c0", "c1", "c2"];
  return (
    <figure class="res-fig-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} class="res-fig" role="img" aria-label={T("Share of contrail warming against share of flight distance")}>
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} class="ref" />
        <line x1={x(0)} x2={x(1)} y1={y(0.8)} y2={y(0.8)} class="ref thin" />
        {Object.entries(curves).map(([k, c], i) =>
          c ? (
            <path class={`curve ${cls[i % 3]}`} d={c.distance_share.map((d, j) => `${j ? "L" : "M"}${x(d).toFixed(1)},${y(c.ef_share[j]).toFixed(1)}`).join("")}>
              <title>{T(k)}</title>
            </path>
          ) : null,
        )}
        <text x={x(0.5)} y={H - 4} text-anchor="middle" class="ax">
          {T("share of cruise distance (largest warming first)")}
        </text>
        <text x="4" y={y(0.8) - 3} class="ax">
          80 %
        </text>
      </svg>
      <figcaption class="mono-s">
        {Object.keys(curves).map((k, i) => (
          <span>
            <i class={`k ${cls[i % 3]}`} /> {T(k)}{" "}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function NightBars({ h }: { h: Record<string, any> }) {
  const d = h.details ?? {};
  const rows: [string, number | undefined, number | undefined][] = [
    ["logged (corrected)", d.night_share_positive_ef, d.night_share_distance],
    ["B1 (descriptive)", h.context?.B1?.night_share_positive_ef, h.context?.B1?.night_share_distance],
    ["B3 (descriptive)", h.context?.B3?.night_share_positive_ef, h.context?.B3?.night_share_distance],
  ];
  const W = 300, x0 = 112, x = (v: number) => x0 + v * (W - x0 - 10);
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * 24 + 16}`} class="res-fig" role="img" aria-label={T("Night share of warming against night share of distance")}>
      {rows.map(([k, ef, dist], i) =>
        ef == null ? null : (
          <g>
            <text x={x0 - 6} y={i * 24 + 14} text-anchor="end" class="ax">
              {T(k)}
            </text>
            <rect x={x0} y={i * 24 + 4} width={x(ef) - x0} height="8" class="bar-ef" />
            <rect x={x0} y={i * 24 + 13} width={x(dist ?? 0) - x0} height="5" class="bar-dist" />
          </g>
        ),
      )}
      <text x={x0} y={rows.length * 24 + 12} class="ax">
        {T("▬ night share of warming · ▬ night share of distance")}
      </text>
    </svg>
  );
}

function Reliability({ rel }: { rel?: Record<string, { mean_forecast: number; observed: number }[]> }) {
  if (!rel) return null;
  const all = Object.values(rel).flat();
  const top = Math.max(0.02, ...all.map((b) => Math.max(b.mean_forecast, b.observed))) * 1.08;
  const W = 300, H = 220, L = 34, B = 26, x = (v: number) => L + (v / top) * (W - L - 8), y = (v: number) => H - B - (v / top) * (H - B - 8);
  const cls: Record<string, string> = { B0: "c3", LOGIT: "c2", STRATUM_b: "c1", STRATUM: "c0" };
  return (
    <figure class="res-fig-wrap rv">
      <svg viewBox={`0 0 ${W} ${H}`} class="res-fig" role="img" aria-label={T("Reliability: forecast probability against observed frequency on held-out seasons")}>
        <line x1={x(0)} y1={y(0)} x2={x(top)} y2={y(top)} class="ref" />
        {Object.entries(rel).map(([m, bins]) => (
          <path class={`curve ${cls[m] ?? "c3"}`} d={bins.map((b, j) => `${j ? "L" : "M"}${x(b.mean_forecast).toFixed(1)},${y(b.observed).toFixed(1)}`).join("")}>
            <title>{LABEL[m] ? T(LABEL[m]) : m}</title>
          </path>
        ))}
        <text x={x(top / 2)} y={H - 6} text-anchor="middle" class="ax">
          {T("forecast probability (bin mean)")}, 0–{pct(top)}
        </text>
        <text x="4" y="12" class="ax">
          {T("observed")}
        </text>
      </svg>
      <figcaption class="mono-s">
        {T("Reliability on held-out seasons (10 equal-count bins): on the diagonal = calibrated.")}{" "}
        {Object.keys(rel).map((m) => (
          <span>
            <i class={`k ${cls[m] ?? "c3"}`} /> {LABEL[m] ? T(LABEL[m]) : m}{" "}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const t1 = (kg?: number | null) => (kg == null || !Number.isFinite(kg) ? "—" : `${Math.round(kg / 1000).toLocaleString()} t`);

/** §5: the decision layer redone with STRATUM's probabilities weighting raw-ERA5 physics
 *  (deviation D-006, descriptive). Numbers from data/weighted/summary.json (Colab 12a). */
function WeightedSection({ ws, h3, h4 }: { ws: Record<string, any>; h3: Est; h4: Est }) {
  const d = ws.decisions ?? {};
  const L = ws.logged_decisions ?? {};
  const c = ws.concentration ?? {};
  const b1 = ws.context_B1 ?? {};
  const rows = [
    { name: T("Logged (corrected physics, too dry)"), d: L },
    { name: T("Weighted by STRATUM (D-006; the 60 strongest stretches per day)"), d },
  ];
  return (
    <section class="section" aria-labelledby="wtd">
      <div class="sec-head rv">
        <p class="label red" id="wtd">
          {T("§5 · Second analysis: STRATUM steers the decisions")}
        </p>
        <span class="mono-s">D-006 · {T("added after the logged runs · descriptive")}</span>
      </div>
      <p class="lede rv">
        {tx(
          <>
            The pre-registered way of feeding the satellite lesson back into the physics turned out far too dry. Here the physics stays standard (raw
            ERA5), and STRATUM decides how much each predicted contrail counts: its probability that a lasting contrail really forms. The{" "}
            {d.days ?? "12"} held-out days are run again, flight by flight, through the same alternatives, fuel model and cautious alert rule.
          </>,
          <>
            उपग्रह की सीख को भौतिकी में वापस डालने का पहले से दर्ज तरीका बहुत ज़्यादा सूखा निकला। यहाँ भौतिकी सामान्य (कच्चा ERA5) रहती है, और STRATUM
            तय करता है कि हर अनुमानित कंट्रेल कितनी गिनी जाए: उसकी यह संभावना कि टिकाऊ कंट्रेल सचमुच बनती है। अलग रखे {d.days ?? "12"} दिन फिर से,
            उड़ान-दर-उड़ान, उन्हीं विकल्पों, ईंधन मॉडल और सतर्क चेतावनी नियम से चलाए जाते हैं।
          </>,
        )}
      </p>
      <div class="table-wrap rv rv-fade">
        <table class="src-table res-table rowhead-s">
          <thead>
            <tr>
              <th scope="col">{T("Decision layer")}</th>
              <th scope="col">{T("Stretches flagged")}</th>
              <th scope="col">{T("Alerts")}</th>
              <th scope="col">{T("Alerts without a fuel saving")}</th>
              <th scope="col">{T("Warming avoided by alerts, 100 yr (median)")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <th scope="row">{r.name}</th>
                <td class="mono">{r.d.portions ?? "—"}</td>
                <td class="mono">{r.d.alerts ?? "—"}</td>
                <td class="mono">{r.d.alerts_without_fuel_credit ?? "—"}</td>
                <td class="mono">{t1(r.d.alerts_net_warming_avoided_h100_p50_kgCO2e)} CO₂e</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="table-wrap rv rv-fade">
        <table class="src-table res-table rowhead-s">
          <thead>
            <tr>
              <th scope="col">{T("Physics")}</th>
              <th scope="col">{T("Share of cruise distance carrying 80 % of warming (H3-style)")}</th>
              <th scope="col">{T("Night excess of warming (H4-style)")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{T("Logged (corrected, too dry)")}</th>
              <td class="mono">{ci(h3, (v) => pct(v))}</td>
              <td class="mono">{ci(h4)}</td>
            </tr>
            <tr>
              <th scope="row">{T("Raw ERA5 (context)")}</th>
              <td class="mono">{ci(b1.h3?.share, (v) => pct(v))}</td>
              <td class="mono">{ci(b1.h4?.difference)}</td>
            </tr>
            <tr>
              <th scope="row">{T("Weighted by STRATUM")} (D-006)</th>
              <td class="mono">{ci(c.h3?.share, (v) => pct(v))}</td>
              <td class="mono">{ci(c.h4?.difference)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small muted rv">
        {tx(
          <>
            The weight is STRATUM's held-out probability that the satellite sees a lasting contrail, divided by the share of lasting contrails a
            satellite can detect (capped at 1); where raw physics forms a warming contrail the weight averaged{" "}
            {c.mean_w_where_b1_warms != null ? c.mean_w_where_b1_warms.toFixed(2) : "—"}. Only the strongest stretches per day are flown through the
            alternatives. The logged H3/H4 tests and alerts are unchanged.
          </>,
          <>
            भार STRATUM की (अलग रखे डेटा पर) यह संभावना है कि उपग्रह टिकाऊ कंट्रेल देखे, उपग्रह से पकड़ी जा सकने वाली टिकाऊ कंट्रेल के हिस्से से भाग
            देकर (अधिकतम 1); जहाँ कच्ची भौतिकी गर्म करने वाली कंट्रेल बनाती है वहाँ भार का औसत{" "}
            {c.mean_w_where_b1_warms != null ? c.mean_w_where_b1_warms.toFixed(2) : "—"} रहा। हर दिन केवल सबसे प्रबल हिस्से विकल्पों से गुज़ारे जाते
            हैं। दर्ज H3/H4 परीक्षण और चेतावनियाँ नहीं बदलीं।
          </>,
        )}
      </p>
    </section>
  );
}
