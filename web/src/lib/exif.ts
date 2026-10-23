// The two things "Spot a contrail" needs from a photo, read in the browser: when it was taken and,
// if the phone saved it, where. Minimal JPEG/EXIF reader (no library); the photo never leaves the
// device. Returns nulls for anything missing (screenshots, HEIC, location switched off).

export type PhotoInfo = { taken: Date | null; lat: number | null; lon: number | null };

export function readExif(buf: ArrayBuffer): PhotoInfo {
  const none: PhotoInfo = { taken: null, lat: null, lon: null };
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return none; // not a JPEG
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o);
    const len = v.getUint16(o + 2);
    if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return tiff(v, o + 10); // "Exif"
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; // start of scan: no EXIF
    o += 2 + len;
  }
  return none;
}

function tiff(v: DataView, t: number): PhotoInfo {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    if (ifd <= 0 || t + ifd + 2 > v.byteLength) return out;
    const n = u16(t + ifd);
    for (let i = 0; i < n; i++) {
      const e = t + ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      out.set(u16(e), { type, count, at: size * count <= 4 ? e + 8 : t + u32(e + 8) });
    }
    return out;
  };
  const ascii = (e?: { count: number; at: number }) => {
    if (!e) return null;
    let s = "";
    for (let i = 0; i < e.count && e.at + i < v.byteLength; i++) {
      const c = v.getUint8(e.at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (e?: { count: number; at: number }) =>
    e ? Array.from({ length: e.count }, (_, i) => u32(e.at + 8 * i) / (u32(e.at + 8 * i + 4) || 1)) : null;

  const ifd0 = entries(u32(t + 4));
  const exif = entries(ifd0.get(0x8769) ? u32(ifd0.get(0x8769)!.at) : 0);
  const gps = entries(ifd0.get(0x8825) ? u32(ifd0.get(0x8825)!.at) : 0);

  // DateTimeOriginal "YYYY:MM:DD HH:MM:SS", in the camera's local time unless an offset is saved
  let taken: Date | null = null;
  const dt = ascii(exif.get(0x9003)) ?? ascii(ifd0.get(0x0132));
  const m = dt && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(dt);
  if (m) {
    const off = ascii(exif.get(0x9011)); // OffsetTimeOriginal "+05:30"
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off && /^[+-]\d\d:\d\d$/.test(off) ? off : ""}`;
    const d = new Date(iso);
    taken = Number.isNaN(d.getTime()) ? null : d;
  }
  const dms = (r: number[] | null, ref: string | null, neg: string) =>
    r && r.length >= 3 ? (r[0] + r[1] / 60 + r[2] / 3600) * (ref === neg ? -1 : 1) : null;
  const lat = dms(rationals(gps.get(2)), ascii(gps.get(1)), "S");
  const lon = dms(rationals(gps.get(4)), ascii(gps.get(3)), "W");
  return { taken, lat: lat != null && Number.isFinite(lat) ? lat : null, lon: lon != null && Number.isFinite(lon) ? lon : null };
}
