// Home: "the problem in one scroll". Every mark is real data: 1 Jan 2026's commercial flights and
// their physics-flagged stretches (the map's own files), one satellite-confirmed contrail
// (ALK266, 1 Nov 2025, the proof viewer's Meteosat crops and overlays) and the logged H1 totals.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ContrailEvent } from "../../data/contract";
import { contrailImg } from "../../data/load";
import { tx, useLang } from "../../i18n";
import { Canvas, clamp, easeIo, easeOut, Film, lerp, nf, Num, type Scene, seg, Stamp } from "./kit";
import { at, type Flight, h1Totals, type Land, loadLand, loadProof, loadRes, loadStoryDay, minuteOf, PROOF_DAY, type StoryDay } from "./data";

type Box = { x: number; y: number; w: number; h: number };
type XY = [number, number][];

function useSize(ref: { current: HTMLElement | null }) {
  const [s, set] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => set([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return s;
}

/** Where the picture lives inside the stage: right of the captions on wide screens, above them on phones. */
const layout = (w: number, h: number): Box => (w >= 900 ? { x: w * 0.36, y: 66, w: w * 0.64, h: h - 66 - 30 } : { x: 0, y: 84, w, h: h * 0.58 - 84 });

/** Geographic placement of a 96 px crop, fitted from its own detected lines' pixel and lat/lon pairs. */
function cropGeo(ev: ContrailEvent) {
  const xs: number[] = [], ys: number[] = [], lo: number[] = [], la: number[] = [];
  for (const s of ev.slots.slice(0, 1))
    for (const d of s.detected)
      d.pts.forEach((p, i) => {
        xs.push(p[0]);
        ys.push(p[1]);
        lo.push(d.lon[i]);
        la.push(d.lat[i]);
      });
  const fit = (a: number[], b: number[]) => {
    const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    a.forEach((v, i) => ((num += (v - ma) * (b[i] - mb)), (den += (v - ma) ** 2)));
    const k = den ? num / den : 0;
    return (x: number) => mb + k * (x - ma);
  };
  if (xs.length < 2) return { lon: ev.lon, lat: ev.lat, span: 4 };
  const fx = fit(xs, lo), fy = fit(ys, la);
  return { lon: fx(48), lat: fy(48), span: Math.abs(fx(96) - fx(0)) || 4 };
}

export function HomeFilm({ skipTo }: { skipTo: string }) {
  useLang();
  const [day, setDay] = useState<StoryDay | null>(null);
  const [land, setLand] = useState<Land | null>(null);
  const [ev, setEv] = useState<ContrailEvent | null>(null);
  const [res, setRes] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    loadStoryDay().then(setDay).catch(() => {});
    loadLand().then(setLand).catch(() => {});
    loadProof().then(setEv).catch(() => {});
    loadRes().then(setRes).catch(() => {});
  }, []);

  // derived, real numbers
  const st = useMemo(() => {
    if (!day) return null;
    const byId = new Map(day.flights.map((f) => [f.id, f]));
    const ranked = [...day.b1].filter((s) => (s.ef_J ?? 0) > 0).sort((a, b) => (b.ef_J ?? 0) - (a.ef_J ?? 0));
    const total = ranked.reduce((a, s) => a + (s.ef_J ?? 0), 0);
    let acc = 0, k80 = 0;
    for (const s of ranked) {
      acc += s.ef_J ?? 0;
      k80++;
      if (acc >= 0.8 * total) break;
    }
    const flaggedFlights = new Set(day.b1.map((s) => s.flight_id)).size;
    return { byId, ranked, total, k80, flaggedFlights, n: day.flights.length, top: new Set(ranked.slice(0, k80).map((s) => s.segment_id)) };
  }, [day]);
  const h1 = res ? h1Totals(res) : null;
  const ratio = res?.hypotheses?.find((h: any) => h.id === "H1")?.estimate?.value as number | undefined;
  const slots = ev?.slots ?? [];
  const seenIn = slots.filter((s) => s.detected.some((d) => d.matched)).length;
  const spanMin = slots.length ? Math.round(slots[slots.length - 1].age_min - slots[0].age_min) : 0;
  const age0 = slots[0] ? Math.round(slots[0].age_min) : 0;
  const N = st ? nf(st.n) : "…";
  const F = st ? nf(st.flaggedFlights) : "…";
  const K = st ? nf(st.k80) : "…";
  const KP = st ? `${((st.k80 / st.n) * 100).toFixed(1)} %` : "…";
  const R = ratio ? ratio.toFixed(2) : "6.44";

  const scenes: Scene[] = [
    {
      k: ["1 January 2026 · 00:00 → 24:00 UTC", "1 जनवरी 2026 · 00:00 → 24:00 UTC"],
      t: [`One day. ${N} airliners over India.`, `एक दिन। भारत के ऊपर ${N} यात्री विमान।`],
      b: [
        "Every line is a real commercial flight, replayed from its own ADS-B position reports. Scroll, and the clock runs.",
        "हर रेखा एक असली व्यावसायिक उड़ान है, जो उसकी अपनी ADS-B स्थिति-रिपोर्टों से दोबारा चलाई गई है। स्क्रॉल कीजिए, और घड़ी चलेगी।",
      ],
    },
    {
      k: ["Contrail physics · raw ERA5 weather", "कंट्रेल भौतिकी · कच्चा ERA5 मौसम"],
      t: [`${F} of them left a contrail that lasts.`, `इनमें से ${F} ने ऐसी कंट्रेल छोड़ी जो टिकी रहती है।`],
      b: [
        "Most contrails vanish in seconds. In thin, cold, ice-supersaturated air they spread into cloud that traps heat for hours. Orange: where the physics says that happened.",
        "ज़्यादातर कंट्रेल कुछ ही सेकंड में मिट जाती हैं। पतली, ठंडी, बर्फ़-अतिसंतृप्त हवा में वे फैलकर ऐसा बादल बनती हैं जो घंटों तक गर्मी रोकता है। नारंगी: जहाँ भौतिकी के अनुसार ऐसा हुआ।",
      ],
    },
    {
      k: ["Energy forcing, largest first", "ऊर्जा बल, सबसे बड़ा पहले"],
      t: [`${K} flights made 80 % of the day's contrail warming.`, `${K} उड़ानों ने दिन की 80 % कंट्रेल-गर्मी पैदा की।`],
      b: [
        `That is ${KP} of the day's flights. Over all 12 study days, under 1 % of cruise distance carries 80 % of the warming (0.48 %). Move those few, and most of the problem goes.`,
        `यह दिन की उड़ानों का ${KP} है। अध्ययन के सभी 12 दिनों में, क्रूज़ दूरी का 1 % से भी कम हिस्सा 80 % गर्मी ढोता है (0.48 %)। उन कुछ उड़ानों को हटाइए, और समस्या का बड़ा हिस्सा चला जाता है।`,
      ],
    },
    {
      k: ["Meteosat-9 · 36,000 km up · every 15 minutes", "Meteosat-9 · 36,000 किमी ऊपर · हर 15 मिनट"],
      t: ["But is the physics right? A satellite can check.", "पर क्या भौतिकी सही है? उपग्रह जाँच सकता है।"],
      b: [
        "Zooming in over Kerala, 1 November 2025, 00:45 UTC, in infrared. Contrails show up as thin dark lines.",
        "केरल के ऊपर ज़ूम, 1 नवंबर 2025, 00:45 UTC, इन्फ्रारेड में। कंट्रेल पतली गहरी रेखाओं जैसी दिखती हैं।",
      ],
    },
    {
      k: [`ADS-B · ${ev?.airline ?? "SriLankan Airlines"} ${ev?.callsign ?? "ALK266"} · ${ev?.aircraft_type ?? ""} · FL${ev?.fl ?? 390}`, `ADS-B · ${ev?.airline ?? "SriLankan Airlines"} ${ev?.callsign ?? "ALK266"} · ${ev?.aircraft_type ?? ""} · FL${ev?.fl ?? 390}`],
      t: [`A real flight crossed here ${age0} minutes earlier.`, `${age0} मिनट पहले एक असली उड़ान यहाँ से गुज़री थी।`],
      b: ["White: where the aircraft flew, from its own position reports.", "सफ़ेद: विमान कहाँ से उड़ा, उसकी अपनी स्थिति-रिपोर्टों के अनुसार।"],
    },
    {
      k: ["Wind drift + parallax", "हवा का बहाव + पैरलैक्स"],
      t: ["Its contrail did not stay put.", "उसकी कंट्रेल अपनी जगह नहीं टिकी।"],
      b: [
        `We move the track with the ERA5 wind for the contrail's age and correct for the satellite's slanted view (${Math.round(slots[0]?.vza_deg ?? 37)}° here). Orange: where the contrail should be now.`,
        `हम ट्रैक को कंट्रेल की उम्र भर ERA5 हवा के साथ खिसकाते हैं और उपग्रह के तिरछे नज़रिए (यहाँ ${Math.round(slots[0]?.vza_deg ?? 37)}°) को ठीक करते हैं। नारंगी: कंट्रेल अभी कहाँ होनी चाहिए।`,
      ],
    },
    {
      k: ["Learned detector v3 · second analysis (D-005)", "सीखा हुआ डिटेक्टर v3 · दूसरा विश्लेषण (D-005)"],
      t: ["And there it is.", "और वह रही।"],
      b: [
        `Cyan: the line our neural network found, ${slots[0]?.match_px?.toFixed(2) ?? "–"} px from the prediction. A match counts only if it shows in at least two images; this one shows in ${seenIn} frames over ${spanMin} minutes.`,
        `सियान: हमारे न्यूरल नेटवर्क की खोजी रेखा, अनुमान से ${slots[0]?.match_px?.toFixed(2) ?? "–"} px दूर। मिलान तभी गिना जाता है जब वह कम से कम दो तस्वीरों में दिखे; यह ${spanMin} मिनट में ${seenIn} फ़्रेमों में दिखती है।`,
      ],
    },
    {
      k: [`H1 · 12 flight days · ${h1 ? nf(h1.segments) : "334,211"} segments`, `H1 · 12 उड़ान-दिन · ${h1 ? nf(h1.segments) : "334,211"} खंड`],
      t: [`Physics predicted ${R}× more lasting contrails than the satellite saw.`, `भौतिकी ने उपग्रह से ${R} गुना ज़्यादा टिकाऊ कंट्रेल का अनुमान लगाया।`],
      b: [
        "We expected the opposite, and we report it as found. Most predicted contrails are too thin for Meteosat to see; so STRATUM learns from the satellite where the physics goes wrong.",
        "हमें उलटे की उम्मीद थी, और हम इसे जैसा पाया वैसा ही बताते हैं। ज़्यादातर अनुमानित कंट्रेल Meteosat के देखने के लिए बहुत पतली हैं; इसलिए STRATUM उपग्रह से सीखता है कि भौतिकी कहाँ चूकती है।",
      ],
    },
    {
      k: ["The decision", "निर्णय"],
      t: ["The fix can be 2,000 ft.", "हल सिर्फ़ 2,000 फ़ुट का हो सकता है।"],
      b: [
        `STRATUM tries 2,000 and 4,000 ft higher and lower, adds the extra fuel, and alerts only when even the cautious estimate says the climate gains. On 1 Jan 2026 that was ${day ? nf(day.alerts) : "…"} flights.`,
        `STRATUM 2,000 और 4,000 फ़ुट ऊपर और नीचे आज़माता है, अतिरिक्त ईंधन जोड़ता है, और चेतावनी तभी देता है जब सतर्क अनुमान भी कहे कि जलवायु को फ़ायदा है। 1 जनवरी 2026 को ऐसी ${day ? nf(day.alerts) : "…"} उड़ानें थीं।`,
      ],
    },
  ];

  const extra = (
    <div class="film-cta">
      <a class="btn primary" href="/map">
        {tx("Open the live map", "लाइव मानचित्र खोलें")} →
      </a>
      <a class="btn" href="/now">
        {tx("Which planes should move now?", "अभी कौन-से विमान हटें?")}
      </a>
      <a class="btn" href="/how-it-works">
        {tx("How it works", "यह कैसे काम करता है")}
      </a>
    </div>
  );

  return (
    <Film id="story" label={["The problem in one scroll", "एक स्क्रॉल में समस्या"]} scenes={scenes} vh={125} skipTo={skipTo} extra={extra}>
      {(f) => <HomeStage f={f} day={day} land={land} st={st} ev={ev} h1={h1} ratio={ratio} />}
    </Film>
  );
}

