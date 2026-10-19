import { useEffect, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { Results as ResultsT } from "../data/contract";
import { loadManifest, loadResults } from "../data/load";
import { hypotheses as HYP } from "../content/site";

type Est = { value?: number; lo?: number; hi?: number } | null | undefined;
type Curve = { distance_share: number[]; ef_share: number[] } | null | undefined;

const f2 = (v?: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
const pct = (v?: number, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toPrecision(d)} %`);
const ci = (e: Est, f: (v?: number) => string = f2) => (e ? `${f(e.value)} (95 % CI ${f(e.lo)} to ${f(e.hi)})` : "—");

/** /results — H1–H4 as pre-registered, with their figures, the baseline comparison, reliability
 *  and the final-runs log. Every number comes from results.json (copied from the logged runs). */
export function Results() {
  const [res, setRes] = useState<ResultsT | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
        {err && <p class="muted mono">{err}</p>}
        {!r && !err && <p class="muted mono">Loading results…</p>}
        {r && (
          <>
            <section class="section pt0" aria-labelledby="h-cards">
              <div class="sec-head rv">
                <p class="label red" id="h-cards">
                  §1 · Hypotheses
                </p>
                <span class="mono-s">{r.hypotheses.length} tested</span>
              </div>
              <div class="res-cards">
                {r.hypotheses.map((x) => {
                  const pre = HYP.find((p) => p.id === x.id);
                  return (
                    <article class="res-card rv" id={x.id.toLowerCase()}>
                      <header>
                        <b class="mono">{x.id}</b>
                        <span class={`verdict mono-s ${x.verdict === "supported" ? "yes" : "no"}`}>{x.verdict}</span>
                      </header>
                      <p class="res-claim">{pre?.plain ?? x.statistic}</p>
                      <p class="small muted">
                        <span class="label">Rule</span> {x.statistic}: {x.rule}
                      </p>
                      <p class="res-num mono">{x.id === "H3" ? ci(x.estimate, (v) => pct(v)) : ci(x.estimate)}</p>
                      {x.id === "H1" && <RatioBar e={x.estimate} />}
                      {x.id === "H2" && <SkillBars h={x} />}
                      {x.id === "H3" && <Lorenz curves={r.concentration_curves} />}
                      {x.id === "H4" && <NightBars h={x} />}
                      {pre?.result && <p class="small">{pre.result.body}</p>}
                      <p class="mono-s muted">Final run {x.run_id ?? "—"}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section class="section" aria-labelledby="base">
              <div class="sec-head rv">
                <p class="label red" id="base">
                  §2 · Baselines and STRATUM on held-out seasons
                </p>
                <span class="mono-s">mean Brier skill score over 4 seasons [95 % CI]</span>
              </div>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">Forecast</th>
                      <th scope="col">vs B3 (pre-registered)</th>
                      <th scope="col">vs constant rate</th>
                      <th scope="col">vs climatology (B0)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((r.h2_mean_over_seasons ?? {}) as Record<string, Record<string, Est>>).map(([m, v]) => (
                      <tr>
                        <th scope="row" class="mono">
                          {LABEL[m] ?? m}
                        </th>
                        <td class="mono">{m === "B3" ? "reference" : ci(v.bss_vs_B3)}</td>
                        <td class="mono">{m === "RATE" ? "reference" : ci(v.bss_vs_RATE)}</td>
                        <td class="mono">{m === "B0" ? "reference" : ci(v.bss_vs_B0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="small muted">
                Brier skill score: 1 = perfect, 0 = no better than the reference, negative = worse. B3 says only yes or no, so any sensible probability
                beats it; the constant rate (the training contrail rate everywhere) is the strictest reference.
              </p>
              <Reliability rel={r.reliability?.phase7} />
            </section>

            {h("H1") && r.h1_sensitivity && (
              <section class="section" aria-labelledby="sens">
                <div class="sec-head rv">
                  <p class="label red" id="sens">
                    §3 · Is H1 robust?
                  </p>
                  <span class="mono-s">same test, other reasonable choices</span>
                </div>
                <div class="table-wrap rv rv-fade">
                  <table class="src-table res-table">
                    <thead>
                      <tr>
                        <th scope="col">Variant</th>
                        <th scope="col">Observed</th>
                        <th scope="col">Ratio [95 % CI]</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(r.h1_sensitivity as Record<string, { observed_y1: number; ratio: Est }>).map(([k, v]) => (
                        <tr>
                          <th scope="row" class="mono">
                            {SENS[k] ?? k}
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

            <section class="section" aria-labelledby="runs">
              <div class="sec-head rv">
                <p class="label red" id="runs">
                  §4 · Final-runs log
                </p>
                <span class="mono-s">append-only · _locks/final_runs.jsonl</span>
              </div>
              <div class="table-wrap rv rv-fade">
                <table class="src-table res-table">
                  <thead>
                    <tr>
                      <th scope="col">Run</th>
                      <th scope="col">Hypotheses</th>
                      <th scope="col">Time (UTC)</th>
                      <th scope="col">Commit</th>
                      <th scope="col">Results SHA-256</th>
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
                Each hypothesis was scored once, after the analysis plan was locked; a second final run would need a written reason and both would be
                listed here. Context runs (H3/H4 with B1 and B3 physics) are descriptive and not in this log.
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
    <svg viewBox={`0 0 ${W} 46`} class="res-fig" role="img" aria-label={`Ratio ${f2(e.value)}, interval ${f2(e.lo)} to ${f2(e.hi)}; 1 means physics matches the satellite`}>
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
    <svg viewBox={`0 0 ${W} ${rows.length * 20 + 18}`} class="res-fig" role="img" aria-label="STRATUM skill against four references">
      <line x1={x(0)} x2={x(0)} y1="2" y2={rows.length * 20} class="ref" />
      {rows.map(([k, e], i) =>
        e?.value == null ? null : (
          <g>
            <text x={x0 - 6} y={i * 20 + 13} text-anchor="end" class="ax">
              {k}
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
      <svg viewBox={`0 0 ${W} ${H}`} class="res-fig" role="img" aria-label="Share of contrail warming against share of flight distance">
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} class="ref" />
        <line x1={x(0)} x2={x(1)} y1={y(0.8)} y2={y(0.8)} class="ref thin" />
        {Object.entries(curves).map(([k, c], i) =>
          c ? (
            <path class={`curve ${cls[i % 3]}`} d={c.distance_share.map((d, j) => `${j ? "L" : "M"}${x(d).toFixed(1)},${y(c.ef_share[j]).toFixed(1)}`).join("")}>
              <title>{k}</title>
            </path>
          ) : null,
        )}
        <text x={x(0.5)} y={H - 4} text-anchor="middle" class="ax">
          share of cruise distance (largest warming first)
        </text>
        <text x="4" y={y(0.8) - 3} class="ax">
          80 %
        </text>
      </svg>
      <figcaption class="mono-s">
        {Object.keys(curves).map((k, i) => (
          <span>
            <i class={`k ${cls[i % 3]}`} /> {k}{" "}
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
    <svg viewBox={`0 0 ${W} ${rows.length * 24 + 16}`} class="res-fig" role="img" aria-label="Night share of warming against night share of distance">
      {rows.map(([k, ef, dist], i) =>
        ef == null ? null : (
          <g>
            <text x={x0 - 6} y={i * 24 + 14} text-anchor="end" class="ax">
              {k}
            </text>
            <rect x={x0} y={i * 24 + 4} width={x(ef) - x0} height="8" class="bar-ef" />
            <rect x={x0} y={i * 24 + 13} width={x(dist ?? 0) - x0} height="5" class="bar-dist" />
          </g>
        ),
      )}
      <text x={x0} y={rows.length * 24 + 12} class="ax">
        ▬ night share of warming · ▬ night share of distance
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
      <svg viewBox={`0 0 ${W} ${H}`} class="res-fig" role="img" aria-label="Reliability: forecast probability against observed frequency on held-out seasons">
        <line x1={x(0)} y1={y(0)} x2={x(top)} y2={y(top)} class="ref" />
        {Object.entries(rel).map(([m, bins]) => (
          <path class={`curve ${cls[m] ?? "c3"}`} d={bins.map((b, j) => `${j ? "L" : "M"}${x(b.mean_forecast).toFixed(1)},${y(b.observed).toFixed(1)}`).join("")}>
            <title>{LABEL[m] ?? m}</title>
          </path>
        ))}
        <text x={x(top / 2)} y={H - 6} text-anchor="middle" class="ax">
          forecast probability (bin mean, 0–{pct(top)})
        </text>
        <text x="4" y="12" class="ax">
          observed
        </text>
      </svg>
      <figcaption class="mono-s">
        Reliability on held-out seasons (10 equal-count bins): on the diagonal = calibrated.{" "}
        {Object.keys(rel).map((m) => (
          <span>
            <i class={`k ${cls[m] ?? "c3"}`} /> {LABEL[m] ?? m}{" "}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
