import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { LiveAircraft, Manifest, OutlookInfo } from "../data/contract";
import { loadLive, loadOutlook, outlookValue } from "../data/load";

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
const MAX_KM = 160;
const R_EARTH = 6371;
const KIND_LABEL: Record<Kind, string> = {
  lasting: "Likely leaving a lasting contrail",
  short: "Short-lived contrail at most",
  none: "No contrail expected",
  unknown: "No forecast here",
};
const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Ground distance (km) and bearing (° from north) from a to b. */
export function distBearing(lat1: number, lon1: number, lat2: number, lon2: number): [number, number] {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dl = rad(lon2 - lon1);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return [d, (deg(Math.atan2(y, x)) + 360) % 360];
}

/** Where the aircraft is now: its last position moved on along its track at its ground speed. */
function deadReckon(a: LiveAircraft, now: number): [number, number] {
  if (a.gs == null || a.trk == null) return [a.lat, a.lon];
  const km = (a.gs * 1.852 * Math.max(0, Math.min(now - a.t, 180_000))) / 3_600_000;
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
        .then((r) => alive && (setAc(r.ac), setFetched(r.t), setErr(null)))
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

  const judged: Judged[] = useMemo(() => {
    if (!ac) return [];
    return ac
      .map((a) => {
        const [lat2, lon2] = deadReckon(a, now);
        const [d, az] = distBearing(place.lat, place.lon, lat2, lon2);
        const el = deg(Math.atan2((a.alt * 0.3048) / 1000 - (d * d) / (2 * R_EARTH), d));
        const [b1, sac] = vals[a.cs] ?? [null, null];
        return { ...a, lat2, lon2, dist_km: d, az, el, fl: nearestFl(a.alt), b1, sac, kind: classify(b1, sac) };
      })
      .filter((a) => a.dist_km <= MAX_KM && a.el >= 4)
      .sort((x, y) => y.el - x.el);
  }, [ac, now, place, vals]);

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
  const chosen = judged.find((a) => a.cs === sel) ?? null;
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
                    <text x={x + 8} y={y + 4}>
                      {a.cs}
                    </text>
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
            {ol?.info.credit ?? "Forecast: ECMWF open data (CC BY 4.0)"} · Live aircraft: adsb.lol (ODbL), airline flights above FL200 only; no aircraft
            addresses are kept.
          </p>
        </section>
      </div>
    </div>
  );
}
