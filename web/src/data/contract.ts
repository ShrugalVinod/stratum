// Web data contract v1 — mirrors stratum/export/schemas.py (pydantic). Every file is
// validated on load; a mismatch shows an error instead of silently wrong numbers.
import { z } from "zod";

export const FlightLevelInfo = z.object({ fl: z.number().int(), pressure_hpa: z.number() });

export const GridMeta = z.object({
  lat_north: z.number(),
  lat_south: z.number(),
  lon_west: z.number(),
  lon_east: z.number(),
  rows: z.number().int(),
  cols: z.number().int(),
  step_deg: z.number(),
  encoding: z.literal("png_uint8_fraction_of_hour"),
});

export const Manifest = z.object({
  contract_version: z.string(),
  build_id: z.string(),
  created_at: z.string(),
  git_commit: z.string(),
  config_hash: z.string(),
  pipeline_version: z.string(),
  model_version: z.string(),
  days: z.array(z.string()),
  days_with_flights: z.array(z.string()),
  flight_levels: z.array(FlightLevelInfo),
  hours_utc: z.array(z.number().int()),
  grid: GridMeta,
  eta_for_grids: z.number(),
  coverage: z.object({ adsb_coverage_pct: z.number().nullable(), note: z.string() }),
  credits: z.array(z.string()),
});
export type Manifest = z.infer<typeof Manifest>;

export const DaySummary = z.object({
  date: z.string(),
  has_flights: z.boolean(),
  n_flights: z.number().int().nullable(),
  n_segments: z.number().int().nullable(),
  n_flagged: z.number().int().nullable(),
  ef_positive_J: z.number().nullable(),
  ef_negative_J: z.number().nullable(),
  grid_files: z.number().int(),
  quality_flags: z.array(z.string()),
});
export type DaySummary = z.infer<typeof DaySummary>;

const Direction = z.enum(["DEL-BOM", "BOM-DEL", "other"]);

export const FlightProps = z.object({
  flight_id: z.string(),
  callsign: z.string(),
  airline: z.string().nullable(),
  aircraft_type: z.string().nullable(),
  direction: Direction,
  t_start: z.string(),
  t_end: z.string(),
  minutes: z.array(z.number().int()),
  flagged: z.boolean(),
});
export type FlightProps = z.infer<typeof FlightProps>;

export const FlightFeature = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])) }),
  properties: FlightProps,
});
export type FlightFeature = z.infer<typeof FlightFeature>;
export const FlightCollection = z.object({ type: z.literal("FeatureCollection"), features: z.array(FlightFeature) });
/** Lighter check used in the browser: every property is validated, coordinates only by shape
 *  (the exporter already validated them; full checking of ~18k vertices costs ~0.5 s on a phone). */
export const FlightCollectionLite = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.any()).min(2) }),
      properties: FlightProps,
    }),
  ),
});

export const FlaggedSegment = z.object({
  segment_id: z.string(),
  flight_id: z.string(),
  callsign: z.string(),
  airline: z.string().nullable(),
  direction: Direction,
  time_utc: z.string(),
  fl: z.number().int(),
  lat: z.number(),
  lon: z.number(),
  lat_start: z.number(),
  lon_start: z.number(),
  lat_end: z.number(),
  lon_end: z.number(),
  night: z.boolean(),
  ef_J: z.number().nullable(),
  ef_p05_J: z.number().nullable(),
  ef_p50_J: z.number().nullable(),
  ef_p95_J: z.number().nullable(),
  ef_note: z.string(),
  contrail_age_h: z.number().nullable(),
  p_persistent: z.number().nullable(),
  best_alternative_fl: z.number().int().nullable(),
  extra_fuel_kg: z.number().nullable(),
  extra_co2_kg: z.number().nullable(),
  net_warming_avoided_20y: z.number().nullable(),
  net_warming_avoided_100y: z.number().nullable(),
  confidence_note: z.string(),
});
export type FlaggedSegment = z.infer<typeof FlaggedSegment>;
