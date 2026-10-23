import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { Manifest, OutlookInfo } from "../data/contract";
import { loadLive, loadOutlook, outlookValue } from "../data/load";
import { T, tx } from "../i18n";
import { readExif } from "../lib/exif";
import { dirName } from "../lib/geo";
import { type Candidate, candidates, type Look } from "../lib/spot";

/** /spot — "Spot a contrail": pick a photo of a contrail; its time and place (read on the device
 *  from the photo's EXIF, or entered by hand) and the live aircraft flown backwards along their
 *  tracks say which airliner most likely drew it. The photo never leaves the device; the server
 *  sees only a location rounded to 0.5° (to fetch the aircraft nearby). Works for photos from the
 *  last two hours: live positions are all we keep. */

type Kind = "lasting" | "short" | "none" | "unknown";
const PLACES = [
  { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Hyderabad", lat: 17.39, lon: 78.49 },
];
const BEARINGS: [string, number | null][] = [["Anywhere", null], ["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]];
const HEIGHTS: [Look["height"], string][] = [["overhead", "Straight up"], ["high", "High"], ["mid", "Halfway"], ["low", "Low, near the horizon"]];
const MAX_AGE_MIN = 120;
const KIND_TEXT: Record<Kind, string> = {
  lasting: "the forecast says contrails last in its air",
  short: "the forecast says only short contrails form in its air",
  none: "the forecast says its air was too warm or dry for a contrail",
  unknown: "no forecast for that place and hour",
};
const hm = (t: number) => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function Spot() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [exifNote, setExifNote] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState<string>("");
  const [ago, setAgo] = useState(0); // minutes before now
  const [look, setLook] = useState<Look>({ bearing: null, height: "high" });
  const [res, setRes] = useState<{ list: Candidate[]; kinds: Record<string, Kind>; photoT: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ol, setOl] = useState<{ manifest: Manifest; info: OutlookInfo } | null>(null);

  useEffect(() => {
    loadOutlook().then(setOl);
    return () => {
      if (photo) URL.revokeObjectURL(photo);
    };
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(f)); // stays in this browser tab
    setRes(null);
    const info = readExif(await f.slice(0, 256 * 1024).arrayBuffer());
    const notes: string[] = [];
    if (info.taken) {
      const m = Math.round((Date.now() - info.taken.getTime()) / 60_000);
      setAgo(Math.max(0, m));
      notes.push(tx(`taken ${hm(info.taken.getTime())} IST`, `ली गई ${hm(info.taken.getTime())} IST`));
    } else notes.push(T("no time saved in the photo: set it below"));
    if (info.lat != null && info.lon != null) {
      setLat(Math.round(info.lat * 100) / 100);
      setLon(Math.round(info.lon * 100) / 100);
      setPlaceName("where the photo was taken");
      notes.push(T("location read from the photo"));
    } else notes.push(T("no location in the photo: pick a place"));
    setExifNote(notes.join(" · "));
  };

  const myLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLat(Math.round(p.coords.latitude * 100) / 100);
        setLon(Math.round(p.coords.longitude * 100) / 100);
        setPlaceName("your location");
      },
      () => setErr(T("Location was not shared. Pick a city instead.")),
      { maximumAge: 600_000, timeout: 10_000 },
    );

  const find = async () => {
    if (lat == null || lon == null) return setErr(T("Pick where you were first."));
    if (ago > MAX_AGE_MIN) return setErr(tx(`This photo is ${ago} minutes old. We only keep the live sky, so this works for photos from the last two hours.`, `यह फ़ोटो ${ago} मिनट पुरानी है। हम केवल लाइव आसमान रखते हैं, इसलिए यह पिछले दो घंटों की फ़ोटो के लिए ही काम करता है।`));
    setBusy(true);
    setErr(null);
    try {
      const live = await loadLive(lat, lon);
      const photoT = Date.now() - ago * 60_000;
      const list = candidates(live.ac, lat, lon, photoT, look).slice(0, 8);
      const kinds: Record<string, Kind> = {};
      if (ol) {
        const fls = ol.manifest.flight_levels.map((f) => f.fl);
        await Promise.all(
          list.map(async (c) => {
            const d = new Date(c.passAt);
            const fl = fls.reduce((b, f) => (Math.abs(f * 100 - c.alt) < Math.abs(b * 100 - c.alt) ? f : b), fls[0]);
            const date = d.toISOString().slice(0, 10);
            const [b1, sac] = await Promise.all([
              outlookValue(ol.manifest, "B1", date, d.getUTCHours(), fl, c.passLat, c.passLon).catch(() => null),
              outlookValue(ol.manifest, "SAC", date, d.getUTCHours(), fl, c.passLat, c.passLon).catch(() => null),
            ]);
            kinds[c.cs] = b1 == null || sac == null ? "unknown" : b1 >= 0.5 ? "lasting" : sac >= 0.5 ? "short" : "none";
          }),
        );
      }
      setRes({ list, kinds, photoT });
      // on a phone the answer is below the form: bring it into view
      if (innerWidth < 900) requestAnimationFrame(() => document.querySelector(".spot-out")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErr(T("The live aircraft feed cannot be reached right now. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  };

  // lasting-contrail planes first among near-equal candidates
  const ranked = useMemo(() => {
    if (!res) return [];
    // you saw a contrail: planes whose air can make one come first; a plane in air that cannot,
    // or low on approach/departure (below FL260, rarely cold enough), goes down the list
    const adj = (c: Candidate) => {
      const k = res.kinds[c.cs];
      return c.score + (k === "lasting" ? -0.25 : k === "short" ? -0.1 : k === "none" ? 0.6 : 0) + (c.alt < 26_000 ? 0.4 : 0);
    };
    return [...res.list].sort((a, b) => adj(a) - adj(b));
  }, [res]);
  const top = ranked[0] ?? null;

  return (
    <div class="page spot">
      <PageHead
        label="Spot a contrail · live"
        note="Your photo stays on your device"
        lines={["Spot a contrail."]}
        lede="Took a photo of a white line in the sky? Add it here. From the photo's time and place we fly every airliner over India backwards along its track and find the one that crossed your patch of sky just before."
      />
      <div class="wrap spot-grid">
        <div class="spot-form">
          <label class="spot-drop">
            <input type="file" accept="image/*" onChange={(e) => onFile((e.target as HTMLInputElement).files?.[0])} />
            {photo ? <img src={photo} alt={T("Your contrail photo (only on this device)")} /> : <span>+ {T("Choose or take a photo")}</span>}
          </label>
          {exifNote && <p class="mono-s muted">{exifNote}</p>}

          <fieldset>
            <legend class="label">{T("Where were you?")}</legend>
            <div class="live-places">
              {PLACES.map((p) => (
                <button class={placeName === p.name ? "tool on" : "tool"} onClick={() => (setLat(p.lat), setLon(p.lon), setPlaceName(p.name))}>
                  {T(p.name)}
                </button>
              ))}
              <button class={placeName === "your location" ? "tool on" : "tool"} onClick={myLocation}>
                ◎ {T("My location")}
              </button>
            </div>
            {lat != null && placeName && <p class="mono-s muted">{tx(`Using ${placeName}`, `${T(placeName)} का इस्तेमाल`)}</p>}
          </fieldset>

          <fieldset>
            <legend class="label">{T("When?")}</legend>
            <input type="range" min={0} max={MAX_AGE_MIN} step={1} value={ago} aria-label={T("Minutes ago")} onInput={(e) => setAgo(Number((e.target as HTMLInputElement).value))} />
            <p class="mono-s">{ago === 0 ? T("just now") : tx(`${ago} min ago (${hm(Date.now() - ago * 60_000)} IST)`, `${ago} मिनट पहले (${hm(Date.now() - ago * 60_000)} IST)`)}</p>
          </fieldset>

          <fieldset>
            <legend class="label">{T("Which way were you looking? (optional)")}</legend>
            <div class="spot-dirs">
              {BEARINGS.map(([n, b]) => (
                <button class={look.bearing === b ? "tool on" : "tool"} aria-pressed={look.bearing === b} onClick={() => setLook({ ...look, bearing: b })}>
                  {n === "Anywhere" ? T(n) : n}
                </button>
              ))}
            </div>
            {look.bearing != null && (
              <div class="spot-dirs">
                {HEIGHTS.map(([h, t]) => (
                  <button class={look.height === h ? "tool on" : "tool"} aria-pressed={look.height === h} onClick={() => setLook({ ...look, height: h })}>
                    {T(t)}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <button class="gm-big" onClick={find} disabled={busy || lat == null}>
            {busy ? T("Searching the sky…") : T("Find the plane")}
          </button>
          {err && <p class="mono-s live-err">{err}</p>}
          <p class="small muted">
            {T(
              "Your photo is shown only in this browser tab and is never uploaded. Its time and place are read here, on your device. To fetch the aircraft nearby, our server receives your location rounded to about 50 km.",
            )}
          </p>
        </div>

        <div class="spot-out" aria-live="polite">
          {!res && <p class="muted">{T("The answer appears here.")}</p>}
          {res && !top && (
            <div class="live-card">
              <p class="live-cs">{T("No match")}</p>
              <p>
                {tx(
                  <>
                    No airliner we can see crossed that part of your sky in the hour before {hm(res.photoT)} IST. The contrail may be older than an hour, may have
                    drifted far with the wind, or the plane may already have left our live data (landed, or flown out of the region).
                  </>,
                  <>
                    {hm(res.photoT)} IST से पहले के घंटे में हमें दिखने वाला कोई यात्री विमान आपके आसमान के उस हिस्से से नहीं गुज़रा। हो सकता है कंट्रेल एक घंटे से
                    पुरानी हो, हवा के साथ दूर बह गई हो, या विमान हमारे लाइव डेटा से निकल चुका हो (उतर गया, या क्षेत्र से बाहर उड़ गया)।
                  </>,
                )}
              </p>
            </div>
          )}
          {res && top && (
            <>
              <div class="live-card spot-best">
                <p class="label red">{T("Most likely")}</p>
                <p class="live-cs">{top.cs}</p>
                <p class="mono-s muted">
                  {top.type ?? T("Airliner")} · FL{String(Math.round(top.alt / 100)).padStart(3, "0")}
                </p>
                <p>
                  {tx(
                    <>
                      It crossed your sky <b>{Math.round(top.ageMin)} min</b> before the photo, about <b>{Math.round(top.distKm)} km</b> to the{" "}
                      <b>{dirName(top.bearing)}</b>
                      {top.distKm < 8 ? " (nearly overhead)" : ""}, and {KIND_TEXT[res.kinds[top.cs] ?? "unknown"]}.
                    </>,
                    <>
                      यह फ़ोटो से <b>{Math.round(top.ageMin)} मिनट</b> पहले आपके आसमान से गुज़रा, लगभग <b>{Math.round(top.distKm)} किमी</b>{" "}
                      <b>{dirName(top.bearing)}</b> में{top.distKm < 8 ? " (लगभग सिर के ऊपर)" : ""}, और {T(KIND_TEXT[res.kinds[top.cs] ?? "unknown"])}।
                    </>,
                  )}
                </p>
                {res.kinds[top.cs] === "none" && (
                  <p class="small">
                    {T(
                      "Your photo says otherwise. Forecasts often miss thin layers of ice-saturated air at cruise height, and that gap is exactly what STRATUM learns to fill from satellite images.",
                    )}
                  </p>
                )}
              </div>
              {ranked.length > 1 && (
                <>
                  <p class="label">{T("Also possible")}</p>
                  <ol class="live-list">
                    {ranked.slice(1).map((c) => (
                      <li>
                        <span class={`spot-row k-${res.kinds[c.cs] ?? "unknown"}`}>
                          <i />
                          <span class="mono">{c.cs}</span>
                          <span class="mono-s muted">
                            {tx(`${Math.round(c.ageMin)} min before`, `${Math.round(c.ageMin)} मिनट पहले`)} · {Math.round(c.distKm)} {tx("km", "किमी")} {dirName(c.bearing)} · FL{String(Math.round(c.alt / 100)).padStart(3, "0")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <p class="small muted">
                {T(
                  "How: each aircraft is flown backwards along its current heading at its current speed (good for cruising flights over an hour; a plane that turned will be missed). Live aircraft: The OpenSky Network, adsb.lol (ODbL). Forecast: ECMWF open data.",
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
