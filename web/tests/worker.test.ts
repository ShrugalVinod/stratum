import { describe, expect, it } from "vitest";
import { cell, COMMERCIAL, slim } from "../worker/live.js";

describe("live aircraft proxy", () => {
  it("keeps cruising airline flights and drops everything identifying or irrelevant", () => {
    const now = 1_000_000;
    const out = slim(
      [
        { flight: "IGO519P ", alt_baro: 32000, lat: 12.97123456, lon: 77.5, t: "A20N", track: 41.6, gs: 452.2, seen_pos: 2, hex: "800abc" },
        { flight: "VTABC   ", alt_baro: 35000, lat: 12, lon: 77 }, // private registration
        { flight: "AIC101  ", alt_baro: 15000, lat: 12, lon: 77 }, // climbing, below FL200
        { flight: "UAE566  ", alt_baro: "ground", lat: 12, lon: 77 },
        { alt_baro: 36000, lat: 12, lon: 77 }, // no callsign
      ],
      now,
    );
    expect(out).toEqual([{ cs: "IGO519P", type: "A20N", alt: 32000, lat: 12.9712, lon: 77.5, trk: 42, gs: 452, t: now - 2000 }]);
    expect(JSON.stringify(out)).not.toContain("800abc");
  });

  it("rounds positions to shared 0.5° cells and refuses points outside the region", () => {
    expect(cell("12.97", 4, 39)).toBe(13);
    expect(cell("77.24", 66, 100)).toBe(77);
    expect(cell("51.5", 4, 39)).toBeNull();
    expect(cell("abc", 4, 39)).toBeNull();
    expect(COMMERCIAL.test("AIC2")).toBe(true);
    expect(COMMERCIAL.test("N123AB")).toBe(false);
  });
});
