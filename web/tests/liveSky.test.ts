import { describe, expect, it } from "vitest";
import type { Sample } from "../src/lib/advice";
import { buildLiveSky } from "../src/lib/liveSky";

const AT = Date.parse("2026-10-29T12:00:00Z");
// lasting-contrail air at FL360 and FL380 between 76°E and 78°E only
const sky: Sample = (_t, fl, _lat, lon) => (fl >= 360 && fl <= 380 && lon >= 76 && lon <= 78 ? 1 : 0);
const plane = (cs: string, lon: number, alt = 36000) => ({ cs, type: "A20N", alt, lat: 20, lon, trk: 90, gs: 450, t: AT, vs: 0, route: null });

describe("the live 3D sky", () => {
  it("puts each airliner on its path ahead, in minutes of today, with its contrails and its advice", () => {
    const { flights, contrails, alerts } = buildLiveSky([plane("IGO1", 74), plane("IGO2", 80)], AT, sky);
    expect(flights).toHaveLength(2);
    expect(flights[0].mins[0]).toBe(12 * 60); // now
    expect(flights[0].fl).toBe(360);
    // IGO1 flies east into the humid band: lasting contrails there, advised away from them
    const mine = contrails.filter((c) => c.flight === "live-IGO1");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.t1 - c.t0 <= 9 && c.moved)).toBe(true);
    expect(alerts.map((a) => a.cs)).toEqual(["IGO1"]);
    expect(flights[0].moves?.[0].dFl).toBe(alerts[0].alt - 360);
    // IGO2 is already east of the band: nothing to advise
    expect(contrails.some((c) => c.flight === "live-IGO2")).toBe(false);
    expect(flights[1].moves).toEqual([]);
  });

  it("still draws an aircraft that is climbing, an hour along its heading", () => {
    const { flights } = buildLiveSky([{ ...plane("IGO3", 74), vs: 2000 }], AT, sky);
    expect(flights[0].mins).toEqual([720, 780]);
    expect(flights[0].xy[1][0]).toBeGreaterThan(74);
  });
});
