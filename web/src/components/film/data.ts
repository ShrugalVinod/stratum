// Real data for the scroll films: the same files the map, the proof viewer and /results read.
import type { FlaggedSegment } from "../../data/contract";
import { currentBuild, loadContrailDay, loadDay, loadManifest, loadResults } from "../../data/load";
import type { z } from "zod";

export type Ring = [number, number][];
export type Land = { iso: string; rings: Ring[] }[];
export type Seg = z.infer<typeof FlaggedSegment> & Record<string, any>;

let land: Promise<Land> | null = null;
/** Natural Earth countries (India point of view), as lon/lat rings. */
export function loadLand(): Promise<Land> {
  land ??= fetch("/geo/countries.geojson")
    .then((r) => r.json())
    .then((g: GeoJSON.FeatureCollection) =>
      g.features.map((f) => {
        const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
        const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
        return { iso: String((f.properties as any)?.iso ?? ""), rings: polys.map((p) => p[0] as Ring) };
      }),
    );
  return land;
}

let world: Promise<number[][]> | null = null;
/** World land outline (Natural Earth 1:110m, coastlines only, no borders), flat lon/lat rings. */
export function loadWorldLand(): Promise<number[][]> {
  world ??= fetch("/geo/land110.json")
    .then((r) => r.json())
    .then((j: { rings: number[][] }) => j.rings);
  return world;
}
let states: Promise<[number, number][][]> | null = null;
/** India's state lines (the same file the map uses). */
export function loadStates(): Promise<[number, number][][]> {
  states ??= fetch("/geo/india_states.geojson")
    .then((r) => r.json())
    .then((g: GeoJSON.FeatureCollection) =>
      g.features.flatMap((f) => {
        const geom = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString | GeoJSON.Polygon | GeoJSON.MultiPolygon;
        if (geom.type === "LineString") return [geom.coordinates as [number, number][]];
        if (geom.type === "MultiLineString" || geom.type === "Polygon") return geom.coordinates as [number, number][][];
        return (geom.coordinates as [number, number][][][]).flat();
      }),
    );
  return states;
}
let cities: Promise<{ lon: number; lat: number; pop: number }[]> | null = null;
export function loadCities() {
  cities ??= fetch("/geo/cities.geojson")
    .then((r) => r.json())
    .then((g: GeoJSON.FeatureCollection) =>
      g.features.map((f) => {
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        return { lon, lat, pop: Number((f.properties as any)?.pop ?? 1e6) };
      }),
    );
  return cities;
}

export type Flight = { id: string; cs: string; lon: Float32Array; lat: Float32Array; m: Float32Array; flagged: boolean; alert: boolean };
export type StoryDay = { date: string; flights: Flight[]; b1: Seg[]; stratum: Seg[]; alerts: number };

const FILM_DAY = "2026-01-01";
let day: Promise<StoryDay> | null = null;
/** 1 Jan 2026: every commercial flight with its minute stamps, and the flagged stretches. */
export function loadStoryDay(): Promise<StoryDay> {
  day ??= currentBuild()
    .then((b) => loadDay(b, FILM_DAY))
    .then(({ day: d, flights, lists }) => {
      const fl: Flight[] = (flights?.features ?? []).map((f: any) => {
        const c = f.geometry.coordinates as [number, number][];
        const m = (f.properties.minutes ?? []) as number[];
        return {
          id: f.properties.flight_id,
          cs: f.properties.callsign ?? "",
          lon: Float32Array.from(c.map((x) => x[0])),
          lat: Float32Array.from(c.map((x) => x[1])),
          m: Float32Array.from(m.length === c.length ? m : c.map((_, i) => i)),
          flagged: (f.properties.flagged_models ?? []).includes("B1"),
          alert: !!f.properties.alert,
        };
      });
      fl.sort((a, b) => a.m[0] - b.m[0]);
      return { date: FILM_DAY, flights: fl, b1: (lists.B1 ?? []) as Seg[], stratum: (lists.STRATUM ?? []) as Seg[], alerts: d.n_alerts ?? 0 };
    });
  return day;
}

export const PROOF_DAY = "2025-11-01";
export const PROOF_CS = "ALK266";
export async function loadProof() {
  const evs = await loadContrailDay(PROOF_DAY);
  return evs.find((e) => e.callsign === PROOF_CS) ?? evs[0];
}

let res: Promise<Record<string, any>> | null = null;
export function loadRes(): Promise<Record<string, any>> {
  res ??= loadManifest().then(({ build, manifest }) => loadResults(build, manifest.results_file ?? "results.json") as Promise<any>);
  return res;
}

/** H1 totals, summed from the logged per-season breakdown (they equal the H1 sentence). */
export function h1Totals(r: Record<string, any>) {
  const s = (r.h1_breakdowns?.season ?? []) as { season: string; segments: number; predicted_B1: number; observed_y1: number; ratio_value: number }[];
  return {
    predicted: s.reduce((a, x) => a + x.predicted_B1, 0),
    observed: s.reduce((a, x) => a + x.observed_y1, 0),
    segments: s.reduce((a, x) => a + x.segments, 0),
    seasons: s,
  };
}

/** Position of a flight at minute t (null before take-off / after the last report). */
export function at(f: Flight, t: number): [number, number] | null {
  const m = f.m;
  if (t < m[0] || t > m[m.length - 1]) return null;
  for (let i = 1; i < m.length; i++)
    if (t <= m[i]) {
      const k = (t - m[i - 1]) / Math.max(1e-6, m[i] - m[i - 1]);
      return [f.lon[i - 1] + (f.lon[i] - f.lon[i - 1]) * k, f.lat[i - 1] + (f.lat[i] - f.lat[i - 1]) * k];
    }
  return [f.lon[m.length - 1], f.lat[m.length - 1]];
}

export const minuteOf = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