function HomeStage({ f, day, land, st, ev, h1, ratio }: { f: { p: number; n: number; still: boolean }; day: StoryDay | null; land: Land | null; st: any; ev: ContrailEvent | null; h1: ReturnType<typeof h1Totals> | null; ratio?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, H] = useSize(ref);
  const { p, n } = f;
  const S = (k: number, a = 0, b = 1) => seg(p, (k + a) / n, (k + b) / n); // progress within scene k
  const box = layout(W || 1200, H || 700);
  const geo = useMemo(() => (ev ? cropGeo(ev) : null), [ev]);

  // camera: India → the crop over Kerala
  const base = Math.min(box.w / 36, box.h / 37) * 0.98;
  const panelTarget = Math.min(box.w * 0.82, box.h * 0.84);
  const zEnd = geo ? panelTarget / (geo.span * base) : 6;
  const zt = easeIo(S(3, 0.05, 0.62));
  const z = lerp(1, zEnd, zt);
  const c0 = { lon: 82, lat: 21.5 };
  const cLon = geo ? lerp(c0.lon, geo.lon, zt) : c0.lon;
  const cLat = geo ? lerp(c0.lat, geo.lat, zt) : c0.lat;
  const k = base * z;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const X = (lon: number) => cx + (lon - cLon) * k;
  const Y = (lat: number) => cy - (lat - cLat) * k * 1.04;

  const T = 1440 * easeIo(S(0, 0.06, 0.9)); // the day's clock, minutes UTC
  const flagT = S(1, 0.05, 0.55);
  const topT = S(2, 0.05, 0.6);
  const fadeFlights = 1 - S(3, 0, 0.3);
  const panelO = S(3, 0.45, 0.8) * (1 - S(7, 0, 0.25) * 0.9) * (1 - S(8, 0, 0.3));

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // ocean glow
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#0d1b2e");
    g.addColorStop(1, "#050a13");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // graticule
    ctx.strokeStyle = "rgba(120,150,190,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lo = 60; lo <= 105; lo += 5) (ctx.moveTo(X(lo), 0), ctx.lineTo(X(lo), h));
    for (let la = 0; la <= 45; la += 5) (ctx.moveTo(0, Y(la)), ctx.lineTo(w, Y(la)));
    ctx.stroke();
    if (land) {
      for (const c of land) {
        ctx.beginPath();
        for (const r of c.rings) r.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
        ctx.fillStyle = c.iso === "IND" ? "#14253c" : "#0f1c2e";
        ctx.fill();
        ctx.strokeStyle = c.iso === "IND" ? "rgba(214,226,245,0.42)" : "rgba(160,180,210,0.16)";
        ctx.lineWidth = c.iso === "IND" ? 1.1 : 0.7;
        ctx.stroke();
      }
    }
    // the reticle over Kerala while zooming
    const ret = S(3, 0, 0.12) * (1 - S(3, 0.55, 0.8));
    if (geo && ret > 0) {
      const half = (geo.span * k) / 2, rx = X(geo.lon), ry = Y(geo.lat), L = Math.max(8, half * 0.3);
      ctx.strokeStyle = `rgba(255,255,255,${ret})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        ctx.moveTo(rx + sx * half, ry + sy * half - sy * L);
        ctx.lineTo(rx + sx * half, ry + sy * half);
        ctx.lineTo(rx + sx * half - sx * L, ry + sy * half);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${ret})`;
      ctx.font = "500 10px 'Martian Mono Variable', ui-monospace, monospace";
      ctx.fillText(`${ev?.callsign ?? ""} · 1 Nov 2025`, rx - half, ry - half - 8);
    }
    const dark = S(7, 0, 0.3) * 0.7;
    if (dark > 0) {
      ctx.fillStyle = `rgba(5,10,19,${dark})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (!day || !st || fadeFlights <= 0) return;
    ctx.save();
    ctx.globalAlpha = fadeFlights;
    // trails up to the clock
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = `rgba(170,198,240,${lerp(0.26, 0.06, flagT)})`;
    ctx.beginPath();
    const heads: [number, number][] = [];
    for (const fl of day.flights as Flight[]) {
      if (fl.m[0] > T) continue;
      ctx.moveTo(X(fl.lon[0]), Y(fl.lat[0]));
      let j = 1;
      for (; j < fl.m.length && fl.m[j] <= T; j++) ctx.lineTo(X(fl.lon[j]), Y(fl.lat[j]));
      const hp = at(fl, T);
      if (hp && j < fl.m.length) {
        ctx.lineTo(X(hp[0]), Y(hp[1]));
        heads.push(hp);
      }
    }
    ctx.stroke();
    // aircraft heads
    if (T < 1439) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      for (const [lo, la] of heads) (ctx.moveTo(X(lo) + 1.6, Y(la)), ctx.arc(X(lo), Y(la), 1.6, 0, 7));
      ctx.fill();
      ctx.fillStyle = "rgba(120,180,255,0.18)";
      ctx.beginPath();
      for (const [lo, la] of heads) (ctx.moveTo(X(lo) + 5, Y(la)), ctx.arc(X(lo), Y(la), 5, 0, 7));
      ctx.fill();
    }
    // physics-flagged lasting-contrail stretches
    if (flagT > 0) {
      const stretch = (s: any) => {
        const fl = st.byId.get(s.flight_id) as Flight | undefined;
        if (!fl) return;
        const a = minuteOf(s.time_utc), b = s.time_end_utc ? minuteOf(s.time_end_utc) : a + 1;
        const steps = Math.max(2, Math.min(40, b - a));
        let started = false;
        for (let q = 0; q <= steps; q++) {
          const pos = at(fl, a + ((b - a) * q) / steps);
          if (!pos) continue;
          if (!started) ctx.moveTo(X(pos[0]), Y(pos[1]));
          else ctx.lineTo(X(pos[0]), Y(pos[1]));
          started = true;
        }
        if (!started) (ctx.moveTo(X(s.lon_start), Y(s.lat_start)), ctx.lineTo(X(s.lon_end), Y(s.lat_end)));
      };
      const layer = (filter: (s: any) => boolean, rgb: string, mult: number, wide: number, thin: number) => {
        ctx.beginPath();
        st.ranked.filter(filter).forEach(stretch);
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(${rgb},${0.22 * flagT * mult})`;
        ctx.lineWidth = wide;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${rgb},${flagT * mult})`;
        ctx.lineWidth = thin;
        ctx.stroke();
      };
      layer((s) => !st.top.has(s.segment_id), "255,140,58", 1 - 0.6 * topT, 7 * flagT, 1.8);
      if (topT > 0) layer((s) => st.top.has(s.segment_id), "255,77,90", 1, 12 * topT, 3 * topT + 0.5);
    }
    ctx.restore();
    // ranked energy-forcing bars
    if (topT > 0 && fadeFlights > 0) {
      ctx.save();
      ctx.globalAlpha = fadeFlights;
      const bx = box.x + box.w * 0.08, bw = box.w * 0.84, bh = Math.min(120, box.h * 0.16), by = box.y + box.h - bh - 28;
      ctx.fillStyle = "rgba(5,10,19,0.72)";
      ctx.fillRect(bx - 12, by - 26, bw + 24, bh + 46);
      const m = st.ranked.length;
      const max = st.ranked[0]?.ef_J ?? 1;
      const step = bw / m;
      st.ranked.forEach((s: any, i: number) => {
        const t = clamp(topT * 1.6 - (i / m) * 0.6);
        const hh = Math.max(1, ((s.ef_J ?? 0) / max) * bh * easeOut(t));
        ctx.fillStyle = i < st.k80 ? "#ff4d5a" : "rgba(255,140,58,0.75)";
        ctx.fillRect(bx + i * step, by + bh - hh, Math.max(1, step - 0.6), hh);
      });
      ctx.fillStyle = "rgba(236,230,216,0.8)";
      ctx.font = "500 10px 'Martian Mono Variable', ui-monospace, monospace";
      const narrow = box.w < 560;
      ctx.fillText(
        narrow
          ? tx(`${st.ranked.length} stretches · largest first`, `${st.ranked.length} हिस्से · सबसे बड़ा पहले`)
          : tx(`${st.ranked.length} lasting-contrail stretches · energy forcing, largest first`, `${st.ranked.length} टिकाऊ-कंट्रेल हिस्से · ऊर्जा बल, सबसे बड़ा पहले`),
        bx,
        by - 10,
      );
      ctx.fillStyle = "#ff8a92";
      ctx.fillText(tx(`red: ${st.k80} flights = 80 % of the warming`, `लाल: ${st.k80} उड़ानें = 80 % गर्मी`), bx, by + bh + 16);
      ctx.restore();
    }
  };

  // HUD numbers on the map
  const clock = `${String(Math.floor(Math.min(T, 1439) / 60)).padStart(2, "0")}:${String(Math.floor(Math.min(T, 1439) % 60)).padStart(2, "0")}`;
  const airborne = day ? day.flights.filter((fl: Flight) => fl.m[0] <= T).length : 0;

  // satellite panel geometry (anchored to the map so the zoom flows into it)
  const half = geo ? (geo.span * k) / 2 : 0;
  const px = geo ? X(geo.lon) - half : 0, py = geo ? Y(geo.lat) - half : 0;
  const frameT = S(6, 0.42, 0.95);
  const slotI = f.p >= (6 + 0.42) / n ? Math.min((ev?.slots.length ?? 1) - 1, Math.floor(frameT * (ev?.slots.length ?? 1) * 0.999)) : 0;
  const slot = ev?.slots[slotI];
  const trackT = slotI > 0 ? 1 : S(4, 0.05, 0.75);
  const driftT = slotI > 0 ? 1 : easeIo(S(5, 0.05, 0.75));
  const detT = slotI > 0 ? 1 : S(6, 0.02, 0.3);

  return (
    <div ref={ref} class="hf">
      <Canvas class="hf-canvas" draw={draw} label={tx("Animated map of India's flights on 1 January 2026", "1 जनवरी 2026 की भारत की उड़ानों का चलता मानचित्र")} />
      <div class="hf-hud mono-s" style={{ left: `${box.x + 18}px`, top: `${box.y + 18}px`, opacity: fadeFlights * (1 - S(2, 0.7, 1)) }}>
        <b>{clock}</b> UTC · {nf(airborne)} {tx("flights", "उड़ानें")}
        {flagT > 0 && st && (
          <span class="hf-hud-o">
            {" "}
            · <Num to={st.flaggedFlights} t={flagT} /> {tx("with a lasting contrail", "टिकाऊ कंट्रेल के साथ")}
          </span>
        )}
      </div>

      {ev && slot && panelO > 0.001 && (
        <div class="hf-sat" style={{ left: `${px}px`, top: `${py}px`, width: `${half * 2}px`, height: `${half * 2}px`, opacity: panelO }}>
          {ev.slots.map((s, i) => (
            <img src={contrailImg(PROOF_DAY, s.img)} alt="" class="hf-img" style={{ opacity: i === slotI ? 1 : 0 }} />
          ))}
          <svg viewBox="0 0 96 96" preserveAspectRatio="none" aria-label={tx("Meteosat-9 image with the flight track, its wind-drifted contrail and the detected line", "Meteosat-9 तस्वीर: उड़ान का ट्रैक, हवा से खिसकी कंट्रेल और पाई गई रेखा")} role="img">
            <Segs segs={slot.track} t={trackT} cls="hf-track" />
            <Morph from={slot.track} to={slot.drift} t={driftT} cls="hf-drift" />
            {slot.detected.map((d) => (
              <Line pts={d.pts} t={detT} cls={d.matched ? "hf-det" : "hf-det off"} />
            ))}
          </svg>
          <div class="hf-sat-cap mono-s">
            <span>
              {slot.t.slice(11, 16)} UTC · {tx("age", "उम्र")} {Math.round(slot.age_min)} min
            </span>
            <span>© EUMETSAT 2026</span>
          </div>
          <div class="hf-frames mono-s" style={{ opacity: S(6, 0.35, 0.5) }}>
            {ev.slots.map((s, i) => (
              <span class={`${i <= slotI ? "on" : ""} ${s.detected.some((d) => d.matched) ? "ok" : ""}`}>
                {s.t.slice(11, 16)} {s.detected.some((d) => d.matched) && i <= slotI ? "✓" : ""}
              </span>
            ))}
          </div>
          <div class="hf-match">
            <Stamp t={S(6, 0.26, 0.5)} kind="info">
              MATCH · {slot.match_px?.toFixed(2)} px
            </Stamp>
          </div>
          <div class="hf-legend mono-s" style={{ opacity: S(4, 0, 0.2) }}>
            <span class="lt">{tx("flight track", "उड़ान ट्रैक")}</span>
            {S(5) > 0 && (
              <span class="ld" style={{ opacity: S(5, 0, 0.2) }}>
                {tx("predicted contrail (wind + parallax)", "अनुमानित कंट्रेल (हवा + पैरलैक्स)")}
              </span>
            )}
            {S(6) > 0 && (
              <span class="lc" style={{ opacity: S(6, 0, 0.2) }}>
                {tx("detected by the satellite", "उपग्रह ने पकड़ी")}
              </span>
            )}
          </div>
        </div>
      )}

      {h1 && S(7) > 0 && (
        <div class="hf-h1" style={{ left: `${box.x + box.w * 0.08}px`, top: `${box.y + box.h * 0.16}px`, width: `${box.w * 0.84}px`, opacity: S(7, 0, 0.2) * (1 - S(8, 0, 0.25)) }}>
          <p class="hf-big">
            <Num to={ratio ?? h1.predicted / h1.observed} t={S(7, 0.1, 0.6)} d={2} />×
          </p>
          <div class="hf-bars">
            <div>
              <span class="mono-s">{tx("lasting contrails predicted by physics (B1)", "भौतिकी (B1) से अनुमानित टिकाऊ कंट्रेल")}</span>
              <i class="o" style={{ transform: `scaleX(${easeOut(S(7, 0.08, 0.5))})` }} />
              <b class="mono">
                <Num to={h1.predicted} t={S(7, 0.08, 0.5)} />
              </b>
            </div>
            <div>
              <span class="mono-s">{tx("seen by Meteosat-9", "Meteosat-9 ने देखीं")}</span>
              <i class="c" style={{ transform: `scaleX(${(h1.observed / h1.predicted) * easeOut(S(7, 0.2, 0.62))})` }} />
              <b class="mono">
                <Num to={h1.observed} t={S(7, 0.2, 0.62)} />
              </b>
            </div>
          </div>
          <div class="hf-stamp">
            <Stamp t={S(7, 0.55, 0.8)} kind="no">
              {tx("H1 not supported", "H1 समर्थित नहीं")}
            </Stamp>
          </div>
        </div>
      )}

      {S(8) > 0 && <SideView t={S(8)} box={box} />}
    </div>
  );
}

const P = (x: number, y: number) => `${(x + 0.5).toFixed(2)},${(y + 0.5).toFixed(2)}`;

/** Two-point segments drawn in order up to t. */
export function Segs({ segs, t, cls }: { segs: XY[]; t: number; cls: string }) {
  const m = Math.floor(segs.length * clamp(t) + 0.0001);
  const frac = segs.length * clamp(t) - m;
  return (
    <g class={cls}>
      {segs.slice(0, m).map((s) => (
        <line x1={s[0][0] + 0.5} y1={s[0][1] + 0.5} x2={s[1][0] + 0.5} y2={s[1][1] + 0.5} />
      ))}
      {m < segs.length && frac > 0 && (
        <line x1={segs[m][0][0] + 0.5} y1={segs[m][0][1] + 0.5} x2={lerp(segs[m][0][0], segs[m][1][0], frac) + 0.5} y2={lerp(segs[m][0][1], segs[m][1][1], frac) + 0.5} />
      )}
    </g>
  );
}

/** The track sliding onto its wind-drifted position. */
export function Morph({ from, to, t, cls }: { from: XY[]; to: XY[]; t: number; cls: string }) {
  if (t <= 0) return null;
  if (from.length !== to.length) return <Segs segs={to} t={1} cls={cls} />;
  return (
    <g class={cls} style={{ opacity: Math.min(1, t * 3) }}>
      {to.map((s, i) => (
        <line
          x1={lerp(from[i][0][0], s[0][0], t) + 0.5}
          y1={lerp(from[i][0][1], s[0][1], t) + 0.5}
          x2={lerp(from[i][1][0], s[1][0], t) + 0.5}
          y2={lerp(from[i][1][1], s[1][1], t) + 0.5}
        />
      ))}
    </g>
  );
}

/** A polyline drawn on with t. */
export function Line({ pts, t, cls }: { pts: [number, number][]; t: number; cls: string }) {
  if (t <= 0 || pts.length < 2) return null;
  return <polyline class={cls} points={pts.map((p) => P(p[0], p[1])).join(" ")} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - clamp(t) }} />;
}

/** Schematic side view: one aircraft through a humid layer, one 2,000 ft above it. */
function SideView({ t, box }: { t: number; box: Box }) {
  const a = easeIo(seg(t, 0.05, 0.7));
  const climb = (x: number) => (x < 210 ? 196 : x > 300 ? 150 : 196 - ((x - 210) / 90) * 46);
  const xs = Array.from({ length: 41 }, (_, i) => 40 + (i / 40) * 520);
  const xa = 40 + a * 520;
  const pathB = xs.filter((x) => x <= xa).map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${climb(x).toFixed(1)}`).join("");
  return (
    <div class="hf-side" style={{ left: `${box.x + box.w * 0.04}px`, top: `${box.y + box.h * 0.1}px`, width: `${box.w * 0.92}px`, opacity: seg(t, 0, 0.18) }}>
      <svg viewBox="0 0 600 340" role="img" aria-label={tx("Schematic: a contrail lasts inside a humid layer and not 2,000 ft above it", "रेखाचित्र: नम परत के भीतर कंट्रेल टिकती है, 2,000 फ़ुट ऊपर नहीं")}>
        <defs>
          <linearGradient id="hf-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#5cbcc6" stop-opacity="0" />
            <stop offset="0.5" stop-color="#5cbcc6" stop-opacity="0.32" />
            <stop offset="1" stop-color="#5cbcc6" stop-opacity="0" />
          </linearGradient>
          <filter id="hf-blur">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <rect x="20" y="170" width="560" height="56" fill="url(#hf-band)" />
        <text x="572" y="244" class="hf-sv-l t" text-anchor="end">
          {tx("ice-supersaturated layer", "बर्फ़-अतिसंतृप्त परत")}
        </text>
        {/* aircraft A: stays in the layer, contrail spreads */}
        <path d={`M40,${198} L${xa},198`} class="hf-sv-con" filter="url(#hf-blur)" style={{ strokeWidth: 10 }} />
        <path d={`M40,${198} L${xa},198`} class="hf-sv-con" />
        <circle cx={xa} cy={198} r="4.5" class="hf-sv-plane" />
        <text x="40" y="272" class="hf-sv-l">
          {tx("as planned: a contrail that lasts for hours", "योजना के अनुसार: घंटों टिकने वाली कंट्रेल")}
        </text>
        {/* aircraft B: 2,000 ft higher, short-lived trail */}
        <path d={pathB} class="hf-sv-short" style={{ opacity: 0.9 }} />
        <circle cx={xa} cy={climb(xa)} r="4.5" class="hf-sv-plane b" />
        <text x="40" y="128" class="hf-sv-l b">
          {tx("+2,000 ft: the trail fades in seconds", "+2,000 फ़ुट: लकीर कुछ सेकंड में मिट जाती है")}
        </text>
        <line x1="330" x2="330" y1="150" y2="196" class="hf-sv-dim" />
        <text x="338" y="178" class="hf-sv-l">
          2,000 ft
        </text>
        <text x="20" y="326" class="hf-sv-tag">
          {tx("SCHEMATIC", "रेखाचित्र")}
        </text>
      </svg>
    </div>
  );
}
