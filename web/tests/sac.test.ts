import { describe, expect, it } from "vitest";
import { eIce, eWater, isaPressure, sac } from "../src/lib/sac";

// Reference values from stratum.physics.sac.schmidt_appleman (Python), T in °C, p in Pa.
const CASES = [
  { T: -50, rhi: 0.8, p: 23842, eta: 0.3, G: 1.56534, TLM: -42.4066, TLC: -49.6985, forms: true, persists: false },
  { T: -45, rhi: 1.1, p: 23842, eta: 0.35, G: 1.68575, TLM: -41.634, TLC: -47.5388, forms: false, persists: false },
  { T: -40, rhi: 1.2, p: 19677, eta: 0.4, G: 1.50721, TLM: -42.7988, TLC: -47.6913, forms: false, persists: false },
  { T: -60, rhi: 0.5, p: 19677, eta: 0.3, G: 1.29189, TLM: -44.3791, TLC: -52.5067, forms: true, persists: false },
  { T: -38, rhi: 1.3, p: 26500, eta: 0.45, G: 2.21436, TLM: -38.7351, TLC: -42.6806, forms: false, persists: false },
  { T: -55, rhi: 1.1, p: 23842, eta: 0.35, G: 1.68575, TLM: -41.634, TLC: -47.9594, forms: true, persists: true },
  { T: -52, rhi: 1.0, p: 23842, eta: 0.3, G: 1.56534, TLM: -42.4066, TLC: -49.0049, forms: true, persists: true },
];

describe("Schmidt–Appleman in the browser matches stratum.physics", () => {
  it("saturation pressures (Murphy & Koop)", () => {
    expect(eWater(230)).toBeCloseTo(13.554135432425777, 9);
    expect(eIce(230)).toBeCloseTo(8.949694385781816, 9);
  });
  it.each(CASES)("T $T °C, RHi $rhi, p $p Pa, η $eta", (c) => {
    const r = sac(c.T + 273.15, c.rhi, c.p, c.eta);
    expect(r.G).toBeCloseTo(c.G, 4);
    expect(r.TLM - 273.15).toBeCloseTo(c.TLM, 3);
    expect(r.TLC - 273.15).toBeCloseTo(c.TLC, 3);
    expect(r.forms).toBe(c.forms);
    expect(r.persists).toBe(c.persists);
  });
  it("ISA pressure: FL300 ≈ 30,090 Pa, FL390 ≈ 19,680 Pa", () => {
    expect(isaPressure(300)).toBeCloseTo(30_090, -2);
    expect(isaPressure(390)).toBeCloseTo(19_680, -2);
  });
});
