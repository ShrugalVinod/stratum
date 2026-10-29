import { useEffect, useRef, useState } from "preact/hooks";
import type { FlaggedSegment, Manifest } from "../data/contract";
import { currentBuild, layerUrl, loadContrailDay, loadGridBytes, loadLive, loadManifest, loadOutlook, loadOutlookB1, loadReplayDay, loadWeighted } from "../data/load";
import { type Live, sampler } from "../lib/advice";
import { buildLiveSky } from "../lib/liveSky";
import { T, tx } from "../i18n";
import type { SkyContrail, SkyFlight, SkyHandle, SkyMove, SkyPick, SkyProof, SkyView } from "../three/sky";
import "../styles/map.css";

/** /3d — the sky over India in 3D: one real day, minute by minute, with the sun where it was,
 *  the humid air where contrails last, every airliner of the day, and the lasting contrails CoCiP
 *  found forming behind them, spreading and fading. Scene: three/sky.ts (loaded only here). */

const LAYERS = [
  { id: "B1", label: "Physics", title: "Raw ERA5 physics: share of the hour with persistent-contrail conditions" },
  { id: "B3", label: "Published fix", title: "The published humidity correction" },
  { id: "STRATUM", label: "STRATUM", title: "STRATUM's probability of a satellite-visible persistent contrail (10 % shown as full)" },
] as const;
type LayerId = (typeof LAYERS)[number]["id"];
const SPEEDS = [
  { k: "ride", label: "Real feel", perSec: 2 },
  { k: "fast", label: "Fast", perSec: 20 },
  { k: "day", label: "Whole day", perSec: 60 },
  { k: "tour", label: "", perSec: 10 }, // the story's own pace (no button)
  { k: "live", label: "Real time", perSec: 1 / 60 }, // live: one minute a minute
] as const;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
const hhmm = (m: number) => `${pad((m / 60) % 24)}:${pad(m % 60)}`;
const minOf = (iso: string, day: string) => (Date.parse(iso) - Date.parse(`${day}T00:00:00Z`)) / 60_000;
const tonnes = (kg: number) => (kg >= 9_950 ? Math.round(kg / 1000).toLocaleString() : (kg / 1000).toFixed(1));
/** One of the day's STRATUM alerts (second analysis D-006): a stretch, its advised level, what it saves. */
type Alert = { flight: string; cs: string; t0: number; t1: number; fl: number; alt: number; low: number; p50: number; fuelKg: number };
const TOUR_DAY = "2026-02-01";
const LIVE = "live"; // the day menu's "Live now": today's real airliners and today's forecast

