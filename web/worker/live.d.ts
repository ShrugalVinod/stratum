// Types for worker/live.js (used by the unit tests and the dev server).
export const COMMERCIAL: RegExp;
export const USER_AGENT: string;
export function cell(v: unknown, lo: number, hi: number): number | null;
export type LiveAircraft = { cs: string; type: string | null; alt: number; lat: number; lon: number; trk: number | null; gs: number | null; t: number };
export function slim(ac: unknown[] | undefined, now: number): LiveAircraft[];
export const MIN_ALT_FT: number;
