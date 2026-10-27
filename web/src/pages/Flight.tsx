import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { LiveAircraft, Manifest, OutlookInfo } from "../data/contract";
import { loadLive, loadOutlook, outlookValue } from "../data/load";
import { T, tx } from "../i18n";
import {
  AIRPORTS,
  aheadPath,
  airport,
  co2eKg,
  cruisePath,
  EF_PER_MIN_J,
  FLS,
  footprint,
  type Hot,
  hottest,
  type Footprint,
  LASTING,
  nearestFl,
  PLAN_TYPES,
  type Point,
  SCAN_AIRPORTS,
} from "../lib/footprint";
import { move } from "../lib/geo";
import "../styles/map.css";

/** /flight — "Your flight's hidden footprint": a trip (from, to, departure, aircraft, level) or an
 *  airliner flying now, checked minute by minute against the forecast's lasting-contrail air at
 *  its level and the levels around it; its CO₂ next to the warming its contrail could cause.
 *  Settings live in the URL so a result can be shared. Calculation: lib/footprint.ts. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BOX = { w: 66, e: 100, s: 4, n: 39 };
const MW = 340;
const MK = MW / (BOX.e - BOX.w);
const MH = (BOX.n - BOX.s) * MK;
const mp = (lon: number, lat: number) => [(lon - BOX.w) * MK, (BOX.n - lat) * MK] as const;
const HOUR = 3_600_000;

const tonnes = (kg: number) => `${kg >= 9_950 ? Math.round(kg / 1000).toLocaleString() : (kg / 1000).toFixed(1)} t`;
const slotLabel = (ms: number) =>
  `${new Date(ms).toLocaleString(tx("en-GB", "hi-IN"), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} IST`;
const place = (code: string) => {
  const a = airport(code);
  return a ? `${T(a.city)} (${a.code})` : code;
};

type Mode = "plan" | "live";
type Plan = { from: string; to: string; dep: number; type: string; fl: number };
type Done = { fp: Footprint; path: Point[]; title: string; label: string };

function initial(): { mode: Mode; plan: Partial<Plan>; cs: string; dest: string } {
  const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const num = (k: string) => (q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  return {
    mode: q.get("cs") ? "live" : "plan",
    // only values the form offers; anything else keeps the default
    plan: Object.fromEntries(
      Object.entries({
        from: airport(q.get("from")) ? q.get("from") : undefined,
        to: airport(q.get("to")) ? q.get("to") : undefined,
        dep: num("dep"),
        type: PLAN_TYPES.includes(q.get("type") ?? "") ? q.get("type") : undefined,
        fl: FLS.includes(num("fl") ?? 0) ? num("fl") : undefined,
      }).filter(([, v]) => v !== undefined),
    ) as Partial<Plan>,
    cs: q.get("cs") ?? "",
    dest: q.get("dest") ?? "",
  };
}

export function Flight() {
  const init = useMemo(initial, []);
  const [ol, setOl] = useState<{ manifest: Manifest; info: OutlookInfo } | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [plan, setPlan] = useState<Plan>({ from: "BLR", to: "DEL", dep: 0, type: "A20N", fl: 360, ...init.plan });
  const [cs, setCs] = useState(init.cs);
  const [dest, setDest] = useState(init.dest);
  const [live, setLive] = useState<LiveAircraft[] | null>(null);
  const [res, setRes] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shapes, setShapes] = useState<{ india: boolean; d: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [hot, setHot] = useState<Hot[] | null | "busy">(null);

  // departure slots: every hour the forecast covers, from the coming hour
  // (a forecast that is out of date still shows its own hours, and the page says so)
  const [slots, stale] = useMemo((): [number[], boolean] => {
    if (!ol) return [[], false];
    const start = Date.parse(`${ol.manifest.days[0]}T00:00:00Z`);
    const last = Date.parse(`${ol.manifest.days[ol.manifest.days.length - 1]}T23:00:00Z`);
    const next = Math.ceil(Date.now() / HOUR) * HOUR;
    const old = next > last;
    const out: number[] = [];
    for (let t = old ? start : Math.max(start, next); t <= last; t += HOUR) out.push(t);
    return [out, old];
  }, [ol]);

  useEffect(() => {
    loadOutlook().then(setOl);
    fetch(`${BASE}/geo/countries.geojson`)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) =>
        setShapes(
          g.features.flatMap((f) => {
            const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
            return polys.map((pp) => ({ india: f.properties?.iso === "IND", d: pp[0].map(([lo, la], i) => `${i ? "L" : "M"}${mp(lo, la)[0].toFixed(1)},${mp(lo, la)[1].toFixed(1)}`).join("") + "Z" }));
          }),
        ),
      )
      .catch(() => setShapes([]));
  }, []);

  // a departure that is not in the forecast window (or none yet) → the coming hour
  useEffect(() => {
    if (slots.length && !slots.includes(plan.dep)) setPlan((p) => ({ ...p, dep: slots[Math.min(slots.length - 1, 1)] }));
  }, [slots]);

  // the first result appears by itself (a shared link, or the default trip)
  useEffect(() => {
    if (!ol || !slots.length || res || busy) return;
    if (mode === "live" && init.cs) findLive(init.cs);
    else if (mode === "plan" && slots.includes(plan.dep)) runPlan(plan);
  }, [ol, slots, plan.dep]);

  // the callsigns flying now, for the search box's suggestions
  useEffect(() => {
    if (mode === "live" && !live) loadLive(20.5, 78.9).then((r) => setLive(r.ac), () => undefined);
  }, [mode]);

  const lookup = (m: Manifest) => (p: Point, fl: number) => {
    const d = new Date(p.t);
    return outlookValue(m, "B1", d.toISOString().slice(0, 10), d.getUTCHours(), fl, p.lat, p.lon).catch(() => null);
  };

  const share = (params: Record<string, string | number>) => {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    history.replaceState(null, "", `/flight?${q}`);
  };

  async function runPlan(p: Plan) {
    if (!ol) return;
    const a = airport(p.from);
    const b = airport(p.to);
    if (!a || !b || a.code === b.code) return setErr(T("Pick two different airports."));
    const path = cruisePath(a, b, p.dep);
    if (!path.length) return setErr(T("This trip is too short to reach cruise level: it makes no lasting contrail."));
    setBusy(true);
    setErr(null);
    try {
      const fp = await footprint(path, p.fl, p.type, lookup(ol.manifest));
      setRes({ fp, path, title: `${a.code} → ${b.code}`, label: `${place(a.code)} → ${place(b.code)} · ${slotLabel(p.dep)} · ${p.type} · FL${p.fl}` });
      share({ from: p.from, to: p.to, dep: p.dep, type: p.type, fl: p.fl });
    } finally {
      setBusy(false);
    }
  }

  async function findLive(callsign: string) {
    if (!ol) return;
    const want = callsign.replace(/\s+/g, "").toUpperCase();
    if (!want) return;
    setBusy(true);
    setErr(null);
    try {
      const list = (await loadLive(20.5, 78.9)).ac;
      setLive(list);
      const a = list.find((x) => x.cs.toUpperCase() === want);
      if (!a) return setErr(tx(`${want} is not in the live picture of India right now (only cruising airline flights above FL200 are).`, `${want} अभी भारत की लाइव तस्वीर में नहीं है (केवल FL200 से ऊपर क्रूज़ करती एयरलाइन उड़ानें होती हैं)।`));
      if (a.alt < 27_000) return setErr(tx(`${a.cs} is at FL${Math.round(a.alt / 100)}, still climbing or descending. Try again once it cruises above FL280.`, `${a.cs} अभी FL${Math.round(a.alt / 100)} पर है, चढ़ रहा या उतर रहा है। FL280 से ऊपर क्रूज़ करने पर फिर देखिए।`));
      const now = Date.now();
      const kmh = (a.gs ?? 450) * 1.852;
      const [lat, lon] = a.trk == null ? [a.lat, a.lon] : move(a.lat, a.lon, a.trk, (kmh * (now - a.t)) / HOUR);
      const b = airport(dest);
      const path = aheadPath({ lat, lon, trk: a.trk ?? 0, t: now }, b, kmh);
      const fl = nearestFl(a.alt);
      const fp = await footprint(path, fl, a.type ?? "", lookup(ol.manifest));
      const where = b ? tx(`to ${place(b.code)}`, `${place(b.code)} तक`) : T("the next hour, on its current heading");
      setRes({ fp, path, title: a.cs, label: `${a.cs} · ${a.type ?? tx("type unknown (A320neo assumed)", "प्रकार अज्ञात (A320neo माना गया)")} · FL${fl} · ${where}` });
      share({ cs: a.cs, ...(b ? { dest: b.code } : {}) });
    } catch {
      setErr(T("The live aircraft feed cannot be reached right now. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    if (!ol) return;
    setHot("busy");
    // every 2 hours of the forecast window, at the chosen level and aircraft's level
    const deps = slots.filter((_, i) => i % 2 === 0);
    setHot(await hottest(SCAN_AIRPORTS, deps, plan.fl, lookup(ol.manifest)));
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div class="page flight">
      <PageHead
        label="Your flight · experimental"
        note={ol ? tx(`Forecast run ${ol.info.run.slice(0, 10)} · physics only`, `पूर्वानुमान रन ${ol.info.run.slice(0, 10)} · केवल भौतिकी`) : ol === null ? "Forecast not published yet" : "Loading forecast…"}
        lines={["Your flight's", "hidden footprint."]}
        lede="Every flight burns fuel. Some also leave a contrail that warms the planet more than that fuel's CO₂, but only where the air is cold and humid enough. Pick a trip, or an airliner flying now, and STRATUM checks the forecast along its whole cruise."
      />
      <div class="wrap">
        {ol === null && <p class="muted mono">{T("The forecast is not published yet. It is built every morning at about 09:30 UTC.")}</p>}
        {ol && (
          <>
            <div class="seg-ctl fp-mode rv" role="tablist" aria-label={T("How to pick the flight")}>
              <button role="tab" aria-selected={mode === "plan"} class={mode === "plan" ? "on" : ""} onClick={() => setMode("plan")}>
                {T("Plan a trip")}
              </button>
              <button role="tab" aria-selected={mode === "live"} class={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>
                {T("A flight in the air now")}
              </button>
            </div>

            {stale && (
              <p class="mono-s live-err">
                {tx(
                  `The latest forecast (run ${ol.info.run.slice(0, 10)}) has no hours left ahead; showing its own hours. A new one is built every morning.`,
                  `नवीनतम पूर्वानुमान (रन ${ol.info.run.slice(0, 10)}) में आगे के घंटे नहीं बचे; उसी के घंटे दिखाए जा रहे हैं। नया पूर्वानुमान हर सुबह बनता है।`,
                )}
              </p>
            )}
            {mode === "plan" ? (
              <form
                class="fp-form rv"
                onSubmit={(e) => {
                  e.preventDefault();
                  runPlan(plan);
                }}
              >
                <label>
                  <span class="label">{T("From")}</span>
                  <select value={plan.from} onChange={(e) => setPlan({ ...plan, from: (e.target as HTMLSelectElement).value })}>
                    {AIRPORTS.map((a) => (
                      <option value={a.code}>{place(a.code)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="label">{T("To")}</span>
                  <select value={plan.to} onChange={(e) => setPlan({ ...plan, to: (e.target as HTMLSelectElement).value })}>
                    {AIRPORTS.map((a) => (
                      <option value={a.code}>{place(a.code)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="label">{T("Departure")}</span>
                  <select value={plan.dep} onChange={(e) => setPlan({ ...plan, dep: Number((e.target as HTMLSelectElement).value) })}>
                    {slots.map((s) => (
                      <option value={s}>{slotLabel(s)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="label">{T("Aircraft")}</span>
                  <select value={plan.type} onChange={(e) => setPlan({ ...plan, type: (e.target as HTMLSelectElement).value })}>
                    {PLAN_TYPES.map((t) => (
                      <option value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="label">{T("Cruise level")}</span>
                  <select value={plan.fl} onChange={(e) => setPlan({ ...plan, fl: Number((e.target as HTMLSelectElement).value) })}>
                    {FLS.filter((f) => f >= 300 && f <= 400).map((f) => (
                      <option value={f}>FL{f}</option>
                    ))}
                  </select>
                </label>
                <button class="gm-big" type="submit" disabled={busy}>
                  {busy ? T("Checking the sky…") : T("Check this flight")}
                </button>
                <div class="fp-scan">
                  <button type="button" class="tool" onClick={scan} disabled={hot === "busy"}>
                    {hot === "busy" ? T("Scanning every route…") : tx(`Find the most contrail-prone trips in this forecast (FL${plan.fl})`, `इस पूर्वानुमान की सबसे ज़्यादा कंट्रेल वाली यात्राएँ खोजें (FL${plan.fl})`)}
                  </button>
                  {Array.isArray(hot) &&
                    (hot.length ? (
                      <ol class="fp-hot-list">
                        {hot.map((h) => (
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...plan, from: h.from, to: h.to, dep: h.dep };
                                setPlan(next);
                                runPlan(next);
                              }}
                            >
                              <b class="mono">
                                {h.from} → {h.to}
                              </b>
                              <span class="mono-s muted">{slotLabel(h.dep)}</span>
                              <span class="mono-s">{tx(`${h.lasting} of ${h.minutes} min in lasting air`, `${h.minutes} में से ${h.lasting} मिनट टिकाऊ हवा में`)}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p class="small muted">{tx(`No trip between the ${SCAN_AIRPORTS.length} busiest airports crosses lasting-contrail air at FL${plan.fl} in this forecast. Try another level.`, `इस पूर्वानुमान में ${SCAN_AIRPORTS.length} सबसे व्यस्त हवाई अड्डों के बीच कोई यात्रा FL${plan.fl} पर टिकाऊ-कंट्रेल वाली हवा से नहीं गुज़रती। कोई दूसरा लेवल आज़माइए।`)}</p>
                    ))}
                </div>
              </form>
            ) : (
              <form
                class="fp-form rv"
                onSubmit={(e) => {
                  e.preventDefault();
                  findLive(cs);
                }}
              >
                <label class="fp-wide">
                  <span class="label">{T("Callsign")}</span>
                  <input value={cs} onInput={(e) => setCs((e.target as HTMLInputElement).value)} placeholder="IGO2131" autocomplete="off" spellcheck={false} list="fp-cs" />
                  <datalist id="fp-cs">{live?.slice(0, 300).map((a) => <option value={a.cs} />)}</datalist>
                </label>
                <label class="fp-wide">
                  <span class="label">{T("Going to (optional)")}</span>
                  <select value={dest} onChange={(e) => setDest((e.target as HTMLSelectElement).value)}>
                    <option value="">{T("Keep its current heading (next hour)")}</option>
                    {AIRPORTS.map((a) => (
                      <option value={a.code}>{place(a.code)}</option>
                    ))}
                  </select>
                </label>
                <button class="gm-big" type="submit" disabled={busy || !cs.trim()}>
                  {busy ? T("Checking the sky…") : T("Find it")}
                </button>
                <p class="small muted fp-wide">
                  {T("Callsigns are on flight-tracking apps: IndiGo flights start IGO, Air India AIC, Air India Express AXB, Akasa AKJ, SpiceJet SEJ.")}{" "}
                  <a href="/now">{T("See the airliners over India now")}</a>
                </p>
              </form>
            )}
            {err && <p class="mono-s live-err">{err}</p>}

            {res && <Result r={res} shapes={shapes} onCopy={copyLink} copied={copied} />}
          </>
        )}
      </div>
    </div>
  );
}

function Result({ r, shapes, onCopy, copied }: { r: Done; shapes: { india: boolean; d: string }[]; onCopy: () => void; copied: boolean }) {
  const { fp, path } = r;
  const p = fp.planned;
  const co2 = p.co2 ?? 0;
  const ratio = co2 > 0 ? fp.warm.p50 / co2 : 0;
  const unknown = p.known < fp.minutes;
  return (
    <section class="section fp-out" aria-live="polite">
      <p class="mono-s muted">{r.label}</p>
      <h2 class="display d-m fp-head">
        {p.lasting > 0
          ? tx(
              <>
                <b>{p.lasting}</b> of {fp.minutes} cruise minutes in air where contrails last.
              </>,
              <>
                क्रूज़ के {fp.minutes} में से <b>{p.lasting}</b> मिनट ऐसी हवा में जहाँ कंट्रेल टिकती हैं।
              </>,
            )
          : tx(<>No lasting-contrail air on this cruise.</>, <>इस क्रूज़ पर कंट्रेल टिकने वाली हवा नहीं।</>)}
      </h2>

      <div class="rt-tiles fp-tiles">
        <div>
          <b>{tonnes(co2)}</b>
          <span>{tx(`CO₂ from the fuel, ${fp.minutes} min of cruise (OpenAP, ${fp.type})`, `ईंधन से CO₂, ${fp.minutes} मिनट क्रूज़ (OpenAP, ${fp.type})`)}</span>
        </div>
        <div class={p.lasting ? "fp-hot" : ""}>
          <b>{p.lasting ? `${tonnes(fp.warm.p25)} – ${tonnes(fp.warm.p75)}` : "0 t"}</b>
          <span>{T("possible contrail warming, CO₂-equivalent over 100 years (middle half of our India runs)")}</span>
        </div>
        <div class={ratio >= 1 ? "fp-hot" : ""}>
          <b>{p.lasting ? `≈ ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×` : "—"}</b>
          <span>{p.lasting ? T("the fuel's CO₂ (central estimate)") : T("the flight's warming is its fuel's CO₂")}</span>
        </div>
      </div>

      <figure class="fp-side rv rv-fade">
        <SideView fp={fp} from={r.title.split(" → ")[0]} to={r.title.split(" → ")[1] ?? ""} />
        <figcaption class="mono-s muted">
          {T("Side view along the cruise: orange where the forecast air lets a contrail last (darker = more of the hour), grey where there is no forecast. Solid line: the planned level; dashed: a better one.")}
        </figcaption>
      </figure>

      <div class="live-grid fp-grid">
        <figure class="adv-map rv rv-fade">
          <svg viewBox={`0 0 ${MW} ${MH.toFixed(0)}`} role="img" aria-label={T("The route on the map, orange where it crosses lasting-contrail air")}>
            <rect width={MW} height={MH} class="adv-sea" />
            {shapes.map((s) => (
              <path d={s.d} class={s.india ? "adv-in" : "adv-land"} />
            ))}
            {path.slice(1).map((q, i) => {
              const a = mp(path[i].lon, path[i].lat);
              const b = mp(q.lon, q.lat);
              const v = p.cells[i];
              return <line class={v != null && v >= LASTING ? "fp-seg hot" : "fp-seg"} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
            })}
            <circle class="fp-end" cx={mp(path[0].lon, path[0].lat)[0]} cy={mp(path[0].lon, path[0].lat)[1]} r="3" />
          </svg>
          <figcaption class="mono-s muted">{T("Cruise only: the climb and the descent are left out.")}</figcaption>
        </figure>

        <div class="live-side">
          <p class="label red">{T("Other levels")}</p>
          {fp.best ? (
            <p>
              {tx(
                <>
                  Flying <b>FL{fp.best.fl}</b> instead: <b>{fp.best.lasting}</b> minutes in lasting-contrail air instead of {p.lasting}, for{" "}
                  {fuel(fp.best.co2! - co2)} of fuel CO₂. About <b>{tonnes(fp.warm.p50 - fp.best.netP50)}</b> CO₂e less
                  warming (central estimate).
                </>,
                <>
                  इसकी जगह <b>FL{fp.best.fl}</b> पर उड़ें: टिकाऊ-कंट्रेल वाली हवा में {p.lasting} की जगह <b>{fp.best.lasting}</b> मिनट, ईंधन CO₂ में{" "}
                  {fuel(fp.best.co2! - co2)}। लगभग <b>{tonnes(fp.warm.p50 - fp.best.netP50)}</b> CO₂e कम
                  गर्मी (केंद्रीय अनुमान)।
                </>,
              )}
            </p>
          ) : (
            <p>{p.lasting ? T("No level within 4,000 ft does clearly better on this route at this time.") : T("Nothing to avoid: the planned level is already clear.")}</p>
          )}
          <table class="alt-table mono small fp-alts">
            <thead>
              <tr>
                <th scope="col">{T("Level")}</th>
                <th scope="col">{T("min in lasting air")}</th>
                <th scope="col">{T("fuel CO₂")}</th>
                <th scope="col">{T("warming + fuel")}</th>
              </tr>
            </thead>
            <tbody>
              {fp.options.map((o) => (
                <tr class={o.fl === p.fl ? "" : o.fl === fp.best?.fl ? "best" : ""}>
                  <th scope="row">
                    FL{o.fl}
                    {o.fl === p.fl ? ` · ${T("planned")}` : ""}
                  </th>
                  <td>{o.lasting}</td>
                  <td>{o.fl === p.fl ? tonnes(o.co2!) : fuel(o.co2! - co2)}</td>
                  <td>{tonnes(o.netP50 + co2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button class="tool" onClick={onCopy}>
            {T(copied ? "Link copied ✓" : "Copy link")}
          </button>
        </div>
      </div>

      <p class="small muted fp-note">
        {tx(
          <>
            How sure is this? It is a physics-only forecast (ECMWF open data through the same Schmidt–Appleman and ice-supersaturation test as our B1
            baseline), and our own test H1 found that physics flags about six times more lasting contrails than the satellite sees, mostly thin ones. The
            warming range is the middle half of the warming contrails in our CoCiP runs over India ({(co2eKg(EF_PER_MIN_J.p25) | 0).toLocaleString()}–
            {(co2eKg(EF_PER_MIN_J.p75) | 0).toLocaleString()} kg CO₂e per minute, 100-year horizon; over 20 years it is about 3.7 times larger). By day a
            contrail can also cool by reflecting sunlight; at night it only warms. Fuel: OpenAP at 80 % of maximum take-off weight. Air traffic control and
            airline limits are not modelled.
            {unknown ? ` ${fp.minutes - p.known} minutes fall outside the forecast and count as clear.` : ""}
          </>,
          <>
            यह कितना पक्का है? यह केवल भौतिकी का पूर्वानुमान है (ECMWF open data, हमारे B1 बेसलाइन वाले श्मिट–ऐपलमैन और बर्फ़-अतिसंतृप्ति परीक्षण से), और हमारे अपने
            परीक्षण H1 ने पाया कि भौतिकी उपग्रह को दिखने वाली टिकाऊ कंट्रेल से लगभग छह गुना ज़्यादा चिह्नित करती है, ज़्यादातर पतली। गर्मी का दायरा भारत के ऊपर हमारे
            CoCiP रनों की गर्म करने वाली कंट्रेल का बीच का आधा हिस्सा है ({(co2eKg(EF_PER_MIN_J.p25) | 0).toLocaleString()}–
            {(co2eKg(EF_PER_MIN_J.p75) | 0).toLocaleString()} kg CO₂e प्रति मिनट, 100 वर्ष; 20 वर्ष पर लगभग 3.7 गुना)। दिन में कंट्रेल सूरज की रोशनी लौटाकर ठंडक भी दे सकती
            है; रात में वह केवल गर्म करती है। ईंधन: अधिकतम टेक-ऑफ़ भार के 80 % पर OpenAP। हवाई यातायात नियंत्रण और एयरलाइन की सीमाएँ मॉडल नहीं की गईं।
            {unknown ? ` ${fp.minutes - p.known} मिनट पूर्वानुमान से बाहर हैं और साफ़ गिने गए।` : ""}
          </>,
        )}
      </p>
    </section>
  );
}

/** "+120 kg" / "−80 kg" of fuel CO₂ against the planned level. */
const fuel = (kg: number) => `${kg >= 0 ? "+" : "−"}${Math.abs(kg) >= 1000 ? tonnes(Math.abs(kg)) : `${Math.round(Math.abs(kg))} kg`}`;

