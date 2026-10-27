import { describe, expect, it } from "vitest";
import type { FlaggedSegment } from "../src/data/contract";
import { contrailAt, DEFAULT_LIFE_H, position, stretches, tally } from "../src/lib/replay";

const DAY = "2026-02-01";
const seg = (o: Partial<FlaggedSegment>): FlaggedSegment => ({ flight_id: "f1", callsign: "IGO1", fl: 360, lon_start: 77, lat_start: 20, lon_end: 78, lat_end: 21, ...o }) as FlaggedSegment;

describe("what if we'd listened", () => {
  const w = [
    seg({ segment_id: "a", time_utc: `${DAY}T12:00:00Z`, time_end_utc: `${DAY}T12:30:00Z`, alert: true, best_alternative_fl: 340, extra_fuel_kg: 80, net_warming_avoided_100y_range: [5_000, 12_000, 20_000] }),
    seg({ segment_id: "b", flight_id: "f2", time_utc: `${DAY}T06:00:00Z`, time_end_utc: `${DAY}T06:20:00Z`, alert: false }),
  ];
  const b1 = [
    seg({ time_utc: `${DAY}T12:10:00Z`, time_end_utc: `${DAY}T12:11:00Z`, contrail_age_h: 5 }),
    seg({ time_utc: `${DAY}T15:00:00Z`, time_end_utc: `${DAY}T15:01:00Z`, contrail_age_h: 9 }), // same flight, not overlapping
  ];
  const list = stretches(DAY, w, b1);

  it("orders stretches by time and takes each lifetime from CoCiP for the same stretch", () => {
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    const a = list[1];
    expect([a.t0, a.t1, a.alt, a.fuelKg, a.lifeH]).toEqual([720, 750, 340, 80, 5]);
    expect(list[0].lifeH).toBe(DEFAULT_LIFE_H); // no CoCiP contrail for that flight
  });

  it("draws a contrail along its stretch, then lets it age out", () => {
    const a = list[1];
    expect(contrailAt(a, 719)).toBeNull();
    expect(contrailAt(a, 735)).toEqual({ drawn: 0.5, age: 0 });
    expect(contrailAt(a, 750 + 150)!.age).toBeCloseTo(0.5);
    expect(contrailAt(a, 750 + 301)).toBeNull();
  });

  it("counts advice and lasting contrails as the day goes on", () => {
    expect(tally(list, 500)).toMatchObject({ alerts: 0, lasting: 1, lastingIfListened: 1 }); // b lasts until 09:20
    const t = tally(list, 740);
    expect(t).toMatchObject({ alerts: 1, fuelKg: 80, lasting: 1, lastingIfListened: 0 });
    expect(t.avoided).toEqual([5_000, 12_000, 20_000]);
  });

  it("moves planes along their tracks only while they fly", () => {
    const tr = { mins: [0, 10], xy: [[70, 10], [80, 20]] as [number, number][] };
    expect(position(tr, 5)).toEqual([75, 15]);
    expect(position(tr, 11)).toBeNull();
  });
});
