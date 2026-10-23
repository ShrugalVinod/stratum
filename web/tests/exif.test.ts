import { describe, expect, it } from "vitest";
import { readExif } from "../src/lib/exif";

/** A minimal JPEG with an EXIF block: DateTimeOriginal, OffsetTimeOriginal and GPS (big-endian). */
function jpeg(): ArrayBuffer {
  const b: number[] = [];
  const u16 = (x: number) => b.push((x >> 8) & 255, x & 255);
  const t: number[] = []; // the TIFF block, offsets relative to its start
  const T16 = (x: number) => t.push((x >> 8) & 255, x & 255);
  const T32 = (x: number) => t.push((x >>> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255);
  const entry = (tag: number, type: number, count: number, value: number) => (T16(tag), T16(type), T32(count), T32(value));
  // header + IFD0 at 8 with 2 entries (Exif pointer, GPS pointer)
  t.push(0x4d, 0x4d); T16(42); T32(8);
  T16(2); entry(0x8769, 4, 1, 38); entry(0x8825, 4, 1, 100); T32(0); // IFD0 ends at 38
  // Exif IFD at 38: DateTimeOriginal (20 bytes at 200), OffsetTimeOriginal (7 bytes at 230)
  T16(2); entry(0x9003, 2, 20, 200); entry(0x9011, 2, 7, 230); T32(0); // ends at 68
  while (t.length < 100) t.push(0);
  // GPS IFD at 100: LatRef "N", Lat (3 rationals at 260), LonRef "E", Lon (at 284)
  T16(4);
  entry(1, 2, 2, 0x4e000000); entry(2, 5, 3, 260); entry(3, 2, 2, 0x45000000); entry(4, 5, 3, 284); T32(0);
  while (t.length < 200) t.push(0);
  for (const c of "2026:10:22 18:45:30\0") t.push(c.charCodeAt(0));
  while (t.length < 230) t.push(0);
  for (const c of "+05:30\0") t.push(c.charCodeAt(0));
  while (t.length < 260) t.push(0);
  for (const [n, d] of [[12, 1], [58, 1], [1200, 100]]) (T32(n), T32(d)); // 12° 58' 12" N
  for (const [n, d] of [[77, 1], [35, 1], [2400, 100]]) (T32(n), T32(d)); // 77° 35' 24" E
  u16(0xffd8); u16(0xffe1); u16(t.length + 8);
  for (const c of "Exif\0\0") b.push(c.charCodeAt(0));
  b.push(...t);
  u16(0xffda);
  return new Uint8Array(b).buffer;
}

describe("photo EXIF", () => {
  it("reads the time (with its offset) and the GPS position", () => {
    const r = readExif(jpeg());
    expect(r.taken?.toISOString()).toBe("2026-10-22T13:15:30.000Z"); // 18:45:30 IST
    expect(r.lat).toBeCloseTo(12.97, 2);
    expect(r.lon).toBeCloseTo(77.59, 2);
  });
  it("returns nothing for a non-JPEG", () => {
    expect(readExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({ taken: null, lat: null, lon: null });
  });
});
