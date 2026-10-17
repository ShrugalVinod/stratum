import { useEffect, useMemo, useState } from "preact/hooks";
import type { DaySummary, FlaggedSegment, FlightFeature, Manifest } from "../data/contract";
import { RAMP } from "../data/ramp";
import { clock, colourise, joules, type MapState, pad2, parseState, stateQuery } from "../data/format";
import { gridUrl, loadCorridor, loadDay, loadGridBytes, loadManifest } from "../data/load";
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

async function gridImage(build: string, date: string, fl: number, h: number, m: Manifest): Promise<string> {
  const k = `${build}|${date}|${fl}|${h}`;
  const hit = imgCache.get(k);
  if (hit) return hit;
  const g = await getGrid(build, date, fl, h);
  const c = document.createElement("canvas");
  c.width = m.grid.cols;
  c.height = m.grid.rows;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(colourise(g) as Uint8ClampedArray<ArrayBuffer>, m.grid.cols, m.grid.rows), 0, 0);
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

// Direction = overall heading compared with the Delhi–Mumbai route (not the actual origin/destination).
const DIR_LABEL = { "DEL-BOM": "Southbound", "BOM-DEL": "Northbound", other: "Crossing" } as const;

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
  const [dayData, setDayData] = useState<{ day: DaySummary; flights: FlightFeature[] | null; segments: FlaggedSegment[] } | null>(null);
  const [riskImage, setRiskImage] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ risk: true, flights: true, corridor: true, cities: true });
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
  useEffect(() => {
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
        const s = parseState(location.search, { date: def, hour: 6, fl: 360, seg: null });
        if (!s.date || !manifest.days.includes(s.date)) s.date = def;
        if (!manifest.flight_levels.some((f) => f.fl === s.fl)) s.fl = manifest.flight_levels[Math.floor(manifest.flight_levels.length / 2)].fl;
        setSt(s);
        loadCorridor(b).then(setCorridor).catch(() => setCorridor(null));
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  // URL state
  useEffect(() => {
    if (!man) return;
    history.replaceState(null, "", `/map${stateQuery(st)}`);
  }, [st, man]);

  // day data
  useEffect(() => {
    if (!build || !st.date) return;
    setDayData(null);
    setFlightSel(null);
    loadDay(build, st.date)
      .then((d) => setDayData({ day: d.day, flights: d.flights?.features ?? null, segments: d.segments }))
      .catch((e) => setErr(String(e.message ?? e)));
  }, [build, st.date]);

  // risk image for the current view + preload the day's hours for this FL
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    gridImage(build, st.date, st.fl, st.hour, man)
      .then((u) => live && setRiskImage(u))
      .catch(() => live && setRiskImage(null));
    for (let h = 0; h < 24; h++) gridImage(build, st.date, st.fl, h, man).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.fl, st.hour]);

  // hourly share of the corridor / domain with persistent-contrail conditions (this FL)
  const mask = useMemo(() => (man ? corridorMask(man, corridor) : null), [man, corridor]);
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    Promise.all([...Array(24).keys()].map((h) => getGrid(build, st.date!, st.fl, h)))
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
          corr.push(n ? s / n / 255 : 0);
          dom.push(sd / g.length / 255);
        }
        setHourly({ corridor: corr, domain: dom });
      })
      .catch(() => live && setHourly(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.fl, mask]);

  // share of the domain at every flight level for the chosen hour (altitude tape bars)
  useEffect(() => {
    if (!build || !man || !st.date) return;
    let live = true;
    Promise.all(man.flight_levels.map((f) => getGrid(build, st.date!, f.fl, st.hour).then((g) => [f.fl, g.reduce((a, v) => a + v, 0) / g.length / 255] as const)))
      .then((r) => live && setByLevel(Object.fromEntries(r)))
      .catch(() => live && setByLevel(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, st.hour]);

  // sky column at the picked point: all flight levels × 24 hours
  useEffect(() => {
    if (!build || !man || !st.date || !picked) return setColumn(null);
    const g = man.grid;
    const r = Math.round((g.lat_north - picked[1]) / g.step_deg);
    const c = Math.round((picked[0] - g.lon_west) / g.step_deg);
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return setColumn(null);
    let live = true;
    Promise.all(man.flight_levels.map((f) => Promise.all([...Array(24).keys()].map((h) => getGrid(build, st.date!, f.fl, h)))))
      .then((byFl) => live && setColumn(byFl.map((hrs) => hrs.map((gr) => gr[r * g.cols + c] / 255))))
      .catch(() => live && setColumn(null));
    return () => {
      live = false;
    };
  }, [build, man, st.date, picked]);

  // playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSt((s) => ({ ...s, hour: (s.hour + 1) % 24 })), 1100);
    return () => clearInterval(id);
  }, [playing]);

  const segments = dayData?.segments ?? [];
  const airlines = useMemo(() => [...new Set(segments.map((s) => s.airline).filter(Boolean) as string[])].sort(), [segments]);
  const shown = segments.filter((s) => (dir === "all" || s.direction === dir) && (airline === "all" || s.airline === airline) && (!nightOnly || s.night));
  const maxEf = Math.max(1, ...segments.map((s) => Math.abs(s.ef_J ?? 0)));
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
  const detailFlight = detailId ? (dayData?.flights?.find((f) => f.properties.flight_id === detailId) ?? null) : null;
  const detailSegs = useMemo(() => (detailId ? segments.filter((s) => s.flight_id === detailId).sort((a, b) => a.time_utc.localeCompare(b.time_utc)) : []), [detailId, segments]);

  const chooseSeg = (s: FlaggedSegment) => {
    setFlightSel(null);
    setSt({ ...st, seg: s.segment_id, hour: Math.floor(clock(s.time_utc).minutes / 60) });
  };
  const onFlight = (id: string) => {
    const segs = segments.filter((s) => s.flight_id === id);
    if (segs.length) {
      // a flight that makes a persistent contrail: open its strongest segment
      chooseSeg(segs.reduce((a, b) => ((b.ef_J ?? 0) > (a.ef_J ?? 0) ? b : a)));
    } else {
      setFlightSel(id);
      setSt((s) => ({ ...s, seg: null }));
    }
  };
  const closeDetail = () => {
    setFlightSel(null);
    setSt({ ...st, seg: null });
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
      <div class="mp-bar" role="toolbar" aria-label="Map controls">
        <h1 class="mp-title mono-s">Contrail map · India 6–37°N 68–98°E</h1>
        <span class="mono-s warn">Computational estimate — no real flight was changed</span>
        <span class="mono-s">Physics-only prototype (v0) · uncorrected B1</span>
        <span class="mono-s">
          ADS-B coverage:{" "}
          {man?.coverage.adsb_coverage_pct != null ? `${man.coverage.adsb_coverage_pct.toFixed(0)} % of scheduled corridor flights` : "audit pending (Nov 2026)"}
        </span>
        <span class="mp-tools">
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
                  ] as const
                ).map(([k, label]) => (
                  <label>
                    <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} /> {label}
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
                flights={dayData?.flights ?? null}
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
              />
            )}
            <p class="map-hint mono-s" aria-hidden="true">
              Click a flight → details below · click anywhere → sky column
            </p>
            <div class="legend">
              <div class="legend-title label ink">Persistent-contrail conditions</div>
              <div class="ramp" aria-hidden="true" />
              <div class="ramp-labels mono">
                <span>0</span>
                <span>share of the hour</span>
                <span>1</span>
              </div>
              <div class="legend-row">
                <i class="sw track" /> Flight track (brighter near the chosen hour)
              </div>
              <div class="legend-row">
                <i class="sw pred" /> Segment making a persistent contrail (CoCiP)
              </div>
              <div class="legend-row">
                <i class="sw plane" aria-hidden="true">
                  ✈
                </i>{" "}
                Aircraft (orange: makes a persistent contrail)
              </div>
              <div class="legend-row">
                <i class="sw corr" /> Delhi–Mumbai corridor ±75 km
              </div>
              {hourly && (
                <div class="legend-stat mono">
                  FL{st.fl} {pad2(st.hour)}:00 UTC: {(hourly.domain[st.hour] * 100).toFixed(1)} % of the domain · {(hourly.corridor[st.hour] * 100).toFixed(1)} % of
                  the corridor
                </div>
              )}
            </div>
            <div class="cursor mono" aria-hidden="true">
              {cursor ? `${cursor[1].toFixed(2)}°N  ${cursor[0].toFixed(2)}°E` : "6–37°N · 68–98°E"}
            </div>
            {picked && (
              <SkyColumn
                at={picked}
                data={column}
                fls={man?.flight_levels.map((f) => f.fl) ?? []}
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
                <p class="label red">Flagged segments</p>
                <p class="label ink" style="margin-top:4px">
                  Ranked by contrail warming
                </p>
              </div>
              {dayData?.day.has_flights && <span class="mono-s muted">{segments.length} segments</span>}
            </div>

            {dayData && !dayData.day.has_flights && (
              <div class="empty">
                <p>No flight data for {st.date ? dayLabel(st.date) : ""}.</p>
                <p class="muted">Free flight data exist for the 1st of each month. The contrail conditions on the map are still real for every January day.</p>
                {man?.days_with_flights[0] && (
                  <button class="tool" onClick={() => setSt({ ...st, date: man.days_with_flights[0], seg: null })}>
                    Show {dayLabel(man.days_with_flights[0])} ✈
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
                        {d === "all" ? "All" : DIR_LABEL[d]}
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
                              <i style={{ transform: `scaleX(${Math.max(0.02, Math.abs(s.ef_J ?? 0) / maxEf)})` }} />
                            </span>
                          </span>
                          <span class="strip-r mono">
                            <b>FL{s.fl}</b>
                            <span>{joules(s.ef_J)}</span>
                            <span>{s.contrail_age_h != null ? `lasts ${s.contrail_age_h.toFixed(1)} h` : ""}</span>
                          </span>
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
          <div>{detailId && <DetailDeck key={detailId} flight={detailFlight} seg={selected} segs={detailSegs} onStep={chooseSeg} onClose={closeDetail} />}</div>
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
        Bars: share of the Delhi–Mumbai corridor with persistent-contrail conditions at FL{st.fl}, each hour (B1 physics, uncorrected). Drag along
        the bars or use the arrow keys to change the hour.
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
      {lightbox && (
        <div class="lightbox" role="dialog" aria-modal="true" aria-label={lightbox.title} onClick={() => setLightbox(null)}>
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

/** Lower detail bar: the flight, how long its contrail lasted, and the segment's contrail details. */
function DetailDeck(p: { flight: FlightFeature | null; seg: FlaggedSegment | null; segs: FlaggedSegment[]; onStep: (s: FlaggedSegment) => void; onClose: () => void }) {
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
      </div>

      <div class={`dk dk-life ${s ? "" : "none"}`}>
        <p class="label red">Contrail lasted</p>
        {s ? (
          <>
            <b class="mono life-num">{age != null ? `${age.toFixed(1)} h` : "—"}</b>
            <span class="mono small">{age != null ? hm(age) : "not available"} · this segment</span>
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
            <span class="small">No persistent contrail predicted for this flight (B1 physics, uncorrected).</span>
          </>
        )}
      </div>

      {s && c && (
        <>
          <div class="dk dk-seg">
            <p class="label">Segment</p>
            <div class="sc-nav">
              <button class="tool" onClick={() => step(-1)} aria-label="Previous segment of this flight" disabled={p.segs.length < 2}>
                ‹
              </button>
              <span class="mono">
                {k + 1} / {p.segs.length}
              </span>
              <button class="tool" onClick={() => step(1)} aria-label="Next segment of this flight" disabled={p.segs.length < 2}>
                ›
              </button>
            </div>
            <span class="mono small">
              {c.utc} UTC · {c.ist} IST{s.night ? " · night" : ""}
            </span>
            <span class="mono small">Planned FL{s.fl}</span>
          </div>
          <dl class="dk dk-fields">
            <div>
              <dt>Contrail energy forcing (central)</dt>
              <dd>{joules(s.ef_J)}</dd>
            </div>
            <div>
              <dt>EF range (5th–95th %)</dt>
              <dd>
                {joules(s.ef_p05_J)} – {joules(s.ef_p95_J)}
              </dd>
            </div>
            <div>
              <dt>P(persistent contrail)</dt>
              <dd>{s.p_persistent ?? <Pending />}</dd>
            </div>
            <div>
              <dt>Best alternative level</dt>
              <dd>{s.best_alternative_fl ? `FL${s.best_alternative_fl}` : <Pending />}</dd>
            </div>
            <div>
              <dt>Extra fuel / CO₂</dt>
              <dd>{s.extra_fuel_kg ?? <Pending />}</dd>
            </div>
            <div>
              <dt>Net warming avoided</dt>
              <dd>{s.net_warming_avoided_100y ?? <Pending />}</dd>
            </div>
          </dl>
        </>
      )}

      <div class="dk dk-end">
        <span class="badge-stamp mono-s">Physics-only estimate</span>
        {s && (
          <p class="small muted">
            {s.confidence_note} {s.ef_note}
          </p>
        )}
        <button class="tool" onClick={p.onClose}>
          Close ✕
        </button>
      </div>
    </section>
  );
}

function SkyColumn(p: { at: [number, number]; data: number[][] | null; fls: number[]; hour: number; fl: number; onClose: () => void; onChoose: (fl: number, h: number) => void }) {
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
                    const k = v > 0 ? Math.min(255, 70 + Math.round(v * 185)) : 0;
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
                        <title>{`FL${fl} ${pad2(h)} UTC: ${(v * 100).toFixed(0)} % of the hour`}</title>
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
              ? `Persistent-contrail conditions appear at ${p.fls.length > 1 ? "some levels" : "this level"} — strongest at FL${(best as { fl: number }).fl}, ${pad2((best as { h: number }).h)} UTC. Click a cell to show it on the map.`
              : "No persistent-contrail conditions at any level above this point today (B1 physics)."}
          </p>
        </>
      )}
    </div>
  );
}

function Pending() {
  return (
    <span class="pending mono" title="Available when the correction model is finished (Phase 7)">
      — Phase 7
    </span>
  );
}
