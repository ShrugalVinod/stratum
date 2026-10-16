import { useEffect, useMemo, useState } from "preact/hooks";
import type { DaySummary, FlaggedSegment, FlightFeature, Manifest } from "../data/contract";
import { RAMP } from "../data/ramp";
import { clock, colourise, hourLabel, joules, type MapState, pad2, parseState, stateQuery } from "../data/format";
import { gridUrl, loadCorridor, loadDay, loadGridBytes, loadManifest } from "../data/load";
import { ContrailMap, type Layers } from "../map/ContrailMap";
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
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [dir, setDir] = useState<"all" | "DEL-BOM" | "BOM-DEL" | "other">("all");
  const [airline, setAirline] = useState("all");
  const [nightOnly, setNightOnly] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [introCmd, setIntroCmd] = useState<{ kind: "play" | "skip"; n: number }>({ kind: "play", n: 0 });
  const [intro, setIntro] = useState<{ active: boolean; t: number }>({ active: false, t: 0 });
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
  const hl = hourLabel(st.hour);

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
      <div class="wrap" style="padding:120px var(--gutter)">
        <p class="eyebrow">Map</p>
        <h1 class="display m">The map data could not be loaded.</h1>
        <p class="muted mono" style="margin-top:20px">{err}</p>
      </div>
    );

  return (
    <div class="map-page">
      <div class="map-main">
        <div class="controls" role="toolbar" aria-label="Map controls">
          <label class="ctl">
            <span class="ctl-label">Date</span>
            <select value={st.date ?? ""} onChange={(e) => setSt({ ...st, date: (e.target as HTMLSelectElement).value, seg: null })} aria-label="Date">
              {man?.days.map((d) => (
                <option value={d}>
                  {d}
                  {man.days_with_flights.includes(d) ? "  ✈ flights" : ""}
                </option>
              ))}
            </select>
          </label>

          <div class="ctl hour-ctl">
            <span class="ctl-label">
              Hour <b class="mono">{hl.utc} UTC</b> <span class="mono muted">({hl.ist} IST)</span>
            </span>
            <div class="hour-row">
              <button class="play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play through the day"}>
                {playing ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
                )}
              </button>
              <div class="slider-wrap">
                <Spark values={hourly?.corridor ?? null} hour={st.hour} onPick={(h) => setSt({ ...st, hour: h })} />
                <input
                  type="range"
                  min={0}
                  max={23}
                  step={1}
                  value={st.hour}
                  onInput={(e) => setSt({ ...st, hour: Number((e.target as HTMLInputElement).value) })}
                  aria-label="Hour (UTC)"
                  aria-valuetext={`${hl.utc} UTC, ${hl.ist} IST`}
                />
              </div>
            </div>
          </div>

          <div class="ctl">
            <span class="ctl-label">
              Flight level {flInfo && <span class="mono muted">≈ {Math.round(flInfo.pressure_hpa)} hPa</span>}
            </span>
            <div class="seg-ctl" role="radiogroup" aria-label="Flight level">
              {man?.flight_levels.map((f) => (
                <button role="radio" aria-checked={f.fl === st.fl} class={f.fl === st.fl ? "on" : ""} title={`${f.pressure_hpa} hPa`} onClick={() => setSt({ ...st, fl: f.fl })}>
                  FL{f.fl}
                </button>
              ))}
            </div>
          </div>

          <div class="ctl ctl-right">
            <div class="layers">
              <button class="btn-sm" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg>
                Layers
              </button>
              {layersOpen && (
                <div class="layers-menu">
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
                </div>
              )}
            </div>
            {dayData?.day.has_flights && (
              <button class="btn-sm" onClick={() => setIntroCmd({ kind: "play", n: introCmd.n + 1 })} disabled={intro.active} title="Replay the whole day">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
                </svg>
                Replay day
              </button>
            )}
            <button class="btn-sm" onClick={copyLink} aria-live="polite">
              {copied ? "Link copied ✓" : "Copy link"}
            </button>
          </div>
        </div>

        <div class="map-wrap">
          {man && (
            <ContrailMap
              manifest={man}
              corridor={corridor}
              riskImage={riskImage}
              flights={dayData?.flights ?? null}
              segments={segments}
              hour={st.hour}
              selected={selected}
              picked={picked}
              layers={layers}
              onSelect={(s) => setSt({ ...st, seg: s?.segment_id ?? null })}
              onPick={setPicked}
              onHover={setCursor}
              introCmd={introCmd}
              onIntro={setIntro}
            />
          )}
          <div class={`map-banners ${intro.active ? "dim" : ""}`} aria-label="Notes">
            <span>Computational estimate — no real flight was changed</span>
            <span>Physics-only prototype (v0)</span>
            <span>
              ADS-B coverage:{" "}
              {man?.coverage.adsb_coverage_pct != null ? `${man.coverage.adsb_coverage_pct.toFixed(0)} % of scheduled corridor flights` : "audit pending (Nov 2026)"}
            </span>
          </div>
          <div class="model-badge">Physics-only (uncorrected) — B1</div>
          <div class="legend">
            <div class="legend-title">Persistent-contrail conditions</div>
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
            {hourly && (
              <div class="legend-stat mono">
                FL{st.fl} {hl.utc} UTC: {(hourly.domain[st.hour] * 100).toFixed(1)} % of the domain ·{" "}
                {(hourly.corridor[st.hour] * 100).toFixed(1)} % of the corridor
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
          {!dayData && <div class="map-loading">Loading {st.date}…</div>}
          {intro.active && (
            <div class="intro-chip" role="status" aria-live="off">
              <span class="eyebrow" style="margin:0">Replaying {st.date}</span>
              <b class="mono">
                {pad2(Math.floor(intro.t / 60) % 24)}:{pad2(Math.floor(intro.t % 60))} UTC
              </b>
              <span class="mono muted">
                {pad2(Math.floor(((intro.t + 330) % 1440) / 60))}:{pad2(Math.floor((intro.t + 330) % 60))} IST
              </span>
              <span class="intro-bar" aria-hidden="true">
                <i style={{ width: `${(intro.t / 1440) * 100}%` }} />
              </span>
              <button class="btn-sm" onClick={() => setIntroCmd({ kind: "skip", n: introCmd.n + 1 })}>
                Skip
              </button>
            </div>
          )}
        </div>

        <section class="gallery" aria-labelledby="gal">
          <div class="gal-head">
            <p class="eyebrow" id="gal">
              Satellite check
            </p>
            <span class="mono muted small">Real Meteosat-9 images · illustrations, not results</span>
          </div>
          <div class="gal-row">
            {GALLERY.map((g) => (
              <button class="gal-card" onClick={() => setLightbox(g)}>
                <img src={g.thumb} alt="" loading="lazy" />
                <span class="gal-text">
                  <b>
                    {g.title}
                    {g.video && <span class="play-mark" aria-hidden="true">▶</span>}
                  </b>
                  <span>{g.caption}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        {lightbox && (
          <div class="lightbox" role="dialog" aria-modal="true" aria-label={lightbox.title} onClick={() => setLightbox(null)}>
            <figure onClick={(e) => e.stopPropagation()}>
              {lightbox.video ? (
                <video src={lightbox.video} poster={lightbox.thumb} controls autoPlay loop playsInline />
              ) : (
                <img src={lightbox.full ?? lightbox.thumb} alt={lightbox.alt} />
              )}
              <figcaption>
                <b>{lightbox.title}</b> — {lightbox.long} <span class="muted">© EUMETSAT 2026 · illustration, not a result.</span>
              </figcaption>
              <button class="btn-sm lb-close" onClick={() => setLightbox(null)} autoFocus>
                Close
              </button>
            </figure>
          </div>
        )}
      </div>

      <aside class="side-panel" aria-label="Flagged segments">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Flagged segments</p>
            <h2 class="h3">Ranked by contrail warming</h2>
          </div>
          {dayData?.day.has_flights && <span class="badge">{segments.length} segments</span>}
        </div>

        {dayData && !dayData.day.has_flights && (
          <div class="empty">
            <p>No flight data for {st.date}.</p>
            <p class="muted">
              Free flight data exist for the 1st of each month. The contrail conditions on the map are still real for every January day.
            </p>
            {man?.days_with_flights[0] && (
              <button class="btn-sm" onClick={() => setSt({ ...st, date: man.days_with_flights[0], seg: null })}>
                Show {man.days_with_flights[0]} ✈
              </button>
            )}
          </div>
        )}

        {dayData?.day.has_flights && (
          <>
            <div class="filters">
              <div class="seg-ctl small" role="radiogroup" aria-label="Direction">
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
            <ol class="seg-list">
              {shown.length === 0 && <li class="muted empty-row">No segments match these filters.</li>}
              {shown.map((s) => {
                const c = clock(s.time_utc);
                return (
                  <li>
                    <button class={`seg-row ${s.segment_id === st.seg ? "on" : ""}`} onClick={() => setSt({ ...st, seg: s.segment_id, hour: Math.floor(c.minutes / 60) })}>
                      <span class="seg-top">
                        <b>{s.callsign}</b>
                        <span class="mono muted">
                          {c.utc} / {c.ist}
                        </span>
                      </span>
                      <span class="seg-mid mono">
                        <span>
                          {DIR_LABEL[s.direction]} · <span class="fl">FL{s.fl}</span>
                          {s.night ? " · night" : ""}
                        </span>
                        <span class="ef">{joules(s.ef_J)}</span>
                      </span>
                      <span class="bar" aria-hidden="true">
                        <i style={{ width: `${Math.max(2, (Math.abs(s.ef_J ?? 0) / maxEf) * 100)}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {selected && <SegmentCard s={selected} onClose={() => setSt({ ...st, seg: null })} />}
      </aside>
    </div>
  );
}

function Spark(p: { values: number[] | null; hour: number; onPick: (h: number) => void }) {
  const max = Math.max(0.02, ...(p.values ?? [0]));
  return (
    <div class="spark" aria-hidden="true">
      {[...Array(24).keys()].map((h) => (
        <i
          class={h === p.hour ? "on" : ""}
          style={{ height: `${p.values ? Math.max(2, (p.values[h] / max) * 100) : 2}%` }}
          title={p.values ? `${pad2(h)} UTC: ${(p.values[h] * 100).toFixed(1)} % of the corridor` : ""}
          onClick={() => p.onPick(h)}
        />
      ))}
    </div>
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
          <p class="eyebrow" style="margin:0 0 4px">Sky column</p>
          <b class="mono">
            {p.at[1].toFixed(2)}°N {p.at[0].toFixed(2)}°E
          </b>
        </div>
        <button class="icon-btn small" onClick={p.onClose} aria-label="Close">
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
                    const fill = v > 0 ? `rgb(${RAMP[k * 3]},${RAMP[k * 3 + 1]},${RAMP[k * 3 + 2]})` : "var(--raised)";
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
    <span class="pending" title="Available when the correction model is finished (Phase 7)">
      — (Phase 7)
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" />
      </svg>
    </span>
  );
}

function SegmentCard({ s, onClose }: { s: FlaggedSegment; onClose: () => void }) {
  const c = clock(s.time_utc);
  return (
    <section class="seg-card" aria-labelledby="sc-title">
      <div class="sc-head">
        <p class="eyebrow" style="margin:0">Selected segment</p>
        <span class="badge">Physics-only estimate</span>
      </div>
      <h3 id="sc-title" class="display" style="font-size:34px;margin:10px 0 4px">
        {s.callsign}
      </h3>
      <p class="mono small" style="margin:0 0 18px;color:var(--cyan)">
        {s.airline ?? "Airline"} · {DIR_LABEL[s.direction]} · {c.utc} UTC · {c.ist} IST
      </p>
      <dl class="fields">
        <div>
          <dt>Planned FL</dt>
          <dd>FL{s.fl}</dd>
        </div>
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
          <dt>Contrail lifetime</dt>
          <dd>{s.contrail_age_h != null ? `${s.contrail_age_h.toFixed(1)} h` : "—"}</dd>
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
      <p class="note">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5h.01" />
        </svg>
        {s.confidence_note} {s.ef_note}
      </p>
      <button class="btn-sm" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
