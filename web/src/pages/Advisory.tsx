import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { Advisory as Adv, Manifest, OutlookInfo } from "../data/contract";
import { loadOutlook } from "../data/load";

/** /advisory — contrail advisories in NOTAM style, written every morning from the ECMWF
 *  open-data forecast (stratum/export/outlook.py): boxes where lasting contrails are likely,
 *  their flight levels and the drier levels nearby. Experimental; not for operational use. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const W = 340;
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const K = W / (BOX.e - BOX.w);
const H = (BOX.n - BOX.s) * K;
const px = (lon: number, lat: number) => [(lon - BOX.w) * K, (BOX.n - lat) * K] as const;

function ringPath(r: number[][]): string {
  return r.map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon, lat)[0].toFixed(1)},${px(lon, lat)[1].toFixed(1)}`).join("") + "Z";
}

/** The place as the notice words it ("near Goa", "over the Arabian Sea", "450 km from Goa"). */
const where = (a: Adv) => {
  const m = /\(([^)]+)\)/.exec(a.text);
  const t = (m ? m[1] : a.near).toLowerCase().replace(/ km /, " km ");
  return t.replace(/\b(goa|pune|delhi|mumbai|kolkata|chennai|bengaluru|hyderabad|ahmedabad|nagpur|bhopal|lucknow|jaipur|varanasi|patna|bhubaneswar|visakhapatnam|kochi|thiruvananthapuram|guwahati|srinagar|amritsar|raipur|ranchi|indore|udaipur|port blair|arabian sea|bay of bengal)\b/g, (w) => w.replace(/\b\w/g, (c) => c.toUpperCase())).replace("Of Bengal", "of Bengal");
};
const win = (a: Adv) => `${a.valid_from.slice(11, 16)}–${a.valid_to.slice(11, 16)} UTC`;
const dayOf = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const ist = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")} IST`;
};

