import { describe, expect, it } from "vitest";
import type { LiveAircraft } from "../src/data/contract";
import { distBearing } from "../src/lib/geo";
import { candidates, positionAt } from "../src/lib/spot";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const BLR: [number, number] = [12.97, 77.59];
const plane = (cs: string, lat: number, lon: number, trk: number, gs = 450): LiveAircraft => ({ cs, type: "A20N", alt: 36000, lat, lon, trk, gs, t: NOW });

describe("spot a contrail", () => {
  it("flies an aircraft backwards along its track", () => {
    const a = plane("IGO1", 13.5, 77.59, 0); // heading north at 450 kt ≈ 833 km/h
    const [la, lo] = positionAt(a, NOW - 30 * 60_000);
    expect(distBearing(13.5, 77.59, la, lo)[0]).toBeCloseTo(416.7, 0);
    expect(la).toBeLessThan(13.5);
    expect(lo).toBeCloseTo(77.59, 3);
  });

  it("finds the plane that crossed the sky before the photo and leaves out the others", () => {
    const over = plane("IGO1", 13.5, 77.59, 0); // passed overhead ≈ 4 min ago
    const far = plane("AIC2", 20.0, 85.0, 45); // never near
    const later = plane("AXB3", 12.5, 77.59, 0); // only gets here after the photo
    const c = candidates([over, far, later], BLR[0], BLR[1], NOW - 2 * 60_000, { bearing: null, height: "overhead" });
    expect(c.map((x) => x.cs)).toEqual(["IGO1"]);
    expect(c[0].passKm).toBeLessThan(2);
    expect(c[0].ageMin).toBeGreaterThan(0);
    expect(c[0].ageMin).toBeLessThan(5);
  });

  it("uses the direction the photographer looked", () => {
    const east = plane("QTR1", 12.97, 78.3, 0); // a north-south track ≈ 77 km east
    const west = plane("UAE1", 12.97, 76.9, 0);
    const look = { bearing: 90, height: "low" as const };
    const c = candidates([east, west], BLR[0], BLR[1], NOW, look);
    expect(c[0].cs).toBe("QTR1");
    expect(c.find((x) => x.cs === "UAE1")).toBeUndefined();
  });
});
