import { describe, expect, it } from "vitest";
import { cell, COMMERCIAL, fromOpenSky, fromReadsb, merge, outlookStale, slim } from "../worker/live.js";

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

  it("reads OpenSky state vectors in feet and knots and drops ground, low and private traffic", () => {
    const st = [
      ["800abc", "IGO519P ", "India", 1000, 1001, 77.5, 12.97, 10972.8, false, 231.5, 41.6, 0, null, 11200, null, false, 0],
      ["800abd", "AIC101  ", "India", 1000, 1001, 77.5, 12.9, 4000, false, 150, 10, 0, null, 4100, null, false, 0],
      ["800abe", "VTABC   ", "India", 1000, 1001, 77.5, 12.9, 11000, false, 200, 10, 0, null, 11100, null, false, 0],
      ["800abf", "AIC102  ", "India", 1000, 1001, 77.5, 12.9, 11000, true, 0, 10, 0, null, 11100, null, false, 0],
    ];
    const out = fromOpenSky(st);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "IGO519P", cs: "IGO519P", alt: 36000, gs: 450, trk: 42, t: 1_000_000 });
  });

  it("merges sources by callsign: the freshest position, the known type, no address", () => {
    const now = 2_000_000;
    // the Action's snapshot: plain records without a key
    const os = [{ cs: "IGO519P", type: null, alt: 36000, lat: 13.0, lon: 77.5, trk: 42, gs: 450, t: 1_990_000 }];
    const fi = fromReadsb([{ hex: "800abc", flight: "IGO519P", alt_baro: 36000, lat: 13.1, lon: 77.6, t: "A20N", track: 42, gs: 452, seen_pos: 1 }], now);
    const lol = fromReadsb([{ hex: "800def", flight: "AXB639", alt_baro: 36000, lat: 14, lon: 76, t: "B738", seen_pos: 5 }], now);
    const m = merge(os, fi, lol);
    expect(m).toHaveLength(2);
    const igo = m.find((a) => a.cs === "IGO519P")!;
    expect([igo.lat, igo.type]).toEqual([13.1, "A20N"]); // adsb.fi is newer (1 s old vs 10 s)
    expect(JSON.stringify(m)).not.toContain("800abc");
  });
});

describe("forecast freshness", () => {
  const at = (iso: string) => Date.parse(iso);
  it("asks for today's build only once today's open data are out", () => {
    expect(outlookStale("2026-10-22T00:00Z", at("2026-10-23T08:00:00Z"))).toBe(false); // too early
    expect(outlookStale("2026-10-22T00:00Z", at("2026-10-23T10:25:00Z"))).toBe(true);
    expect(outlookStale("2026-10-23T00:00Z", at("2026-10-23T23:59:00Z"))).toBe(false); // already today's
    expect(outlookStale(undefined, at("2026-10-23T10:00:00Z"))).toBe(true);
  });
});