export function Advisory() {
  const [ol, setOl] = useState<{ manifest: Manifest; info: OutlookInfo } | null | undefined>(undefined);
  const [shapes, setShapes] = useState<{ india: boolean; d: string }[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    loadOutlook().then((o) => {
      setOl(o);
      if (o) {
        const today = new Date().toISOString().slice(0, 10);
        setDay(o.info.days.includes(today) ? today : o.info.days[0]);
      }
    });
    fetch(`${BASE}/geo/countries.geojson`)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) =>
        setShapes(
          g.features.flatMap((f) => {
            const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
            return polys.map((p) => ({ india: f.properties?.iso === "IND", d: ringPath(p[0]) }));
          }),
        ),
      )
      .catch(() => setShapes([]));
  }, []);

  const list = useMemo(() => (ol && day ? ol.info.advisories.filter((a) => a.valid_from.startsWith(day)) : []), [ol, day]);
  const chosen = list.find((a) => a.id === sel) ?? null;
  const issued = ol ? `${dayOf(ol.info.issued)} ${ol.info.issued.slice(11, 16)} UTC` : "";

  return (
    <div class="page advisory">
      <PageHead
        label="Contrail advisories · experimental"
        note={ol ? `Issued ${issued} · forecast run ${ol.info.run.slice(0, 10)} ${ol.info.run.slice(11, 16)} UTC` : ol === null ? "Not published yet" : "Loading…"}
        lines={["Notice to", "contrail makers."]}
        lede="Every morning STRATUM reads the new weather forecast and writes notices in the style pilots know: where the air at cruise level is cold and humid enough for contrails to last, at which levels, and which nearby levels are drier."
      />
      <div class="wrap">
        {ol === null && <p class="muted mono">No advisories have been published yet. They are written daily at about 09:30 UTC.</p>}
        {ol && (
          <>
            <div class="adv-days rv" role="tablist" aria-label="Day">
              {ol.info.days.map((d) => (
                <button role="tab" aria-selected={day === d} class={day === d ? "tool on" : "tool"} onClick={() => (setDay(d), setSel(null))}>
                  {dayOf(d)}
                  <span class="mono-s">{ol.info.advisories.filter((a) => a.valid_from.startsWith(d)).length}</span>
                </button>
              ))}
            </div>

            <div class="adv-grid">
              <figure class="adv-map rv rv-fade">
                <svg viewBox={`0 0 ${W} ${H.toFixed(0)}`} role="img" aria-label={`Advisory areas on ${day}`}>
                  <rect width={W} height={H} class="adv-sea" />
                  {shapes.map((s) => (
                    <path d={s.d} class={s.india ? "adv-in" : "adv-land"} />
                  ))}
                  {list.map((a) => {
                    const [x0, y0] = px(a.bbox[1], a.bbox[2]);
                    const [x1, y1] = px(a.bbox[3], a.bbox[0]);
                    return (
                      <rect
                        class={`adv-box ${sel === a.id ? "sel" : ""} ${sel && sel !== a.id ? "dim" : ""}`}
                        x={x0}
                        y={y0}
                        width={x1 - x0}
                        height={y1 - y0}
                        style={{ "--o": Math.min(0.5, 0.12 + a.mean_fraction * 0.35) }}
                        onClick={() => setSel(a.id === sel ? null : a.id)}
                      >
                        <title>{`${a.id}: FL${a.fl_low}–FL${a.fl_high}, ${win(a)}`}</title>
                      </rect>
                    );
                  })}
                </svg>
                <figcaption class="mono-s muted">Boxes: areas with an advisory on this day (darker = more of the box affected). Click one to read it.</figcaption>
              </figure>

              <div class="adv-list">
                {chosen ? (
                  <Notam a={chosen} onClose={() => setSel(null)} />
                ) : (
                  <ol>
                    {list.map((a) => (
                      <li>
                        <button onClick={() => setSel(a.id)}>
                          <span class="mono adv-id">{a.id}</span>
                          <span class="adv-fl mono">
                            FL{a.fl_low}
                            {a.fl_high !== a.fl_low ? `–${a.fl_high}` : ""}
                          </span>
                          <span class="adv-where">{where(a)}</span>
                          <span class="mono-s muted">{win(a)}</span>
                        </button>
                      </li>
                    ))}
                    {!list.length && <li class="muted">No advisory for this day: the forecast has no large area of lasting-contrail air at FL300–FL400.</li>}
                  </ol>
                )}
              </div>
            </div>

            <section class="section adv-how rv">
              <p class="label red">How these are written</p>
              <p>
                The forecast humidity and temperature (ECMWF's open data, the latest 00 UTC run) go through the same test as our physics baseline B1:
                does a contrail form (Schmidt–Appleman), and is the air ice-supersaturated so it lasts? The domain is cut into 3° boxes; a box gets a
                notice for a 6-hour window when at least {Math.round(0.4 * 100)} % of it has lasting-contrail air for at least half of some hour, at a level
                between FL300 and FL400. Neighbouring boxes with the same levels are joined, at most five notices per window. "Drier levels nearby" are
                the flight levels with the least lasting-contrail air inside the box.
              </p>
              <p class="small muted">
                Experimental and physics only: STRATUM's learned correction is not applied (the open data lack the cloud fields it needs), and forecast
                humidity at cruise level is uncertain. These notices are a research demonstration, not a NOTAM and not for operational use. {ol.info.credit}.
              </p>
              <p>
                <a href={`/map?build=outlook&date=${day ?? ""}`}>See the hour-by-hour forecast on the map</a> · <a href="/live">Which plane is making a contrail right now?</a>
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Notam({ a, onClose }: { a: Adv; onClose: () => void }) {
  const hour = Number(a.valid_from.slice(11, 13)) + 3;
  const fl = [300, 320, 340, 360, 380, 400].reduce((b, f) => (Math.abs(f - (a.fl_low + a.fl_high) / 2) < Math.abs(b - (a.fl_low + a.fl_high) / 2) ? f : b), 340);
  return (
    <div class="notam">
      <pre class="mono">
        {`${a.id} NOTAMN (STRATUM, EXPERIMENTAL)
A) INDIA REGION
B) ${a.b}  C) ${a.c}
E) ${a.text}
F) FL${String(a.fl_low).padStart(3, "0")}  G) FL${String(a.fl_high).padStart(3, "0")}`}
      </pre>
      <p class="small">
        In plain words: between {a.valid_from.slice(11, 16)} and {a.valid_to.slice(11, 16)} UTC ({ist(a.valid_from)}–{ist(a.valid_to)}), aircraft cruising at FL
        {a.fl_low}
        {a.fl_high !== a.fl_low ? `–FL${a.fl_high}` : ""} {where(a)} are likely to leave contrails
        that last and spread.{a.drier_fls.length ? ` Flying at ${a.drier_fls.map((f) => `FL${f}`).join(" or ")} would cross drier air.` : ""}
      </p>
      <p class="adv-actions">
        <a class="tool" href={`/map?build=outlook&date=${a.valid_from.slice(0, 10)}&hour=${hour}&fl=${fl}`}>
          Show on the map
        </a>
        <button class="tool" onClick={onClose}>
          All notices
        </button>
      </p>
    </div>
  );
}
