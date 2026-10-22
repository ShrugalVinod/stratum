// Types for worker/live.js (used by the unit tests and the dev server).
export const COMMERCIAL: RegExp;
export const USER_AGENT: string;
export const MIN_ALT_FT: number;
export const INDIA_BOX: { lamin: number; lomin: number; lamax: number; lomax: number };
export function cell(v: unknown, lo: number, hi: number): number | null;
export type LiveAircraft = { cs: string; type: string | null; alt: number; lat: number; lon: number; trk: number | null; gs: number | null; t: number };
export type Keyed = LiveAircraft & { key: string };
export function fromReadsb(ac: unknown[] | undefined, now: number): Keyed[];
export function fromOpenSky(states: unknown[][] | undefined | null): Keyed[];
export function merge(...lists: (Keyed | LiveAircraft)[][]): LiveAircraft[];
export function slim(ac: unknown[] | undefined, now: number): LiveAircraft[];
