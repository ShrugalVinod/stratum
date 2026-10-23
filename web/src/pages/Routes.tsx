import { useEffect, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { loadDashboard } from "../data/load";
import { T, tx } from "../i18n";
import "../styles/map.css";

/** /routes — where India's contrail warming comes from: by airline, route, hour, flight level,
 *  aircraft type and month, and on the map. Each bar is a group's share of the modelled warming;
 *  the tick is its share of the distance flown (its "fair share"). Data: data/dashboard/summary.json
 *  (stratum/export/dashboard.py, Colab 12b). Descriptive. */

type Row = { key: string; flights: number; km: number; flights_warming: number; share_km: number; share_warm_b1: number; share_warm_w: number; index_w: number | null };
type Metric = "share_warm_w" | "share_warm_b1";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const MW = 340;
const MK = MW / (BOX.e - BOX.w);
const MH = (BOX.n - BOX.s) * MK;
const mp = (lon: number, lat: number) => [(lon - BOX.w) * MK, (BOX.n - lat) * MK] as const;
const pc = (v: number, d = 1) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : d)} %`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं"];
/** "North-west → East", "Overflight (beyond → beyond)": each word through the dictionary. */
const corridor = (k: string) => k.replace(/[A-Za-z][A-Za-z-]*/g, (w) => T(w));

function Bars({ rows, metric, label, short }: { rows: Row[]; metric: Metric; label: (r: Row) => string; short?: (r: Row) => string }) {
  const max = Math.max(0.0001, ...rows.map((r) => Math.max(r[metric], r.share_km)));
  return (
    <ul class="rt-bars">
      {rows.map((r) => (
        <li title={tx(`${label(r)}: ${pc(r[metric])} of the warming, ${pc(r.share_km)} of the distance · ${r.flights.toLocaleString()} flights`, `${label(r)}: गर्मी का ${pc(r[metric])}, दूरी का ${pc(r.share_km)} · ${r.flights.toLocaleString()} उड़ानें`)}>
          <span class="rt-l">
            <span class={short ? "rt-full" : ""}>{label(r)}</span>
            {short && <span class="rt-short">{short(r)}</span>}
          </span>
          <span class="rt-track">
            <i class="rt-bar" style={{ width: `${(r[metric] / max) * 100}%` }} />
            <em class="rt-tick" style={{ left: `${(r.share_km / max) * 100}%` }} />
          </span>
          <span class="rt-v mono-s">
            <b>{pc(r[metric])}</b> · {pc(r.share_km)} {tx("km", "किमी")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Hours({ rows, metric }: { rows: Row[]; metric: Metric }) {
  const by = new Map(rows.map((r) => [r.key, r]));
  const hs = Array.from({ length: 24 }, (_, h) => by.get(String(h).padStart(2, "0")));
  const max = Math.max(0.0001, ...hs.map((r) => (r ? Math.max(r[metric], r.share_km) : 0)));
  const W = 1200;
  const H = 200;
  const bw = W / 24;
  return (
    <svg class="rt-hours" viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={T("Share of contrail warming and of distance by hour of day, IST")}>
      <rect class="rt-night" x={0} y={0} width={bw * 6} height={H} />
      <rect class="rt-night" x={bw * 18} y={0} width={bw * 6} height={H} />
      {hs.map((r, h) => {
        if (!r) return null;
        const bh = (r[metric] / max) * (H - 8);
        const th = H - (r.share_km / max) * (H - 8);
        return (
          <g>
            <title>{tx(`${String(h).padStart(2, "0")}:00 IST: ${pc(r[metric])} of the warming, ${pc(r.share_km)} of the distance`, `${String(h).padStart(2, "0")}:00 IST: गर्मी का ${pc(r[metric])}, दूरी का ${pc(r.share_km)}`)}</title>
            <rect class="rt-bar" x={h * bw + 3} y={H - bh} width={bw - 6} height={Math.max(bh, 0.5)} rx={2} />
            <line class="rt-tick-l" x1={h * bw + 1} x2={(h + 1) * bw - 1} y1={th} y2={th} />
            <rect x={h * bw} y={0} width={bw} height={H} fill="transparent" />
          </g>
        );
      })}
      <line class="rt-axis" x1={0} x2={W} y1={H} y2={H} />
      {[0, 6, 12, 18].map((h) => (
        <text class="rt-ax" x={h * bw + 2} y={H + 16}>
          {String(h).padStart(2, "0")}:00
        </text>
      ))}
      <text class="rt-ax" x={4} y={14}>
        {T("night")}
      </text>
      <text class="rt-ax" x={bw * 18 + 4} y={14}>
        {T("night")}
      </text>
    </svg>
  );
}

export function Routes() {
  const [d, setD] = useState<Record<string, any> | null | undefined>(undefined);
  const [metric, setMetric] = useState<Metric>("share_warm_w");
  const [shapes, setShapes] = useState<{ india: boolean; d: string }[]>([]);
  useEffect(() => {
    loadDashboard().then(setD);
    fetch(`${BASE}/geo/countries.geojson`)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) =>
        setShapes(
          g.features.flatMap((f) => {
            const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
            return polys.map((pp) => ({ india: f.properties?.iso === "IND", d: pp[0].map(([lo, la], i) => `${i ? "L" : "M"}${mp(lo, la)[0].toFixed(1)},${mp(lo, la)[1].toFixed(1)}`).join("") + "Z" }));
          }),
        ),
      )
      .catch(() => setShapes([]));
  }, []);

  const other = (r: Row, what: string) => (r.key === "other" ? T(`Other ${what} (under 3 flights each)`) : r.key);
  const heatMax = Math.max(1e-9, ...((d?.heat ?? []) as number[][]).map((c) => c[2]));
  const t = d?.totals;
  const c = d?.concentration;
  const nightShare = (rows: Row[] | undefined, k: Metric) =>
    (rows ?? []).filter((r) => Number(r.key) >= 18 || Number(r.key) < 6).reduce((s, r) => s + r[k], 0);

  return (
    <div class="page routes">
      <PageHead
        label="Routes & airlines · descriptive"
        note={
          t
            ? tx(
                `${t.flights.toLocaleString()} commercial flights · 12 days · ${Math.round(t.km / 1000).toLocaleString()} thousand km`,
                `${t.flights.toLocaleString()} व्यावसायिक उड़ानें · 12 दिन · ${Math.round(t.km / 1000).toLocaleString()} हज़ार किमी`,
              )
            : d === null
              ? "Not published yet"
              : "Loading…"
        }
        lines={["Where the warming", "comes from."]}
        lede="Contrail warming is not spread evenly. Here it is broken down by airline, route, hour, flight level and aircraft, next to each group's share of the flying. A bar longer than its tick means more warming than its distance would suggest."
      />
      <div class="wrap">
        {d === null && <p class="muted mono">{T("The dashboard data are not published yet.")}</p>}
        {d && (
          <>
            <div class="rt-tiles rv">
              <div>
                <b>{pc(c.top_1pct_flights, 0)}</b>
                <span>{T("of the warming came from the top 1 % of flights")}</span>
              </div>
              <div>
                <b>{pc(c.top_10pct_flights, 0)}</b>
                <span>{T("from the top 10 %")}</span>
              </div>
              <div>
                <b>{pc(t.flights_warming / t.flights, 0)}</b>
                <span>{T("of flights made any warming contrail")}</span>
              </div>
              <div>
                <b>{pc(nightShare(d.by_hour_ist, metric), 0)}</b>
                <span>{tx(`of the warming at night (18:00–06:00 IST), for ${pc(nightShare(d.by_hour_ist, "share_km" as unknown as Metric), 0)} of the distance`, `गर्मी रात में (18:00–06:00 IST), जबकि दूरी केवल ${pc(nightShare(d.by_hour_ist, "share_km" as unknown as Metric), 0)}`)}</span>
              </div>
            </div>

            <div class="rt-ctl rv" role="radiogroup" aria-label={T("Warming measure")}>
              <span class="mono-s muted">{T("Warming measured by")}</span>
              <span class="seg-ctl">
                <button role="radio" aria-checked={metric === "share_warm_w"} class={metric === "share_warm_w" ? "on" : ""} onClick={() => setMetric("share_warm_w")}>
                  {T("STRATUM-weighted")}
                </button>
                <button role="radio" aria-checked={metric === "share_warm_b1"} class={metric === "share_warm_b1" ? "on" : ""} onClick={() => setMetric("share_warm_b1")}>
                  {T("Raw physics")}
                </button>
              </span>
              <span class="rt-key mono-s">
                <i class="rt-key-bar" /> {T("share of the warming")} <i class="rt-key-tick" /> {T("share of the distance flown")}
              </span>
            </div>

            <section class="section rt-sec">
              <div class="sec-head rv">
                <p class="label red">{T("By hour of day (IST)")}</p>
                <span class="mono-s">{T("shaded: night")}</span>
              </div>
              <Hours rows={d.by_hour_ist} metric={metric} />
            </section>

            <div class="rt-grid">
              <section class="rt-sec">
                <p class="label red">{T("By airline")}</p>
                <Bars rows={d.by_airline} metric={metric} label={(r) => other(r, "airlines")} />
              </section>
              {d.by_corridor && (
                <section class="rt-sec">
                  <p class="label red">{T("By corridor")}</p>
                  <Bars rows={d.by_corridor} metric={metric} label={(r) => (r.key === "other" ? other(r, "corridors") : corridor(r.key))} />
                  <p class="small muted">
                    {T(
                      'Where each tracked stretch of flight began and ended: parts of India, or "beyond" where it enters or leaves the area. Overflights cross the whole region without landing, often long-haul flights between the Gulf and South-east Asia.',
                    )}
                  </p>
                </section>
              )}
              <section class="rt-sec">
                <p class="label red">{T("By flight level")}</p>
                <Bars rows={d.by_fl_band} metric={metric} label={(r) => T(r.key)} />
              </section>
              <section class="rt-sec">
                <p class="label red">{T("By aircraft type")}</p>
                <Bars rows={d.by_aircraft} metric={metric} label={(r) => other(r, "types")} />
              </section>
              <section class="rt-sec">
                <p class="label red">{T("By month (one day each)")}</p>
                <Bars rows={d.by_month} metric={metric} label={(r) => `${tx(MONTHS, MONTHS_HI)[Number(r.key.slice(5, 7)) - 1]} ${r.key.slice(0, 4)}`} />
              </section>
              <section class="rt-sec">
                <p class="label red">{T("Where (STRATUM-weighted)")}</p>
                <figure class="adv-map rt-map">
                  <svg viewBox={`0 0 ${MW} ${MH.toFixed(0)}`} role="img" aria-label={T("Map of the share of contrail warming per 1° square")}>
                    <rect width={MW} height={MH} class="adv-sea" />
                    {shapes.map((s) => (
                      <path d={s.d} class={s.india ? "adv-in" : "adv-land"} />
                    ))}
                    {(d.heat as number[][]).map(([la, lo, w, km]) => {
                      const [x, y] = mp(lo - 0.5, la + 0.5);
                      return (
                        <rect class="rt-cell" x={x} y={y} width={MK} height={MK} style={{ opacity: 0.12 + 0.88 * Math.sqrt(w / heatMax) }}>
                          <title>{tx(`${la.toFixed(1)}°N ${lo.toFixed(1)}°E: ${pc(w, 2)} of the warming, ${pc(km, 2)} of the distance`, `${la.toFixed(1)}°N ${lo.toFixed(1)}°E: गर्मी का ${pc(w, 2)}, दूरी का ${pc(km, 2)}`)}</title>
                        </rect>
                      );
                    })}
                  </svg>
                  <figcaption class="mono-s muted">{T("Each 1° square, darker = more of the STRATUM-weighted warming.")}</figcaption>
                </figure>
              </section>
            </div>

            <p class="small muted rt-note">
              {T(d.note)}{" "}
              {T(
                "An airline's share mostly reflects where and when it flies, not how it flies. Raw physics: CoCiP with ERA5 humidity; STRATUM-weighted: the same contrails weighted by STRATUM's probability that they really form (second analysis D-006).",
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
