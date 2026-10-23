import { describe, expect, it } from "vitest";
import { airport, co2eKg, co2PerMin, cruisePath, EF_PER_MIN_J, footprint, fuelType, hottest, type Point } from "../src/lib/footprint";

describe("your flight's footprint", () => {
  const blr = airport("BLR")!;
  const del = airport("DEL")!;

  it("cruises Bengaluru → Delhi for about 100 minutes, without climb and descent", () => {
    const p = cruisePath(blr, del, 0);
    expect(p.length).toBeGreaterThan(90);
    expect(p.length).toBeLessThan(110);
    expect(p[1].t - p[0].t).toBe(60_000);
    expect(p[p.length - 1].lat).toBeLessThan(del.lat); // stops before the descent
    expect(cruisePath(blr, airport("MAA")!, 0)).toHaveLength(0); // too short to cruise
  });

  it("maps ADS-B type codes to the fuel table and keeps neo below ceo", () => {
    expect(fuelType("A20N")).toBe("A20N");
    expect(fuelType("A21N")).toBe("A21N");
    expect(fuelType("B39M")).toBe("B38M");
    expect(fuelType("B77L")).toBe("B77W");
    expect(fuelType(null)).toBe("A20N");
    expect(co2PerMin("A20N", 360)!).toBeLessThan(co2PerMin("A320", 360)!);
    expect(co2PerMin("A20N", 420)).toBeNull(); // above the A320's ceiling
  });

  it("converts contrail energy forcing to CO₂e like the decision layer", () => {
    // 2.15e12 J × 0.42 / (9.17e-14 × 5.101e14 × 31,536,000) ≈ 612 kg (100 yr)
    expect(co2eKg(EF_PER_MIN_J.p50)).toBeCloseTo(612, -1);
    expect(co2eKg(1e12, 20) / co2eKg(1e12, 100)).toBeCloseTo(9.17 / 2.49, 3);
  });

  it("suggests another level only when it cuts lasting-contrail minutes", async () => {
    const path: Point[] = Array.from({ length: 30 }, (_, i) => ({ lat: 20, lon: 75, t: i * 60_000 }));
    // humid at FL380 and above; dry below
    const humid = await footprint(path, 380, "A20N", async (_p, fl) => (fl >= 380 ? 0.9 : 0));
    expect(humid.planned.lasting).toBe(30);
    expect(humid.best?.fl).toBe(360);
    expect(humid.warm.p50).toBeCloseTo(30 * co2eKg(EF_PER_MIN_J.p50), 3);
    // dry everywhere: a lower-fuel level is not contrail advice
    const dry = await footprint(path, 340, "A20N", async () => 0);
    expect(dry.best).toBeNull();
    expect(dry.warm.p50).toBe(0);
  });

  it("finds the most contrail-prone trips, one per route", async () => {
    const hot = await hottest(["BLR", "DEL", "BOM"], [0, 3_600_000], 360, async (p) => (p.lat > 20 ? 1 : 0));
    expect(hot.length).toBeGreaterThan(0);
    expect(new Set(hot.map((h) => h.from + h.to)).size).toBe(hot.length);
    expect(hot[0].lasting).toBeGreaterThanOrEqual(hot[hot.length - 1].lasting);
  });
});
