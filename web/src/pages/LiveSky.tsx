import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { LiveAircraft, Manifest, OutlookInfo } from "../data/contract";
import { DIRS, deg, distBearing, R_EARTH, rad } from "../lib/geo";
import { layerUrl, loadGridBytes, loadLive, loadOutlook, OUTLOOK, outlookValue, spriteHour } from "../data/load";

/** /live — "Which plane made that contrail?": commercial aircraft above you right now (adsb.lol,
 *  via the site's Worker), each judged against today's forecast at its level (ECMWF open data,
 *  physics only): leaving a lasting contrail, a short one, or none. Positions move on between the
 *  one-minute updates by dead reckoning. A chosen location stays in the browser; the Worker only
 *  sees it rounded to 0.5°. */

type Place = { name: string; lat: number; lon: number };
type Kind = "lasting" | "short" | "none" | "unknown";
type Judged = LiveAircraft & { lat2: number; lon2: number; dist_km: number; az: number; el: number; fl: number; kind: Kind; b1: number | null; sac: number | null };

const PLACES: Place[] = [
  { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Hyderabad", lat: 17.39, lon: 78.49 },
];
const MAX_KM = 200;
const MIN_EL = 3;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// the India map (same frame as the advisories page)
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const MW = 340;
const MK = MW / (BOX.e - BOX.w);
const MH = (BOX.n - BOX.s) * MK;
const mp = (lon: number, lat: number) => [(lon - BOX.w) * MK, (BOX.n - lat) * MK] as const;
const HUBS: [string, number, number][] = [
  ["Delhi", 28.61, 77.21], ["Mumbai", 19.08, 72.88], ["Kolkata", 22.57, 88.36], ["Chennai", 13.08, 80.27], ["Bengaluru", 12.97, 77.59],
  ["Hyderabad", 17.39, 78.49], ["Ahmedabad", 23.02, 72.57], ["Nagpur", 21.15, 79.09], ["Bhopal", 23.26, 77.41], ["Lucknow", 26.85, 80.95],
  ["Jaipur", 26.91, 75.79], ["Varanasi", 25.32, 82.97], ["Patna", 25.59, 85.14], ["Bhubaneswar", 20.3, 85.82], ["Visakhapatnam", 17.69, 83.22],
  ["Goa", 15.38, 73.83], ["Kochi", 9.93, 76.27], ["Guwahati", 26.14, 91.74], ["Amritsar", 31.63, 74.87], ["Raipur", 21.25, 81.63],
  ["Karachi", 24.86, 67.0], ["Lahore", 31.55, 74.34], ["Dhaka", 23.81, 90.41], ["Kathmandu", 27.72, 85.32], ["Colombo", 6.93, 79.85],
];
const KIND_LABEL: Record<Kind, string> = {
  lasting: "Likely leaving a lasting contrail",
  short: "Short-lived contrail at most",
  none: "No contrail expected",
  unknown: "No forecast here",
};

/** Where the aircraft is now: its last position moved on along its track at its ground speed. */
function deadReckon(a: LiveAircraft, now: number): [number, number] {
  if (a.gs == null || a.trk == null) return [a.lat, a.lon];
  const km = (a.gs * 1.852 * Math.max(0, Math.min(now - a.t, 900_000))) / 3_600_000;
  const dLat = (km / 111.2) * Math.cos(rad(a.trk));
  const dLon = ((km / 111.2) * Math.sin(rad(a.trk))) / Math.cos(rad(a.lat));
  return [a.lat + dLat, a.lon + dLon];
}

const classify = (b1: number | null, sac: number | null): Kind => (b1 == null || sac == null ? "unknown" : b1 >= 0.5 ? "lasting" : sac >= 0.5 ? "short" : "none");

export function LiveSky() {
  const [place, setPlace] = useState<Place>(PLACES[0]);
  const [mine, setMine] = useState(false);
  const [ac, setAc] = useState<LiveAircraft[] | null>(null);
  const [fetched, setFetched] = useState(0);
  const [sources, setSources] = useState<Record<string, unknown> | null>(null);
  const [snapT, setSnapT] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ol, setOl] = useState<{ manifest: Manifest; info: OutlookInfo } | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [vals, setVals] = useState<Record<string, [number | null, number | null]>>({});
  const [column, setColumn] = useState<{ fl: number; b1: number | null; sac: number | null }[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    loadOutlook().then(setOl);
  }, []);

  // aircraft: now, then every minute
  useEffect(() => {
    let alive = true;
    const get = () =>
      loadLive(place.lat, place.lon)
        .then((r) => alive && (setAc(r.ac), setFetched(r.t), setSources(r.sources ?? null), setSnapT(r.snapshot_t ?? null), setRefreshing(!!r.refreshing), setErr(null)))
        .catch((e) => alive && setErr(String(e.message ?? e).includes("503") ? "The live feed is busy. Trying again in a minute." : "The live feed cannot be reached right now."));
    get();
    const t = setInterval(get, 60_000);
    return () => ((alive = false), clearInterval(t));
  }, [place.lat, place.lon]);

  // smooth motion between updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const utc = new Date(now);
  const date = utc.toISOString().slice(0, 10);
  const hour = utc.getUTCHours();
  const fls = ol?.manifest.flight_levels.map((f) => f.fl) ?? [];
  const nearestFl = (alt: number) => fls.reduce((b, f) => (Math.abs(f * 100 - alt) < Math.abs(b * 100 - alt) ? f : b), fls[0] ?? 360);

  // forecast at each aircraft (refreshed with each update and each new hour)
  useEffect(() => {
    if (!ol || !ac) return;
    let alive = true;
    Promise.all(
      ac.map(async (a) => {
        const fl = nearestFl(a.alt);
        const [b1, sac] = await Promise.all([
          outlookValue(ol.manifest, "B1", date, hour, fl, a.lat, a.lon).catch(() => null),
          outlookValue(ol.manifest, "SAC", date, hour, fl, a.lat, a.lon).catch(() => null),
        ]);
        return [a.cs, [b1, sac] as [number | null, number | null]] as const;
      }),
    ).then((r) => alive && setVals(Object.fromEntries(r)));
    return () => {
      alive = false;
    };
  }, [ol, ac, date, hour]);

  // the sky column above the chosen place
  useEffect(() => {
    if (!ol) return;
    Promise.all(
      fls.map(async (fl) => ({
        fl,
        b1: await outlookValue(ol.manifest, "B1", date, hour, fl, place.lat, place.lon).catch(() => null),
        sac: await outlookValue(ol.manifest, "SAC", date, hour, fl, place.lat, place.lon).catch(() => null),
      })),
    ).then(setColumn);
  }, [ol, place.lat, place.lon, date, hour]);

  const all: Judged[] = useMemo(() => {
    if (!ac) return [];
    return ac
      .map((a) => {
        const [lat2, lon2] = deadReckon(a, now);
        const [d, az] = distBearing(place.lat, place.lon, lat2, lon2);
        const el = deg(Math.atan2((a.alt * 0.3048) / 1000 - (d * d) / (2 * R_EARTH), d));
        const [b1, sac] = vals[a.cs] ?? [null, null];
        return { ...a, lat2, lon2, dist_km: d, az, el, fl: nearestFl(a.alt), b1, sac, kind: classify(b1, sac) };
      })
      .sort((x, y) => y.el - x.el);
  }, [ac, now, place, vals]);
  const judged = useMemo(() => all.filter((a) => a.dist_km <= MAX_KM && a.el >= MIN_EL), [all]);
  // callsigns on the dome: the highest planes first, skipping any too close to one already named
  const labelled = useMemo(() => {
    const out = new Set<string>();
    const placed: [number, number][] = [];
    for (const a of judged) {
      const r = (150 * (90 - a.el)) / 90;
      const p: [number, number] = [r * Math.sin(rad(a.az)), -r * Math.cos(rad(a.az))];
      if (placed.some(([x, y]) => Math.abs(x - p[0]) < 46 && Math.abs(y - p[1]) < 12)) continue;
      placed.push(p);
      out.add(a.cs);
      if (out.size >= 10) break;
    }
    return out;
  }, [judged]);
  const [shapes, setShapes] = useState<{ india: boolean; d: string }[]>([]);
  useEffect(() => {
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
  // this hour's lasting-contrail air anywhere between FL320 and FL400 (0.5° cells), for the map
  const [humid, setHumid] = useState<{ x: number; y: number; v: number; lv: string }[]>([]);
  useEffect(() => {
    if (!ol) return;
    const m = ol.manifest;
    const info = m.layers?.find((l) => l.id === "B1");
    if (!info || !m.days.includes(date)) return setHumid([]);
    const levels = m.flight_levels.map((f) => f.fl).filter((f) => f >= 320 && f <= 400);
    Promise.all(levels.map((fl) => loadGridBytes(layerUrl(OUTLOOK, date, info.file, fl)).then((sp) => [fl, spriteHour(sp, hour, m.grid.cols)] as const)))
      .then((grids) => {
        const g = m.grid;
        const out: { x: number; y: number; v: number; lv: string }[] = [];
        for (let r = 0; r + 2 <= g.rows; r += 2)
          for (let c = 0; c + 2 <= g.cols; c += 2) {
            let best = 0;
            const at: number[] = [];
            for (const [fl, v] of grids) {
              const f = (v[r * g.cols + c] + v[r * g.cols + c + 1] + v[(r + 1) * g.cols + c] + v[(r + 1) * g.cols + c + 1]) / 4 / 255;
              if (f >= 0.5) at.push(fl);
              best = Math.max(best, f);
            }
            if (best < 0.5) continue;
            const [x, y] = mp(g.lon_west + (c + 0.5) * g.step_deg, g.lat_north - (r + 0.5) * g.step_deg);
            out.push({ x, y, v: best, lv: `FL${Math.min(...at)}–${Math.max(...at)}` });
          }
        setHumid(out);
      })
      .catch(() => setHumid([]));
  }, [ol, date, hour]);
  // where the airliners flying through lasting-contrail air are right now (nearest hub)
  const hotspots = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of all) {
      if (a.kind !== "lasting") continue;
      let best = "";
      let bd = Infinity;
      for (const [n, la, lo] of HUBS) {
        const d = distBearing(a.lat2, a.lon2, la, lo)[0];
        if (d < bd) [best, bd] = [n, d];
      }
      const k = bd < 250 ? best : "elsewhere";
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return [...c.entries()].filter(([k]) => k !== "elsewhere").sort((x, y) => y[1] - x[1]).slice(0, 6);
  }, [all]);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 100) / 100;
        const lon = Math.round(p.coords.longitude * 100) / 100;
        if (lat < 4 || lat > 39 || lon < 66 || lon > 100) return setErr("Your location is outside the region STRATUM covers (India, 4–39°N 66–100°E).");
        setPlace({ name: "Your location", lat, lon });
        setMine(true);
      },
      () => setErr("Location was not shared. Pick a city instead."),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };

  const counts = judged.reduce((c, a) => ((c[a.kind] = (c[a.kind] ?? 0) + 1), c), {} as Record<Kind, number>);
  const nat = all.reduce((c, a) => ((c[a.kind] = (c[a.kind] ?? 0) + 1), c), {} as Record<Kind, number>);
  const chosen = all.find((a) => a.cs === sel) ?? null;
  const age = fetched ? Math.round((now - fetched) / 1000) : null;
  const runLabel = ol ? `${ol.info.run.slice(8, 10)} ${new Date(ol.info.run).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${ol.info.run.slice(11, 13)} UTC` : "";
  const tomorrow = ol?.manifest.days.find((d) => d > date);

  return (
    <div class="page live">
      <PageHead
        label="Live sky · experimental"
        note={ol ? `Forecast run ${runLabel} · physics only` : ol === null ? "Forecast not published yet" : "Loading forecast…"}
        lines={["Which plane", "made that contrail?"]}
        lede="See a white line across the sky? These are the airliners above you right now, and whether the air at their level lets a contrail last. Point, look up, and match the line to the plane."
      />
      <div class="wrap">
        <div class="live-places rv" role="radiogroup" aria-label="Where are you?">
          {PLACES.map((p) => (
            <button role="radio" aria-checked={!mine && place.name === p.name} class={!mine && place.name === p.name ? "tool on" : "tool"} onClick={() => (setPlace(p), setMine(false), setSel(null))}>
              {p.name}
            </button>
          ))}
          <button class={mine ? "tool on" : "tool"} onClick={useMyLocation} aria-pressed={mine}>
            ◎ Use my location
          </button>
        </div>
        {err && <p class="mono-s live-err">{err}</p>}

        <div class="live-grid">
          <figure class="live-dome rv rv-fade">
            <svg viewBox="-170 -170 340 340" role="img" aria-label={`Sky above ${place.name}: ${judged.length} airliners within ${MAX_KM} km`}>
              {[0, 30, 60].map((e) => (
                <circle class="dome-ring" r={(150 * (90 - e)) / 90} />
              ))}
              <line class="dome-axis" x1="-150" y1="0" x2="150" y2="0" />
              <line class="dome-axis" x1="0" y1="-150" x2="0" y2="150" />
              {(["N", "E", "S", "W"] as const).map((d, i) => (
                <text class="dome-dir" x={160 * Math.sin((i * Math.PI) / 2)} y={-160 * Math.cos((i * Math.PI) / 2) + 4} text-anchor="middle">
                  {d}
                </text>
              ))}
              <text class="dome-el" x="4" y={-(150 * 60) / 90 - 3}>
                30°
              </text>
              <text class="dome-el" x="4" y={-(150 * 30) / 90 - 3}>
                60°
              </text>
              {judged.map((a) => {
                const r = (150 * (90 - a.el)) / 90;
                const x = r * Math.sin(rad(a.az));
                const y = -r * Math.cos(rad(a.az));
                const back = rad((a.trk ?? 0) + 180);
                const tail = a.kind === "lasting" ? 38 : a.kind === "short" ? 12 : 0;
                return (
                  <g class={`dome-ac k-${a.kind} ${sel === a.cs ? "sel" : ""}`} onClick={() => setSel(a.cs)} role="button" tabIndex={0} aria-label={`${a.cs}, ${KIND_LABEL[a.kind]}`} onKeyDown={(e) => e.key === "Enter" && setSel(a.cs)}>
                    {tail > 0 && <line class="dome-trail" x1={x} y1={y} x2={x + tail * Math.sin(back)} y2={y - tail * Math.cos(back)} />}
                    <path d="M0,-6 L4.5,5 L0,2.5 L-4.5,5 Z" transform={`translate(${x},${y}) rotate(${a.trk ?? 0})`} />
                    {(labelled.has(a.cs) || sel === a.cs) && (
                      <text x={x + 8} y={y + 4}>
                        {a.cs}
                      </text>
                    )}
                  </g>
                );
              })}
              <circle class="dome-you" r="3" />
            </svg>
            <figcaption class="mono-s muted">
              Looking up from {place.name}: the centre is straight overhead, the rim the horizon. Contrail tails drawn where the forecast air holds one.
            </figcaption>
          </figure>

          <div class="live-side">
            <p class="label red">Right now</p>
            <p class="live-count">
              <b>{judged.length}</b> airliners within {MAX_KM} km
              {age != null && <span class="mono-s muted"> · updated {age < 5 ? "just now" : `${age} s ago`}</span>}
            </p>
            <ul class="live-key">
              {(["lasting", "short", "none"] as const).map((k) => (
                <li class={`k-${k}`}>
                  <i /> {KIND_LABEL[k]} <span class="mono-s">{counts[k] ?? 0}</span>
                </li>
              ))}
            </ul>

            {chosen ? (
              <div class="live-card">
                <p class="mono-s muted">
                  {chosen.type ?? "Airliner"} · FL{String(Math.round(chosen.alt / 100)).padStart(3, "0")} · {Math.round(chosen.dist_km)} km away
                </p>
                <p class="live-cs">{chosen.cs}</p>
                <p>
                  Look <b>{Math.round(chosen.el)}° up</b> toward the <b>{DIRS[Math.round(chosen.az / 45) % 8]}</b>.
                </p>
                <p class={`live-verdict k-${chosen.kind}`}>{KIND_LABEL[chosen.kind]}</p>
                <p class="small muted">
                  Forecast for this hour at FL{chosen.fl}: lasting-contrail conditions {chosen.b1 == null ? "—" : `${Math.round(chosen.b1 * 100)} %`} of the hour, any contrail{" "}
                  {chosen.sac == null ? "—" : `${Math.round(chosen.sac * 100)} %`}.
                </p>
                <button class="tool" onClick={() => setSel(null)}>
                  Close
                </button>
              </div>
            ) : (
              <ol class="live-list">
                {judged.slice(0, 8).map((a) => (
                  <li>
                    <button class={`k-${a.kind}`} onClick={() => setSel(a.cs)}>
                      <i />
                      <span class="mono">{a.cs}</span>
                      <span class="mono-s muted">
                        {Math.round(a.el)}° up · {DIRS[Math.round(a.az / 45) % 8]} · FL{String(Math.round(a.alt / 100)).padStart(3, "0")}
                      </span>
                    </button>
                  </li>
                ))}
                {ac && !judged.length && <li class="muted">No airliner high enough above {place.name} at the moment.</li>}
                {!ac && !err && <li class="muted">Listening for aircraft…</li>}
              </ol>
            )}

            {column.length > 0 && (
              <div class="live-column" aria-label="Contrail conditions above you by flight level">
                <p class="label">The air above {place.name}, this hour</p>
                {[...column].reverse().map((c) => (
                  <div class="lc-row">
                    <span class="mono-s">FL{c.fl}</span>
                    <span class="lc-bar">
                      <i class="lc-sac" style={{ width: `${Math.round((c.sac ?? 0) * 100)}%` }} />
                      <i class="lc-b1" style={{ width: `${Math.round((c.b1 ?? 0) * 100)}%` }} />
                    </span>
                  </div>
                ))}
                <p class="mono-s muted">orange: lasting contrails · teal: any contrail · share of the hour</p>
              </div>
            )}
          </div>
        </div>

        <section class="section live-india">
          <div class="sec-head rv">
            <p class="label red">Over India now</p>
            <span class="mono-s">{all.length} airliners above FL200 · positions moved on by speed and heading</span>
          </div>
          <div class="live-grid">
            <figure class="adv-map live-map rv rv-fade">
              <svg viewBox={`0 0 ${MW} ${MH.toFixed(0)}`} role="img" aria-label={`${all.length} airliners over India, ${nat.lasting ?? 0} in lasting-contrail air`}>
                <rect width={MW} height={MH} class="adv-sea" />
                {shapes.map((sh) => (
                  <path d={sh.d} class={sh.india ? "adv-in" : "adv-land"} />
                ))}
                {humid.map((h) => (
                  <rect class="map-humid" x={h.x - MK * 0.25} y={h.y - MK * 0.25} width={MK * 0.5} height={MK * 0.5} style={{ opacity: 0.18 + 0.3 * h.v }}>
                    <title>{`lasting-contrail air at ${h.lv}`}</title>
                  </rect>
                ))}
                {all
                  .slice()
                  .sort((x, y) => (x.kind === "lasting" ? 1 : 0) - (y.kind === "lasting" ? 1 : 0))
                  .map((a) => {
                    const [x, y] = mp(a.lon2, a.lat2);
                    return (
                      <g class={`map-ac k-${a.kind} ${sel === a.cs ? "sel" : ""}`} transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${a.trk ?? 0})`} onClick={() => setSel(a.cs)}>
                        <title>{`${a.cs} · FL${Math.round(a.alt / 100)} · ${KIND_LABEL[a.kind]}`}</title>
                        <path d="M0,-3.6 L2.6,3 L0,1.5 L-2.6,3 Z" />
                      </g>
                    );
                  })}
                <circle class="map-you" cx={mp(place.lon, place.lat)[0]} cy={mp(place.lon, place.lat)[1]} r={(MAX_KM / 111.2) * MK} />
              </svg>
              <figcaption class="mono-s muted">
                Orange shading: air where contrails would last this hour, somewhere between FL320 and FL400 (forecast). A plane counts only if it is inside
                that air at its own level. The circle is the sky dome above {place.name}.
              </figcaption>
            </figure>
            <div class="live-side">
              <p class="live-count">
                <b>{nat.lasting ?? 0}</b> of {all.length} airliners are flying through air where contrails last, right now
              </p>
              {refreshing && (typeof sources?.opensky !== "number" || (snapT != null && now - snapT > 6 * 60_000)) && (
                <p class="mono-s live-err">Fetching a fresh picture of all of India, about a minute… (the page updates by itself)</p>
              )}
              <ul class="live-key">
                {(["lasting", "short", "none"] as const).map((k) => (
                  <li class={`k-${k}`}>
                    <i /> {KIND_LABEL[k]} <span class="mono-s">{nat[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
              {!nat.lasting && all.length > 0 && (
                <p class="small muted">
                  Right now the air where contrails last sits {humid.length ? "mostly above the levels airliners fly at, or away from the routes" : "nowhere over India at airliner levels"}: over India it is often too
                  warm below FL360 for a contrail to form at all. Check again at night or in winter, when it is colder.
                </p>
              )}
              {hotspots.length > 0 && (
                <>
                  <p class="label">Contrail hotspots now</p>
                  <ol class="live-hot">
                    {hotspots.map(([n, k]) => (
                      <li>
                        <span>near {n}</span>
                        <span class="mono">{k} airliners</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {chosen && (
                <p class="live-pick">
                  <b class="mono">{chosen.cs}</b> {chosen.type ?? ""} · FL{String(Math.round(chosen.alt / 100)).padStart(3, "0")} · {Math.round(chosen.dist_km)} km from {place.name}
                  <br />
                  <span class={`live-verdict k-${chosen.kind}`}>{KIND_LABEL[chosen.kind]}</span>
                </p>
              )}
              {sources && (
                <p class="mono-s muted">
                  Sources: OpenSky snapshot {String(sources.opensky)}
                  {snapT ? ` (taken ${Math.max(0, Math.round((now - snapT) / 60_000))} min ago)` : ""} · adsb.lol live {String(sources.adsb_lol)} (merged by
                  callsign)
                </p>
              )}
            </div>
          </div>
        </section>

        <section class="section live-more rv">
          <p class="label red">Tomorrow</p>
          <p class="lede">
            The same forecast covers {tomorrow ? "tomorrow" : "the next day"} hour by hour.{" "}
            <a href={`/map?build=outlook${tomorrow ? `&date=${tomorrow}` : ""}`}>Open it on the map</a>, or read the{" "}
            <a href="/advisory">contrail advisories</a> written from it.
          </p>
          <p class="small muted">
            Experimental and physics only: the forecast humidity goes through the same Schmidt–Appleman and ice-supersaturation test as our B1 baseline.
            STRATUM's learned correction is not applied, because the open forecast data lack the cloud fields it needs. Not for operational use.
          </p>
          <p class="mono-s muted">
            {ol?.info.credit ?? "Forecast: ECMWF open data (CC BY 4.0)"} · Live aircraft: The OpenSky Network (every 5 minutes, positions moved on by speed and heading)
            and adsb.lol (ODbL, live); airline flights above FL200 only; no aircraft addresses are kept.
          </p>
        </section>
      </div>
    </div>
  );
}
