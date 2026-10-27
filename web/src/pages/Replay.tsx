import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { loadReplayDay, loadWeighted, loadWeightedSummary } from "../data/load";
import { T, tx } from "../i18n";
import { contrailAt, position, type Stretch, stretches, tally, type Track, tracks } from "../lib/replay";
import "../styles/map.css";

/** /replay — "What if we'd listened?": one real day over India twice, side by side. Left: as
 *  flown, the day's 60 strongest contrail stretches forming and spreading. Right: the same day if
 *  every STRATUM alert had been followed (second analysis D-006). Running totals of the warming
 *  avoided and the extra fuel. Data and rules: lib/replay.ts. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const ASPECT = (BOX.n - BOX.s) / (BOX.e - BOX.w);
const DAY_MIN = 1440;
const SPEED = 30; // simulated minutes per second: the whole day in 48 s
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
const clock = (m: number) => `${pad(((m / 60) % 24 + 24) % 24)}:${pad(((m % 60) + 60) % 60)}`;
const tonnes = (kg: number) => `${kg >= 9_950 ? Math.round(kg / 1000).toLocaleString() : (kg / 1000).toFixed(1)} t`;
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(tx("en-GB", "hi-IN"), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Shapes = { india: boolean; rings: [number, number][][] }[];
type Colours = { sea: string; land: string; india: string; edge: string; track: string; plane: string; contrail: string; moved: string };

function colours(): Colours {
  const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { sea: v("--map-ocean"), land: v("--map-state"), india: v("--map-land"), edge: v("--map-border"), track: v("--map-track"), plane: v("--map-plane"), contrail: v("--orange"), moved: v("--teal") };
}

export function Replay() {
  const [days, setDays] = useState<string[] | null | undefined>(undefined);
  const [day, setDay] = useState<string | null>(null);
  const [data, setData] = useState<{ list: Stretch[]; tracks: Track[] } | null | undefined>(undefined);
  const [m, setM] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shapes, setShapes] = useState<Shapes>([]);

  useEffect(() => {
    loadWeightedSummary().then((w) => {
      const per = (w?.decisions?.alerts_per_day ?? {}) as Record<string, number>;
      const ds = Object.keys(per).sort();
      setDays(ds.length ? ds : null);
      const want = new URLSearchParams(location.search).get("day");
      setDay(ds.includes(want ?? "") ? want : ds.includes("2026-02-01") ? "2026-02-01" : (ds[ds.length - 1] ?? null));
    });
    fetch(`${BASE}/geo/countries.geojson`)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) =>
        setShapes(
          g.features.flatMap((f) => {
            const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
            return polys.map((p) => ({ india: f.properties?.iso === "IND", rings: [p[0] as [number, number][]] }));
          }),
        ),
      )
      .catch(() => setShapes([]));
  }, []);

  useEffect(() => {
    if (!day) return;
    setData(undefined);
    setPlaying(false);
    setM(0);
    history.replaceState(null, "", `/replay?day=${day}`);
    Promise.all([loadWeighted(day), loadReplayDay(day)])
      .then(([w, d]) => setData(w ? { list: stretches(day, w, d.b1), tracks: tracks(d.flights) } : null))
      .catch(() => setData(null));
  }, [day]);

  // start playing once a day is loaded (not for people who prefer less motion)
  useEffect(() => {
    if (data && !matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
  }, [data]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setM((x) => {
        const next = x + dt * SPEED;
        if (next >= DAY_MIN) {
          setPlaying(false);
          return DAY_MIN;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const t = useMemo(() => (data ? tally(data.list, m) : null), [data, m]);
  const total = useMemo(() => (data ? tally(data.list, DAY_MIN) : null), [data]);
  const ist = m + 330;

  return (
    <div class="page replay">
      <PageHead
        label="Replay · one real day"
        note="Second analysis D-006 · descriptive"
        lines={["What if we'd", "listened?"]}
        lede="One real day of flights over India, twice. On the left, as flown: the stretches that made the most contrail warming, forming and spreading behind the aircraft. On the right, the same day if every STRATUM alert had been followed, each one a climb or descent of 2,000 or 4,000 ft."
      />
      <div class="wrap">
        {days === null && <p class="muted mono">{T("The decision data are not published yet.")}</p>}
        {days && (
          <div class="adv-days rv" role="tablist" aria-label={T("Day")}>
            {days.map((d) => (
              <button role="tab" aria-selected={day === d} class={day === d ? "tool on" : "tool"} onClick={() => setDay(d)}>
                {dayLabel(d)}
              </button>
            ))}
          </div>
        )}

        {data === undefined && days && <p class="muted mono">{T("Loading the day…")}</p>}
        {data === null && <p class="muted mono">{T("This day could not be loaded.")}</p>}
        {data && t && total && (
          <>
            <div class="rp-grid">
              <figure class="rp-panel">
                <figcaption>
                  <b>{T("As flown")}</b>
                  <span class="mono-s">{tx(`${t.lasting} lasting contrails in the sky`, `आसमान में ${t.lasting} टिकाऊ कंट्रेल`)}</span>
                </figcaption>
                <Sky list={data.list} tracks={data.tracks} shapes={shapes} m={m} listened={false} />
              </figure>
              <figure class="rp-panel">
                <figcaption>
                  <b>{T("If they had listened")}</b>
                  <span class="mono-s">{tx(`${t.lastingIfListened} lasting contrails in the sky`, `आसमान में ${t.lastingIfListened} टिकाऊ कंट्रेल`)}</span>
                </figcaption>
                <Sky list={data.list} tracks={data.tracks} shapes={shapes} m={m} listened />
              </figure>
            </div>

            <div class="rp-time">
              <button class="tool strong" onClick={() => (m >= DAY_MIN ? (setM(0), setPlaying(true)) : setPlaying(!playing))} aria-pressed={playing}>
                {playing ? `❚❚ ${T("Pause")}` : m >= DAY_MIN ? `↻ ${T("Replay day")}` : `▶ ${T("Play")}`}
              </button>
              <input
                type="range"
                min={0}
                max={DAY_MIN}
                step={1}
                value={Math.round(m)}
                aria-label={T("Time of day (UTC)")}
                onInput={(e) => (setPlaying(false), setM(Number((e.target as HTMLInputElement).value)))}
              />
              <span class="mono rp-clock">
                {clock(m)} UTC · {clock(ist)} IST
              </span>
            </div>

            <div class="rt-tiles rp-tiles">
              <div class="rp-good">
                <b>{tonnes(t.avoided[1])}</b>
                <span>{tx(`CO₂e of contrail warming avoided so far (100 years; cautious: ${tonnes(t.avoided[0])})`, `अब तक टली कंट्रेल गर्मी, CO₂e (100 वर्ष; सतर्क: ${tonnes(t.avoided[0])})`)}</span>
              </div>
              <div>
                <b>{t.fuelKg >= 0 ? "+" : "−"}{tonnes(Math.abs(t.fuelKg))}</b>
                <span>{T("extra fuel for the new levels (already subtracted from the warming avoided)")}</span>
              </div>
              <div>
                <b>{t.alerts}</b>
                <span>{tx(`altitude changes advised so far, of ${total.alerts} that day`, `अब तक सुझाए ऊँचाई बदलाव, उस दिन के ${total.alerts} में से`)}</span>
              </div>
            </div>

            <p class="lede rp-sum">
              {tx(
                <>
                  If pilots had followed STRATUM on {dayLabel(day!)}, {total.alerts} climbs or descents would have avoided about <b>{tonnes(total.avoided[1])}</b> of
                  CO₂-equivalent warming (cautious estimate {tonnes(total.avoided[0])}),{" "}
                  {total.fuelKg >= 0 ? `for ${tonnes(total.fuelKg)} of extra fuel.` : `while saving ${tonnes(-total.fuelKg)} of fuel.`}
                </>,
                <>
                  अगर {dayLabel(day!)} को पायलट STRATUM की सलाह मानते, तो {total.alerts} बार ऊपर या नीचे जाने से लगभग <b>{tonnes(total.avoided[1])}</b> CO₂ के बराबर गर्मी
                  टलती (सतर्क अनुमान {tonnes(total.avoided[0])}),{" "}
                  {total.fuelKg >= 0 ? `${tonnes(total.fuelKg)} अतिरिक्त ईंधन के बदले।` : `और ${tonnes(-total.fuelKg)} ईंधन भी बचता।`}
                </>,
              )}
            </p>
            <p class="mono-s rp-key">
              <span>
                <i class="rp-k contrail" /> {T("lasting contrail (wider and fainter as it ages)")}
              </span>
              <span>
                <i class="rp-k moved" /> {T("the same stretch flown at the advised level: no lasting contrail")}
              </span>
              <span>
                <i class="rp-k plane" /> {T("airliners in the air")}
              </span>
            </p>
            <p class="small muted">
              {T(
                "Real flights and weather of that day. Shown: the 60 stretches with the most contrail warming, from our decision layer redone with STRATUM's probabilities (second analysis D-006, descriptive, not a pre-registered result); alerts are the stretches where the cautious estimate of warming avoided is positive at 20 and 100 years. Contrails are drawn where they formed and for as long as CoCiP says they last; real contrails drift with the wind. Moving a stretch avoids most, not all, of its contrail; the numbers are net of what remains and of the extra fuel (GWP-100, efficacy 0.42). Air traffic control is not modelled, and no real flight was changed.",
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** One side of the replay: base map and tracks drawn once, then planes and contrails per frame. */
function Sky({ list, tracks: trs, shapes, m, listened }: { list: Stretch[]; tracks: Track[]; shapes: Shapes; m: number; listened: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<{ img: HTMLCanvasElement; w: number; c: Colours } | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the base map: sea, land, India, and the whole day's tracks, faint (redrawn on resize)
  useEffect(() => {
    if (!w) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(w * dpr);
    const H = Math.round(W * ASPECT);
    const img = document.createElement("canvas");
    img.width = W;
    img.height = H;
    const g = img.getContext("2d")!;
    const c = colours();
    const px = (lon: number, lat: number) => [((lon - BOX.w) / (BOX.e - BOX.w)) * W, ((BOX.n - lat) / (BOX.n - BOX.s)) * H] as const;
    g.fillStyle = c.sea;
    g.fillRect(0, 0, W, H);
    for (const s of shapes) {
      g.beginPath();
      for (const ring of s.rings) ring.forEach(([lo, la], i) => (i ? g.lineTo(...px(lo, la)) : g.moveTo(...px(lo, la))));
      g.closePath();
      g.fillStyle = s.india ? c.india : c.land;
      g.fill();
      g.strokeStyle = c.edge;
      g.lineWidth = dpr * 0.6;
      g.stroke();
    }
    g.globalAlpha = 0.025;
    g.strokeStyle = c.track;
    g.lineWidth = dpr * 0.5;
    for (const t of trs) {
      g.beginPath();
      t.xy.forEach(([lo, la], i) => (i ? g.lineTo(...px(lo, la)) : g.moveTo(...px(lo, la))));
      g.stroke();
    }
    g.globalAlpha = 1;
    base.current = { img, w, c };
  }, [w, shapes, trs]);

  // each frame: planes in the air and the contrails
  useEffect(() => {
    const el = ref.current;
    const b = base.current;
    if (!el || !b) return;
    const { img, c } = b;
    if (el.width !== img.width || el.height !== img.height) {
      el.width = img.width;
      el.height = img.height;
    }
    const W = img.width;
    const H = img.height;
    const k = W / 340; // marks keep their look whatever the size
    const px = (lon: number, lat: number) => [((lon - BOX.w) / (BOX.e - BOX.w)) * W, ((BOX.n - lat) / (BOX.n - BOX.s)) * H] as const;
    const g = el.getContext("2d")!;
    g.drawImage(img, 0, 0);
    g.lineCap = "round";
    for (const s of list) {
      const look = contrailAt(s, m);
      if (!look) continue;
      const [ax, ay] = px(...s.a);
      const [bx, by] = px(...s.b);
      const ex = ax + (bx - ax) * look.drawn;
      const ey = ay + (by - ay) * look.drawn;
      if (listened && s.alert) {
        // flown at the advised level: a thin trail while the aircraft passes, then nothing lasting
        if (m > s.t1 + 15) continue;
        g.globalAlpha = 0.9;
        g.setLineDash([3 * k, 3 * k]);
        g.strokeStyle = c.moved;
        g.lineWidth = 1.4 * k;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(ex, ey);
        g.stroke();
        g.setLineDash([]);
        continue;
      }
      g.globalAlpha = Math.max(0.08, 0.9 * (1 - look.age) ** 0.6);
      g.strokeStyle = c.contrail;
      g.lineWidth = (1.6 + 7 * look.age) * k;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(ex, ey);
      g.stroke();
    }
    g.globalAlpha = 0.85;
    g.fillStyle = c.plane;
    const r = Math.max(1.5, 1.6 * k);
    for (const t of trs) {
      const p = position(t, m);
      if (!p) continue;
      const [x, y] = px(...p);
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    g.globalAlpha = 1;
  }, [m, w, list, trs, listened, shapes]);

  return <canvas ref={ref} class="rp-canvas" role="img" aria-label={T(listened ? "The day if every STRATUM alert had been followed" : "The day as flown, with its lasting contrails")} />;
}
