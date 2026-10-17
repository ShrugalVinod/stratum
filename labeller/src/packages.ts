// Reading scene packages (pilot.zip / calibration.zip / test.zip) and label exports in the browser.
// Nothing is uploaded anywhere: files are read from the labeller's own disk.
import { strFromU8, unzipSync } from "fflate";
import type { SceneLabel } from "./labels";

export type Frame = "m15" | "t" | "p15";
export type Meta = {
  scene_id: string;
  package_version: string;
  time_utc: string;
  times_utc: Record<Frame, string>;
  size_px: number;
  corners_latlon: { top_left: [number, number]; top_right: [number, number]; bottom_left: [number, number]; bottom_right: [number, number] };
  encoding: { btd_k: { min: number; max: number }; t108_k: { min: number; max: number; invert: boolean } };
};
export type ScenePkg = { meta: Meta; files: Record<string, Uint8Array> };
export type PackageSet = { scenes: Map<string, ScenePkg>; guide: string | null; name: string };

export const FRAME_FILE: Record<Frame, string> = { m15: "_m15", t: "", p15: "_p15" };

export function readPackageZip(data: Uint8Array, name: string): PackageSet {
  const files = unzipSync(data);
  const scenes = new Map<string, ScenePkg>();
  let guide: string | null = null;
  for (const [path, bytes] of Object.entries(files)) {
    const clean = path.replace(/^\.?\/?/, "");
    if (clean.endsWith("labelling_guide.md")) guide = strFromU8(bytes);
    const m = clean.match(/(?:^|\/)([SC]\d{3,})\/([^/]+)$/);
    if (!m) continue;
    const [, sid, file] = m;
    if (!scenes.has(sid)) scenes.set(sid, { meta: undefined as unknown as Meta, files: {} });
    const s = scenes.get(sid)!;
    if (file === "meta.json") s.meta = JSON.parse(strFromU8(bytes)) as Meta;
    else s.files[file] = bytes;
  }
  for (const [sid, s] of scenes) if (!s.meta || !s.files["btd.png"]) scenes.delete(sid);
  if (!scenes.size) throw new Error("No scenes found. Open pilot.zip, calibration.zip or test.zip from the team Drive.");
  return { scenes, guide, name };
}

/** A labeller's export zip (or a single JSON) → their labels by scene id. */
export function readLabelExport(data: Uint8Array, fileName: string): { labeller: string; labels: Map<string, SceneLabel> } {
  const out = new Map<string, SceneLabel>();
  let labeller = "";
  const add = (txt: string) => {
    const j = JSON.parse(txt) as SceneLabel;
    if (!j.scene_id || !Array.isArray(j.objects)) return;
    labeller ||= j.labeller;
    out.set(j.scene_id, j);
  };
  if (fileName.toLowerCase().endsWith(".json")) add(strFromU8(data));
  else
    for (const [path, bytes] of Object.entries(unzipSync(data)))
      if (path.endsWith(".json") && !path.endsWith("_export.json")) add(strFromU8(bytes));
  if (!out.size) throw new Error(`No labels found in ${fileName}.`);
  return { labeller, labels: out };
}

/** PNG bytes → 8-bit grey values (red channel), size × size. */
export async function decodeGrey(png: Uint8Array): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const out = new Uint8Array(bmp.width * bmp.height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return { data: out, width: bmp.width, height: bmp.height };
}

/** Encoded byte → kelvin for BTD (linear over the package's encoding range). */
export const btdK = (v: number, enc: { min: number; max: number }) => enc.min + (v / 255) * (enc.max - enc.min);
