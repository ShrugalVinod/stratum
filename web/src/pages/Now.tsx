import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { Manifest, OutlookInfo, Schedule } from "../data/contract";
import { colourise } from "../data/format";
import { loadLive, loadOutlook, loadOutlookB1, loadSchedule } from "../data/load";
import { T, tx } from "../i18n";
import { type Advice, contrailsUntil, LIFE_H, type Live, routePosition, type Sample, sampler, type Stop, type Timing, totals, track, type Tracked, upcoming, type Upcoming, usualLevel } from "../lib/advice";
import { AIRPORTS, FLS, type Point } from "../lib/footprint";
import { deg, dirName, distBearing, move, R_EARTH } from "../lib/geo";
import type { NowMap as NowMapT } from "../map/NowMap";
import "../styles/map.css";

/** /now — live contrail advice: every airliner over India now, and the flights expected in the
 *  next hours, checked against today's forecast; where a level 2,000 or 4,000 ft away avoids a
 *  lasting contrail for less CO₂ than its warming, the advice. Calculation: lib/advice.ts. */

type Mode = "now" | "next";
const HOURS = 12;
const HOUR = 3_600_000;
const REFRESH_MS = 60_000;
const NEXT_SPEED = (HOURS * HOUR) / 48_000; // the next 12 hours in 48 s
const GLIDE_MS = 1500;
// "Near me": the sky above a city or the visitor's own location (kept in the browser only)
type Place = { name: string; lat: number; lon: number };
const PLACES: Place[] = [
  { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Hyderabad", lat: 17.39, lon: 78.49 },
];
const NEAR_KM = 200;
const SHADE_FLS = FLS.filter((f) => f >= 300 && f <= 400);
const pad = (n: number) => String(n).padStart(2, "0");
const utc = (t: number) => `${pad(new Date(t).getUTCHours())}:${pad(new Date(t).getUTCMinutes())}`;
const ist = (t: number) => utc(t + 330 * 60_000);
const t1 = (kg: number) => `${(kg / 1000).toFixed(kg >= 99_500 ? 0 : 1)} t`;
const kg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v)).toLocaleString()} kg`;
const flName = (fl: number) => `FL${String(fl).padStart(3, "0")}`;
const feet = (d: number) => `${d > 0 ? tx("climb", "चढ़ें") : tx("descend", "उतरें")} ${Math.abs(d * 100).toLocaleString()} ft`;

type Row = { id: string; cs: string; type: string | null; route: string; fl: number; advice: Advice | null; path: Point[]; when?: string; flNote?: string };

export function Now() {
  const q = new URLSearchParams(location.search);
  const [mode, setMode] = useState<Mode>(q.get("mode") === "next" ? "next" : "now");
  const [sel, setSel] = useState<string | null>(q.get("cs"));
  const [ol, setOl] = useState<{ manifest: Manifest; info: OutlookInfo } | null | undefined>(undefined);
  const [sample, setSample] = useState<Sample | null>(null);
  const [live, setLive] = useState<{ ac: Live[]; at: number; age: number | null } | null | undefined>(undefined);
  const [sched, setSched] = useState<Schedule | null | undefined>(undefined);
  const [shade, setShade] = useState<number | "any">("any");
  const [simT, setSimT] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [listened, setListened] = useState(false);
  const [all, setAll] = useState(false);
  const [near, setNear] = useState<Place | null>(() => PLACES.find((p) => p.name === q.get("near")) ?? null);
  const [geoErr, setGeoErr] = useState(false);
  const within = (lat: number, lon: number) => !near || distBearing(near.lat, near.lon, lat, lon)[0] <= NEAR_KM;
  const pickNear = (v: string) => {
    setGeoErr(false);
    if (v === "me") {
      navigator.geolocation?.getCurrentPosition(
        (g) => setNear({ name: T("your location"), lat: Math.round(g.coords.latitude * 100) / 100, lon: Math.round(g.coords.longitude * 100) / 100 }),
        () => setGeoErr(true),
        { timeout: 10_000 },
      );
    } else setNear(PLACES.find((p) => p.name === v) ?? null);
  };
  const [NowMap, setNowMap] = useState<typeof NowMapT | null>(null);
  const simRef = useRef(simT); // read by the map every frame; the page redraws ~10 times a second
  const setSim = (t: number) => {
    simRef.current = t;
    setSimT(t);
  };

  useEffect(() => {
    import("../map/NowMap").then((m) => setNowMap(() => m.NowMap));
    loadOutlook().then(async (o) => {
      setOl(o);
      if (o) {
        const sprites = await loadOutlookB1(o.manifest);
        spritesFor = sprites;
        setSample(() => sampler(o.manifest, sprites));
      }
    });
    loadSchedule().then(setSched);
    const get = () =>
      loadLive(20.5, 78.9).then(
        (r) => setLive({ ac: r.ac as Live[], at: Date.now(), age: (r as { snapshot_age_min?: number | null }).snapshot_age_min ?? null }),
        () => setLive((l) => l ?? null),
      );
    get();
    const id = setInterval(get, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (mode === "next") p.set("mode", "next");
    if (sel) p.set("cs", sel);
    if (near && PLACES.includes(near)) p.set("near", near.name);
    const qs = p.toString();
    history.replaceState(null, "", `/now${qs ? `?${qs}` : ""}`);
  }, [mode, sel, near]);

  // the forecast covers today? (it is built every morning; an old one only covers past hours)
  const today = new Date().toISOString().slice(0, 10);
  const covered = !!ol?.manifest.days.includes(today);
  const ready = !!sample && covered;

  // airliners in the air now, each with its advice (recomputed with every new position report)
  const tracked = useMemo(() => (live && ready ? live.ac.map((a) => track(a, live.at, sample!)) : null), [live, sample, ready]);
  // flights expected in the next hours, at the level airliners on the same route fly now
  const next = useMemo(() => {
    if (!sched || !tracked || !ready) return null;
    return upcoming(sched.flights, live!.at, HOURS, new Set(tracked.map((t) => t.cs)), usualLevel(tracked), sample!);
  }, [sched, tracked]);

  useEffect(() => {
    if (mode !== "next" || !playing) return;
    let raf = 0;
    let last = performance.now();
    let drawn = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const end = (live?.at ?? Date.now()) + HOURS * HOUR;
      const t = simRef.current + dt * NEXT_SPEED;
      if (t >= end) {
        setSim(end);
        setPlaying(false);
        return;
      }
      simRef.current = t;
      if (now - drawn > 100) {
        drawn = now;
        setSimT(t);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mode, playing]);

  // the replay of the next hours starts from now once the flights are worked out
  const nextReady = mode === "next" && !!next;
  useEffect(() => {
    if (nextReady) {
      setSim(live?.at ?? Date.now());
      setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    } else setPlaying(false);
  }, [nextReady]);

  if (import.meta.env.DEV) (window as unknown as { __now: unknown }).__now = { tracked, next, sched, ol }; // local testing only
  const rows: Row[] = useMemo(() => {
    if (mode === "now")
      return (tracked ?? [])
        .filter((t) => t.status === "cruise" && within(t.lat, t.lon))
        .map((t) => ({ id: t.cs, cs: t.cs, type: t.type, route: routeText(t), fl: t.fl, advice: t.advice, path: t.path }));
    return (next ?? [])
      .filter((u) => !near || within(u.from[1], u.from[2]) || within(u.to[1], u.to[2]) || u.path.some((p) => within(p.lat, p.lon)))
      .map((u) => ({
      id: u.cs,
      cs: u.cs,
      type: u.type,
      route: `${u.from[0]} → ${u.to[0]}`,
      fl: u.fl,
      advice: u.advice,
      path: u.path,
      when: `${utc(u.dep)} UTC ±${u.acc}`,
      flNote: u.flHow === "route" ? T("as airliners on this route fly now") : u.flHow === "similar" ? T("as on similar trips now") : T("usual level for the direction"),
    }));
  }, [mode, tracked, next, near]);
  const ranked = useMemo(
    () => [...rows].sort((a, b) => Number(!!b.advice?.alert) - Number(!!a.advice?.alert) || (b.advice?.avoided.p50 ?? 0) - (a.advice?.avoided.p50 ?? 0) || (b.advice?.nLasting ?? 0) - (a.advice?.nLasting ?? 0)),
    [rows],
  );
  const sum = useMemo(() => totals(rows.map((r) => r.advice)), [rows]);
  const inAir = rows.filter((r) => (r.advice?.nLasting ?? 0) > 0).length;
  const chosen = rows.find((r) => r.id === sel) ?? null;
  const chosenTrack = mode === "now" ? tracked?.find((t) => t.cs === sel) ?? null : null;
  const chosenUp = mode === "next" ? next?.find((u) => u.cs === sel) ?? null : null;

  // the shaded hour: now, or the replayed time
  const shownT = mode === "now" ? live?.at ?? Date.now() : simT;
  const risk = useMemo(() => (ol && sample ? riskImage(ol.manifest, shownT, shade) : null), [ol, sample, Math.floor(shownT / HOUR), shade]);

  // map lines: where each flight would leave a lasting contrail (and, chosen, its path and the advised stretch)
  const minute = Math.floor(shownT / 60_000);
  const lines = useMemo(() => {
    const f: GeoJSON.Feature[] = [];
    const line = (pts: Point[], kind: string) => pts.length > 1 && f.push({ type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lon, p.lat]) } });
    for (const r of rows) {
      const a = r.advice;
      if (!a) continue;
      const moved = listened && a.alert;
      // in the replay of the next hours a stretch appears as the aircraft flies it, and stays 2 hours
      const flown = (p: Point) => mode === "now" || (p.t <= shownT && p.t > shownT - 2 * HOUR);
      if (moved) {
        for (const [i, j] of a.spans) line(r.path.slice(i, j).filter(flown), "advised");
        continue;
      }
      let run: Point[] = [];
      r.path.forEach((p, i) => {
        const on = a.lasting[i] && flown(p);
        if (on) run.push(p);
        if ((!on || i === r.path.length - 1) && run.length) {
          line(run.length === 1 ? [run[0], r.path[Math.min(i, r.path.length - 1)]] : run, "lasting");
          run = [];
        }
      });
    }
    if (chosen) {
      const ahead = mode === "now" ? chosen.path : chosen.path.filter((p) => p.t >= shownT);
      line(ahead, "ahead");
      if (chosen.advice?.alert && !listened) for (const [i, j] of chosen.advice.spans) line(chosen.path.slice(i, j).filter((p) => mode === "now" || p.t >= shownT), "advised");
    }
    return { type: "FeatureCollection" as const, features: f };
  }, [rows, chosen, listened, mode, mode === "next" ? minute : 0]);

  // plane positions for the map's animation loop (read every frame). When a new position report
  // arrives, each plane glides from where it is drawn to its new place over GLIDE_MS.
  const frameData = useRef({ mode, tracked, next, at: live?.at ?? 0, sel });
  frameData.current = { mode, tracked, next, at: live?.at ?? 0, sel };
  const drawn = useRef(new Map<string, [number, number, number]>());
  const glide = useRef({ at: 0, from: new Map<string, [number, number, number]>() });
  useEffect(() => {
    glide.current = { at: performance.now(), from: mode === "now" ? new Map(drawn.current) : new Map() };
    if (mode !== "now") drawn.current.clear();
  }, [tracked, mode]);
  const frame = useMemo(
    () => (): GeoJSON.FeatureCollection => {
      const d = frameData.current;
      const feats: GeoJSON.Feature[] = [];
      if (d.mode === "now") {
        const k = Math.min(1, (performance.now() - glide.current.at) / GLIDE_MS);
        const w = 1 - (1 - k) ** 3; // ease out
        for (const t of d.tracked ?? []) {
          const [lat, lon] = move(t.lat, t.lon, t.trk, (t.kmh * (Date.now() - d.at)) / HOUR);
          let p: [number, number, number] = [lon, lat, t.trk];
          const f = glide.current.from.get(t.cs);
          if (f && w < 1) {
            const turn = ((t.trk - f[2] + 540) % 360) - 180;
            p = [f[0] + (lon - f[0]) * w, f[1] + (lat - f[1]) * w, f[2] + turn * w];
          }
          drawn.current.set(t.cs, p);
          feats.push(pt(t.cs, p[0], p[1], p[2], !!t.advice?.alert, t.cs === d.sel));
        }
      } else
        for (const u of d.next ?? []) {
          const p = routePosition(u, simRef.current);
          if (p) feats.push(pt(u.cs, p[0], p[1], p[2], !!u.advice?.alert, u.cs === d.sel));
        }
      return { type: "FeatureCollection", features: feats };
    },
    [],
  );
  const tipFor = (id: string) => {
    const r = rows.find((x) => x.id === id) ?? null;
    const t = mode === "now" ? tracked?.find((x) => x.cs === id) ?? null : null;
    const u = mode === "next" ? next?.find((x) => x.cs === id) ?? null : null;
    if (!r && !t && !u) return null;
    const from = t?.from ?? u?.from;
    const to = t?.to ?? u?.to;
    const route = from && to ? `${place(from)} → ${place(to)}` : t ? routeText(t) : "";
    const tm = t?.timing ?? (u ? { arr: u.arr, total: u.total, dep: u.dep } : null);
    const a = r?.advice ?? t?.advice ?? null;
    const until = contrailsUntil(a, r?.path ?? t?.path ?? []);
    const lines = [
      t ? `${flName(t.fl)} · ${T(STATUS[t.status])}` : u ? `${T("departs")} ${utc(u.dep)} UTC · ${flName(u.fl)}` : "",
      tm ? tx(`lands about ${utc(tm.arr)} UTC · ${dur(tm.total)} trip`, `लगभग ${utc(tm.arr)} UTC उतरेगा · ${dur(tm.total)} की यात्रा`) : "",
      until ? tx(`lasting contrails until about ${utc(until[0])}–${utc(until[1])} UTC`, `टिकाऊ कंट्रेल लगभग ${utc(until[0])}–${utc(until[1])} UTC तक`) : "",
    ].filter(Boolean);
    return `<b>${esc(id)}</b><span>${esc([r?.type ?? t?.type ?? u?.type, route].filter(Boolean).join(" · "))}</span>${lines.map((l) => `<em>${esc(l)}</em>`).join("")}${a?.alert ? `<strong>${esc(adviceShort(a))}</strong>` : ""}<em>${esc(T("Click for the details"))}</em>`;
  };
  const focus = useMemo((): [number, number] | null => {
    if (chosenTrack) return [chosenTrack.lon, chosenTrack.lat];
    if (chosenUp) {
      const p = routePosition(chosenUp, Math.max(simRef.current, chosenUp.dep));
      return p ? [p[0], p[1]] : [chosenUp.from[2], chosenUp.from[1]];
    }
    return null;
  }, [sel, mode]);

  const pick = (id: string | null) => {
    setSel(id);
    if (id && mode === "next") {
      const u = next?.find((x) => x.cs === id);
      if (u && u.advice?.alert && u.path[u.advice.from]) {
        setPlaying(false);
        setSim(Math.max(live?.at ?? 0, u.path[u.advice.from].t - 10 * 60_000));
      }
    }
  };

  const shown = all ? ranked : ranked.filter((r) => r.advice?.alert || (r.advice?.nLasting ?? 0) > 0).slice(0, 40);
  const end = (live?.at ?? Date.now()) + HOURS * HOUR;

  return (
    <div class="page now">
      <PageHead
        label="Live advice · today's forecast"
        note={ol?.info.run ? tx(`Forecast: ECMWF run ${ol.info.run.slice(0, 10)} ${ol.info.run.slice(11, 13)} UTC`, `पूर्वानुमान: ECMWF रन ${ol.info.run.slice(0, 10)} ${ol.info.run.slice(11, 13)} UTC`) : "Loading…"}
        lines={["Which planes", "should move", "right now?"]}
        lede="Every airliner over India right now, and the flights expected in the next 12 hours, checked against today's weather forecast. Where a plane is about to fly through air in which its contrail would last, and a level 2,000 or 4,000 ft away avoids it for less CO₂ than the contrail's warming, STRATUM says which level, and for how long."
      />
      <div class="wrap">
        <div class="now-bar">
          <div class="seg-ctl now-mode" role="tablist" aria-label={T("Which flights")}>
            <button role="tab" aria-selected={mode === "now"} class={mode === "now" ? "on" : ""} onClick={() => (setMode("now"), setSel(null))}>
              {T("In the air now")}
            </button>
            <button role="tab" aria-selected={mode === "next"} class={mode === "next" ? "on" : ""} onClick={() => (setMode("next"), setSel(null))}>
              {T("Next 12 hours")}
            </button>
          </div>
          <label class="now-shade mono-s">
            {T("Near")}
            <select value={near ? (PLACES.includes(near) ? near.name : "me") : "all"} onChange={(e) => pickNear((e.target as HTMLSelectElement).value)}>
              <option value="all">{T("All of India")}</option>
              {PLACES.map((p) => (
                <option value={p.name}>{T(p.name)}</option>
              ))}
              <option value="me">{T("My location (stays on this device)")}</option>
            </select>
          </label>
          <label class="now-shade mono-s">
            {T("Shading")}
            <select value={String(shade)} onChange={(e) => setShade((e.target as HTMLSelectElement).value === "any" ? "any" : Number((e.target as HTMLSelectElement).value))}>
              <option value="any">{T("lasting-contrail air, any level FL300–FL400")}</option>
              {SHADE_FLS.map((f) => (
                <option value={f}>{tx(`lasting-contrail air at ${flName(f)}`, `${flName(f)} पर टिकाऊ कंट्रेल वाली हवा`)}</option>
              ))}
            </select>
          </label>
        </div>

        {geoErr && <p class="now-warn mono-s">{T("Your location is not available. Pick a city instead.")}</p>}
        {ol === null && <p class="now-warn mono-s">{T("The forecast cannot be loaded right now. Try again in a minute.")}</p>}
        {ol && !covered && (
          <p class="now-warn mono-s">
            {tx(
              `Today's forecast is not published yet (the latest covers ${ol.manifest.days.join(" and ")}). It is fetched by itself; try again in a few minutes.`,
              `आज का पूर्वानुमान अभी प्रकाशित नहीं हुआ (नवीनतम ${ol.manifest.days.join(" और ")} का है)। यह अपने आप आता है; कुछ मिनट बाद फिर देखिए।`,
            )}
          </p>
        )}
        {live && live.ac.length < 80 && (
          <p class="now-warn mono-s">
            {tx(
              `The live aircraft feed has only ${live.ac.length} airliners over India right now (usually 200–260): the OpenSky Network's coverage is down. The advice below covers only these.`,
              `लाइव विमान फ़ीड में अभी भारत के ऊपर केवल ${live.ac.length} यात्री विमान हैं (आमतौर पर 200–260): OpenSky Network की कवरेज बंद है। नीचे की सलाह केवल इन्हीं के लिए है।`,
            )}
          </p>
        )}
        {live === null && <p class="now-warn mono-s">{T("The live aircraft feed cannot be reached right now. Try again in a minute.")}</p>}
        {mode === "next" && sched === null && <p class="now-warn mono-s">{T("The list of expected flights is not published yet.")}</p>}

        <div class="rt-tiles now-tiles" aria-live="polite">
          <div>
            <b>{mode === "now" ? (live ? (near ? (tracked ?? []).filter((t) => within(t.lat, t.lon)).length : live.ac.length) : "…") : next ? (near ? rows.length : next.length) : "…"}</b>
            <span>
              {mode === "now"
                ? near
                  ? tx(`airliners within ${NEAR_KM} km of ${near.name} now`, `अभी ${near.name} के ${NEAR_KM} किमी के भीतर यात्री विमान`)
                  : T("airliners over India now (above FL200)")
                : near
                  ? tx(`expected flights near ${near.name} in the next ${HOURS} hours`, `अगले ${HOURS} घंटों में ${near.name} के पास अपेक्षित उड़ानें`)
                  : tx(`expected departures in the next ${HOURS} hours`, `अगले ${HOURS} घंटों में अपेक्षित उड़ानें`)}
            </span>
          </div>
          <div>
            <b>{rows.length ? inAir : "…"}</b>
            <span>{mode === "now" ? tx(`of ${rows.length} cruising will cross lasting-contrail air`, `क्रूज़ कर रहे ${rows.length} में से टिकाऊ कंट्रेल वाली हवा से गुज़रेंगे`) : T("will cross lasting-contrail air at their planned level")}</span>
          </div>
          <div class="now-alerts">
            <b>{rows.length ? sum.n : "…"}</b>
            <span>{T("altitude changes advised")}</span>
          </div>
          <div class="rp-good">
            <b>{rows.length ? t1(sum.p50) : "…"}</b>
            <span>{tx(`CO₂e of warming avoided if all are followed (cautious ${t1(sum.low)}), for ${kg(sum.fuel)} of fuel`, `सब मानी जाएँ तो टली गर्मी, CO₂e (सतर्क ${t1(sum.low)}), ${kg(sum.fuel)} ईंधन के बदले`)}</span>
          </div>
        </div>

        <div class="map-wrap now-map">
          {(!NowMap || !ol) && <div class="map-loading mono-s">{T("Loading map…")}</div>}
          {NowMap && ol && (
            <NowMap
              manifest={ol.manifest}
              risk={risk}
              frame={frame}
              lines={lines}
              focus={focus}
              near={near ? [near.lon, near.lat] : null}
              nearKm={NEAR_KM}
              onSelect={pick}
              tip={tipFor}
              label={T("Map of airliners over India and the air where their contrails would last")}
            />
          )}
          {ol && !sample && <div class="map-loading mono-s">{T("Reading today's forecast…")}</div>}
          <div class="legend now-legend">
            <div class="legend-row">
              <span class="sw ramp" />
              <span>{tx(`Lasting-contrail air, ${mode === "now" ? "this hour" : utc(shownT).slice(0, 2) + ":00 UTC"}`, `टिकाऊ कंट्रेल वाली हवा, ${mode === "now" ? "इस घंटे" : utc(shownT).slice(0, 2) + ":00 UTC"}`)}</span>
            </div>
            <div class="legend-row">
              <span class="sw pred" />
              <span>{mode === "now" ? T("where a plane ahead would leave a lasting contrail") : T("lasting contrail left behind")}</span>
            </div>
            <div class="legend-row">
              <span class="sw now-adv" />
              <span>{T("flown at the advised level instead")}</span>
            </div>
            <div class="legend-row">
              <span class="sw now-ring" />
              <span>{T("advice: change level")}</span>
            </div>
          </div>
        </div>

        {mode === "next" && (
          <div class="rp-time now-time">
            <button class="tool strong" onClick={() => (simT >= end ? (setSim(live?.at ?? Date.now()), setPlaying(true)) : setPlaying(!playing))} aria-pressed={playing}>
              {playing ? `❚❚ ${T("Pause")}` : simT >= end ? `↻ ${T("Again")}` : `▶ ${T("Play")}`}
            </button>
            <input
              type="range"
              min={live?.at ?? 0}
              max={end}
              step={60_000}
              value={simT}
              aria-label={T("Time (UTC)")}
              onInput={(e) => (setPlaying(false), setSim(Number((e.target as HTMLInputElement).value)))}
            />
            <span class="mono rp-clock">
              {utc(simT)} UTC · {ist(simT)} IST
            </span>
            <div class="seg-ctl now-listen" role="group" aria-label={T("Show")}>
              <button class={!listened ? "on" : ""} aria-pressed={!listened} onClick={() => setListened(false)}>
                {T("As planned")}
              </button>
              <button class={listened ? "on" : ""} aria-pressed={listened} onClick={() => setListened(true)}>
                {T("If they listen")}
              </button>
            </div>
          </div>
        )}

        {/* right under the map: the chosen flight, then every flight with advice */}
        <section class="now-pick" aria-live="polite">
          {chosen || chosenTrack || chosenUp ? (
            <Detail key={`${mode}-${sel}`} row={chosen} t={chosenTrack} up={chosenUp} near={near} onClose={() => setSel(null)} />
          ) : (
            <p class="mono-s muted">{T("Click a plane on the map, or a flight below, to see its advice.")}</p>
          )}
        </section>

        <section class="now-board" aria-labelledby="board-title">
          <div class="now-board-head">
            <h2 id="board-title" class="display d-s">
              {mode === "now" ? T("Advice for the planes in the air") : T("Advice for the flights expected next")}
            </h2>
            <button class="tool" onClick={() => setAll(!all)}>
              {all ? T("Only those crossing lasting-contrail air") : tx(`Show all ${rows.length}`, `सभी ${rows.length} दिखाएँ`)}
            </button>
          </div>
          {!ready || !rows.length ? (
            <p class="mono-s muted">{!ready ? T("Reading today's forecast…") : mode === "now" ? T("Loading the airliners…") : T("Loading the expected flights…")}</p>
          ) : !shown.length ? (
            <p class="now-empty">
              {mode === "now"
                ? T("None of these flights crosses lasting-contrail air right now.")
                : T("None of the expected flights crosses lasting-contrail air at its likely level in the next 12 hours. Use the shading menu above the map to see at which levels that air is today.")}
            </p>
          ) : (
            <div class="now-table-wrap">
              <table class="alt-table now-table">
                <thead>
                  <tr>
                    <th>{T("Flight")}</th>
                    <th>{T("Route")}</th>
                    {mode === "next" && <th>{T("Departs")}</th>}
                    <th>{T("Level")}</th>
                    <th>{T("In lasting air")}</th>
                    <th>{T("Advice")}</th>
                    <th class="num">{T("Extra fuel")}</th>
                    <th class="num">{T("Warming avoided")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const a = r.advice;
                    return (
                      <tr class={`${a?.alert ? "best" : ""} ${r.id === sel ? "sel" : ""}`} onClick={() => pick(r.id)}>
                        <th>
                          <button class="now-cs" onClick={(e) => (e.stopPropagation(), pick(r.id))} aria-pressed={r.id === sel}>
                            {r.cs}
                          </button>
                          <span class="muted"> {r.type ?? ""}</span>
                        </th>
                        <td>{r.route}</td>
                        {mode === "next" && <td class="mono-s">{r.when}</td>}
                        <td>
                          {flName(r.fl)}
                          {r.flNote && <span class="muted" title={r.flNote}>*</span>}
                        </td>
                        <td>{a ? `${a.nLasting} ${T("min")}` : "–"}</td>
                        <td>{a?.alert ? `→ ${flName(a.alt!)} · ${spanText(r.path, a.spans[0])}${a.spans.length > 1 ? ` +${a.spans.length - 1}` : ""}` : a?.nLasting ? T("no level nearby helps") : "–"}</td>
                        <td class="num">{a?.alert ? kg(a.extraFuelKg) : "–"}</td>
                        <td class="num">{a?.alert ? `${t1(a.avoided.p50)} (${t1(a.avoided.low)})` : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {mode === "next" && <p class="small muted">{T("* The planned level is not known in advance: we take the level airliners on the same route are flying now, else on trips of the same direction and length, else FL350 eastbound / FL360 westbound.")}</p>}
        </section>

        <div class="note now-note">
          <p class="label">{T("How this works, and its limits")}</p>
          <p>
            {T(
              "Weather: today's ECMWF open-data forecast, physics only (Schmidt–Appleman with ice supersaturation, hour by hour, every 2,000 ft); our learned correction is not applied, because the open forecast lacks the cloud fields it needs, and this physics flags about six times more lasting contrails over India than the satellite sees (H1). Odd flight levels are judged between the forecast's levels.",
            )}
          </p>
          <p>
            {T(
              "Planes in the air: OpenSky positions (every few minutes, moved on by speed and heading), types from the Mictronics database and routes from adsb.lol's route database; a route is used only if the plane lies on it and is heading for the next stop, otherwise we look one hour ahead on its heading. Planes climbing, descending, below FL280 or about to land are not advised.",
            )}
          </p>
          <p>
            {tx(
              `Expected flights: the ${sched?.flights.length ?? "…"} airline flights to, from and within India that OpenSky's receivers placed on ${sched?.day ?? "…"} (about one in five of India's flights: India has few receivers), assumed to fly again today at the same time (flight numbers repeat daily; each time ± its uncertainty). Their route is flown along the great circle at a typical cruise speed.`,
              `अपेक्षित उड़ानें: भारत से, भारत को और भारत के भीतर की वे ${sched?.flights.length ?? "…"} एयरलाइन उड़ानें जिन्हें OpenSky के रिसीवरों ने ${sched?.day ?? "…"} को पहचाना (भारत की लगभग हर पाँचवीं उड़ान: भारत में रिसीवर कम हैं), यह मानकर कि वे आज उसी समय फिर उड़ेंगी (फ़्लाइट नंबर रोज़ दोहराए जाते हैं; हर समय ± उसकी अनिश्चितता के साथ)। उनका रास्ता ग्रेट सर्कल पर सामान्य क्रूज़ गति से माना गया है।`,
            )}
          </p>
          <p>
            {T(
              "Advice: a level 2,000 or 4,000 ft away, within the aircraft's ceiling, held only over each stretch in lasting-contrail air (5 minutes either side; stretches less than 10 minutes apart are joined). Contrail warming per minute and fuel CO₂ per minute as on Your flight (CoCiP over India; OpenAP), 100-year CO₂e with efficacy 0.42. An alert needs even the cautious estimate (25th percentile) to beat the extra fuel's CO₂; warming avoided is net of that fuel. Air traffic control, other traffic and the climb itself are not modelled.",
            )}
          </p>
          <p>
            <b>{T("A research demonstration: no advice is sent to any pilot, airline or air traffic controller, and none should be acted on.")}</b>
          </p>
          <p class="mono-s muted">
            {tx(
              `Positions ${live?.age != null ? `${live.age} min old` : "…"} · refreshed every minute · Live aircraft: The OpenSky Network · Routes: adsb.lol (ODbL) · Types: Mictronics · Airports: OurAirports · Forecast: ECMWF open data (CC BY 4.0)`,
              `स्थितियाँ ${live?.age != null ? `${live.age} मिनट पुरानी` : "…"} · हर मिनट ताज़ा · लाइव विमान: The OpenSky Network · रूट: adsb.lol (ODbL) · प्रकार: Mictronics · हवाई अड्डे: OurAirports · पूर्वानुमान: ECMWF open data (CC BY 4.0)`,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<Tracked["status"], string> = {
  cruise: "cruising",
  climb: "climbing or descending",
  low: "below the forecast's levels",
  high: "above the forecast's levels",
  turboprop: "turboprop (flies below the forecast's levels)",
  landing: "about to descend",
};

const spanText = (path: Point[], [i, j]: [number, number]) => `${utc(path[i].t)}–${utc(path[j - 1].t)}`;

function routeText(t: Tracked) {
  return t.from && t.to ? `${t.from[0]} → ${t.to[0]}` : tx(`heading ${dirName(t.trk)}`, `${dirName(t.trk)} की ओर`);
}

function adviceShort(a: Advice) {
  const min = a.spans.reduce((n, [i, j]) => n + j - i, 0);
  if (a.alert) return tx(`Advice: ${flName(a.alt!)} for ${min} min`, `सलाह: ${min} मिनट ${flName(a.alt!)}`);
  if (a.nLasting) return tx(`${a.nLasting} min in lasting-contrail air; no level nearby helps`, `${a.nLasting} मिनट टिकाऊ कंट्रेल वाली हवा में; पास का कोई लेवल मदद नहीं करता`);
  return T("Clear of lasting-contrail air");
}

/** Where to look for a plane from ``near``: how far, how high above the horizon, which way. */
function lookUp(t: Tracked | null, near: Place | null): [string, ComponentChildren][] {
  if (!t || !near) return [];
  const [d, az] = distBearing(near.lat, near.lon, t.lat, t.lon);
  const el = deg(Math.atan2((t.fl * 100 * 0.3048) / 1000 - (d * d) / (2 * R_EARTH), d));
  if (el < 3) return [];
  return [[tx(`From ${near.name}`, `${near.name} से`), tx(`${Math.round(d)} km away: look ${Math.round(el)}° above the horizon, towards the ${dirName(az)}`, `${Math.round(d)} किमी दूर: क्षितिज से ${Math.round(el)}° ऊपर, ${dirName(az)} की ओर देखिए`)]];
}

/** "Delhi (DEL)" from a route stop; the city as the route database or airport list names it. */
function place(st: Stop) {
  const city = st[3] || AIRPORTS.find((a) => a.code === st[0])?.city;
  return city ? `${city} (${st[0]})` : st[0];
}
const dur = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
};
const both = (t: number) => `${utc(t)} UTC (${ist(t)} IST)`;

/** Everything about the chosen flight, right under the map: its trip, its contrails, the advice. */
function Detail({ row, t, up, near, onClose }: { row: Row | null; t: Tracked | null; up: Upcoming | null; near: Place | null; onClose: () => void }) {
  const a = row?.advice ?? t?.advice ?? null;
  const cs = row?.cs ?? t?.cs ?? up?.cs ?? "";
  const type = row?.type ?? t?.type ?? up?.type ?? null;
  const from = t?.from ?? up?.from ?? null;
  const to = t?.to ?? up?.to ?? null;
  const tm: Timing | null = t?.timing ?? (up ? { dep: up.dep, arr: up.arr, total: up.total } : null);
  const path = row?.path ?? t?.path ?? up?.path ?? [];
  const until = contrailsUntil(a, path);
  const now = Date.now();
  const fl = row?.fl ?? t?.fl ?? up?.fl ?? 0;
  const facts: [string, ComponentChildren][] = [
    [T("Route"), from && to ? `${place(from)} → ${place(to)}` : tx(`Unknown: not in the route database, or not on its listed route (heading ${t ? dirName(t.trk) : "?"}), so its departure and landing times are not known either`, `अज्ञात: रूट डेटाबेस में नहीं, या अपने दर्ज रूट पर नहीं (${t ? dirName(t.trk) : "?"} की ओर), इसलिए इसके रवाना होने और उतरने का समय भी पता नहीं`)],
    [up ? T("Departs") : T("Departed"), up ? `${both(up.dep)} ±${up.acc} min` : tm ? tx(`about ${both(tm.dep)}`, `लगभग ${both(tm.dep)}`) : "–"],
    [T("Lands"), tm ? tx(`about ${both(tm.arr)}`, `लगभग ${both(tm.arr)}`) : "–"],
    [T("Travel time"), tm ? (up ? tx(`about ${dur(tm.total)}`, `लगभग ${dur(tm.total)}`) : tx(`about ${dur(tm.total)} · ${dur((tm.arr - now) / 60_000)} left`, `लगभग ${dur(tm.total)} · ${dur((tm.arr - now) / 60_000)} बाकी`)) : "–"],
    ...lookUp(t, near),
    [T("Level"), up ? tx(`about ${flName(fl)} (${row?.flNote ?? ""})`, `लगभग ${flName(fl)} (${row?.flNote ?? ""})`) : t ? `${flName(t.fl)} · ${Math.round(t.kmh)} km/h · ${T(STATUS[t.status])}` : flName(fl)],
    [
      T("Contrails"),
      t && t.status !== "cruise"
        ? tx(`Not checked: the aircraft is ${STATUS[t.status]}.`, `जाँचा नहीं गया: विमान ${T(STATUS[t.status])} है।`)
        : !a
          ? "–"
          : until
            ? tx(
                `It would leave lasting contrails for ${a.nLasting} min of ${up ? `its ${a.minutes} min of cruise` : `the next ${a.minutes}`} (${utc(path[a.lasting.indexOf(true)].t)}–${utc(path[a.lasting.lastIndexOf(true)].t)} UTC). Contrails like these stayed in the sky for about ${LIFE_H.p25.toFixed(1)}–${LIFE_H.p75.toFixed(1)} h (median ${LIFE_H.p50.toFixed(1)} h) in our CoCiP runs over India, so these could last until about ${utc(until[0])}–${utc(until[1])} UTC.`,
                `यह ${up ? `अपने ${a.minutes} मिनट के क्रूज़` : `अगले ${a.minutes}`} में से ${a.nLasting} मिनट टिकाऊ कंट्रेल छोड़ेगा (${utc(path[a.lasting.indexOf(true)].t)}–${utc(path[a.lasting.lastIndexOf(true)].t)} UTC)। भारत पर हमारे CoCiP रन में ऐसी कंट्रेल लगभग ${LIFE_H.p25.toFixed(1)}–${LIFE_H.p75.toFixed(1)} घंटे (माध्यिका ${LIFE_H.p50.toFixed(1)} घंटे) आसमान में रहीं, इसलिए ये लगभग ${utc(until[0])}–${utc(until[1])} UTC तक रह सकती हैं।`,
              )
            : tx(`None that last: the next ${a.minutes} min of its cruise stay out of air where contrails persist, so any contrail it draws fades within minutes.`, `कोई टिकाऊ नहीं: इसके क्रूज़ के अगले ${a.minutes} मिनट ऐसी हवा से बाहर रहते हैं जहाँ कंट्रेल टिकती है, इसलिए इसकी कोई भी कंट्रेल कुछ ही मिनटों में मिट जाएगी।`),
    ],
  ];
  return (
    <div class={`now-detail ${a?.alert ? "alert" : ""}`}>
      <header>
        <b class="mono">{cs}</b>
        <span class="mono-s muted">{type ?? T("type unknown (A320neo assumed)")}</span>
        <button class="tool" onClick={onClose} aria-label={T("Close")}>
          ×
        </button>
      </header>
      <dl class="now-facts">
        {facts.filter(([, v]) => v !== "–").map(([k, v]) => (
          <>
            <dt class="mono-s">{k}</dt>
            <dd>{v}</dd>
          </>
        ))}
      </dl>
      {a?.alert && row ? (
        <p class="now-advice">
          {tx(
            <>
              <b>
                Advice: {feet(a.alt! - a.fl)} to {flName(a.alt!)} for {a.spans.map((x) => spanText(row.path, x)).join(" and ")} UTC
              </b>
              {a.spans.length > 1 ? `, back to ${flName(a.fl)} in between and after.` : `, then back to ${flName(a.fl)}.`} {a.altLasting ? `${a.altLasting} lasting minutes would remain. ` : "No lasting contrail would remain. "}
              Extra fuel {kg(a.extraFuelKg)}; contrail warming avoided about <b>{t1(a.avoided.p50)} CO₂e</b> (cautious {t1(a.avoided.low)}), already net of that fuel.
            </>,
            <>
              <b>
                सलाह: {a.spans.map((x) => spanText(row.path, x)).join(" और ")} UTC के दौरान {flName(a.alt!)} पर ({feet(a.alt! - a.fl)})
              </b>
              , बाकी समय {flName(a.fl)} पर। {a.altLasting ? `${a.altLasting} टिकाऊ मिनट बचेंगे। ` : "कोई टिकाऊ कंट्रेल नहीं बचेगी। "}
              अतिरिक्त ईंधन {kg(a.extraFuelKg)}; टली कंट्रेल गर्मी लगभग <b>{t1(a.avoided.p50)} CO₂e</b> (सतर्क {t1(a.avoided.low)}), उस ईंधन को घटाकर।
            </>,
          )}
        </p>
      ) : a?.nLasting ? (
        <p class="muted">{T("No level 2,000 or 4,000 ft away avoids it for less CO₂ than the contrail's warming (or the aircraft cannot fly there), so there is no advice.")}</p>
      ) : null}
      {tm && <p class="mono-s muted now-est">{up ? T("Times: yesterday's flight under the same number; landing = departure + a typical block time.") : T("Times are estimates: landing from the distance left at the current ground speed plus 10 minutes of approach; departure from a typical block time.")}</p>}
    </div>
  );
}

function pt(id: string, lon: number, lat: number, brg: number, alert: boolean, sel: boolean): GeoJSON.Feature {
  return { type: "Feature", properties: { id, brg, alert, sel }, geometry: { type: "Point", coordinates: [lon, lat] } };
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// the forecast's lasting-contrail air for one hour, coloured like the main map (cached)
const riskCache = new Map<string, string>();
let spritesFor: Map<string, { data: Uint8Array; width: number; height: number }> | null = null;
function riskImage(m: Manifest, t: number, shade: number | "any"): string | null {
  const date = new Date(t).toISOString().slice(0, 10);
  const hour = new Date(t).getUTCHours();
  const k = `${m.days.join()}|${date}|${hour}|${shade}`;
  const hit = riskCache.get(k);
  if (hit) return hit;
  if (!spritesFor) return null;
  const { rows, cols } = m.grid;
  const out = new Uint8Array(rows * cols);
  const scale = m.layers?.find((l) => l.id === "B1")?.full_scale ?? 1;
  for (const fl of shade === "any" ? SHADE_FLS : [shade]) {
    const s = spritesFor.get(`${date}|${fl}`);
    if (!s) continue;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = Math.min(255, Math.round(s.data[r * s.width + hour * cols + c] * scale));
        if (v > out[r * cols + c]) out[r * cols + c] = v;
      }
  }
  const cv = document.createElement("canvas");
  cv.width = cols;
  cv.height = rows;
  cv.getContext("2d")!.putImageData(new ImageData(colourise(out) as Uint8ClampedArray<ArrayBuffer>, cols, rows), 0, 0);
  const url = cv.toDataURL("image/png");
  riskCache.set(k, url);
  return url;
}
