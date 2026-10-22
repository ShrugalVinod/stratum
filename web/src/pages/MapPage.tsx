import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import type { ContrailEvent, ContrailIndex, DaySummary, ExplainDay, FlaggedSegment, FlightFeature, Manifest, Profile } from "../data/contract";
import { RAMP } from "../data/ramp";
import { clock, colourise, colouriseObs, joules, tonnes, type MapState, type ModelKey, pad2, parseState, stateQuery, type ViewKey } from "../data/format";
import { gridUrl, layerUrl, type Lists, loadContrailDay, loadContrailIndex, loadCorridor, loadDay, loadExplain, loadGridBytes, loadManifest, loadWeighted, loadWeightedSummary, spriteHour } from "../data/load";
import { WhyPanel } from "../components/WhyPanel";
import { ContrailProof } from "../components/ContrailProof";
import type { ContrailMap as ContrailMapT, Layers } from "../map/ContrailMap";
import "../styles/map.css";

type Grid = Uint8Array;
const gridCache = new Map<string, Promise<Grid>>();
const imgCache = new Map<string, string>();

function getGrid(build: string, date: string, fl: number, h: number): Promise<Grid> {
  const k = `${build}|${date}|${fl}|${h}`;
  let p = gridCache.get(k);
  if (!p) {
    p = loadGridBytes(gridUrl(build, date, fl, h)).then((g) => g.data);
    gridCache.set(k, p);
  }
  return p;
}

/** Value shown at the top of the colour ramp per layer: STRATUM's probabilities of a contrail
 *  the satellite would see are small (≈ 0.5 % on average), so 5 % already shows as the maximum. */
const DISPLAY_MAX: Record<string, number> = { B1: 1, B3: 1, STRATUM: 0.05, STRATUM_spread: 0.05, observable: 1 };
const spriteCache = new Map<string, Promise<{ data: Uint8Array; width: number; height: number }>>();

/** One hour of a layer as display bytes (0–255 = 0 … DISPLAY_MAX). A v1 build has only the
 *  B1 per-hour PNGs; a v2 build has hour sprites per layer and flight level. */
function getView(build: string, date: string, layer: string, fl: number, h: number, m: Manifest): Promise<Grid> {
  const info = m.layers?.find((l) => l.id === layer);
  if (!info) return getGrid(build, date, fl, h);
  const k = `${build}|${date}|${layer}|${fl}|${h}`;
  let p = gridCache.get(k);
  if (!p) {
    const url = layerUrl(build, date, info.file, fl);
    let sp = spriteCache.get(url);
    if (!sp) {
      sp = loadGridBytes(url);
      spriteCache.set(url, sp);
    }
    const f = info.full_scale / (DISPLAY_MAX[layer] ?? 1);
    p = sp.then((s) => {
      const raw = spriteHour(s, h, m.grid.cols);
      if (f === 1) return raw;
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = Math.min(255, Math.round(raw[i] * f));
      return out;
    });
    gridCache.set(k, p);
  }
  return p;
}

async function gridImage(build: string, date: string, layer: string, fl: number, h: number, m: Manifest): Promise<string> {
  const k = `${build}|${date}|${layer}|${fl}|${h}`;
  const hit = imgCache.get(k);
  if (hit) return hit;
  const g = await getView(build, date, layer, fl, h, m);
  const c = document.createElement("canvas");
  c.width = m.grid.cols;
  c.height = m.grid.rows;
  const ctx = c.getContext("2d")!;
  const rgba = layer === "observable" ? colouriseObs(g) : colourise(g);
  ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, m.grid.cols, m.grid.rows), 0, 0);
  const url = c.toDataURL("image/png");
  imgCache.set(k, url);
  return url;
}

function pointInPoly(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function corridorMask(m: Manifest, corridor: GeoJSON.Feature | null): Uint8Array | null {
  if (!corridor || corridor.geometry.type !== "Polygon") return null;
  const ring = corridor.geometry.coordinates[0];
  const g = m.grid;
  const mask = new Uint8Array(g.rows * g.cols);
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) mask[r * g.cols + c] = pointInPoly(g.lon_west + c * g.step_deg, g.lat_north - r * g.step_deg, ring) ? 1 : 0;
  return mask;
}

type GalleryItem = { title: string; caption: string; long: string; thumb: string; full?: string; video?: string; alt: string };
const GALLERY: GalleryItem[] = [
  {
    title: "Detector finds contrails",
    caption: "Arabian Sea, 15 Jan 2026, 05:30 IST",
    long: "Two long contrails over the Arabian Sea at night, found by the STRATUM line detector (15 Jan 2026, 00:00 UTC).",
    thumb: "/img/meteosat_arabian_sea_2026-01-15_0000.webp",
    alt: "Meteosat-9 infrared image with two thin bright diagonal contrails over a smooth sea",
  },
  {
    title: "Physics vs satellite",
    caption: "1 Jan 2026, 18:30 IST — no match",
    long: "Orange: contrails predicted by uncorrected physics (CoCiP, B1). Blue: lines the detector found. None of the predicted contrails lines up with a detected one — the reason STRATUM learns a correction from satellite evidence (1 Jan 2026, 13:00 UTC).",
    thumb: "/img/overlay_2026-01-01_1300.webp",
    alt: "Two-panel satellite image: left plain, right with orange predicted contrails and blue detected lines that do not coincide",
  },
  {
    title: "Four-hour time-lapse",
    caption: "1 Jan 2026, 09:30–13:30 IST",
    long: "Predicted contrails drifting with the wind next to the lines the detector finds, every 15 minutes (1 Jan 2026, 04:00–08:00 UTC).",
    thumb: "/media/timelapse_poster.webp",
    video: "/media/timelapse_2026-01-01.mp4",
    alt: "Time-lapse of satellite images with predicted and detected contrails",
  },
];