/** The humid layers along the cruise: one column per minute, one row per flight level. */
function SideView({ fp, from, to }: { fp: Footprint; from: string; to: string }) {
  const W = 720;
  const L = 52;
  const rowH = 22;
  const rows = [...fp.levels].reverse(); // FL420 at the top
  const H = rows.length * rowH;
  const cw = (W - L - 8) / Math.max(1, fp.minutes);
  const y = (fl: number) => rows.findIndex((r) => r.fl === fl) * rowH + rowH / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} class="fp-svg" role="img" aria-label={T("Lasting-contrail air along the cruise at every flight level")}>
      {rows.map((r, ri) => (
        <g>
          <text x={L - 8} y={ri * rowH + rowH * 0.68} text-anchor="end" class="ax">
            FL{r.fl}
          </text>
          {r.cells.map((v, i) => (
            <rect x={L + i * cw} y={ri * rowH + 1} width={cw + 0.4} height={rowH - 2} class={v == null ? "fp-none" : "fp-cell"} style={v == null ? undefined : { opacity: Math.min(1, v * 1.1) }}>
              <title>{v == null ? `FL${r.fl}: ${T("no forecast")}` : tx(`FL${r.fl}, minute ${i + 1}: lasting-contrail air ${Math.round(v * 100)} % of the hour`, `FL${r.fl}, मिनट ${i + 1}: घंटे के ${Math.round(v * 100)} % टिकाऊ-कंट्रेल वाली हवा`)}</title>
            </rect>
          ))}
        </g>
      ))}
      <line class="fp-planned" x1={L} x2={W - 8} y1={y(fp.planned.fl)} y2={y(fp.planned.fl)} />
      {fp.best && <line class="fp-best" x1={L} x2={W - 8} y1={y(fp.best.fl)} y2={y(fp.best.fl)} />}
      <text x={L} y={H + 16} class="ax">
        {from}
      </text>
      <text x={(L + W) / 2} y={H + 16} text-anchor="middle" class="ax">
        {tx(`${fp.minutes} min of cruise`, `${fp.minutes} मिनट क्रूज़`)}
      </text>
      <text x={W - 8} y={H + 16} text-anchor="end" class="ax">
        {to}
      </text>
    </svg>
  );
}
