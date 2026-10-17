import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { dedupe, distToPoly, emptyLabel, exportZip, isComplete, polyLength, problems, seededOrder, type SceneLabel } from "../src/labels";
import { mdToHtml } from "../src/md";
import { readLabelExport, readPackageZip } from "../src/packages";

const lbl = (patch: Partial<SceneLabel> = {}): SceneLabel => ({ ...emptyLabel("S001", "aditya", "1.0", new Date("2026-10-17T00:00:00Z")), ...patch });

describe("geometry", () => {
  it("measures and cleans polylines", () => {
    expect(polyLength([[0, 0], [3, 4], [3, 10]])).toBe(11);
    expect(dedupe([[0, 0], [0, 0.2], [5, 5], [5, 5]])).toEqual([[0, 0], [5, 5]]);
    expect(distToPoly([5, 3], [[0, 0], [10, 0]])).toBe(3);
    expect(distToPoly([-4, 3], [[0, 0], [10, 0]])).toBe(5); // beyond the end: distance to the end point
  });
});

describe("completeness (rules 1 and 4)", () => {
  it("needs a status and lines or 'no contrails'", () => {
    expect(isComplete(lbl())).toBe(false);
    expect(isComplete(lbl({ scene_status: "clear" }))).toBe(false);
    expect(isComplete(lbl({ scene_status: "clear", flags: { no_contrails: true, unusable: false, unusable_reason: "" } }))).toBe(true);
    const line = { id: "a", polyline_px: [[0, 0], [0, 20]] as [number, number][], confidence: "sure" as const };
    expect(isComplete(lbl({ scene_status: "obscured", objects: [line] }))).toBe(true);
    expect(isComplete(lbl({ flags: { no_contrails: false, unusable: true, unusable_reason: "" } }))).toBe(false);
    expect(isComplete(lbl({ flags: { no_contrails: false, unusable: true, unusable_reason: "stripes" } }))).toBe(true);
  });
  it("flags lines shorter than 10 px", () => {
    const short = { id: "a", polyline_px: [[0, 0], [0, 5]] as [number, number][], confidence: "sure" as const };
    expect(problems(lbl({ scene_status: "clear", objects: [short] })).join(" ")).toMatch(/10 px/);
  });
});

describe("scene order", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(3, "0")}`);
  it("is a fixed permutation per labeller and differs between labellers", () => {
    const a1 = seededOrder(ids, "aditya|pilot.zip");
    expect(seededOrder(ids, "aditya|pilot.zip")).toEqual(a1);
    expect([...a1].sort()).toEqual(ids);
    expect(seededOrder(ids, "ishaan|pilot.zip")).not.toEqual(a1);
  });
});

describe("export and import", () => {
  it("round-trips labels through the export zip", () => {
    const l = lbl({ scene_status: "clear", objects: [{ id: "x", polyline_px: [[1.234567, 2], [30, 40]], confidence: "uncertain" }] });
    const z = unzipSync(exportZip([l], "aditya"));
    expect(Object.keys(z).sort()).toEqual(["aditya/S001.json", "aditya/_export.json"]);
    const back = JSON.parse(strFromU8(z["aditya/S001.json"]));
    expect(back.objects[0].polyline_px[0]).toEqual([1.23, 2]);
    expect(back.labeller).toBe("aditya");
    const again = readLabelExport(exportZip([l], "aditya"), "labels.zip");
    expect(again.labeller).toBe("aditya");
    expect(again.labels.get("S001")?.objects[0].confidence).toBe("uncertain");
  });
  it("reads a scene package zip", () => {
    const meta = { scene_id: "S004", package_version: "1.0", size_px: 256 };
    const zip = zipSync({ "S004/meta.json": strToU8(JSON.stringify(meta)), "S004/btd.png": new Uint8Array([1, 2]), "labelling_guide.md": strToU8("# Guide") });
    const p = readPackageZip(zip, "pilot.zip");
    expect([...p.scenes.keys()]).toEqual(["S004"]);
    expect(p.guide).toBe("# Guide");
    expect(() => readPackageZip(zipSync({ "x.txt": strToU8("x") }), "x.zip")).toThrow(/No scenes/);
  });
});

describe("guide markdown", () => {
  it("renders headings and lists and escapes HTML", () => {
    const h = mdToHtml("# Title\n\n1. **Bold** rule\n2. second\n\n<script>alert(1)</script>");
    expect(h).toContain("<h1>Title</h1>");
    expect(h).toContain("<ol>");
    expect(h).toContain("<strong>Bold</strong>");
    expect(h).not.toContain("<script>");
  });
});