const MODEL_SHORT: Record<ModelKey, string> = { B1: "Physics", B3: "Published fix", STRATUM: "STRATUM" };
/** The models a build has (a v1 build: physics only; the forecast outlook: B1 and B3). */
const modelsOf = (m: Manifest): ModelKey[] => (m.models ? m.models.map((x) => x.id as ModelKey) : ["B1"]);
const defaultModel = (m: Manifest): ModelKey => (modelsOf(m).includes("STRATUM") ? "STRATUM" : modelsOf(m)[0]);
const MODEL_BADGE: Record<ModelKey, string> = {
  B1: "Uncorrected physics (B1)",
  B3: "Published humidity correction (B3)",
  STRATUM: "STRATUM: learned from Meteosat-9 contrails",
};
// Direction = overall heading compared with the Delhi–Mumbai route (not the actual origin/destination).
const DIR_LABEL = { "DEL-BOM": "Southbound", "BOM-DEL": "Northbound", other: "Crossing" } as const;
const DIR_SHORT = { "DEL-BOM": "South", "BOM-DEL": "North", other: "Crossing" } as const; // fits the 380 px side panel

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** 3.2 → "3 h 12 min" */
const hm = (h: number) => {
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)} min` : `${m} min`;
};

export function MapPage() {
  const [err, setErr] = useState<string | null>(null);
  const [build, setBuild] = useState<string | null>(null);
  const [man, setMan] = useState<Manifest | null>(null);
  const [corridor, setCorridor] = useState<GeoJSON.Feature | null>(null);
  const [st, setSt] = useState<MapState>({ date: null, hour: 6, fl: 360, seg: null });
  const [dayData, setDayData] = useState<{ day: DaySummary; flights: FlightFeature[] | null; segments: FlaggedSegment[]; lists: Lists } | null>(null);
  const [alertsByDay, setAlertsByDay] = useState<Record<string, number> | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);
  // the controls bar wraps to two lines on laptop screens: the map below takes its real height
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = () => el.parentElement?.style.setProperty("--bar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, [!!man]);
  // website extras (Colab 12a): per-card explanations and the weighted decision layer (D-006)
  const [explain, setExplain] = useState<ExplainDay | null>(null);
  const [hasWeighted, setHasWeighted] = useState(false);
  const [weighted, setWeighted] = useState(false);
  const [wList, setWList] = useState<FlaggedSegment[] | null>(null);
  const [conf, setConf] = useState<"all" | "covered" | "extrapolating">("all");
  const [riskImage, setRiskImage] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ risk: true, flights: true, corridor: true, cities: true, seen: true });
  const [cIdx, setCIdx] = useState<ContrailIndex | null>(null);
  const [seen, setSeen] = useState<ContrailEvent[] | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [column, setColumn] = useState<number[][] | null>(null);
  const [hourly, setHourly] = useState<{ corridor: number[]; domain: number[] } | null>(null);
  const [byLevel, setByLevel] = useState<Record<number, number> | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [dir, setDir] = useState<"all" | "DEL-BOM" | "BOM-DEL" | "other">("all");
  const [airline, setAirline] = useState("all");
  const [nightOnly, setNightOnly] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("stratum-legend");
      if (v) return v === "open";
    } catch {
      /* storage blocked: fall back to the screen size */
    }
    return typeof window === "undefined" || window.innerWidth > 900;
  });
  const toggleLegend = () => {
    const next = !legendOpen;
    setLegendOpen(next);
    try {
      localStorage.setItem("stratum-legend", next ? "open" : "closed");
    } catch {
      /* not remembered: fine */
    }
  };
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [flightSel, setFlightSel] = useState<string | null>(null); // a clicked flight without a selected segment
  const [introCmd, setIntroCmd] = useState<{ kind: "play" | "skip"; n: number }>({ kind: "play", n: 0 });
  const [intro, setIntro] = useState<{ active: boolean; t: number }>({ active: false, t: 0 });
  // the map engine (~300 KB) loads in parallel, so controls and the list appear at once
  const [ContrailMap, setContrailMap] = useState<typeof ContrailMapT | null>(null);
  useEffect(() => {
    import("../map/ContrailMap").then((mod) => setContrailMap(() => mod.ContrailMap));
  }, []);
  useLayoutEffect(() => {
    if (!lightbox) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [lightbox]);

  // manifest + initial state from URL
  useEffect(() => {
    loadManifest()
      .then(({ build: b, manifest }) => {
        setBuild(b);
        setMan(manifest);
        const def = manifest.days_with_flights[0] ?? manifest.days[0] ?? null;
        const s = parseState(location.search, { date: def, hour: 6, fl: 360, seg: null, model: defaultModel(manifest), view: "chance" });
        if (!modelsOf(manifest).includes(s.model ?? "B1")) s.model = defaultModel(manifest);
        if (!s.date || !manifest.days.includes(s.date)) s.date = def;
        if (!manifest.flight_levels.some((f) => f.fl === s.fl)) s.fl = manifest.flight_levels[Math.floor(manifest.flight_levels.length / 2)].fl;
        setSt(s);
        loadCorridor(b).then(setCorridor).catch(() => setCorridor(null));
        // alerts per flight day for the calendar strip (v2 builds)
        if (manifest.models)
          Promise.all(manifest.days_with_flights.map((d) => loadDay(b, d).then((x) => [d, x.day.n_alerts ?? 0] as const)))
            .then((r) => setAlertsByDay(Object.fromEntries(r)))
            .catch(() => setAlertsByDay(null));
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  // the URL changed from outside (a link, back/forward or the booth tour): read it again
  const loc = useLocation();
  useEffect(() => {
    if (!man) return;
    const q = loc.url.includes("?") ? loc.url.slice(loc.url.indexOf("?")) : "";
    if (!q) return;
    setSt((cur) => {
      const s = parseState(q, { ...cur, seg: null });
      if (!s.date || !man.days.includes(s.date)) s.date = cur.date;
      if (!modelsOf(man).includes(s.model ?? "B1")) s.model = defaultModel(man); // e.g. a v1 build has physics only
      return s;
    });
  }, [loc.url, man]);

  // URL state
  useEffect(() => {
    if (!man) return;
    // review overrides (another data build, other viewer data) stay in the URL
    const q = new URLSearchParams(location.search);
    const keep = ["build", "contrails", "explain", "weighted"].flatMap((k) => (q.get(k) ? [`&${k}=${encodeURIComponent(q.get(k)!)}`] : [])).join("");
    history.replaceState(null, "", `/map${stateQuery(st)}${keep}`);
  }, [st, man]);

  // satellite-confirmed contrails (contrail proof viewer), if this deployment has them
  useEffect(() => {
    loadContrailIndex().then(setCIdx);
  }, []);
  useEffect(() => {
    setSeen(null);
    setProofId(null);
    if (!cIdx || !st.date || !cIdx.days[st.date]) return;
    loadContrailDay(st.date)
      .then(setSeen)
      .catch(() => setSeen(null));
  }, [cIdx, st.date]);

  // day data
  useEffect(() => {
    if (!build || !st.date) return;
    setDayData(null);
    setFlightSel(null);
    loadDay(build, st.date)
      .then((d) => setDayData({ day: d.day, flights: d.flights?.features ?? null, segments: d.segments, lists: d.lists }))
      .catch((e) => setErr(String(e.message ?? e)));
  }, [build, st.date]);

  const model: ModelKey = st.model ?? "B1";
  const view: ViewKey = st.view ?? "chance";
  const v2 = !!man?.layers;
  const hasObs = !!dayData?.day.has_observability;
  const layer = !v2 ? "B1" : view === "obs" && hasObs ? "observable" : view === "spread" && model === "STRATUM" ? "STRATUM_spread" : model;
  const dmax = DISPLAY_MAX[layer] ?? 1;

  // risk image for the current view + preload the day's hours for this FL
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    gridImage(build, st.date, layer, st.fl, st.hour, man)
      .then((u) => live && setRiskImage(u))
      .catch(() => live && setRiskImage(null));
    for (let h = 0; h < 24; h++) gridImage(build, st.date, layer, st.fl, h, man).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.fl, st.hour, layer]);

  // hourly share of the corridor / domain with persistent-contrail conditions (this FL)
  const mask = useMemo(() => (man ? corridorMask(man, corridor) : null), [man, corridor]);
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    Promise.all([...Array(24).keys()].map((h) => getView(build, st.date!, layer, st.fl, h, man)))
      .then((gs) => {
        if (!live) return;
        const corr: number[] = [];
        const dom: number[] = [];
        for (const g of gs) {
          let s = 0, n = 0, sd = 0;
          for (let i = 0; i < g.length; i++) {
            sd += g[i];
            if (mask && mask[i]) {
              s += g[i];
              n++;
            }
          }
          corr.push(n ? (s / n / 255) * dmax : 0);
          dom.push((sd / g.length / 255) * dmax);
        }
        setHourly({ corridor: corr, domain: dom });
      })
      .catch(() => live && setHourly(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.fl, mask, layer]);

  // share of the domain at every flight level for the chosen hour (altitude tape bars)
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    Promise.all(man.flight_levels.map((f) => getView(build, st.date!, layer, f.fl, st.hour, man).then((g) => [f.fl, g.reduce((a, v) => a + v, 0) / g.length / 255] as const)))
      .then((r) => live && setByLevel(Object.fromEntries(r)))
      .catch(() => live && setByLevel(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.hour, layer]);

  // sky column at the picked point: all flight levels × 24 hours
  useEffect(() => {
    if (!build || !man || !st.date || !picked) return setColumn(null);
    const g = man.grid;
    const r = Math.round((g.lat_north - picked[1]) / g.step_deg);
    const c = Math.round((picked[0] - g.lon_west) / g.step_deg);
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return setColumn(null);
    let live = true;
    Promise.all(man.flight_levels.map((f) => Promise.all([...Array(24).keys()].map((h) => getView(build, st.date!, layer, f.fl, h, man)))))
      .then((byFl) => live && setColumn(byFl.map((hrs) => hrs.map((gr) => (gr[r * g.cols + c] / 255) * dmax))))
      .catch(() => live && setColumn(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, picked, layer]);

  // playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSt((s) => ({ ...s, hour: (s.hour + 1) % 24 })), 1100);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    loadWeightedSummary().then((x) => setHasWeighted(!!x));
  }, []);
  useEffect(() => {
    setExplain(null);
    if (st.date && build !== "outlook") loadExplain(st.date).then(setExplain);
  }, [st.date, build]);
  useEffect(() => {
    setWList(null);
    if (weighted && st.date) loadWeighted(st.date).then(setWList);
  }, [weighted, st.date]);
  const segments = useMemo(
    () => (dayData ? (model === "STRATUM" && weighted && wList ? wList : (dayData.lists[model] ?? (model === "B1" ? dayData.segments : []))) : []),
    [dayData, model, weighted, wList],
  );
  const airlines = useMemo(() => [...new Set(segments.map((s) => s.airline).filter(Boolean) as string[])].sort(), [segments]);
  const isS = model === "STRATUM";
  const shown = segments.filter(
    (s) =>
      (dir === "all" || s.direction === dir) &&
      (airline === "all" || s.airline === airline) &&
      (!nightOnly || s.night) &&
      (!isS || !alertsOnly || s.alert) &&
      (!isS || conf === "all" || (conf === "covered" ? s.confidence_note.startsWith("well covered") : s.confidence_note.startsWith("extrapolating"))),
  );
  // bar length: warming of the contrail (physics lists) or the cautious warming avoided (STRATUM)
  const metric = (s: FlaggedSegment) => (isS ? Math.max(0, s.net_warming_avoided_100y ?? 0) : Math.abs(s.ef_J ?? 0));
  const maxEf = Math.max(1, ...segments.map(metric));
  // planes and tracks: orange when the flight is in this model's list (STRATUM: when it has an alert)
  const flightsView = useMemo(() => {
    const fs = dayData?.flights ?? null;
    if (!fs || !v2) return fs;
    const ids = new Set(segments.filter((x) => !isS || x.alert).map((x) => x.flight_id));
    return fs.map((f) => ({ ...f, properties: { ...f.properties, flagged: ids.has(f.properties.flight_id) } }));
  }, [dayData, segments, isS, v2]);
  const selected = segments.find((s) => s.segment_id === st.seg) ?? null;
  const flInfo = man?.flight_levels.find((f) => f.fl === st.fl);
  const minutes = intro.active ? intro.t : st.hour * 60;
  const utc = `${pad2(Math.floor(minutes / 60) % 24)}${pad2(Math.floor(minutes % 60))}`;
  const istM = (minutes + 330) % 1440;
  const ist = `${pad2(Math.floor(istM / 60))}${pad2(Math.floor(istM % 60))}`;
  const fls = man ? [...man.flight_levels].reverse() : [];
  const tapeIdx = Math.max(0, fls.findIndex((f) => f.fl === st.fl));

  // what the lower detail bar shows: the selected segment's flight, or a clicked flight
  const detailId = selected?.flight_id ?? flightSel;
  // the flight day closest to the chosen date (for the "no flights on this day" button)
  const nearestFlightDay = useMemo(() => {
    const t = st.date ? Date.parse(st.date) : NaN;
    const ds = man?.days_with_flights ?? [];
    if (!ds.length || isNaN(t)) return ds[0] ?? null;
    return ds.reduce((a, b) => (Math.abs(Date.parse(b) - t) < Math.abs(Date.parse(a) - t) ? b : a));
  }, [man, st.date]);
  const detailFlight = detailId ? (flightsView?.find((f) => f.properties.flight_id === detailId) ?? null) : null;
  const detailSegs = useMemo(() => (detailId ? segments.filter((s) => s.flight_id === detailId).sort((a, b) => a.time_utc.localeCompare(b.time_utc)) : []), [detailId, segments]);

  // ?seg=top opens the list's first item (STRATUM: the strongest alert) once the day has loaded
  useEffect(() => {
    if (st.seg !== "top" || !dayData) return;
    const first = segments.find((x) => !isS || x.alert) ?? segments[0];
    if (first) chooseSeg(first);
    else setSt((x) => ({ ...x, seg: null }));
  }, [st.seg, dayData, segments]);

  const chooseSeg = (s: FlaggedSegment) => {
    setFlightSel(null);
    setSt({ ...st, seg: s.segment_id, hour: Math.floor(clock(s.time_utc).minutes / 60) });
  };
  const onFlight = (id: string) => {
    const segs = segments.filter((s) => s.flight_id === id);
    if (segs.length) {
      // a flight that makes a persistent contrail: open its strongest segment
      chooseSeg(segs.reduce((a, b) => (metric(b) > metric(a) ? b : a)));
    } else {
      setFlightSel(id);
      setSt((s) => ({ ...s, seg: null }));
    }
  };
  const closeDetail = () => {
    setFlightSel(null);
    setSt({ ...st, seg: null });
  };
  const downloadCsv = () => {
    const cols: [string, (s: FlaggedSegment) => unknown][] = [
      ["model", () => model], ["flight_id_hashed", (s) => s.flight_id], ["callsign", (s) => s.callsign], ["airline", (s) => s.airline ?? ""],
      ["direction", (s) => DIR_LABEL[s.direction]], ["start_utc", (s) => s.time_utc], ["end_utc", (s) => s.time_end_utc ?? ""], ["planned_fl", (s) => s.fl],
      ["night", (s) => s.night], ["ef_J", (s) => s.ef_J ?? ""], ["ef_p05_J", (s) => s.ef_p05_J ?? ""], ["ef_p95_J", (s) => s.ef_p95_J ?? ""],
      ["p_persistent_seen", (s) => s.p_persistent ?? ""], ["best_alternative_fl", (s) => s.best_alternative_fl ?? ""], ["extra_fuel_kg", (s) => s.extra_fuel_kg ?? ""],
      ["extra_co2_kg", (s) => s.extra_co2_kg ?? ""], ["net_warming_avoided_20y_p05_kgCO2e", (s) => s.net_warming_avoided_20y ?? ""],
      ["net_warming_avoided_100y_p05_kgCO2e", (s) => s.net_warming_avoided_100y ?? ""], ["alert", (s) => s.alert ?? ""], ["confidence", (s) => s.confidence_note.split(".")[0]],
    ];
    const esc = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.map((c) => c[0]).join(","), ...shown.map((s) => cols.map(([, f]) => esc(f(s))).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`# STRATUM ${model} list, ${st.date}; commercial flights only, hashed ids; computational estimate, ATC feasibility not modelled\n${csv}\n`], { type: "text/csv" }));
    a.download = `stratum_${model}_${st.date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  if (err)
    return (
      <div class="page">
        <div class="wrap page-head">
          <p class="label red">Map</p>
          <h1 class="display d-l" style="margin-top:20px">
            The map data could not be loaded.
          </h1>
          <p class="muted mono" style="margin-top:20px">
            {err}
          </p>
        </div>
      </div>
    );

  return (
    <div class="mp">
      <div class="mp-bar" role="toolbar" aria-label="Map controls" ref={barRef}>
        <h1 class="mp-title mono-s">Contrail map · India 6–37°N 68–98°E</h1>
        <span class="mono-s warn">{build === "outlook" ? `Forecast (experimental) · ${man?.model_version ?? ""}` : "Computational estimate — no real flight was changed"}</span>
        <span class="mono-s mp-badge">{v2 ? MODEL_BADGE[model] : "Physics-only prototype (v0) · uncorrected B1"}</span>
        <span class="mono-s mp-extra">
          ADS-B coverage:{" "}
          {man?.coverage.adsb_coverage_pct != null ? `${man.coverage.adsb_coverage_pct.toFixed(0)} % of scheduled corridor flights` : "audit pending (Nov 2026)"}
        </span>
        <span class="mp-tools">
          {v2 && build !== "outlook" && st.date && (
            <a class="tool tool-3d" href={`/3d?date=${st.date}&hour=${st.hour}&layer=${model}`} title="The humid layers in three dimensions">
              ◇ 3D view
            </a>
          )}
          <label class="date-pick">
            <span class="sr-only">Date</span>
            <select value={st.date ?? ""} onChange={(e) => setSt({ ...st, date: (e.target as HTMLSelectElement).value, seg: null })}>
              {man?.days.map((d) => (
                <option value={d}>
                  {dayLabel(d)}
                  {man.days_with_flights.includes(d) ? " ✈ flights" : ""}
                </option>
              ))}
            </select>
          </label>
          {alertsByDay && (
            <span class="day-strip" role="group" aria-label="Alerts per flight day (STRATUM)">
              {man!.days_with_flights.map((d) => {
                const n = alertsByDay[d] ?? 0;
                const mx = Math.max(1, ...Object.values(alertsByDay));
                return (
                  <button class={d === st.date ? "on" : ""} style={{ "--v": n ? 0.18 + 0.82 * Math.sqrt(n / mx) : 0 }} title={`${dayLabel(d)}: ${n} alert${n === 1 ? "" : "s"}`} aria-label={`${dayLabel(d)}, ${n} alerts`} onClick={() => setSt({ ...st, date: d, seg: null })}>
                    <span class="mono">{MON[Number(d.slice(5, 7)) - 1].slice(0, 1)}</span>
                  </button>
                );
              })}
            </span>
          )}
          {v2 && (
            <span class="seg-ctl model-ctl" role="radiogroup" aria-label="Model">
              {(["B1", "B3", "STRATUM"] as const).filter((m) => !man || modelsOf(man).includes(m)).map((m) => (
                <button role="radio" aria-checked={model === m} class={model === m ? "on" : ""} title={man?.models?.find((x) => x.id === m)?.description} onClick={() => setSt({ ...st, model: m, seg: null, view: m === "STRATUM" ? view : view === "spread" ? "chance" : view })}>
                  {MODEL_SHORT[m]}
                </button>
              ))}
            </span>
          )}
          {v2 && (
            <label class="date-pick">
              <span class="sr-only">Map shows</span>
              <select value={view} onChange={(e) => setSt({ ...st, view: (e.target as HTMLSelectElement).value as ViewKey })}>
                <option value="chance">{model === "STRATUM" ? "Contrail chance" : "Contrail conditions"}</option>
                <option value="spread" disabled={model !== "STRATUM"}>
                  Uncertainty (model spread)
                </option>
                <option value="obs" disabled={!hasObs}>
                  Where the satellite could see{hasObs ? "" : " (no images this day)"}
                </option>
              </select>
            </label>
          )}
          <span class="layers">
            <button class="tool" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
              Layers
            </button>
            {layersOpen && (
              <span class="layers-menu">
                {(
                  [
                    ["risk", "Contrail conditions"],
                    ["flights", "Flights"],
                    ["corridor", "Delhi–Mumbai corridor"],
                    ["cities", "City labels"],
                    ...(cIdx ? ([["seen", "Satellite-confirmed contrails"]] as const) : []),
                  ] as const
                ).map(([k, label]) => (
                  <label>
                    <input type="checkbox" checked={layers[k] !== false} onChange={() => setLayers({ ...layers, [k]: layers[k] === false })} /> {label}
                  </label>
                ))}
              </span>
            )}
          </span>
          <button class="tool" onClick={copyLink} aria-live="polite">
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
        </span>
      </div>

      <div class={`mp-stage ${detailId ? "has-detail" : ""}`}>
        <div class="mp-body">
          <nav class="tape" aria-label="Flight level">
            <span class="tape-ind" style={{ transform: `translateY(${tapeIdx * 100}%)`, height: `${100 / Math.max(1, fls.length)}%` }} aria-hidden="true" />
            {fls.map((f) => (
              <button class={f.fl === st.fl ? "on" : ""} aria-pressed={f.fl === st.fl} title={`${f.pressure_hpa} hPa`} onClick={() => setSt({ ...st, fl: f.fl })}>
                <b class="mono">FL{f.fl}</b>
                <span class="mono">{Math.round(f.pressure_hpa)} hPa</span>
                <i class="lvl" aria-hidden="true">
                  <i style={{ transform: `scaleX(${byLevel ? Math.min(1, (byLevel[f.fl] ?? 0) * 4) : 0})` }} />
                </i>
              </button>
            ))}
          </nav>

          <div class="map-wrap">
            {!ContrailMap && <div class="map-loading mono-s">Loading map…</div>}
            {man && ContrailMap && (
              <ContrailMap
                manifest={man}
                corridor={corridor}
                riskImage={riskImage}
                flights={flightsView}
                modelLabel={v2 ? model : "B1"}
                segments={segments}
                hour={st.hour}
                selected={selected}
                selectedFlight={selected ? null : detailFlight}
                picked={picked}
                layers={layers}
                onSelect={(s) => (s ? chooseSeg(s) : closeDetail())}
                onFlight={onFlight}
                onPick={setPicked}
                onHover={setCursor}
                introCmd={introCmd}
                onIntro={setIntro}
                seen={seen}
                onSeen={setProofId}
              />
            )}
            <p class="map-hint mono-s" aria-hidden="true">
              Click a flight → details below · click anywhere → sky column
            </p>
            <div class={`legend ${detailId ? "compact" : ""} ${legendOpen ? "" : "closed"}`}>
              <div class="legend-head">
                <div class="legend-title label ink">
                  {layer === "observable" ? "Satellite could not see (shaded)" : layer === "STRATUM_spread" ? "Model uncertainty" : layer === "STRATUM" ? "Chance of a contrail the satellite sees" : "Persistent-contrail conditions"}
                </div>
                <button class="legend-toggle mono" aria-expanded={legendOpen} aria-controls="legend-body" title={legendOpen ? "Hide the legend" : "Show the legend"} onClick={toggleLegend}>
                  {legendOpen ? "−" : "+"}
                  <span class="sr-only">{legendOpen ? "Hide the legend" : "Show the legend"}</span>
                </button>
              </div>
              <div id="legend-body" class="legend-body" hidden={!legendOpen}>
              {layer === "observable" ? (
                <div class="ramp-labels mono">
                  <span>Grey: cloud or steep view in that hour</span>
                </div>
              ) : (
                <>
                  <div class="ramp" aria-hidden="true" />
                  <div class="ramp-labels mono">
                    <span>0</span>
                    <span>{layer === "STRATUM" ? "probability" : layer === "STRATUM_spread" ? "spread of 4 season models" : "share of the hour"}</span>
                    <span>{dmax < 1 ? `≥ ${Math.round(dmax * 100)} %` : "1"}</span>
                  </div>
                </>
              )}
              <div class="legend-row">
                <i class="sw track" /> Flight track (brighter near the chosen hour)
              </div>
              <div class="legend-row">
                <i class="sw pred" /> {isS ? "Flagged warming contrail (corrected physics)" : `Warming persistent contrail (CoCiP, ${model})`}
              </div>
              <div class="legend-row">
                <i class="sw plane" aria-hidden="true">
                  ✈
                </i>{" "}
                {isS ? "Aircraft (orange: an alert, a level change helps)" : "Aircraft (orange: makes a persistent contrail)"}
              </div>
              <div class="legend-row">
                <i class="sw corr" /> Delhi–Mumbai corridor ±75 km
              </div>
              {!!seen?.length && layers.seen !== false && (
                <div class="legend-row">
                  <i class="sw seen" /> Contrail confirmed by the satellite (click for the proof)
                </div>
              )}
              {hourly && (
                <div class="legend-stat mono">
                  {layer === "STRATUM" || layer === "STRATUM_spread"
                    ? `FL${st.fl} ${pad2(st.hour)}:00 UTC: mean ${(hourly.domain[st.hour] * 100).toFixed(2)} % over the domain · ${(hourly.corridor[st.hour] * 100).toFixed(2)} % in the corridor`
                    : layer === "observable"
                      ? `${pad2(st.hour)}:00 UTC: the satellite could see ${(hourly.domain[st.hour] * 100).toFixed(0)} % of the domain`
                      : `FL${st.fl} ${pad2(st.hour)}:00 UTC: ${(hourly.domain[st.hour] * 100).toFixed(1)} % of the domain · ${(hourly.corridor[st.hour] * 100).toFixed(1)} % of the corridor`}
                </div>
              )}
              </div>
            </div>
            <div class="cursor mono" aria-hidden="true">
              {cursor ? `${cursor[1].toFixed(2)}°N  ${cursor[0].toFixed(2)}°E` : "6–37°N · 68–98°E"}
            </div>
            {picked && (
              <SkyColumn
                at={picked}
                data={column}
                fls={man?.flight_levels.map((f) => f.fl) ?? []}
                dmax={dmax}
                what={layer}
                hour={st.hour}
                fl={st.fl}
                onClose={() => setPicked(null)}
                onChoose={(fl, h) => setSt({ ...st, fl, hour: h })}
              />
            )}
            {!dayData && <div class="map-loading mono-s">Loading {st.date}…</div>}
            {intro.active && (
              <div class="intro-chip" role="status" aria-live="off">
                <span class="mono-s">Replaying {st.date ? dayLabel(st.date) : ""}</span>
                <b class="mono">
                  {pad2(Math.floor(intro.t / 60) % 24)}:{pad2(Math.floor(intro.t % 60))} UTC
                </b>
                <span class="intro-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${intro.t / 1440})` }} />
                </span>
                <button class="tool" onClick={() => setIntroCmd({ kind: "skip", n: introCmd.n + 1 })}>
                  Skip
                </button>
              </div>
            )}
          </div>

          <aside class="strips" aria-label="Flagged segments">
            <div class="strips-head">
              <div>
                <p class="label red">{isS ? "Avoidance candidates" : "Flagged segments"}</p>
                <p class="label ink" style="margin-top:4px">
                  {isS ? "Ranked by the cautious warming avoided" : "Ranked by contrail warming"}
                </p>
              </div>
              {dayData?.day.has_flights && <span class="mono-s muted">{segments.length} segments</span>}
            </div>

            {dayData && !dayData.day.has_flights && build === "outlook" && (
              <div class="empty">
                <p>Forecast: no flights yet.</p>
                <p class="muted">
                  This is tomorrow's sky from the ECMWF open-data forecast, run through our physics. For the aircraft flying right now and whether they
                  are leaving contrails, open <a href="/live">Live sky</a>; for the areas to avoid, the <a href="/advisory">contrail advisories</a>.
                </p>
              </div>
            )}

            {dayData && !dayData.day.has_flights && build !== "outlook" && (
              <div class="empty">
                <p>No flight data for {st.date ? dayLabel(st.date) : ""}.</p>
                <p class="muted">Free flight data exist for the 1st of each month. The contrail conditions on the map are still real for every January day.</p>
                {nearestFlightDay && (
                  <button class="tool" onClick={() => setSt({ ...st, date: nearestFlightDay, seg: null })}>
                    Show {dayLabel(nearestFlightDay)} ✈
                  </button>
                )}
              </div>
            )}

            {dayData?.day.has_flights && (
              <>
                <div class="filters">
                  <div class="seg-ctl" role="radiogroup" aria-label="Direction">
                    {(["all", "DEL-BOM", "BOM-DEL", "other"] as const).map((d) => (
                      <button role="radio" aria-checked={dir === d} class={dir === d ? "on" : ""} onClick={() => setDir(d)}>
                        {d === "all" ? "All" : DIR_SHORT[d]}
                      </button>
                    ))}
                  </div>
                  <div class="filter-row">
                    <select value={airline} onChange={(e) => setAirline((e.target as HTMLSelectElement).value)} aria-label="Airline">
                      <option value="all">All airlines</option>
                      {airlines.map((a) => (
                        <option value={a}>{a}</option>
                      ))}
                    </select>
                    <label class="toggle">
                      <input type="checkbox" checked={nightOnly} onChange={() => setNightOnly(!nightOnly)} />
                      <span />
                      Night only
                    </label>
                  </div>
                  {isS && hasWeighted && (
                    <div class="filter-row">
                      <span class="seg-ctl" role="radiogroup" aria-label="Decision layer">
                        <button role="radio" aria-checked={!weighted} class={!weighted ? "on" : ""} onClick={() => setWeighted(false)} title="The pre-registered decision layer (logged; its corrected physics turned out too dry)">
                          Logged
                        </button>
                        <button role="radio" aria-checked={weighted} class={weighted ? "on" : ""} onClick={() => setWeighted(true)} title="Second analysis D-006: raw-ERA5 physics weighted by STRATUM's probability">
                          Weighted (D-006)
                        </button>
                      </span>
                    </div>
                  )}
                  {isS && (
                    <div class="filter-row">
                      <label class="toggle">
                        <input type="checkbox" checked={alertsOnly} onChange={() => setAlertsOnly(!alertsOnly)} />
                        <span />
                        Alerts only
                      </label>
                      <select value={conf} onChange={(e) => setConf((e.target as HTMLSelectElement).value as typeof conf)} aria-label="Confidence">
                        <option value="all">Any confidence</option>
                        <option value="covered">Well covered by labels</option>
                        <option value="extrapolating">Extrapolating</option>
                      </select>
                    </div>
                  )}
                  <div class="filter-row">
                    <span class="mono-s muted">
                      {shown.length} of {segments.length} shown{isS ? ` · ${segments.filter((x) => x.alert).length} alerts` : ""}
                    </span>
                    <button class="tool" onClick={downloadCsv} disabled={!shown.length} title="Commercial flights only, hashed ids">
                      CSV ↓
                    </button>
                  </div>
                </div>
                <ol class="strip-list">
                  {shown.length === 0 && <li class="muted empty-row">No segments match these filters.</li>}
                  {shown.map((s, i) => {
                    const c = clock(s.time_utc);
                    const on = s.segment_id === st.seg;
                    return (
                      <li style={{ "--i": Math.min(i, 12) }} key={s.segment_id}>
                        <button class={`strip ${on ? "on" : ""} ${(s.ef_J ?? 0) < 0 ? "cool" : ""}`} aria-pressed={on} onClick={() => (on ? closeDetail() : chooseSeg(s))}>
                          <span class="strip-l">
                            <span class="strip-cs">
                              <b class="display">{s.callsign}</b>
                              <span class="mono-s">{DIR_LABEL[s.direction]}</span>
                            </span>
                            <span class="strip-al mono">
                              {c.utc} UTC / {c.ist} IST{s.night ? " · night" : ""}
                            </span>
                            <span class="bar" aria-hidden="true">
                              <i style={{ transform: `scaleX(${Math.max(0.02, metric(s) / maxEf)})` }} />
                            </span>
                          </span>
                          {isS ? (
                            <span class="strip-r mono">
                              <b>
                                FL{s.fl}
                                {s.best_alternative_fl ? ` → ${s.best_alternative_fl}` : ""}
                              </b>
                              <span>{s.alert ? <em class="alert-tag">alert</em> : "no alert"}</span>
                              <span>{s.net_warming_avoided_100y != null ? `≥ ${tonnes(s.net_warming_avoided_100y)} CO₂e` : ""}</span>
                            </span>
                          ) : (
                            <span class="strip-r mono">
                              <b>FL{s.fl}</b>
                              <span>{joules(s.ef_J)}</span>
                              <span>{s.contrail_age_h != null ? `lasts ${s.contrail_age_h.toFixed(1)} h` : ""}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </aside>
        </div>

        <div class={`deck-wrap ${detailId ? "open" : ""}`}>
          <div>{detailId && <DetailDeck key={detailId} model={v2 ? model : "B1"} flight={detailFlight} seg={selected} segs={detailSegs} onStep={chooseSeg} onClose={closeDetail} proof={seen?.find((e) => e.flight_id === detailId) ?? null} onProof={setProofId} explain={explain} />}</div>
        </div>
      </div>

      <div class="mp-time">
        <div class="tl-btns">
          <button class="tool strong" onClick={() => setIntroCmd({ kind: "play", n: introCmd.n + 1 })} disabled={intro.active || !dayData?.day.has_flights} title="Replay the whole day">
            ↻ Replay day
          </button>
          <button class="tool" onClick={() => setPlaying(!playing)} title={playing ? "Pause" : "Play through the day, hour by hour"}>
            {playing ? "❚❚ Pause" : "▶ Play hours"}
          </button>
        </div>
        <div class="tl">
          <div class="tl-bars" aria-hidden="true">
            {[...Array(24).keys()].map((h) => (
              <i
                class={h === st.hour && !intro.active ? "on" : ""}
                style={{ "--v": hourly ? Math.max(0.03, hourly.corridor[h] / Math.max(0.02, ...hourly.corridor)) : 0.03 }}
                title={hourly ? `${pad2(h)} UTC: ${(hourly.corridor[h] * 100).toFixed(1)} % of the corridor` : ""}
              />
            ))}
          </div>
          <span class={`tl-head ${intro.active ? "live" : ""}`} style={{ left: `${(intro.active ? intro.t / 1440 : (st.hour + 0.5) / 24) * 100}%` }} aria-hidden="true">
            <b class="mono">{utc}Z</b>
          </span>
          <div class="tl-labels mono" aria-hidden="true">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
              <span style={{ left: `${(h / 24) * 100}%` }}>
                {pad2(h)}00 · {pad2(Math.floor(((h * 60 + 330) % 1440) / 60))}
                {pad2((h * 60 + 330) % 60)} IST
              </span>
            ))}
          </div>
          <input
            class="tl-input"
            type="range"
            min={0}
            max={23}
            step={1}
            value={st.hour}
            onInput={(e) => setSt({ ...st, hour: Number((e.target as HTMLInputElement).value) })}
            aria-label="Hour (UTC)"
            aria-valuetext={`${pad2(st.hour)}:00 UTC, ${ist.slice(0, 2)}:${ist.slice(2)} IST`}
          />
        </div>
        <div class="readout">
          <Digits text={utc} suffix=" UTC" big />
          <Digits text={ist} suffix=" IST" />
          <span class="mono-s muted">
            FL{st.fl}
            {flInfo ? ` · ≈ ${Math.round(flInfo.pressure_hpa)} hPa` : ""}
          </span>
        </div>
      </div>
      <p class="tl-caption wrap small muted">
        Bars: {layer === "STRATUM" ? "mean STRATUM chance over the Delhi–Mumbai corridor" : layer === "observable" ? "share of the domain the satellite could see" : `share of the Delhi–Mumbai corridor with persistent-contrail conditions (${MODEL_BADGE[model === "STRATUM" ? "B1" : model]})`}{" "}
        at FL{st.fl}, each hour. Drag along the bars or use the arrow keys to change the hour.
      </p>

      {dayData && (
      <section class="gallery wrap" aria-labelledby="gal">
        <div class="sec-head rv">
          <p class="label red" id="gal">
            Satellite check
          </p>
          <span class="mono-s">Real Meteosat-9 images · illustrations, not results</span>
        </div>
        <div class="gal-row rv stagger">
          {GALLERY.map((g, i) => (
            <button class="gal-card" onClick={() => setLightbox(g)} style={{ "--i": i }}>
              <span class="gal-img">
                <img src={g.thumb} alt="" loading="lazy" />
                {g.video && (
                  <span class="play-mark" aria-hidden="true">
                    ▶
                  </span>
                )}
              </span>
              <span class="gal-text">
                <b class="display">{g.title}</b>
                <span class="mono-s muted">{g.caption}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      )}
      {proofId && cIdx && st.date && seen?.find((e) => e.id === proofId) && (
        <ContrailProof ev={seen.find((e) => e.id === proofId)!} day={st.date} detector={cIdx.detector} credit={cIdx.credit} onClose={() => setProofId(null)} />
      )}
      {lightbox && (
        <div class="lightbox" role="dialog" aria-modal="true" aria-label={lightbox.title} onClick={() => setLightbox(null)} onKeyDown={(e) => e.key === "Escape" && setLightbox(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            {lightbox.video ? <video src={lightbox.video} poster={lightbox.thumb} controls autoPlay loop playsInline /> : <img src={lightbox.full ?? lightbox.thumb} alt={lightbox.alt} />}
            <figcaption>
              <b>{lightbox.title}</b> — {lightbox.long} <span class="muted">© EUMETSAT 2026 · illustration, not a result.</span>
            </figcaption>
            <button class="tool lb-close" onClick={() => setLightbox(null)} autoFocus>
              Close
            </button>
          </figure>
        </div>
      )}
    </div>
  );
}

/** Digits that roll in when they change (split-flap feel). */
function Digits(p: { text: string; suffix: string; big?: boolean }) {
  return (
    <span class={`digits mono ${p.big ? "big" : ""}`} aria-label={`${p.text}${p.suffix}`}>
      {[...p.text].map((c, i) => (
        <span class="dg" key={`${i}-${c}`}>
          {c}
        </span>
      ))}
      <span class="sfx">{p.suffix}</span>
    </span>
  );
}

/** Lower detail bar: the flight and, for the selected list item, every field the model has.
 *  Physics lists (B1, B3): how long the contrail lasted and its warming. STRATUM: the Table 3
 *  fields of the decision layer, the alternatives and the humidity profile. */
function DetailDeck(p: { model: ModelKey; flight: FlightFeature | null; seg: FlaggedSegment | null; segs: FlaggedSegment[]; onStep: (s: FlaggedSegment) => void; onClose: () => void; proof?: ContrailEvent | null; onProof?: (id: string) => void; explain?: ExplainDay | null }) {
  const s = p.seg;
  const head = s ?? p.segs[0] ?? null;
  const fp = p.flight?.properties;
  const callsign = fp?.callsign ?? head?.callsign ?? "—";
  const air = fp?.airline ?? head?.airline ?? null;
  const direction = fp?.direction ?? head?.direction ?? "other";
  const ages = p.segs.map((x) => x.contrail_age_h).filter((x): x is number => x != null);
  const longest = ages.length ? Math.max(...ages) : null;
  const k = s ? p.segs.findIndex((x) => x.segment_id === s.segment_id) : -1;
  const step = (d: number) => p.segs.length && p.onStep(p.segs[(k + d + p.segs.length) % p.segs.length]);
  const age = s?.contrail_age_h ?? null;
  const c = s ? clock(s.time_utc) : null;
  const isS = p.model === "STRATUM";
  const rng = (r: number[] | null | undefined) => (r && r.length === 3 ? `${tonnes(r[0])} … ${tonnes(r[2])} (median ${tonnes(r[1])})` : "—");
  return (
    <section class="deck" aria-label={`Details for ${callsign}`} aria-live="polite">
      <div class="dk dk-flight">
        <p class="label">Flight</p>
        <b class="display">{callsign}</b>
        <span>{air ?? "Airline"}</span>
        <span class="mono small muted">
          {[fp?.aircraft_type, DIR_LABEL[direction]].filter(Boolean).join(" · ")}
          {fp && (
            <>
              <br />
              Tracked {clock(fp.t_start).utc}–{clock(fp.t_end).utc} UTC
            </>
          )}
        </span>
        {p.proof && p.onProof && (
          <button class="tool btn-proof" onClick={() => p.onProof!(p.proof!.id)}>
            Satellite proof · {p.proof.slots.length} images
          </button>
        )}
      </div>

      {isS ? (
        <div class={`dk dk-life ${s?.alert ? "" : "none"}`}>
          <p class="label red">{s ? (s.alert ? "Alert" : "No alert") : "STRATUM"}</p>
          {s ? (
            <>
              <b class="mono life-num">{s.alert && s.best_alternative_fl ? `FL${s.best_alternative_fl}` : `FL${s.fl}`}</b>
              <span class="small">
                {s.alert
                  ? `Fly FL${s.best_alternative_fl} instead of FL${s.fl} here: the cautious estimate of warming avoided is positive at both 20 and 100 years.`
                  : s.best_alternative_fl
                    ? `Best option FL${s.best_alternative_fl}, but its cautious estimate is not positive at both horizons: keep FL${s.fl}.`
                    : "No feasible alternative level."}
              </span>
              {s.alert && !s.alert_without_fuel_credit && <span class="small muted">This alert relies on a fuel saving at the new level (OpenAP).</span>}
            </>
          ) : (
            <span class="small">No avoidance candidate for this flight.</span>
          )}
        </div>
      ) : (
        <div class={`dk dk-life ${s ? "" : "none"}`}>
          <p class="label red">Contrail lasted</p>
          {s ? (
            <>
              <b class="mono life-num">{age != null ? `${age.toFixed(1)} h` : "—"}</b>
              <span class="mono small">{age != null ? hm(age) : "not available"} · this stretch</span>
              {longest != null && p.segs.length > 1 && <span class="mono small muted">Longest in this flight: {longest.toFixed(1)} h</span>}
              {age != null && (
                <span class="life-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${Math.min(1, age / 12)})` }} />
                  <em class="mono">0 h</em>
                  <em class="mono">12 h</em>
                </span>
              )}
            </>
          ) : (
            <>
              <b class="mono life-num">0 h</b>
              <span class="small">No persistent contrail predicted for this flight ({p.model} physics).</span>
            </>
          )}
        </div>
      )}

      {s && c && (
        <>
          <div class="dk dk-seg">
            <p class="label">{isS ? "Flagged stretch" : "Segment"}</p>
            <div class="sc-nav">
              <button class="tool" onClick={() => step(-1)} aria-label="Previous item of this flight" disabled={p.segs.length < 2}>
                ‹
              </button>
              <span class="mono">
                {k + 1} / {p.segs.length}
              </span>
              <button class="tool" onClick={() => step(1)} aria-label="Next item of this flight" disabled={p.segs.length < 2}>
                ›
              </button>
            </div>
            <span class="mono small">
              {c.utc}
              {s.time_end_utc ? `–${clock(s.time_end_utc).utc}` : ""} UTC · {c.ist} IST{s.night ? " · night" : ""}
            </span>
            <span class="mono small">
              Planned FL{s.fl}
              {s.n_segments ? ` · ${s.n_segments} min` : ""}
            </span>
          </div>
          {isS ? (
            <dl class="dk dk-fields">
              <div>
                <dt>Chance the satellite sees a lasting contrail</dt>
                <dd>{s.p_persistent != null ? `${(s.p_persistent * 100).toFixed(1)} %` : "—"}</dd>
              </div>
              <div>
                <dt>Contrail warming at the planned level (5th–95th %)</dt>
                <dd>
                  {joules(s.ef_p05_J)} – {joules(s.ef_p95_J)}
                </dd>
              </div>
              <div>
                <dt>Fuel / CO₂ at the best level</dt>
                <dd>
                  {s.extra_fuel_kg == null
                    ? "—"
                    : s.extra_fuel_kg < 0
                      ? `saves ${Math.round(-s.extra_fuel_kg)} kg fuel / ${tonnes(-(s.extra_co2_kg ?? 0))} CO₂`
                      : `+${Math.round(s.extra_fuel_kg)} kg fuel / ${tonnes(s.extra_co2_kg)} CO₂`}
                </dd>
              </div>
              <div>
                <dt>Net warming avoided, 20 years</dt>
                <dd>{rng(s.net_warming_avoided_20y_range)} CO₂e</dd>
              </div>
              <div>
                <dt>Net warming avoided, 100 years</dt>
                <dd>{rng(s.net_warming_avoided_100y_range)} CO₂e</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd class="small">{s.confidence_note.split(".")[0]}</dd>
              </div>
            </dl>
          ) : (
            <dl class="dk dk-fields">
              <div>
                <dt>Contrail energy forcing</dt>
                <dd>{joules(s.ef_J)}</dd>
              </div>
              <div>
                <dt>EF range (5th–95th %)</dt>
                <dd>{s.ef_p05_J != null ? `${joules(s.ef_p05_J)} – ${joules(s.ef_p95_J)}` : "central run only"}</dd>
              </div>
              <div>
                <dt>Avoidance advice</dt>
                <dd class="small">Switch to STRATUM for alternatives, fuel and net warming.</dd>
              </div>
            </dl>
          )}
          {s && p.explain?.items[s.segment_id] && <WhyPanel key={s.segment_id} it={p.explain.items[s.segment_id]} features={p.explain.features} base={p.explain.base} />}
          {isS && s.alternatives && <AltTable s={s} />}
          {isS && s.profile && <ProfileChart pr={s.profile} planned={s.fl} best={s.best_alternative_fl} />}
        </>
      )}

      <div class="dk dk-end">
        <span class="badge-stamp mono-s">{isS ? "Computational estimate · ATC feasibility not modelled" : `Physics only (${p.model})`}</span>
        {s && (
          <p class="small muted">
            {isS ? s.confidence_note.split(".").slice(1).join(".").trim() : s.confidence_note} {s.ef_note}
          </p>
        )}
        <button class="tool" onClick={p.onClose}>
          Close ✕
        </button>
      </div>
    </section>
  );
}

/** The four alternatives: feasibility, extra fuel and net warming avoided (5th / median / 95th). */
function AltTable({ s }: { s: FlaggedSegment }) {
  const t = (r: number[] | null) => (r ? `${tonnes(r[0])} · ${tonnes(r[1])} · ${tonnes(r[2])}` : "—");
  return (
    <div class="dk dk-alts">
      <p class="label">Alternatives (5th % · median · 95th % net warming avoided, CO₂e)</p>
      <table class="alt-table mono small">
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Extra fuel</th>
            <th scope="col">20 years</th>
            <th scope="col">100 years</th>
          </tr>
        </thead>
        <tbody>
          {s.alternatives!.map((a) => (
            <tr class={a.fl === s.best_alternative_fl ? "best" : a.feasible ? "" : "no"}>
              <th scope="row">
                FL{a.fl} ({a.delta_ft > 0 ? "+" : ""}
                {a.delta_ft} ft)
              </th>
              {a.feasible ? (
                <>
                  <td>{a.extra_fuel_kg != null ? (a.extra_fuel_kg < 0 ? `saves ${Math.round(-a.extra_fuel_kg)} kg` : `+${Math.round(a.extra_fuel_kg)} kg`) : "—"}</td>
                  <td>{t(a.net_20y)}</td>
                  <td>{t(a.net_100y)}</td>
                </>
              ) : (
                <td colSpan={3}>not possible: {a.reason}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** RHi against flight level at the stretch (ERA5, nearest cell and hour): raw, published
 *  correction (B3) and STRATUM (RHi / s); ice-supersaturated air (RHi ≥ 1) shaded. */
function ProfileChart({ pr, planned, best }: { pr: Profile; planned: number; best: number | null }) {
  const W = 260, H = 190, L = 44, R = 10, T = 10, B = 28;
  const pts = pr.fl.map((f, i) => ({ f, raw: pr.rhi_raw[i], b3: pr.rhi_b3[i], st: pr.rhi_stratum[i] })).filter((d) => d.f >= 200 && d.f <= 450);
  if (pts.length < 2) return null;
  const fmin = 250, fmax = 440, xmax = 1.6;
  const x = (v: number) => L + (Math.min(v, xmax) / xmax) * (W - L - R);
  const y = (f: number) => T + (1 - (f - fmin) / (fmax - fmin)) * (H - T - B);
  const line = (k: "raw" | "b3" | "st") =>
    pts.filter((d) => d[k] != null && d.f >= fmin && d.f <= fmax).map((d, i) => `${i ? "L" : "M"}${x(d[k] as number).toFixed(1)},${y(d.f).toFixed(1)}`).join("");
  return (
    <figure class="dk dk-prof">
      <p class="label">Humidity over ice at this point</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Relative humidity over ice against flight level, three versions">
        <rect x={x(1)} y={T} width={x(xmax) - x(1)} height={H - T - B} class="issr" />
        <line x1={x(1)} x2={x(1)} y1={T} y2={H - B} class="ax-line" />
        {[0, 0.5, 1, 1.5].map((v) => (
          <text x={x(v)} y={H - B + 14} text-anchor="middle" class="ax">
            {Math.round(v * 100)}%
          </text>
        ))}
        {[260, 300, 340, 380, 420].map((f) => (
          <text x={L - 6} y={y(f) + 3} text-anchor="end" class="ax">
            FL{f}
          </text>
        ))}
        <path d={line("raw")} class="pr-raw" />
        <path d={line("b3")} class="pr-b3" />
        <path d={line("st")} class="pr-st" />
        <line x1={L} x2={W - R} y1={y(planned)} y2={y(planned)} class="lvl-planned" />
        {best && <line x1={L} x2={W - R} y1={y(best)} y2={y(best)} class="lvl-best" />}
      </svg>
      <figcaption class="mono small">
        <i class="k k-raw" /> ERA5 <i class="k k-b3" /> published fix <i class="k k-st" /> STRATUM · shaded: RHi ≥ 100 % · solid: FL{planned}
        {best ? ` · dashed: FL${best}` : ""}
      </figcaption>
    </figure>
  );
}

function SkyColumn(p: { at: [number, number]; data: number[][] | null; fls: number[]; dmax: number; what: string; hour: number; fl: number; onClose: () => void; onChoose: (fl: number, h: number) => void }) {
  const cw = 13, ch = 17, left = 46, top = 6;
  const rows = [...p.fls].reverse();
  let best: { fl: number; h: number; v: number } | null = null;
  if (p.data)
    p.fls.forEach((fl, i) =>
      p.data![i].forEach((v, h) => {
        if (v > 0 && (!best || v > best.v)) best = { fl, h, v };
      }),
    );
  const any = p.data?.some((r) => r.some((v) => v > 0));
  return (
    <div class="sky-col" role="dialog" aria-label="Sky column at the selected point">
      <div class="sky-head">
        <div>
          <p class="label red" style="margin:0 0 4px">Sky column</p>
          <b class="mono">
            {p.at[1].toFixed(2)}°N {p.at[0].toFixed(2)}°E
          </b>
        </div>
        <button class="tool" onClick={p.onClose} aria-label="Close">
          ×
        </button>
      </div>
      {!p.data ? (
        <p class="muted small">Loading every level and hour…</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${left + 24 * cw + 4} ${top + rows.length * ch + 22}`} class="sky-svg">
            {rows.map((fl, ri) => {
              const i = p.fls.indexOf(fl);
              return (
                <g>
                  <text x={left - 6} y={top + ri * ch + ch * 0.68} text-anchor="end" class="ax">
                    FL{fl}
                  </text>
                  {p.data![i].map((v, h) => {
                    const k = v > 0 ? Math.min(255, 70 + Math.round(Math.min(1, v / p.dmax) * 185)) : 0;
                    const fill = v > 0 ? `rgb(${RAMP[k * 3]},${RAMP[k * 3 + 1]},${RAMP[k * 3 + 2]})` : "var(--paper-2)";
                    return (
                      <rect
                        x={left + h * cw}
                        y={top + ri * ch}
                        width={cw - 1.5}
                        height={ch - 1.5}
                        fill={fill}
                        class={fl === p.fl && h === p.hour ? "cur" : ""}
                        onClick={() => p.onChoose(fl, h)}
                      >
                        <title>{p.dmax < 1 ? `FL${fl} ${pad2(h)} UTC: ${(v * 100).toFixed(1)} %` : `FL${fl} ${pad2(h)} UTC: ${(v * 100).toFixed(0)} % of the hour`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
            {[0, 6, 12, 18].map((h) => (
              <text x={left + h * cw} y={top + rows.length * ch + 15} class="ax">
                {pad2(h)}
              </text>
            ))}
            <text x={left + 23 * cw} y={top + rows.length * ch + 15} class="ax" text-anchor="end">
              UTC
            </text>
          </svg>
          <p class="small muted" style="margin:6px 0 0">
            {any && best
              ? `${p.what === "STRATUM" ? "Highest contrail chance" : p.what === "observable" ? "Best satellite view" : "Strongest persistent-contrail conditions"} at FL${(best as { fl: number }).fl}, ${pad2((best as { h: number }).h)} UTC. Click a cell to show it on the map.`
              : `Nothing above this point today (${p.what}).`}
          </p>
        </>
      )}
    </div>
  );
}
