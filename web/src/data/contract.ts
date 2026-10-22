// Web data contract v2 — mirrors stratum/export/schemas.py (pydantic). Every file is
// validated on load; a mismatch shows an error instead of silently wrong numbers. The v2
// (Phase 8) fields are optional, so a v1 build still validates.
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
  encoding: z.enum(["png_uint8_fraction_of_hour", "png_uint8_hour_sprite"]),
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
  models: z.array(z.object({ id: z.enum(["B1", "B3", "STRATUM"]), label: z.string(), description: z.string() })).nullish(),
  layers: z
    .array(z.object({ id: z.string(), file: z.string(), per_flight_level: z.boolean(), full_scale: z.number(), meaning: z.string() }))
    .nullish(),
  results_file: z.string().nullish(),
});
export type Manifest = z.infer<typeof Manifest>;
export type ModelId = "B1" | "B3" | "STRATUM";

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
  n_flagged_by_model: z.record(z.string(), z.number().int()).nullish(),
  n_alerts: z.number().int().nullish(),
  has_observability: z.boolean().nullish(),
  layers: z.array(z.string()).nullish(),
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
  flagged_models: z.array(z.string()).nullish(),
  alert: z.boolean().nullish(),
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

export const Alternative = z.object({
  delta_ft: z.number().int(),
  fl: z.number().int(),
  feasible: z.boolean(),
  reason: z.string(),
  extra_fuel_kg: z.number().nullable(),
  net_20y: z.array(z.number()).nullable(),
  net_100y: z.array(z.number()).nullable(),
});
export type Alternative = z.infer<typeof Alternative>;

export const Profile = z.object({
  pressure_hpa: z.array(z.number()),
  fl: z.array(z.number()),
  rhi_raw: z.array(z.number().nullable()),
  rhi_b3: z.array(z.number().nullable()),
  rhi_stratum: z.array(z.number().nullable()),
  temperature_k: z.array(z.number().nullable()),
});
export type Profile = z.infer<typeof Profile>;

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
  // v2 (Phase 8)
  model: z.string().nullish(),
  time_end_utc: z.string().nullish(),
  n_segments: z.number().int().nullish(),
  alert: z.boolean().nullish(),
  alert_without_fuel_credit: z.boolean().nullish(),
  net_warming_avoided_20y_range: z.array(z.number()).nullish(),
  net_warming_avoided_100y_range: z.array(z.number()).nullish(),
  alternatives: z.array(Alternative).nullish(),
  alternatives_rejected: z.string().nullish(),
  profile: Profile.nullish(),
  commercial_only_note: z.string().nullish(),
});
export type FlaggedSegment = z.infer<typeof FlaggedSegment>;

/** Build-wide results (results.json): numbers copied from the logged final runs. Loosely typed
 *  beyond the fields the pages use, so a new field never breaks the site. */
const Est = z.object({ value: z.number(), lo: z.number(), hi: z.number() }).partial().passthrough();
export const Hypothesis = z
  .object({ id: z.string(), verdict: z.string(), statistic: z.string(), rule: z.string(), estimate: Est.nullish(), run_id: z.string().nullish() })
  .passthrough();
export const Results = z
  .object({ generated_from: z.array(z.string()), hypotheses: z.array(Hypothesis), final_runs: z.array(z.record(z.string(), z.unknown())) })
  .passthrough();
export type Results = z.infer<typeof Results>;

/** Contrail proof viewer (data/contrails-<track>/): satellite-confirmed contrails, each with
 *  Meteosat crops and three overlays in the crop's pixel grid ([x, y] = [column, row]). */
const XY = z.array(z.tuple([z.number(), z.number()]));
export const ContrailSlot = z.object({
  t: z.string(),
  img: z.string(),
  w: z.number().int(),
  h: z.number().int(),
  age_min: z.number(),
  vza_deg: z.number().nullish(),
  track: z.array(XY),
  drift: z.array(XY),
  detected: z.array(z.object({ pts: XY, matched: z.boolean(), lat: z.array(z.number()), lon: z.array(z.number()) })),
  match_px: z.number().nullish(),
});
export const ContrailEvent = z.object({
  id: z.string(),
  flight_id: z.string(),
  callsign: z.string().nullish(),
  airline: z.string().nullish(),
  aircraft_type: z.string().nullish(),
  fl: z.number().nullish(),
  t_start: z.string(),
  t_end: z.string(),
  segments: z.number().int(),
  lat: z.number(),
  lon: z.number(),
  slots: z.array(ContrailSlot),
});
export type ContrailEvent = z.infer<typeof ContrailEvent>;
export const ContrailIndex = z.object({
  track: z.string(),
  detector: z.string(),
  days: z.record(z.string(), z.number()),
  events: z.number(),
  credit: z.string(),
  note: z.string().nullish(),
});
export type ContrailIndex = z.infer<typeof ContrailIndex>;
