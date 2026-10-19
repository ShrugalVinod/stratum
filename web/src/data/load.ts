// Loaders for the exported build (web/public/data/<build>/…), validated with the contract.
import { z } from "zod";
import { DaySummary, FlaggedSegment, FlightCollectionLite, type FlightFeature, Manifest, type ModelId, Results } from "./contract";

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
