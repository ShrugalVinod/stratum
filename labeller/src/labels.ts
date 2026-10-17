// Label data model and rules (pure functions, unit-tested).
// Coordinates: [row, col] in package pixels, pixel CENTRES at integers (0…255), north-up.
// stratum/labelling/packages.py maps them back to the stored satellite crop.
import { strToU8, zipSync } from "fflate";

export const APP_VERSION = "1.0.0";
export const MIN_LENGTH_PX = 10; // labelling guide rule 1 (pre-registered)

export type Pt = [number, number];
export type Confidence = "sure" | "uncertain";
export type Status = "clear" | "partly_obscured" | "obscured";
export type Obj = { id: string; polyline_px: Pt[]; confidence: Confidence; source?: string };

export type SceneLabel = {
  scene_id: string;
  labeller: string;
  app_version: string;
  package_version: string;
  scene_status: Status | null;
  flags: { no_contrails: boolean; unusable: boolean; unusable_reason: string };
  objects: Obj[];
  started_at: string;
  updated_at: string;
  time_spent_s: number;
};

export function emptyLabel(scene_id: string, labeller: string, package_version: string, now = new Date()): SceneLabel {
  return {
    scene_id,
    labeller,
    app_version: APP_VERSION,
    package_version,
    scene_status: null,
    flags: { no_contrails: false, unusable: false, unusable_reason: "" },
    objects: [],
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
    time_spent_s: 0,
  };
}

export function polyLength(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

/** Drop consecutive points closer than `eps` (a double-click adds the last point twice). */
export function dedupe(p: Pt[], eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= eps) out.push(q);
  }
  return out;
}

/** Distance from a point to a polyline (same units as the points). */
export function distToPoly(q: Pt, p: Pt[]): number {
  if (p.length === 1) return Math.hypot(q[0] - p[0][0], q[1] - p[0][1]);
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const [ar, ac] = p[i - 1];
    const [br, bc] = p[i];
    const dr = br - ar;
    const dc = bc - ac;
    const L2 = dr * dr + dc * dc || 1e-12;
    const t = Math.max(0, Math.min(1, ((q[0] - ar) * dr + (q[1] - ac) * dc) / L2));
    best = Math.min(best, Math.hypot(q[0] - (ar + t * dr), q[1] - (ac + t * dc)));
  }
  return best;
}

/** A scene is done when its status is set and it has lines, or "no contrails", or "unusable". */
export function isComplete(l: SceneLabel | undefined): boolean {
  if (!l) return false;
  if (l.flags.unusable) return l.flags.unusable_reason.trim().length > 0;
  return l.scene_status !== null && (l.objects.length > 0 || l.flags.no_contrails);
}

export function problems(l: SceneLabel): string[] {
  const out: string[] = [];
  if (!l.flags.unusable && l.scene_status === null) out.push("Set the scene status (clear / partly obscured / obscured).");
  if (!l.flags.unusable && l.objects.length === 0 && !l.flags.no_contrails) out.push("Draw the contrails, or press “No contrails”.");
  if (l.flags.unusable && !l.flags.unusable_reason.trim()) out.push("Say why the scene is unusable.");
  if (l.objects.some((o) => polyLength(o.polyline_px) < MIN_LENGTH_PX)) out.push("A line is shorter than 10 px (rule 1).");
  return out;
}

// Each labeller sees the scenes in their own fixed random order (same order after a reload).
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededOrder(ids: string[], key: string): string[] {
  const rnd = mulberry32(fnv1a(key));
  const a = [...ids].sort();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── browser storage (autosave; may be unavailable in private windows) ──────
const KEY = (labeller: string, sid: string) => `stratum-labeller:v1:${labeller}:${sid}`;
export function loadSaved(labeller: string, sid: string): SceneLabel | undefined {
  try {
    const raw = localStorage.getItem(KEY(labeller, sid));
    return raw ? (JSON.parse(raw) as SceneLabel) : undefined;
  } catch {
    return undefined;
  }
}
export function save(l: SceneLabel): boolean {
  try {
    localStorage.setItem(KEY(l.labeller, l.scene_id), JSON.stringify(l));
    return true;
  } catch {
    return false;
  }
}

/** One zip: <folder>/<scene_id>.json per label + a small summary. */
export function exportZip(labels: SceneLabel[], folder: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const l of labels) files[`${folder}/${l.scene_id}.json`] = strToU8(JSON.stringify(round(l), null, 1));
  files[`${folder}/_export.json`] = strToU8(
    JSON.stringify(
      {
        labeller: folder,
        app_version: APP_VERSION,
        exported_at: new Date().toISOString(),
        scenes: labels.length,
        complete: labels.filter(isComplete).length,
      },
      null,
      1,
    ),
  );
  return zipSync(files, { level: 6 });
}

function round(l: SceneLabel): SceneLabel {
  return { ...l, objects: l.objects.map((o) => ({ ...o, polyline_px: o.polyline_px.map(([r, c]) => [Math.round(r * 100) / 100, Math.round(c * 100) / 100] as Pt) })) };
}
