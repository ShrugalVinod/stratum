import { useEffect, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { ReportDay, ReportIndex } from "../data/contract";
import { loadReportDay, loadReportIndex } from "../data/load";
import { T, tx } from "../i18n";
import "../styles/map.css";

/** /report — the daily report card: every morning the `report` Action checks yesterday's contrail
 *  outlook against the contrails Meteosat-9 saw (learned detector v3) and keeps the score in
 *  public. Scores: stratum/export/report_card.py. Descriptive; not a pre-registered result. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const MW = 340;
const MK = MW / (BOX.e - BOX.w);
const MH = (BOX.n - BOX.s) * MK;
const mp = (lon: number, lat: number) => [(lon - BOX.w) * MK, (BOX.n - lat) * MK] as const;
const pc = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)} %`);
const times = (v: number | null | undefined) => (v == null ? "—" : `×${v.toFixed(1)}`);
const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(tx("en-GB", "hi-IN"), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function Report() {
  const [idx, setIdx] = useState<ReportIndex | null | undefined>(undefined);
  const [day, setDay] = useState<string | null>(null);
  const [card, setCard] = useState<ReportDay | null | undefined>(undefined);
  const [shapes, setShapes] = useState<{ india: boolean; d: string }[]>([]);

  useEffect(() => {
    loadReportIndex().then((i) => {
      setIdx(i);
      const want = new URLSearchParams(location.search).get("day");
      if (i?.days.length) setDay(i.days.some((d) => d.date === want) ? want : i.days[0].date);
    });
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
  useEffect(() => {
    if (!day) return;
    setCard(undefined);
    loadReportDay(day).then(setCard);
    history.replaceState(null, "", `/report?day=${day}`);
  }, [day]);

  const t = idx?.totals;
  return (
    <div class="page report">
      <PageHead
        label="Report card · every morning"
        note={idx ? tx(`${idx.totals.days} days scored · last ${idx.updated}`, `${idx.totals.days} दिन जाँचे · अंतिम ${idx.updated}`) : idx === null ? "Not published yet" : "Loading…"}
        lines={["Was yesterday's", "forecast right?"]}
        lede="Every morning STRATUM checks yesterday's contrail forecast against the contrails the satellite actually saw, and keeps the score here, in public, good days and bad."
      />
      <div class="wrap">
        {idx === null && <p class="muted mono">{T("The first report card is written the morning after the daily check starts.")}</p>}
        {idx && day && (
          <>
            <div class="adv-days rv" role="tablist" aria-label={T("Day")}>
              {idx.days.slice(0, 14).map((d) => (
                <button role="tab" aria-selected={day === d.date} class={day === d.date ? "tool on" : "tool"} onClick={() => setDay(d.date)}>
                  {d.date.slice(5)}
                  <span class="mono-s">{times(d.lift)}</span>
                </button>
              ))}
            </div>

            {card === undefined && <p class="muted mono">{T("Loading…")}</p>}
            {card && <Day c={card} shapes={shapes} />}

            {t && t.days > 1 && (
              <section class="section rc-record rv">
                <div class="sec-head">
                  <p class="label red">{T("The running record")}</p>
                  <span class="mono-s">{tx(`${t.days} days · ${t.contrails_seen.toLocaleString()} contrails`, `${t.days} दिन · ${t.contrails_seen.toLocaleString()} कंट्रेल`)}</span>
                </div>
                <div class="rt-tiles rc-tiles">
                  <div>
                    <b>{pc(t.hit_rate)}</b>
                    <span>{T("of all the contrails seen were in forecast air")}</span>
                  </div>
                  <div>
                    <b>{pc(t.chance)}</b>
                    <span>{T("expected by chance (a forecast patch of the same size)")}</span>
                  </div>
                  <div class={t.lift != null && t.lift > 1 ? "rc-good" : ""}>
                    <b>{times(t.lift)}</b>
                    <span>{T("better than chance, all days together")}</span>
                  </div>
                  <div>
                    <b>
                      {t.notices_confirmed}/{t.notices_checked}
                    </b>
                    <span>{T("contrail notices confirmed by the satellite (of those it could check)")}</span>
                  </div>
                </div>
                <Record idx={idx} onPick={setDay} />
                <p class="mono-s muted">{T("Each day: dot = share of contrails in forecast air, tick = chance. Click a day to open it.")}</p>
              </section>
            )}
          </>
        )}

        <section class="section rc-how rv">
          <p class="label red">{T("How the score works")}</p>
          <p>
            {T(
              "The forecast: the experimental outlook made that morning from ECMWF open data (physics only), which marks every quarter-degree square where the air at some cruise level lets a contrail last for at least half of the hour. The check: the contrail lines our learned detector finds in that day's 24 hourly Meteosat-9 images, counted only where the sky was clear and in good view. A contrail counts as explained if it lies in forecast air (within one square, which also covers its drift with the wind). Chance is the share of the checkable sky the forecast had marked at that hour: a forecast that paints a random patch of the same size would score ×1.0.",
            )}
          </p>
          <p class="small muted">
            {T(
              "Forecast air with no contrail is not counted as wrong: a contrail also needs a plane, and air traffic is not part of this check. The detector finds about 2 in 5 contrails and about 1 in 3 of its lines is not a contrail (expert check scenes, D-005), so single days are noisy; the running record is what matters. This is a descriptive check of the experimental outlook, added after the pre-registered study and not part of its results. Only the derived lines and scores are published; satellite images © EUMETSAT 2026.",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

function Day({ c, shapes }: { c: ReportDay; shapes: { india: boolean; d: string }[] }) {
  const g = c.grid;
  const half = (g.step / 2) * MK;
  const maxH = Math.max(1, ...c.by_hour.map((h) => h.lines));
  const notChecked = c.notices - c.notices_checked;
  return (
    <section class="section pt0 rc-day" aria-live="polite">
      <p class="mono-s muted">{dayName(c.date)}</p>
      <h2 class="display d-m rc-head">
        {c.lift == null
          ? T("Too cloudy to check: no contrail was seen in clear, well-viewed sky.")
          : c.lift >= 1.5
            ? tx(<>A good day for the forecast.</>, <>पूर्वानुमान के लिए अच्छा दिन।</>)
            : c.lift > 1
              ? tx(<>Better than chance, but not by much.</>, <>संयोग से बेहतर, पर ज़्यादा नहीं।</>)
              : tx(<>A bad day: no better than chance.</>, <>बुरा दिन: संयोग से बेहतर नहीं।</>)}
      </h2>
      <div class="rt-tiles rc-tiles">
        <div>
          <b>{pc(c.hit_rate)}</b>
          <span>{tx(`of the ${c.contrails_seen} contrails seen were in forecast air`, `देखी गई ${c.contrails_seen} कंट्रेल में से इतनी पूर्वानुमान की हवा में थीं`)}</span>
        </div>
        <div>
          <b>{pc(c.chance)}</b>
          <span>{T("expected by chance")}</span>
        </div>
        <div class={c.lift != null && c.lift > 1 ? "rc-good" : c.lift != null ? "rc-bad" : ""}>
          <b>{times(c.lift)}</b>
          <span>{T("better than chance")}</span>
        </div>
        <div>
          <b>
            {c.notices_confirmed}/{c.notices_checked}
          </b>
          <span>
            {tx(
              "notices confirmed by the satellite (of those it could check)",
              "सूचनाएँ उपग्रह से पुष्ट (जो जाँची जा सकीं उनमें से)",
            )}
          </span>
        </div>
      </div>

      <div class="live-grid rc-grid">
        <figure class="adv-map rv rv-fade">
          <svg viewBox={`0 0 ${MW} ${MH.toFixed(0)}`} role="img" aria-label={T("Forecast lasting-contrail air and the contrails the satellite saw")}>
            <rect width={MW} height={MH} class="adv-sea" />
            {shapes.map((s) => (
              <path d={s.d} class={s.india ? "adv-in" : "adv-land"} />
            ))}
            {c.forecast_cells.map(([r, col]) => {
              const [x, y] = mp(g.lon_west + col * g.step, g.lat_north - r * g.step);
              return <rect class="rc-cell" x={x - half} y={y - half} width={half * 2} height={half * 2} />;
            })}
            {c.lines.map((l) => (
              <polyline class={l.hit ? "rc-line hit" : "rc-line"} points={l.lat.map((la, i) => mp(l.lon[i], la).map((v) => v.toFixed(1)).join(",")).join(" ")}>
                <title>{tx(`${String(l.h).padStart(2, "0")}:00 UTC · ${l.hit ? "in forecast air" : "outside forecast air"}`, `${String(l.h).padStart(2, "0")}:00 UTC · ${l.hit ? "पूर्वानुमान की हवा में" : "पूर्वानुमान की हवा से बाहर"}`)}</title>
              </polyline>
            ))}
          </svg>
          <figcaption class="mono-s muted">
            {T("Orange: where the forecast had lasting-contrail air at some hour of the day. Lines: contrails the satellite saw (dark: in forecast air at their hour; blue: outside it).")}
          </figcaption>
        </figure>
        <div class="live-side">
          <p class="label">{T("Hour by hour (UTC)")}</p>
          <svg viewBox="0 0 480 92" class="rc-hours" role="img" aria-label={T("Contrails seen each hour, and how many were in forecast air")}>
            {c.by_hour.map((h) => {
              const H = 70;
              const all = (h.lines / maxH) * H;
              const hit = (h.hits / maxH) * H;
              return (
                <g>
                  <title>{tx(`${String(h.h).padStart(2, "0")}:00 UTC: ${h.hits} of ${h.lines} in forecast air · chance ${pc(h.chance)}`, `${String(h.h).padStart(2, "0")}:00 UTC: ${h.lines} में से ${h.hits} पूर्वानुमान की हवा में · संयोग ${pc(h.chance)}`)}</title>
                  <rect class="rc-bar" x={h.h * 20} y={H - all} width={16} height={Math.max(all, 0.5)} />
                  <rect class="rc-bar hit" x={h.h * 20} y={H - hit} width={16} height={hit} />
                  <rect x={h.h * 20} y={0} width={20} height={H} fill="transparent" />
                </g>
              );
            })}
            {[0, 6, 12, 18].map((h) => (
              <text x={h * 20} y={86} class="ax">
                {String(h).padStart(2, "0")}
              </text>
            ))}
          </svg>
          <p class="mono-s muted">{T("Bar: contrails seen that hour · dark part: in forecast air")}</p>
          {c.notice_results.length > 0 && (
            <>
              <p class="label">{T("The day's notices")}</p>
              <ul class="rc-notices mono-s">
                {c.notice_results.filter((n) => n.status !== "not checkable").map((n) => (
                  <li class={`rc-n ${n.status.replace(/ /g, "-")}`}>
                    <span>{n.id}</span>
                    <span>{n.status === "confirmed" ? tx(`confirmed · ${n.contrails}`, `पुष्ट · ${n.contrails}`) : T(n.status)}</span>
                  </li>
                ))}
              </ul>
              {notChecked > 0 && (
                <p class="mono-s muted">
                  {tx(`${notChecked} more could not be checked (cloud or out of view in their time window).`, `${notChecked} और जाँची नहीं जा सकीं (अपनी अवधि में बादल या दृश्य से बाहर)।`)}
                </p>
              )}
              <a class="mono-s" href="/advisory">
                {T("Read the notices")} →
              </a>
            </>
          )}
          <p class="mono-s muted">
            {tx(
              `Forecast run ${c.forecast_run?.slice(0, 10) ?? "—"} · ${c.images ?? 24} satellite images · detector: ${c.detector ?? "—"} · ${pc(c.checkable_share ?? null)} of the area clear and in view at some hour`,
              `पूर्वानुमान रन ${c.forecast_run?.slice(0, 10) ?? "—"} · ${c.images ?? 24} उपग्रह तस्वीरें · डिटेक्टर: ${c.detector ?? "—"} · क्षेत्र का ${pc(c.checkable_share ?? null)} किसी घंटे साफ़ और दृश्य में`,
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Daily share of contrails in forecast air (dot) against chance (tick), newest on the right. */
function Record({ idx, onPick }: { idx: ReportIndex; onPick: (d: string) => void }) {
  const days = [...idx.days].reverse().slice(-60);
  const W = 720;
  const H = 140;
  const L = 34;
  const step = (W - L - 10) / Math.max(1, days.length);
  const y = (v: number) => H - 18 - v * (H - 28);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="rc-rec" role="img" aria-label={T("Each day: share of contrails in forecast air against chance")}>
      {[0, 0.5, 1].map((v) => (
        <g>
          <line class="rc-grid-l" x1={L} x2={W - 6} y1={y(v)} y2={y(v)} />
          <text x={L - 6} y={y(v) + 3} text-anchor="end" class="ax">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + step * (i + 0.5);
        return (
          <g class="rc-day-mark" onClick={() => onPick(d.date)}>
            <title>{tx(`${d.date}: ${pc(d.hit_rate)} in forecast air, chance ${pc(d.chance)}`, `${d.date}: ${pc(d.hit_rate)} पूर्वानुमान की हवा में, संयोग ${pc(d.chance)}`)}</title>
            {d.chance != null && <line class="rc-chance" x1={x - Math.min(8, step / 2.5)} x2={x + Math.min(8, step / 2.5)} y1={y(d.chance)} y2={y(d.chance)} />}
            {d.hit_rate != null && <circle class="rc-dot" cx={x} cy={y(d.hit_rate)} r={4} />}
            <rect x={x - step / 2} y={0} width={step} height={H} fill="transparent" />
          </g>
        );
      })}
      <text x={L} y={H - 2} class="ax">
        {days[0]?.date}
      </text>
      <text x={W - 6} y={H - 2} text-anchor="end" class="ax">
        {days[days.length - 1]?.date}
      </text>
    </svg>
  );
}
