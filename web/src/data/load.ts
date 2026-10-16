// Loaders for the exported build (web/public/data/<build>/…), validated with the contract.
import { z } from "zod";
import { DaySummary, FlaggedSegment, FlightCollection, Manifest } from "./contract";

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
  buildPromise ??= json(`${BASE}/data/current.json`, z.object({ build: z.string() })).then((c) => c.build);
  return buildPromise;
}

export const dataUrl = (build: string, path: string) => `${BASE}/data/${build}/${path}`;

export async function loadManifest() {
  const b = await currentBuild();
  return { build: b, manifest: await json(dataUrl(b, "manifest.json"), Manifest) };
}

export async function loadDay(build: string, date: string) {
  const day = await json(dataUrl(build, `days/${date}/day.json`), DaySummary);
  if (!day.has_flights) return { day, flights: null, segments: [] as z.infer<typeof FlaggedSegment>[] };
  const [flights, segments] = await Promise.all([
    json(dataUrl(build, `days/${date}/flights.geojson`), FlightCollection),
    json(dataUrl(build, `days/${date}/segments_flagged.json`), z.array(FlaggedSegment)),
  ]);
  return { day, flights, segments };
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