export function Sky3D() {
  const box = useRef<HTMLDivElement>(null);
  const eng = useRef<SkyHandle | null>(null);
  const sim = useRef(720);
  const [man, setMan] = useState<Manifest | null>(null);
  const [build, setBuild] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerId>("B1");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [play, setPlay] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["k"]>("fast");
  const [clock, setClock] = useState(720);
  const [stats, setStats] = useState({ airborne: 0, contrails: 0, sunElev: 0 });
  const [hover, setHover] = useState<SkyPick | null>(null);
  const [following, setFollowing] = useState<SkyFlight | null>(null);
  const [contrails, setContrails] = useState<SkyContrail[]>([]);
  const [ended, setEnded] = useState<string | null>(null);
  const [liveInfo, setLiveInfo] = useState<{ n: number; run: string; fb: { recorded_t: number; reason: string } | null; covered: boolean } | null>(null);
  const flightsRef = useRef<SkyFlight[]>([]);
  const contrailsRef = useRef<SkyContrail[]>([]);
  // "If they had listened": the day's alerts, flown at the advised level
  const [view, setView] = useState<SkyView>("flown");
  const listened = view === "listened";
  const viewRef = useRef<SkyView>("flown");
  viewRef.current = view;
  // the contrails Meteosat-9 confirmed this day: per flight, the satellite image times
  const [seenBy, setSeenBy] = useState<Map<string, number[]>>(new Map());
  const seenRef = useRef<{ flight: string; t0: number; first: number }[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertsRef = useRef<Alert[]>([]);
  // the one-minute story (?tour=1, or the button)
  const [tour, setTour] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const tourRef = useRef(false);
  tourRef.current = tour;

  // the build, the day, the hour and the layer (from the address when given)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    Promise.all([loadManifest(), currentBuild()])
      .then(([{ manifest }, b]) => {
        setMan(manifest);
        setBuild(b);
        const d = q.get("date");
        const days = manifest.days_with_flights.length ? manifest.days_with_flights : manifest.days;
        setDate(d === LIVE || (d && days.includes(d)) ? d : days.includes("2026-02-01") ? "2026-02-01" : days[days.length - 1]);
        const h = Number(q.get("hour"));
        if (q.get("hour") && Number.isInteger(h) && h >= 0 && h < 24) sim.current = h * 60;
        else sim.current = 13 * 60; // early evening in India: the sun sets and the contrails come out
        const l = q.get("layer");
        if (l && LAYERS.some((x) => x.id === l)) setLayer(l as LayerId);
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPlay(false);
        const v = q.get("view");
        if (v === "listened" || v === "satellite") setView(v);
        if (q.get("tour") === "1") setTour(true);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  // the scene (once)
  useEffect(() => {
    if (!man || !box.current) return;
    let stop = false;
    const el = box.current;
    Promise.all([import("../three/sky"), ...["countries", "india_states", "cities"].map((n) => fetch(`${BASE}/geo/${n}.geojson`).then((r) => r.json()))])
      .then(([mod, countries, states, cities]) => {
        if (stop) return;
        const e = (mod as typeof import("../three/sky")).createSky(el, { countries, states, cities });
        e.time.min = sim.current;
        e.onFollowEnd(() => {
          setFollowing((f) => {
            if (f) setEnded(f.cs);
            return null;
          });
          setSpeed(tourRef.current ? "tour" : "fast"); // the story keeps its own pace
        });
        e.onPick((p, click) => {
          setHover(click ? null : p);
          if (click && p) ride(p.id);
        });
        eng.current = e;
        setReady(true);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
    return () => {
      stop = true;
      eng.current?.dispose();
      eng.current = null;
    };
  }, [man]);

  // the day's flights and the lasting contrails CoCiP found
  useEffect(() => {
    if (!ready || !date) return;
    setLoading(true);
    if (date === LIVE) {
      // live: the airliners in the air now on their paths ahead, today's forecast humid air,
      // the contrails they would leave, and STRATUM's advice for them (as on Live advice)
      (async () => {
        const o = await loadOutlook();
        if (!o) throw new Error("no forecast");
        const [sprites, feed] = await Promise.all([loadOutlookB1(o.manifest), loadLive(20.5, 78.9, "allow")]);
        const at = Date.now();
        const today = new Date(at).toISOString().slice(0, 10);
        const sky = buildLiveSky(feed.ac as Live[], at, sampler(o.manifest, sprites));
        const scale = o.manifest.layers?.find((l) => l.id === "B1")?.full_scale ?? 1;
        const levels = o.manifest.flight_levels.flatMap(({ fl }) => {
          const sprite = sprites.get(`${today}|${fl}`);
          return sprite ? [{ fl, sprite }] : [];
        });
        eng.current?.setHumid(levels, o.manifest.grid, (v) => v * scale);
        seenRef.current = [];
        setSeenBy(new Map());
        eng.current?.setProofs([]);
        alertsRef.current = sky.alerts.sort((a, b) => a.t0 - b.t0);
        setAlerts(alertsRef.current);
        flightsRef.current = sky.flights;
        contrailsRef.current = sky.contrails;
        setContrails(sky.contrails);
        eng.current?.setDay(today, sky.flights, sky.contrails);
        sim.current = (at - Date.parse(`${today}T00:00:00Z`)) / 60_000;
        setSpeed("live");
        setPlay(true);
        setView((v) => (v === "satellite" ? "flown" : v));
        setLiveInfo({ n: feed.ac.length, run: o.info.run, fb: feed.fallback ?? null, covered: levels.length > 0 });
      })()
        .catch(() => setErr(T("The live sky cannot be loaded right now. Try again in a minute.")))
        .finally(() => setLoading(false));
      return;
    }
    setLiveInfo(null);
    setSpeed((sp) => (sp === "live" ? "fast" : sp));
    Promise.all([loadReplayDay(date), loadWeighted(date), loadContrailDay(date).catch(() => [])])
      .then(([{ flights, b1 }, weighted, seen]) => {
        // what the satellite saw: the detector's matched lines in each image, at the flight's level
        const proofs: SkyProof[] = [];
        const times = new Map<string, number[]>();
        for (const e of seen)
          for (const sl of e.slots) {
            const lines = sl.detected.filter((d) => d.matched && d.lon.length > 1).map((d) => d.lon.map((lo, i) => [lo, d.lat[i]] as [number, number]));
            if (!lines.length) continue;
            const t = minOf(sl.t, date);
            proofs.push({ flight: e.flight_id, t, fl: e.fl ?? 350, lines });
            (times.get(e.flight_id) ?? times.set(e.flight_id, []).get(e.flight_id)!).push(t);
          }
        for (const ts of times.values()) ts.sort((a, b) => a - b);
        seenRef.current = seen
          .map((e) => ({ flight: e.flight_id, t0: minOf(e.t_start, date), first: Math.min(...(times.get(e.flight_id) ?? [Infinity])) }))
          .filter((x) => Number.isFinite(x.first))
          .sort((a, b) => a.first - b.first);
        setSeenBy(times);
        eng.current?.setProofs(proofs);
        // the day's alerts (D-006): which flights move, when, by how much, and what it saves
        const al: Alert[] = (weighted ?? [])
          .filter((w) => w.alert && w.best_alternative_fl != null)
          .map((w) => {
            const t0 = minOf(w.time_utc, date);
            const r = w.net_warming_avoided_100y_range ?? [0, 0, 0];
            return { flight: w.flight_id, cs: w.callsign, t0, t1: w.time_end_utc ? minOf(w.time_end_utc, date) : t0 + (w.n_segments ?? 1), fl: w.fl, alt: w.best_alternative_fl!, low: r[0], p50: r[1], fuelKg: w.extra_fuel_kg ?? 0 };
          })
          .sort((a, b) => a.t0 - b.t0);
        const movesOf = new Map<string, SkyMove[]>();
        for (const a of al) (movesOf.get(a.flight) ?? movesOf.set(a.flight, []).get(a.flight)!).push({ t0: a.t0, t1: a.t1, dFl: a.alt - a.fl });
        const byFlight = new Map<string, FlaggedSegment[]>();
        for (const s of b1) (byFlight.get(s.flight_id) ?? byFlight.set(s.flight_id, []).get(s.flight_id)!).push(s);
        const fls: SkyFlight[] = flights
          .filter((f) => f.properties.minutes?.length === f.geometry.coordinates.length && f.geometry.coordinates.length > 1)
          .map((f) => {
            const segs = byFlight.get(f.properties.flight_id) ?? [];
            const levels = segs.map((s) => s.fl).sort((a, b) => a - b);
            return {
              id: f.properties.flight_id,
              cs: f.properties.callsign,
              type: f.properties.aircraft_type,
              mins: f.properties.minutes,
              xy: f.geometry.coordinates as [number, number][],
              fl: levels.length ? levels[levels.length >> 1] : 350,
              makesContrail: segs.length > 0,
              moves: movesOf.get(f.properties.flight_id),
            };
          });
        const cs: SkyContrail[] = b1.map((s) => {
          const t0 = minOf(s.time_utc, date);
          return {
            flight: s.flight_id,
            a: [s.lon_start, s.lat_start],
            b: [s.lon_end, s.lat_end],
            fl: s.fl,
            t0,
            t1: s.time_end_utc ? minOf(s.time_end_utc, date) : t0 + (s.n_segments ?? 1),
            lifeMin: (s.contrail_age_h ?? 3) * 60,
            // inside an advised stretch of the same flight: this contrail is not made if they listen
            moved: al.some((a) => a.flight === s.flight_id && minOf(s.time_utc, date) <= a.t1 + 1 && (s.time_end_utc ? minOf(s.time_end_utc, date) : t0) >= a.t0 - 1),
          };
        });
        alertsRef.current = al;
        setAlerts(al);
        flightsRef.current = fls;
        contrailsRef.current = cs;
        setContrails(cs);
        eng.current?.setDay(date, fls, cs);
      })
      .catch(() => setErr(T("This day could not be loaded.")))
      .finally(() => setLoading(false));
  }, [ready, date]);

  useEffect(() => {
    eng.current?.setView(view);
  }, [ready, view]);

  // the humid air for the day, every flight level
  useEffect(() => {
    if (!ready || !man || !date || !build || date === LIVE) return;
    const info = man.layers?.find((l) => l.id === layer);
    if (!info) return;
    let alive = true;
    Promise.all(man.flight_levels.map((f) => loadGridBytes(layerUrl(build, date, info.file, f.fl)).then((sprite) => ({ fl: f.fl, sprite }))))
      .then((levels) => {
        if (!alive) return;
        const scale = info.full_scale;
        eng.current?.setHumid(levels, man.grid, (v) => (layer === "STRATUM" ? (v * scale) / 0.1 : v * scale));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ready, man, build, date, layer]);

  // the clock: the scene reads the time every frame; the page redraws ~10 times a second
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let last = performance.now();
    let drawn = 0;
    const per = SPEEDS.find((s) => s.k === speed)!.perSec;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (play) sim.current = (sim.current + dt * per) % 1440;
      if (eng.current) eng.current.time.min = sim.current;
      if (now - drawn > 100) {
        drawn = now;
        setClock(sim.current);
        if (eng.current) setStats(eng.current.stats());
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready, play, speed]);

  useEffect(() => {
    if (!date) return;
    history.replaceState(null, "", `/3d?date=${date}&hour=${Math.floor(clock / 60)}&layer=${layer}${view !== "flown" ? `&view=${view}` : ""}`);
  }, [date, layer, view, Math.floor(clock / 60)]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === " " && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setPlay((p) => !p);
      }
      if (e.key === "Escape") stopRide();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  /** Ride behind a flight: the one given, or the next one about to leave a lasting contrail. */
  function ride(id?: string) {
    const fls = flightsRef.current;
    let f = id ? fls.find((x) => x.id === id) : undefined;
    if (!f && viewRef.current === "satellite") {
      // the next contrail the satellite confirms while its plane is still flying: join 12 minutes before
      const flying = (id: string, a: number, z: number) => {
        const x = fls.find((y) => y.id === id);
        return x && x.mins[0] <= a && x.mins[x.mins.length - 1] >= z ? x : undefined;
      };
      const ok = seenRef.current.filter((x) => flying(x.flight, x.first - 12, x.first + 3));
      const ev = ok.find((x) => x.first >= sim.current + 14) ?? ok[0];
      f = ev ? flying(ev.flight, ev.first - 12, ev.first + 3) : undefined;
      if (!f || !ev) return;
      sim.current = ev.first - 12;
    } else if (!f && viewRef.current === "listened") {
      const al = alertsRef.current;
      const next = al.find((a) => a.t0 >= sim.current + 10) ?? al[0];
      f = next ? fls.find((x) => x.id === next.flight) : undefined;
      if (!f || !next) return;
      sim.current = Math.max(f.mins[0], next.t0 - 9);
    } else if (!f) {
      const cs = [...contrailsRef.current];
      const next = cs.filter((c) => c.t0 >= sim.current + 6).sort((a, b) => a.t0 - b.t0)[0] ?? cs.sort((a, b) => a.t0 - b.t0)[0];
      if (!next) return;
      f = fls.find((x) => x.id === next.flight);
      if (!f) return;
      sim.current = Math.max(f.mins[0], next.t0 - 8);
    } else if (sim.current < f.mins[0] || sim.current > f.mins[f.mins.length - 1]) sim.current = f.mins[0];
    setSpeed("ride");
    setPlay(true);
    setFollowing(f);
    setEnded(null);
    // the scene must see the new time before it looks for the plane
    if (eng.current) {
      eng.current.time.min = sim.current;
      eng.current.follow(f.id);
    }
  }
  function stopRide() {
    setFollowing(null);
    setSpeed("fast");
    eng.current?.home();
  }

  // the story: seven captions over about a minute, the camera and the switch doing the rest
  useEffect(() => {
    if (!tour) return;
    if (!ready || loading) return;
    if (date !== TOUR_DAY) {
      setDate(TOUR_DAY);
      return;
    }
    const al = alertsRef.current;
    const total = al.reduce((s, a) => s + a.p50, 0);
    const fuel = al.reduce((s, a) => s + a.fuelKg, 0);
    const steps: [number, () => void][] = [
      [0, () => {
        setFollowing(null);
        eng.current?.home();
        setView("flown");
        sim.current = 11 * 60 + 10;
        setSpeed("tour");
        setPlay(true);
        setCaption(T("1 February 2026. Every airliner over India, on its real track."));
      }],
      [7000, () => setCaption(T("The white sheets: air so cold and humid that a contrail, once made, lasts for hours."))],
      [14000, () => setCaption(T("Planes that cross them leave contrails that spread into thin cloud and trap heat."))],
      [21000, () => {
        viewRef.current = "satellite"; // ride() must see the new view now, not on the next render
        setView("satellite");
        ride();
        setCaption(T("Is it real? Meteosat-9 scans India every 15 minutes."));
      }],
      [28500, () => setCaption(T("Cyan: the contrail our detector found in the real satellite image, matched to the plane that made it."))],
      [43000, () => {
        stopRide();
        setSpeed("tour");
        setCaption(T("Physics alone flags about six times more lasting contrails than the satellite sees. STRATUM checks the forecast against the satellite every day."));
      }],
      [52000, () => {
        setView("listened");
        setCaption(T("Now: what if every plane had followed STRATUM's advice?"));
      }],
      [58000, () => {
        ride();
        setCaption(T("Climb or descend 2,000 ft, cross the humid layer, come back. No lasting contrail."));
      }],
      [80000, () => {
        stopRide();
        setSpeed("tour");
        setCaption(tx(`In this one day: ${al.length} altitude changes avoid about ${tonnes(total)} t CO₂e of contrail warming, for ${tonnes(fuel)} t of extra fuel.`, `केवल इस एक दिन में: ${al.length} ऊँचाई बदलाव लगभग ${tonnes(total)} t CO₂e कंट्रेल गर्मी टालते हैं, ${tonnes(fuel)} t अतिरिक्त ईंधन के बदले।`));
      }],
      [90000, () => setCaption(T("STRATUM. Move the plane. Lose the cloud."))],
      [98000, () => {
        setCaption(null);
        setSpeed("fast");
        setTour(false);
      }],
    ];
    const ids = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
    // any touch, drag, wheel or key hands the sky back to the visitor
    const stopIt = () => {
      ids.forEach(clearTimeout);
      setCaption(null);
      setTour(false);
    };
    const el = box.current;
    const later = window.setTimeout(() => {
      el?.addEventListener("pointerdown", stopIt);
      el?.addEventListener("wheel", stopIt, { passive: true });
      addEventListener("keydown", stopIt);
    }, 400);
    return () => {
      ids.forEach(clearTimeout);
      clearTimeout(later);
      el?.removeEventListener("pointerdown", stopIt);
      el?.removeEventListener("wheel", stopIt);
      removeEventListener("keydown", stopIt);
    };
  }, [tour, ready, loading, date]);

  // what the advice has saved so far today (if they listened)
  const sofar = alerts.filter((a) => clock >= a.t0);
  const saved = { n: sofar.length, p50: sofar.reduce((s, a) => s + a.p50, 0), low: sofar.reduce((s, a) => s + a.low, 0), fuel: sofar.reduce((s, a) => s + a.fuelKg, 0) };
  const dayTotal = alerts.reduce((s, a) => s + a.p50, 0);
  const myAlerts = following ? alerts.filter((a) => a.flight === following.id) : [];
  const mine = listened ? (myAlerts.find((a) => clock <= a.t1 + 5) ?? myAlerts[myAlerts.length - 1] ?? null) : null;
  const rideText = (() => {
    if (!mine || !following) return null;
    const up = mine.alt > mine.fl;
    const ft = `${(Math.abs(mine.alt - mine.fl) * 100).toLocaleString()} ft`;
    if (clock < mine.t0 - 5) return tx(`STRATUM advice ahead: ${up ? "climb" : "descend"} ${ft} to FL${mine.alt} at ${hhmm(mine.t0)} UTC, before a stretch of air where its contrail would last.`, `आगे STRATUM की सलाह: ${hhmm(mine.t0)} UTC पर ${ft} ${up ? "ऊपर" : "नीचे"} FL${mine.alt} पर, उस हवा से पहले जहाँ इसकी कंट्रेल टिकती।`);
    if (clock < mine.t0) return tx(`${up ? "Climbing" : "Descending"} to FL${mine.alt} to clear the humid layer…`, `नम परत से बचने के लिए FL${mine.alt} की ओर ${up ? "चढ़ रहा" : "उतर रहा"} है…`);
    if (clock <= mine.t1) return tx(`At FL${mine.alt}, ${up ? "above" : "below"} the humid layer: no lasting contrail.`, `FL${mine.alt} पर, नम परत के ${up ? "ऊपर" : "नीचे"}: कोई टिकाऊ कंट्रेल नहीं।`);
    if (clock <= mine.t1 + 5) return tx(`Clear of it. Back to FL${mine.fl}.`, `परत पार। FL${mine.fl} पर वापस।`);
    return tx(`Done: about ${tonnes(mine.p50)} t CO₂e of warming avoided (cautious ${tonnes(mine.low)} t), for ${Math.round(mine.fuelKg)} kg of extra fuel.`, `पूरा: लगभग ${tonnes(mine.p50)} t CO₂e गर्मी टली (सतर्क ${tonnes(mine.low)} t), ${Math.round(mine.fuelKg)} kg अतिरिक्त ईंधन के बदले।`);
  })();

  // the satellite: how many of the day's confirmed contrails it has seen so far, and the ridden one
  const seenSoFar = seenRef.current.filter((x) => clock >= x.first).length;
  const seenTimes = following ? seenBy.get(following.id) : undefined;
  const proofText = (() => {
    if (!seenTimes?.length || listened) return null;
    const next = seenTimes.find((t) => t > clock);
    const last = [...seenTimes].reverse().find((t) => t <= clock);
    if (last != null && clock - last <= 30) return tx(`✓ Confirmed by Meteosat-9 at ${hhmm(last)} UTC: our detector found this contrail in the real satellite image.`, `✓ ${hhmm(last)} UTC पर Meteosat-9 ने पुष्टि की: हमारे डिटेक्टर ने यह कंट्रेल असली सैटेलाइट तस्वीर में पाई।`);
    if (next != null && last == null) return tx(`Meteosat-9 will image this stretch at ${hhmm(next)} UTC. Watch for cyan.`, `Meteosat-9 इस हिस्से की तस्वीर ${hhmm(next)} UTC पर लेगा। नीले रंग पर नज़र रखिए।`);
    return null;
  })();

  const ist = (clock + 330) % 1440;
  const phase = stats.sunElev > 8 ? T("Day") : stats.sunElev > -6 ? (clock / 60 + 5.5) % 24 < 12 ? T("Dawn") : T("Dusk") : T("Night");
  const avail = LAYERS.filter((l) => man?.layers?.some((x) => x.id === l.id));
  const ridingContrail = following && contrails.some((c) => c.flight === following.id && clock >= c.t0 && clock <= c.t1);

  return (
    <div class="sky3d">
      <div class={`s3-stage ${tour ? "touring" : ""}`} ref={box}>
        {err && <p class="s3-msg mono">{err}</p>}
        {(!ready || loading) && !err && <p class="s3-msg mono s3-loading">{T("Building the sky over India…")}</p>}

        <div class="s3-top">
          <div class="s3-title">
            <p class="label">{date === LIVE ? T("The sky over India · live") : T("The sky over India · one real day")}</p>
            <h1 class="display">{T("Where contrails are born")}</h1>
            <div class="s3-stats mono-s" aria-live="polite">
              <span>
                <b>{stats.airborne}</b> {T("airliners in the air")}
              </span>
              <span>
                <b>{stats.contrails}</b> {T("lasting contrails in the sky")}
              </span>
              <span>{phase}</span>
            </div>
            {liveInfo && date === LIVE && (
              <p class="s3-live mono-s">
                <b>● {T("Live")}</b>{" "}
                {liveInfo.fb
                  ? tx(`The live feed is down: the real sky recorded at ${hhmm((liveInfo.fb.recorded_t % 86_400_000) / 60_000)} UTC, shown as if now.`, `लाइव फ़ीड बंद है: ${hhmm((liveInfo.fb.recorded_t % 86_400_000) / 60_000)} UTC पर रिकॉर्ड किया गया असली आसमान, ऐसे दिखाया गया जैसे अभी हो।`)
                  : tx(`${liveInfo.n} airliners over India right now (OpenSky) on their paths ahead`, `अभी भारत के ऊपर ${liveInfo.n} यात्री विमान (OpenSky), अपने आगे के रास्तों पर`)}
                {" · "}
                {tx(`today's ECMWF forecast (run ${liveInfo.run.slice(0, 10)}), physics only`, `आज का ECMWF पूर्वानुमान (रन ${liveInfo.run.slice(0, 10)}), केवल भौतिकी`)}
                {!liveInfo.covered && ` · ${T("today's forecast is not published yet")}`}
              </p>
            )}
          </div>
          <div class="s3-right">
            <div class="s3-ctl">
              <span class="s3-seg s3-listen" role="radiogroup" aria-label={T("Which sky")}>
                <button role="radio" aria-checked={view === "flown"} class={view === "flown" ? "on" : ""} onClick={() => setView("flown")}>
                  {T("As flown")}
                </button>
                <button role="radio" aria-checked={view === "satellite"} class={view === "satellite" ? "on sat" : "sat"} disabled={date === LIVE} title={date === LIVE ? T("The satellite check is for past days") : undefined} onClick={() => setView("satellite")}>
                  {T("What the satellite saw")}
                </button>
                <button role="radio" aria-checked={listened} class={listened ? "on" : ""} onClick={() => setView("listened")}>
                  {T("If they had listened")}
                </button>
              </span>
              {!tour && (
                <button class="s3-btn s3-tour-btn" onClick={() => setTour(true)}>
                  ▶ {T("Watch the story (1½ min)")}
                </button>
              )}
              {man && date && (
                <select class="s3-select" value={date} onChange={(e) => (stopRide(), setDate((e.target as HTMLSelectElement).value))} aria-label={T("Day")}>
                  <option value={LIVE}>● {T("Live now")}</option>
                  {(man.days_with_flights.length ? man.days_with_flights : man.days).map((d) => (
                    <option value={d}>{new Date(`${d}T12:00:00Z`).toLocaleDateString(tx("en-GB", "hi-IN"), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</option>
                  ))}
                </select>
              )}
              {date !== LIVE && (
                <span class="s3-seg" role="radiogroup" aria-label={T("Humid air shown")}>
                  {avail.map((l) => (
                    <button role="radio" aria-checked={layer === l.id} class={layer === l.id ? "on" : ""} title={T(l.title)} onClick={() => setLayer(l.id)}>
                      {T(l.label)}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {view === "satellite" && (
              <div class="s3-saved s3-seen" aria-live="polite">
                <p class="label">{T("What the satellite saw")}</p>
                <b class="display">{seenSoFar}</b>
                <span>{tx(`contrails confirmed by Meteosat-9 so far today, of ${seenRef.current.length}`, `आज अब तक Meteosat-9 द्वारा पुष्ट कंट्रेल, ${seenRef.current.length} में से`)}</span>
                <span class="mono-s">{T("Over our 12 days, physics flags about 6× more lasting contrails than the satellite sees (H1): most are too thin to detect.")}</span>
              </div>
            )}
            {listened && (
              <div class="s3-saved" aria-live="polite">
                <p class="label">{T("If they had listened")}</p>
                <b class="display">{tonnes(saved.p50)} t</b>
                <span>{tx(`CO₂e of contrail warming avoided so far (cautious ${tonnes(saved.low)} t)`, `अब तक टली कंट्रेल गर्मी, CO₂e (सतर्क ${tonnes(saved.low)} t)`)}</span>
                <span class="mono-s">
                  {date === LIVE
                    ? tx(`${saved.n} of ${alerts.length} planes advised now have moved · +${tonnes(saved.fuel)} t fuel · all advice now ${tonnes(dayTotal)} t`, `अभी सलाह पाए ${alerts.length} में से ${saved.n} विमान हटे · +${tonnes(saved.fuel)} t ईंधन · अभी की सारी सलाह ${tonnes(dayTotal)} t`)
                    : tx(`${saved.n} of ${alerts.length} planes moved · +${tonnes(saved.fuel)} t fuel · whole day ${tonnes(dayTotal)} t`, `${alerts.length} में से ${saved.n} विमान हटे · +${tonnes(saved.fuel)} t ईंधन · पूरा दिन ${tonnes(dayTotal)} t`)}
                </span>
              </div>
            )}
          </div>
        </div>

        {caption && (
          <p class="s3-caption display" key={caption}>
            {caption}
          </p>
        )}

        {following ? (
          <div class="s3-ride">
            <p class="label">{T("Riding along")}</p>
            <b class="mono">{following.cs}</b>
            <span class="mono-s">
              {[following.type, `FL${following.fl}`].filter(Boolean).join(" · ")}
            </span>
            {proofText && <p class="s3-ride-now seen">{proofText}</p>}
            <p class={`s3-ride-now ${rideText ? "cool" : ridingContrail ? "hot" : ""}`}>
              {rideText ??
                (ridingContrail ? T("Inside air where its contrail lasts: watch it stay behind and spread.") : following.makesContrail ? T("Heading for air where its contrail will last.") : T("Its contrails fade within minutes."))}
            </p>
            <button class="s3-btn" onClick={stopRide}>
              {T("Back to all of India")} (Esc)
            </button>
          </div>
        ) : (
          ready && (
            <div class="s3-ride-btn-wrap">
              {ended && <p class="s3-ended mono-s">{tx(`${ended} has left the area.`, `${ended} क्षेत्र से बाहर चला गया।`)}</p>}
              <button class="s3-btn s3-ride-btn" onClick={() => ride()}>
                ✈ {listened ? T("Ride along as a plane dodges the layer") : view === "satellite" ? T("Ride along until the satellite sees it") : T("Ride along with a contrail-maker")}
              </button>
            </div>
          )
        )}

        {hover && !following && (
          <div class="s3-tip" style={{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }}>
            <b class="mono">{hover.cs}</b>
            <span class="mono-s">{[hover.type, `FL${hover.fl}`].filter(Boolean).join(" · ")}</span>
            {hover.inContrail && <span class="hot">{T("leaving a lasting contrail now")}</span>}
            {seenBy.has(hover.id) && <span class="seen">{T("its contrail was seen by Meteosat-9")}</span>}
            <em>{T("Click to ride along")}</em>
          </div>
        )}

        <div class="s3-key mono-s">
          <span>
            <i class="k-humid" /> {T("humid air where contrails last")}
          </span>
          <span>
            <i class="k-trail" /> {date === LIVE ? T("lasting contrail (today's forecast)") : T("lasting contrail (CoCiP)")}
          </span>
          <span>
            <i class="k-plane" /> {T("airliner (orange: making one now)")}
          </span>
          {listened && (
            <span>
              <i class="k-move" /> {T("changing level on STRATUM's advice")}
            </span>
          )}
          {!listened && date !== LIVE && (
            <span>
              <i class="k-seen" /> {T("contrail seen by Meteosat-9 (our detector)")}
            </span>
          )}
          <span class="muted">{T("height ×40 · drag to turn · scroll to zoom")}</span>
        </div>
      </div>

      <div class="s3-time">
        <button class="s3-btn" onClick={() => setPlay(!play)} aria-pressed={play}>
          {play ? `❚❚ ${T("Pause")}` : `▶ ${T("Play")}`}
        </button>
        <input
          type="range"
          min={0}
          max={1439}
          step={1}
          value={Math.round(clock)}
          aria-label={T("Time of day (UTC)")}
          onInput={(e) => {
            sim.current = Number((e.target as HTMLInputElement).value);
            setClock(sim.current);
          }}
        />
        <span class="mono s3-clock">
          {hhmm(clock)} UTC · {hhmm(ist)} IST
        </span>
        <span class="s3-seg" role="radiogroup" aria-label={T("Speed")}>
          {SPEEDS.filter((s) => s.label && (s.k !== "live" || date === LIVE)).map((s) => (
            <button role="radio" aria-checked={speed === s.k} class={speed === s.k ? "on" : ""} onClick={() => setSpeed(s.k)}>
              {T(s.label)}
            </button>
          ))}
        </span>
      </div>
      <p class="s3-note small">
        {T(
          "What the satellite saw: the contrail lines our learned detector (v3) found in the Meteosat-9 images of this day and matched to the flight that made them (in two images), shown at each image's time and where the satellite saw them, drifted by the wind. Only these derived lines are shown, never the images. Meteosat-9 imagery © EUMETSAT 2026.",
        )}
      </p>
      <p class="s3-note small">
        {T(
          "If they had listened: the alerts of our second analysis D-006 (the 60 strongest stretches each day, descriptive, not a pre-registered result). Each alerted plane changes level a few minutes before its stretch and comes back after it, and its lasting contrail there is not drawn; the warming avoided is net of the extra fuel, as on What if we'd listened?. No real flight was changed.",
        )}
      </p>
      <p class="s3-note small">
        {T(
          "Real flights and ERA5 weather of this day. Humid air: where the air at each flight level was cold and humid enough for contrails to last that hour (the layer chosen above). Lasting contrails: the ones CoCiP found, drawn as the aircraft passed and for as long as CoCiP says they lasted; real ones also drift with the wind, which is not shown. A flight's level is the one CoCiP flagged, else FL350. The sun is where it was over India; heights are stretched 40 times.",
        )}
      </p>
    </div>
  );
}
