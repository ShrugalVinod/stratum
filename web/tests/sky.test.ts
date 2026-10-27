import { describe, expect, it } from "vitest";
import { moveShare, sunAt, yOf } from "../src/three/sky";

describe("the 3D sky", () => {
  it("eases a plane to its advised level over five minutes and back after its stretch", () => {
    const m = { t0: 100, t1: 130, dFl: -20 };
    expect(moveShare(m, 90)).toBe(0); // before the climb or descent starts
    expect(moveShare(m, 97.5)).toBeCloseTo(0.5); // halfway down
    expect(moveShare(m, 100)).toBe(1);
    expect(moveShare(m, 120)).toBe(1); // the whole stretch at the advised level
    expect(moveShare(m, 132.5)).toBeCloseTo(0.5); // halfway back
    expect(moveShare(m, 136)).toBe(0);
  });

  it("puts the sun where it is over India: high at midday, below the horizon at midnight", () => {
    const noon = sunAt("2026-02-01", 6 * 60 + 40); // ~12:10 IST, local solar noon
    expect(noon.elev).toBeGreaterThan(50);
    expect(noon.elev).toBeLessThan(55); // 90 − 22 − 17 (February declination)
    expect(noon.az).toBeGreaterThan(160); // due south, give or take
    expect(noon.az).toBeLessThan(200);
    expect(sunAt("2026-02-01", 18 * 60 + 30).elev).toBeLessThan(-40); // midnight IST
    // sunset at 22°N 80°E on 1 Feb: hour angle acos(−tan 22° tan −17.3°) ≈ 82.9° → 17:32 solar ≈ 17:55 IST
    const evening = sunAt("2026-02-01", 12 * 60 + 25);
    expect(Math.abs(evening.elev)).toBeLessThan(3);
    expect(evening.az).toBeGreaterThan(250); // in the west
  });

  it("stretches heights 40 times: FL350 sits a few degrees above the ground", () => {
    expect(yOf(350)).toBeCloseTo((350 * 30.48 * 40) / 1000 / 111.2, 6);
    expect(yOf(390) - yOf(350)).toBeCloseTo(yOf(40), 6);
  });
});
