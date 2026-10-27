import { describe, expect, it } from "vitest";
import type { Manifest, ScheduledFlight } from "../src/data/contract";
import { advise, b1At, co2At, legOf, routePosition, type Sample, sampler, type Stop, stretches, totals, track, upcoming, usualLevel } from "../src/lib/advice";
import { co2eKg, cruisePath, EF_PER_MIN_J, type Point } from "../src/lib/footprint";

const T0 = Date.parse("2026-10-27T06:00:00Z");
// a made-up sky: lasting-contrail air at FL360 and FL380 between 76°E and 78°E, dry elsewhere
const sky: Sample = (_t, fl, _lat, lon) => (fl >= 360 && fl <= 380 && lon >= 76 && lon <= 78 ? 1 : 0);
// due east along 20°N, one point a minute, ~14 km a minute
const eastPath = (n: number): Point[] => Array.from({ length: n }, (_, i) => ({ lat: 20, lon: 74 + i * 0.13, t: T0 + i * 60_000 }));
const DEL: Stop = ["DEL", 28.5556, 77.0952];
const BOM: Stop = ["BOM", 19.0887, 72.8679];

describe("contrail advice for one cruise", () => {
  it("advises the nearest dry level, only around the humid stretch, net of its extra fuel", () => {
    const p = eastPath(40);
    const a = advise(p, 360, "A20N", sky);
    const humid = p.filter((x) => x.lon >= 76 && x.lon <= 78).length;
    expect(a.nLasting).toBe(humid);
    expect(a.alt).toBe(340); // FL380 is humid too; FL340 is the dry level 2,000 ft away
    expect(a.altLasting).toBe(0);
    expect(a.to - a.from).toBe(humid + 10); // 5 minutes either side
    const extraCo2 = (co2At("A20N", 340)! - co2At("A20N", 360)!) * (a.to - a.from);
    expect(a.extraFuelKg).toBeCloseTo(extraCo2 / 3.16, 6);
    expect(a.avoided.p50).toBeCloseTo(humid * co2eKg(EF_PER_MIN_J.p50) - extraCo2, 6);
    expect(a.avoided.low).toBeCloseTo(humid * co2eKg(EF_PER_MIN_J.p25) - extraCo2, 6);
    expect(a.alert).toBe(true);
  });

  it("changes level only over each humid stretch, joining stretches less than 10 minutes apart", () => {
    const at = (...idx: number[]) => Array.from({ length: 60 }, (_, i) => idx.includes(i));
    expect(stretches(at(10, 11, 12), 5)).toEqual([[5, 18]]);
    expect(stretches(at(10, 19), 5)).toEqual([[5, 25]]); // 9 minutes apart: one stretch
    expect(stretches(at(10, 40), 5)).toEqual([[5, 16], [35, 46]]); // two level changes
    expect(stretches(at(0, 59), 5)).toEqual([[0, 6], [54, 60]]);
    // two humid patches far apart: the extra fuel is for 2 × 11 minutes, not the 41 between
    const two: Sample = (_t, fl, _la, lon) => (fl === 360 && (Math.abs(lon - 75.3) < 0.01 || Math.abs(lon - 79.2) < 0.01) ? 1 : 0);
    const p = eastPath(60);
    const a = advise(p, 360, "A20N", two);
    expect(a.nLasting).toBe(2);
    expect(a.spans).toHaveLength(2);
    expect(a.extraFuelKg).toBeCloseTo(((co2At("A20N", 380)! - co2At("A20N", 360)!) * 22) / 3.16, 6);
  });

  it("gives no advice in dry air, and none when every nearby level is humid", () => {
    expect(advise(eastPath(10), 360, "A20N", sky).alt).toBeNull(); // still west of 76°E
    const wet: Sample = () => 1;
    const a = advise(eastPath(40), 360, "A20N", wet);
    expect(a.nLasting).toBe(40);
    expect(a.alt).toBeNull();
    expect(a.alert).toBe(false);
  });

  it("judges odd levels between the forecast's levels, and never advises outside FL280–FL420", () => {
    const half: Sample = (_t, fl) => (fl === 360 ? 1 : 0);
    expect(b1At(half, eastPath(1)[0], 370)).toBeCloseTo(0.5);
    expect(b1At(half, eastPath(1)[0], 350)).toBeCloseTo(0.5);
    expect(co2At("A20N", 370)).toBeCloseTo((co2At("A20N", 360)! + co2At("A20N", 380)!) / 2);
    const high: Sample = (_t, fl) => (fl === 420 ? 1 : 0);
    const a = advise(eastPath(20), 420, "B77W", high);
    expect(a.alt).toBe(400); // FL440 is not offered
    const a20n = advise(eastPath(40), 380, "A20N", (_t, fl, _la, lon) => (fl <= 380 && lon >= 76 && lon <= 78 ? 1 : 0));
    expect(a20n.alt).toBeNull(); // FL400 is dry but above the A320neo's ceiling, FL360/340 humid
  });

  it("reads the outlook's hour sprites like the rest of the site", () => {
    const m = { days: ["2026-10-27"], grid: { lat_north: 37, lat_south: 6, lon_west: 68, lon_east: 98, rows: 125, cols: 121, step_deg: 0.25 }, layers: [{ id: "B1", file: "x", full_scale: 1 }] } as unknown as Manifest;
    const width = 121 * 24;
    const data = new Uint8Array(125 * width);
    const r = Math.round((37 - 20) / 0.25);
    const c = Math.round((77 - 68) / 0.25);
    data[r * width + 6 * 121 + c] = 255; // 06 UTC
    const s = sampler(m, new Map([["2026-10-27|360", { data, width, height: 125 }]]));
    expect(s(T0 + 10 * 60_000, 360, 20, 77)).toBe(1);
    expect(s(T0 + 70 * 60_000, 360, 20, 77)).toBe(0); // 07 UTC
    expect(s(T0, 340, 20, 77)).toBeNull(); // level not loaded
    expect(s(T0, 360, 50, 77)).toBeNull(); // outside the grid
  });
});

