import { useState } from "preact/hooks";
import type { ExplainItem } from "../data/contract";
import { T, tx } from "../i18n";

/** "Why this prediction?" for one map card: the exact TreeSHAP contributions of the STRATUM model
 *  (the fold that holds the day out) for the card's most likely segment. Bars push the model's
 *  score up (orange, more likely a seen lasting contrail) or down (teal). Season and time of day
 *  are each one bar (their sine and cosine parts added). */

type Feat = { label: string; fmt: (x: number) => string };
const pctf = (x: number) => `${Math.round(x * 100)} %`;
const FEATS: Record<string, Feat> = {
  rhi_at_level: { label: "Humidity vs ice at the level", fmt: pctf },
  rhi_level_above: { label: "Humidity vs ice, level above", fmt: pctf },
  rhi_level_below: { label: "Humidity vs ice, level below", fmt: pctf },
  rhi_vertical_gradient: { label: "Humidity change with height", fmt: (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)} %/km` },
  temperature: { label: "Temperature", fmt: (x) => `${Math.round(x - 273.15)} °C` },
  temp_minus_TLM: { label: "Margin to the contrail limit", fmt: (x) => (x <= 0 ? `${Math.abs(x).toFixed(0)} °C ${T("colder")}` : `${x.toFixed(0)} °C ${T("warmer")}`) },
  pressure: { label: "Pressure (flight level)", fmt: (x) => `${Math.round(x / 100)} hPa` },
  cloud_ice_water_content: { label: "Natural cirrus ice", fmt: (x) => `${(x * 1e6).toFixed(1)} mg/kg` },
  high_cloud_fraction: { label: "High cloud cover", fmt: pctf },
  vertical_velocity: { label: "Rising or sinking air", fmt: (x) => (x < 0 ? `${T("rising")} ${(-x).toFixed(2)} Pa/s` : `${T("sinking")} ${x.toFixed(2)} Pa/s`) },
  vertical_wind_shear: { label: "Wind shear", fmt: (x) => `${x.toFixed(1)} m/s ${T("per km")}` },
  distance_to_tropopause_wmo: { label: "Distance below the tropopause", fmt: (x) => `${(x / 1000).toFixed(1)} km` },
  latitude: { label: "Latitude", fmt: (x) => `${x.toFixed(1)}°N` },
  longitude: { label: "Longitude", fmt: (x) => `${x.toFixed(1)}°E` },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const TOP = 6;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

type Bar = { label: string; value: string; phi: number };

/** One bar per feature (sine/cosine pairs merged), strongest first. */
export function bars(features: string[], it: ExplainItem): Bar[] {
  const v = (n: string) => it.x[features.indexOf(n)];
  const ph = (n: string) => it.phi[features.indexOf(n)] ?? 0;
  const out: Bar[] = [];
  for (const [i, f] of features.entries()) {
    if (f.startsWith("month_") || f.startsWith("local_solar_time_")) continue;
    const x = it.x[i];
    out.push({ label: FEATS[f] ? T(FEATS[f].label) : f, value: x == null ? "—" : (FEATS[f]?.fmt ?? String)(x), phi: it.phi[i] ?? 0 });
  }
  if (features.includes("month_sin")) out.push({ label: T("Season"), value: tx(MONTHS, MONTHS_HI)[Number(it.t.slice(5, 7)) - 1] ?? "—", phi: ph("month_sin") + ph("month_cos") });
  if (features.includes("local_solar_time_sin")) {
    const s = v("local_solar_time_sin");
    const c = v("local_solar_time_cos");
    const h = s == null || c == null ? null : (((Math.atan2(s, c) / (2 * Math.PI)) * 24 + 24) % 24);
    out.push({ label: T("Time of day (local sun)"), value: h == null ? "—" : `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`, phi: ph("local_solar_time_sin") + ph("local_solar_time_cos") });
  }
  return out.sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
}

export function WhyPanel({ it, features, base }: { it: ExplainItem; features: string[]; base: number | null }) {
  const [open, setOpen] = useState(false);
  const all = bars(features, it);
  const top = all.slice(0, TOP);
  const rest = all.slice(TOP).reduce((s, b) => s + b.phi, 0);
  const max = Math.max(0.01, ...top.map((b) => Math.abs(b.phi)), Math.abs(rest));
  return (
    <div class={`dk dk-why ${open ? "open" : ""}`}>
      <button class="why-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="label red">{T("Why this prediction?")}</span>
        <span class="mono-s">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <>
          <p class="small muted">
            {tx(
              <>
                What moved STRATUM's score for the most likely minute of this stretch ({it.t.slice(11, 16)} UTC, FL{it.fl}): from the average
                {base != null ? ` (${(sigmoid(base) * 100).toFixed(1)} %)` : ""} to this segment{it.p != null ? ` (${(it.p * 100).toFixed(1)} % after calibration)` : ""}.
              </>,
              <>
                इस हिस्से के सबसे संभावित मिनट ({it.t.slice(11, 16)} UTC, FL{it.fl}) पर STRATUM के स्कोर को किसने बदला: औसत
                {base != null ? ` (${(sigmoid(base) * 100).toFixed(1)} %)` : ""} से इस हिस्से तक{it.p != null ? ` (कैलिब्रेशन के बाद ${(it.p * 100).toFixed(1)} %)` : ""}।
              </>,
            )}
          </p>
          <ul class="why-bars">
            {top.map((b) => (
              <li>
                <span class="why-l">
                  {b.label}
                  <em class="mono-s">{b.value}</em>
                </span>
                <span class="why-track" aria-label={tx(`${b.phi >= 0 ? "raises" : "lowers"} the score by ${Math.abs(b.phi).toFixed(2)}`, `स्कोर को ${Math.abs(b.phi).toFixed(2)} ${b.phi >= 0 ? "बढ़ाता" : "घटाता"} है`)}>
                  <i class={b.phi >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(b.phi) / max) * 50}%` }} />
                </span>
              </li>
            ))}
            {all.length > TOP && (
              <li class="muted">
                <span class="why-l">
                  {all.length - TOP} {T("other factors together")}
                </span>
                <span class="why-track">
                  <i class={rest >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(rest) / max) * 50}%` }} />
                </span>
              </li>
            )}
          </ul>
          <p class="mono-s muted">{T("orange: raises the chance · teal: lowers it · exact TreeSHAP, model score in log-odds")}</p>
        </>
      )}
    </div>
  );
}
