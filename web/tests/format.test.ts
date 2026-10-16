import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Manifest } from "../src/data/contract";
import { clock, colourise, hourLabel, joules, parseState, stateQuery } from "../src/data/format";

describe("format", () => {
  it("formats energy forcing in scientific notation", () => {
    expect(joules(2.13e12)).toBe("2.1 × 10¹² J");
    expect(joules(-4.5e11)).toBe("-4.5 × 10¹¹ J");
    expect(joules(null)).toBe("—");
    expect(joules(0)).toBe("0 J");
  });

  it("converts UTC to IST (+5:30) across midnight", () => {
    expect(clock("2026-01-01T06:12:30Z")).toEqual({ utc: "06:12", ist: "11:42", minutes: 372 });
    expect(clock("2026-01-01T20:45:00Z").ist).toBe("02:15");
    expect(hourLabel(19)).toEqual({ utc: "19:00", ist: "00:30" });
  });

  it("round-trips the map state through the URL", () => {
    const s = { date: "2026-01-01", hour: 6, fl: 360, seg: "abc123def456_001" };
    expect(parseState(stateQuery(s), { date: null, hour: 0, fl: 280, seg: null })).toEqual(s);
  });

  it("falls back to defaults for bad URL values", () => {
    const d = { date: "2026-01-01", hour: 6, fl: 360, seg: null };
    expect(parseState("?hour=99&fl=abc", d)).toEqual(d);
  });

  it("colourises: zero is transparent, positive is opaque", () => {
    const rgba = colourise(new Uint8Array([0, 128, 255]));
    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBeGreaterThan(0);
    expect(rgba[11]).toBeGreaterThan(rgba[7]);
  });
});

describe("data contract", () => {
  it("accepts the manifest written by the Python exporter", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/manifest.json", import.meta.url), "utf8"));
    const m = Manifest.parse(raw);
    expect(m.flight_levels.map((f) => f.fl)).toEqual([280, 300, 320, 340, 360, 380, 400, 420]);
    expect(m.grid.encoding).toBe("png_uint8_fraction_of_hour");
  });
});