describe("airliners in the air now", () => {
  it("uses a route only when the aircraft is on it and heading for the next stop", () => {
    // halfway Delhi → Mumbai, heading south-west
    expect(legOf([DEL, BOM], 23.8, 75, 215)?.[1][0]).toBe("BOM");
    expect(legOf([DEL, BOM], 23.8, 75, 35)).toBeNull(); // flying the other way: stale route
    expect(legOf([DEL, BOM], 13, 80, 215)).toBeNull(); // far off the route
    expect(legOf([["BLR", 13.2, 77.7], DEL, BOM], 23.8, 75, 215)?.[0][0]).toBe("DEL"); // second leg
  });

  it("skips aircraft that are climbing, too low, turboprops, or about to land", () => {
    const base = { cs: "IGO1", type: "A20N", alt: 36000, lat: 23.8, lon: 75, trk: 215, gs: 450, t: T0, vs: 0, route: [DEL, BOM] };
    expect(track({ ...base, vs: 1800 }, T0, sky).status).toBe("climb");
    expect(track({ ...base, alt: 24000 }, T0, sky).status).toBe("low");
    expect(track({ ...base, alt: 43000 }, T0, sky).status).toBe("high");
    expect(track({ ...base, type: "AT76" }, T0, sky).status).toBe("turboprop");
    expect(track({ ...base, lat: 19.5, lon: 73.2 }, T0, sky).status).toBe("landing");
    const t = track(base, T0, sky);
    expect(t.status).toBe("cruise");
    expect(t.fl).toBe(360);
    expect(t.to?.[0]).toBe("BOM");
    expect(t.path.length).toBeGreaterThan(20); // to Mumbai's descent
  });

  it("moves the aircraft on from its last report", () => {
    const t = track({ cs: "IGO1", type: null, alt: 36000, lat: 20, lon: 74, trk: 90, gs: 450, t: T0 - 60_000 }, T0, sky);
    expect(t.lon - 74).toBeCloseTo((450 * 1.852) / 60 / (111.2 * Math.cos((20 * Math.PI) / 180)), 2);
    expect(t.path).toHaveLength(60); // no route: the next hour on its heading
  });
});

describe("flights expected in the next hours", () => {
  const flight = (cs: string, dep: number): ScheduledFlight => ({ cs, type: "A20N", from: DEL, to: BOM, dep, acc: 10, block: 125 });
  const now = Date.parse("2026-10-27T05:30:00Z");

  it("keeps departures in the window, tomorrow's early ones too, and not flights already flying", () => {
    const level = usualLevel([]);
    const list = [flight("A", 300), flight("B", 400), flight("C", 2), flight("D", 360), flight("E", 1000)];
    const up = upcoming(list, now, 20, new Set(["D"]), level, sky);
    expect(up.map((u) => u.cs)).toEqual(["B", "E", "C"]); // A left at 05:00; C at 00:02 tomorrow
    expect(up[0].fl).toBe(360); // westbound, no live reference: FL360
    expect(up[0].flHow).toBe("rule");
  });

  it("takes the planned level from airliners flying the same route now", () => {
    const flying = track({ cs: "X", type: "A20N", alt: 34000, lat: 23.8, lon: 75, trk: 215, gs: 450, t: now, vs: 0, route: [DEL, BOM] }, now, sky);
    const lv = usualLevel([flying]);
    expect(lv(DEL, BOM)).toEqual({ fl: 340, how: "route" });
    expect(lv(["BLR", 13.2, 77.7], ["CCU", 22.65, 88.45]).how).toBe("rule"); // eastbound, no match
  });

  it("puts the plane where the advice path says it is", () => {
    const [u] = upcoming([flight("B", 400)], now, 20, new Set(), usualLevel([]), sky);
    expect(routePosition(u, u.dep - 1)).toBeNull();
    expect(routePosition(u, u.dep)!.slice(0, 2)).toEqual([DEL[2], DEL[1]]);
    const mid = u.path[10];
    const p = routePosition(u, mid.t)!;
    expect(p[0]).toBeCloseTo(mid.lon, 6);
    expect(p[1]).toBeCloseTo(mid.lat, 6);
    expect(u.path).toEqual(cruisePath({ lat: DEL[1], lon: DEL[2] }, { lat: BOM[1], lon: BOM[2] }, u.dep));
  });

  it("adds up only the alerts", () => {
    const a = advise(eastPath(40), 360, "A20N", sky);
    const none = advise(eastPath(10), 360, "A20N", sky);
    const t = totals([a, none, null]);
    expect(t.n).toBe(1);
    expect(t.p50).toBeCloseTo(a.avoided.p50);
    expect(t.fuel).toBeCloseTo(a.extraFuelKg);
  });
});
