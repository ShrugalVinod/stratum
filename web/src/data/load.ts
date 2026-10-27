// Loaders for the exported build (web/public/data/<build>/…), validated with the contract.
import { z } from "zod";
import { ContrailEvent, ContrailIndex, DaySummary, ExplainDay, FlaggedSegment, FlightCollectionLite, type FlightFeature, GameIndex, LiveResponse, Manifest, type ModelId, OutlookInfo, ReportDay, ReportIndex, Results, Schedule } from "./contract";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function json<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const parsed = schema.safeParse(await r.json());
  if (!parsed.success) throw new Error(`${url} does not match the data contract: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

let buildPromise: Promise<string> | null = null;
export function currentBuild(): Promise<string> {
  // ?build=<id> opens another exported build (development and review); otherwise current.json
  const override = typeof location !== "undefined" ? new URLSearchParams(location.search).get("build") : null;
  buildPromise ??= override && /^[\w.-]+$/.test(override)
    ? Promise.resolve(override)
    : json(`${BASE}/data/current.json`, z.object({ build: z.string() })).then((c) => c.build);
  return buildPromise;
}

export const dataUrl = (build: string, path: string) => `${BASE}/data/${build}/${path}`;

export async function loadManifest() {
  const b = await currentBuild();
  return { build: b, manifest: await json(dataUrl(b, "manifest.json"), Manifest) };
}

export type Lists = Partial<Record<ModelId, z.infer<typeof FlaggedSegment>[]>>;

/** One day: summary, flights and the flagged lists. A v2 build has one list per model
 *  (segments_B1/B3/STRATUM.json); a v1 build has only the B1 list (segments_flagged.json). */
export async function loadDay(build: string, date: string) {
  const day = await json(dataUrl(build, `days/${date}/day.json`), DaySummary);
  const lists: Lists = {};
  if (!day.has_flights) return { day, flights: null, segments: [] as z.infer<typeof FlaggedSegment>[], lists };
  const v2 = !!day.layers;
  const files: [ModelId, string][] = v2 ? (["B1", "B3", "STRATUM"] as ModelId[]).map((m) => [m, `segments_${m}.json`]) : [["B1", "segments_flagged.json"]];
  const [flights, ...ls] = await Promise.all([
    json(dataUrl(build, `days/${date}/flights.geojson`), FlightCollectionLite) as Promise<{ type: "FeatureCollection"; features: FlightFeature[] }>,
    ...files.map(([, f]) => json(dataUrl(build, `days/${date}/${f}`), z.array(FlaggedSegment))),
  ]);
  files.forEach(([m], i) => (lists[m] = ls[i]));
  return { day, flights, segments: lists.B1 ?? [], lists };
}

export async function loadResults(build: string, file = "results.json"): Promise<Results> {
  return json(dataUrl(build, file), Results);
}

/** URL of a v2 layer sprite (all 24 hours of one flight level side by side). */
export const layerUrl = (build: string, date: string, pattern: string, fl: number) =>
  dataUrl(build, `days/${date}/${pattern.replace("{fl}", String(fl).padStart(3, "0"))}`);

/** One hour of a decoded sprite (rows × cols bytes). */
export function spriteHour(sprite: { data: Uint8Array; width: number; height: number }, hour: number, cols: number): Uint8Array {
  const out = new Uint8Array(sprite.height * cols);
  for (let r = 0; r < sprite.height; r++) out.set(sprite.data.subarray(r * sprite.width + hour * cols, r * sprite.width + (hour + 1) * cols), r * cols);
  return out;
}

export async function loadCorridor(build: string): Promise<GeoJSON.Feature> {
  const r = await fetch(dataUrl(build, "corridor.geojson"));
  return (await r.json()) as GeoJSON.Feature;
}

export const gridUrl = (build: string, date: string, fl: number, hour: number) =>
  dataUrl(build, `days/${date}/grids/FL${String(fl).padStart(3, "0")}_${String(hour).padStart(2, "0")}.png`);

/** Decode an 8-bit grey grid PNG to its byte values (0–255 = fraction of the hour). */
export async function loadGridBytes(url: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const out = new Uint8Array(bmp.width * bmp.height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return { data: out, width: bmp.width, height: bmp.height };
}

// ── contrail proof viewer (data/contrails-<track>/) ─────────────────────────
/** Folder of the viewer data: contrails-nn3 (detector v3); ?contrails=<folder> for review. */
export function contrailsDir(): string {
  const o = typeof location !== "undefined" ? new URLSearchParams(location.search).get("contrails") : null;
  return o && /^[\w.-]+$/.test(o) ? o : "contrails-nn3";
}
let contrailIndex: Promise<ContrailIndex | null> | null = null;
/** The viewer index, or null if this deployment has no viewer data (the layer then hides). */
export function loadContrailIndex(): Promise<ContrailIndex | null> {
  contrailIndex ??= json(`${BASE}/data/${contrailsDir()}/index.json`, ContrailIndex).catch(() => null);
  return contrailIndex;
}
export async function loadContrailDay(date: string): Promise<ContrailEvent[]> {
  return json(`${BASE}/data/${contrailsDir()}/days/${date}/contrails.json`, z.array(ContrailEvent));
}
export const contrailImg = (date: string, name: string) => `${BASE}/data/${contrailsDir()}/days/${date}/${name}`;

// ── the daily forecast outlook and live aircraft ────────────────────────────
export const OUTLOOK = "outlook";

/** The outlook build's manifest and outlook.json (advisories), or null when none is published. */
export async function loadOutlook(): Promise<{ manifest: Manifest; info: OutlookInfo } | null> {
  try {
    const [manifest, info] = await Promise.all([json(dataUrl(OUTLOOK, "manifest.json"), Manifest), json(dataUrl(OUTLOOK, "outlook.json"), OutlookInfo)]);
    return { manifest, info };
  } catch {
    return null;
  }
}

const sprites = new Map<string, Promise<{ data: Uint8Array; width: number; height: number }>>();

/** A layer's value (0–1) at a point, from the outlook's hour sprites; null outside the grid. */
export async function outlookValue(m: Manifest, layer: string, date: string, hour: number, fl: number, lat: number, lon: number): Promise<number | null> {
  const info = m.layers?.find((l) => l.id === layer);
  const g = m.grid;
  if (!info || !m.days.includes(date)) return null;
  const r = Math.round((g.lat_north - lat) / g.step_deg);
  const c = Math.round((lon - g.lon_west) / g.step_deg);
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  const url = layerUrl(OUTLOOK, date, info.file, fl);
  let p = sprites.get(url);
  if (!p) {
    p = loadGridBytes(url);
    sprites.set(url, p);
    p.catch(() => sprites.delete(url));
  }
  const s = await p;
  return (s.data[r * s.width + hour * g.cols + c] / 255) * info.full_scale;
}

/** The flights expected today (yesterday's, by flight number), or null when none is published. */
export function loadSchedule(): Promise<Schedule | null> {
  return json(`${BASE}/data/schedule/schedule.json`, Schedule).catch(() => null);
}

/** Every B1 hour sprite of the outlook (each day × flight level), keyed "date|fl". */
export async function loadOutlookB1(m: Manifest): Promise<Map<string, { data: Uint8Array; width: number; height: number }>> {
  const info = m.layers?.find((l) => l.id === "B1");
  const out = new Map<string, { data: Uint8Array; width: number; height: number }>();
  if (!info) return out;
  await Promise.all(
    m.days.flatMap((d) =>
      m.flight_levels.map(async ({ fl }) => {
        const url = layerUrl(OUTLOOK, d, info.file, fl);
        let p = sprites.get(url);
        if (!p) {
          p = loadGridBytes(url);
          sprites.set(url, p);
        }
        try {
          out.set(`${d}|${fl}`, await p);
        } catch {
          sprites.delete(url);
        }
      }),
    ),
  );
  return out;
}

/** Aircraft near a point from the site's Worker (rounded to its 0.5° cache cell before sending). */
export async function loadLive(lat: number, lon: number) {
  const q = (v: number) => (Math.round(v * 2) / 2).toFixed(1);
  return json(`${BASE}/api/live?lat=${q(lat)}&lon=${q(lon)}`, LiveResponse);
}

// ── "Beat STRATUM" (data/game/; ?game=<folder> for review) ───────────────────
export function gameDir(): string {
  const o = typeof location !== "undefined" ? new URLSearchParams(location.search).get("game") : null;
  return o && /^[\w.-]+$/.test(o) ? o : "game";
}
export function loadGame(): Promise<GameIndex | null> {
  return json(`${BASE}/data/${gameDir()}/index.json`, GameIndex).catch(() => null);
}
export const gameImg = (name: string) => `${BASE}/data/${gameDir()}/img/${name}`;

// ── website extras from Colab 12a: explanations and the weighted decisions (D-006) ──
const dirOverride = (key: string, def: string) => {
  const o = typeof location !== "undefined" ? new URLSearchParams(location.search).get(key) : null;
  return o && /^[\w.-]+$/.test(o) ? o : def;
};
const explainCache = new Map<string, Promise<ExplainDay | null>>();
/** Per-card TreeSHAP for one day, or null when not exported (?explain=<folder> for review). */
export function loadExplain(date: string): Promise<ExplainDay | null> {
  const url = `${BASE}/data/${dirOverride("explain", "explain")}/days/${date}.json`;
  let p = explainCache.get(url);
  if (!p) explainCache.set(url, (p = json(url, ExplainDay).catch(() => null)));
  return p;
}
/** The day's probability-weighted decision list (D-006), or null (?weighted=<folder>). */
export function loadWeighted(date: string): Promise<z.infer<typeof FlaggedSegment>[] | null> {
  return json(`${BASE}/data/${dirOverride("weighted", "weighted")}/days/${date}/segments_STRATUMw.json`, z.array(FlaggedSegment)).catch(() => null);
}
/** Whether the weighted analysis is published, with its summary (weighted/summary.json). */
export function loadWeightedSummary(): Promise<Record<string, any> | null> {
  return json(`${BASE}/data/${dirOverride("weighted", "weighted")}/summary.json`, z.record(z.string(), z.any())).catch(() => null);
}

/** The routes and airlines dashboard (data/dashboard/summary.json; ?dashboard=<folder>). */
export function loadDashboard(): Promise<Record<string, any> | null> {
  return json(`${BASE}/data/${dirOverride("dashboard", "dashboard")}/summary.json`, z.record(z.string(), z.any())).catch(() => null);
}

// ── daily report card (data/report/ — the `report-data` branch via the Worker) ─────────────
export function loadReportIndex(): Promise<ReportIndex | null> {
  return json(`${BASE}/data/report/index.json`, ReportIndex).catch(() => null);
}
export function loadReportDay(date: string): Promise<ReportDay | null> {
  return json(`${BASE}/data/report/days/${date}.json`, ReportDay).catch(() => null);
}

// ── "What if we'd listened?" (/replay): one day's flight tracks and CoCiP contrail lifetimes ─
export async function loadReplayDay(date: string) {
  const build = await currentBuild();
  const [flights, b1] = await Promise.all([
    json(dataUrl(build, `days/${date}/flights.geojson`), FlightCollectionLite) as Promise<{ type: "FeatureCollection"; features: FlightFeature[] }>,
    json(dataUrl(build, `days/${date}/segments_B1.json`), z.array(FlaggedSegment)),
  ]);
  return { flights: flights.features, b1 };
}
