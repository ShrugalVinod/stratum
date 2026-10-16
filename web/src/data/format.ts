// Small pure helpers (unit-tested): time, energy, colour.
import { CIVIDIS } from "./cividis";

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** 2.13e12 → "2.1 × 10¹² J" (null → "—"). */
export function joules(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0 J";
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return `${m.toFixed(1)} × 10${String(e).split("").map((c) => SUP[c]).join("")} J`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026-01-01T06:12:30Z" → { utc: "06:12", ist: "11:42" } */
export function clock(iso: string): { utc: string; ist: string; minutes: number } {
  const hh = Number(iso.slice(11, 13));
  const mm = Number(iso.slice(14, 16));
  const m = hh * 60 + mm;
  const ist = (m + 330) % 1440;
  return { utc: `${pad2(hh)}:${pad2(mm)}`, ist: `${pad2(Math.floor(ist / 60))}:${pad2(ist % 60)}`, minutes: m };
}

export function hourLabel(h: number): { utc: string; ist: string } {
  const ist = (h * 60 + 330) % 1440;
  return { utc: `${pad2(h)}:00`, ist: `${pad2(Math.floor(ist / 60))}:${pad2(ist % 60)}` };
}

/** Grey grid bytes → RGBA with the cividis ramp; 0 is fully transparent. */
export function colourise(bytes: Uint8Array, maxAlpha = 0.85): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bytes.length * 4);
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    if (v === 0) continue;
    const k = Math.min(255, 70 + Math.round((v / 255) * 185)); // start mid-ramp so small fractions stay visible
    out[i * 4] = CIVIDIS[k * 3];
    out[i * 4 + 1] = CIVIDIS[k * 3 + 1];
    out[i * 4 + 2] = CIVIDIS[k * 3 + 2];
    out[i * 4 + 3] = Math.round(255 * maxAlpha * (0.45 + 0.55 * (v / 255)));
  }
  return out;
}

export type MapState = { date: string | null; hour: number; fl: number; seg: string | null };

export function parseState(search: string, defaults: MapState): MapState {
  const q = new URLSearchParams(search);
  const hour = Number(q.get("hour"));
  const fl = Number(q.get("fl"));
  return {
    date: q.get("date") ?? defaults.date,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 && q.has("hour") ? hour : defaults.hour,
    fl: Number.isInteger(fl) && q.has("fl") ? fl : defaults.fl,
    seg: q.get("seg") ?? defaults.seg,
  };
}

export function stateQuery(s: MapState): string {
  const q = new URLSearchParams();
  if (s.date) q.set("date", s.date);
  q.set("hour", pad2(s.hour));
  q.set("fl", String(s.fl));
  if (s.seg) q.set("seg", s.seg);
  return `?${q.toString()}`;
}
