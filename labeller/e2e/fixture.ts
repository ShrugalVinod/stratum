// A synthetic scene package (no satellite data): two 256 × 256 grey PNGs per frame with one bright line.
import { strToU8, zipSync } from "fflate";
import { deflateSync } from "node:zlib";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(strToU8(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function greyPng(size: number, pixel: (r: number, c: number) => number): Uint8Array {
  const raw = new Uint8Array(size * (size + 1));
  for (let r = 0; r < size; r++) {
    raw[r * (size + 1)] = 0;
    for (let c = 0; c < size; c++) raw[r * (size + 1) + 1 + c] = pixel(r, c);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8-bit greyscale
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
export function packageZip(): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const sid of ["S001", "S002"]) {
    const meta = {
      scene_id: sid,
      package_version: "1.0",
      time_utc: "2026-01-01T06:15:00Z",
      times_utc: { m15: "2026-01-01T06:00:00Z", t: "2026-01-01T06:15:00Z", p15: "2026-01-01T06:30:00Z" },
      size_px: 256,
      orientation: "north_up",
      corners_latlon: { top_left: [25, 70], top_right: [25, 78], bottom_left: [17, 70], bottom_right: [17, 78] },
      encoding: { btd_k: { min: -4, max: 8, invert: false }, t108_k: { min: 180, max: 310, invert: true } },
    };
    files[`${sid}/meta.json`] = strToU8(JSON.stringify(meta));
    for (const f of ["", "_m15", "_p15"]) {
      files[`${sid}/btd${f}.png`] = greyPng(256, (r, c) => (Math.abs(r - 128 - (c - 128) * 0.3) < 1.5 ? 200 : 80 + ((r * 7 + c * 13) % 9)));
      files[`${sid}/t108${f}.png`] = greyPng(256, () => 90);
    }
  }
  files["labelling_guide.md"] = strToU8("# Guide\n\n1. Label lines.");
  return zipSync(files);
}
