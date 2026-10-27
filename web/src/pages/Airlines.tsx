import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { loadDashboard, loadWeightedSummary } from "../data/load";
import { Bars, Hours, pc, type Row } from "../components/WarmingCharts";
import { T, tx } from "../i18n";
import { ATF_KG_PER_L, type Decisions, perAlert, rupees, year } from "../lib/business";

/** /airlines — the business case: the EU now makes airlines monitor and report their contrails'
 *  climate effect (from 2027 for every flight between India and Europe), where STRATUM fits, and
 *  a calculator for what avoiding contrails would cost an Indian airline in rupees. Facts checked
 *  against the European Commission's aviation page and EUR-Lex on 24 Oct 2026; calculator from
 *  the D-006 decisions (lib/business.ts). */

// defaults, editable on the page (checked 24 Oct 2026)
const ATF_RS_PER_L = 137; // Delhi ATF from 1 Oct 2026 (oil companies' fortnightly revision)
const EUR_PER_T = 85; // EU ETS allowance, mid-October 2026
const INR_PER_EUR = 106.56; // reference rate of 19 Oct 2026

const SOURCES = {
  ec: "https://climate.ec.europa.eu/areas-action/transport-decarbonisation/reducing-emissions-aviation_en",
  directive: "https://eur-lex.europa.eu/legal-content/en/TXT/?uri=CELEX%3A32023L0958",
  corsia: "https://www.icao.int/sites/default/files/APAC/Meetings/2025/2025%20CORSIASAP/Presentations/PPT-FOR-ICAO-CORSIA-SEMINAR_India.pdf",
};

type Airline = { key: string; share: number };

export function Airlines() {
  const [dec, setDec] = useState<Decisions | null | undefined>(undefined);
  const [airlines, setAirlines] = useState<Airline[]>([]);
  const [who, setWho] = useState("all");
  const [atf, setAtf] = useState(ATF_RS_PER_L);
  const [eur, setEur] = useState(EUR_PER_T);
  const [fx, setFx] = useState(INR_PER_EUR);
  const [dash, setDash] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    loadWeightedSummary().then((w) => setDec(w ? (w.decisions as Decisions) : null));
    loadDashboard().then((d) => {
      setDash(d);
      setAirlines(((d?.by_airline ?? []) as { key: string; share_warm_w: number }[]).filter((r) => r.key !== "other").map((r) => ({ key: r.key, share: r.share_warm_w })));
    });
  }, []);

  const p = useMemo(() => (dec ? perAlert(dec) : null), [dec]);
  const share = who === "all" ? 1 : (airlines.find((a) => a.key === who)?.share ?? 0);
  const y = p ? year(p, { alertsPerDay: p.perDay * share, atfRsPerL: atf, eurPerT: eur, inrPerEur: fx }) : null;
  const rs = (v: number) => tx(rupees(v), rupees(v).replace("crore", "करोड़").replace("lakh", "लाख"));

  return (
    <div class="page airlines">
      <PageHead
        label="For airlines · the business case"
        note="EU rules checked 24 Oct 2026"
        lines={["The rules now", "count contrails."]}
        lede="Since 2025 the European Union has made airlines monitor and report the climate effect of their contrails, and from 2027 that includes every flight between India and Europe. Here is the rule, where STRATUM fits, and what avoiding contrails would cost an airline over India."
      />
      <div class="wrap">
        <section class="section pt0" aria-labelledby="rule">
          <div class="sec-head rv">
            <p class="label red" id="rule">
              {T("§1 · The rule")}
            </p>
            <span class="mono-s">EU ETS · non-CO₂ MRV</span>
          </div>
          <ol class="al-time rv">
            <li>
              <b class="mono">2023</b>
              <span>
                {T("The EU adds non-CO₂ effects of aviation, contrails among them, to its Emissions Trading System law and asks for a system to monitor, report and verify them.")}{" "}
                <a href={SOURCES.directive} target="_blank" rel="noopener">
                  Directive (EU) 2023/958
                </a>
              </span>
            </li>
            <li>
              <b class="mono">{tx("1 Jan 2025", "1 जनवरी 2025")}</b>
              <span>{T("Monitoring starts for flights between airports in the European Economic Area (and from there to Switzerland and the UK), reported once a year.")}</span>
            </li>
            <li>
              <b class="mono">2025–26</b>
              <span>{T("Flights to and from the rest of the world, India included, may report voluntarily.")}</span>
            </li>
            <li class="al-key">
              <b class="mono">{tx("1 Jan 2027", "1 जनवरी 2027")}</b>
              <span>{T("Mandatory for all flights into and out of the European Economic Area: every flight between India and Europe.")}</span>
            </li>
            <li>
              <b class="mono">{tx("End 2027", "2027 के अंत तक")}</b>
              <span>{T("The European Commission reports on the results and, if appropriate, proposes a law to address aviation's non-CO₂ effects.")}</span>
            </li>
            <li>
              <b class="mono">{tx("India, 2027", "भारत, 2027")}</b>
              <span>
                {T("Indian airlines enter the mandatory phase of ICAO's CORSIA. It covers CO₂ only: contrails are not in it yet.")}{" "}
                <a href={SOURCES.corsia} target="_blank" rel="noopener">
                  ICAO / DGCA
                </a>
              </span>
            </li>
          </ol>
          <p class="small muted rv">
            {T("Source for 2025–2027:")}{" "}
            <a href={SOURCES.ec} target="_blank" rel="noopener">
              {T("European Commission, Reducing emissions from aviation")}
            </a>
            .
          </p>
        </section>

        <section class="section" aria-labelledby="fit">
          <div class="sec-head rv">
            <p class="label red" id="fit">
              {T("§2 · Where STRATUM fits")}
            </p>
            <span class="mono-s">{T("same physics, checked over India")}</span>
          </div>
          <div class="al-cols rv stagger">
            <div>
              <p class="label">{T("What the EU uses")}</p>
              <p>{T("Its default method estimates each flight's contrail effect with CoCiP, the contrail model STRATUM also uses, driven by weather forecasts, and turns it into CO₂-equivalent (20, 50 and 100 years) in the EU's own tracking system.")}</p>
            </div>
            <div>
              <p class="label">{T("What we found over India")}</p>
              <p>
                {T("That physics flags about six times more lasting contrails over India than the satellite sees (our test H1), and the humidity it relies on is poorly measured at cruise height here. Estimates for India's skies need checking against India's skies.")}{" "}
                <a href="/results#h1">H1 →</a>
              </p>
            </div>
            <div>
              <p class="label">{T("What STRATUM adds")}</p>
              <p>
                {T("A satellite check of the forecast every day, a correction learned from Meteosat-9, a footprint for any flight, and altitude advice only where the cautious estimate says it helps.")}{" "}
                <a href="/report">{T("Report card")} →</a> · <a href="/flight">{T("Your flight")} →</a>
              </p>
            </div>
          </div>
          <p class="small muted rv">{T("STRATUM is a student research prototype, not an approved monitoring tool, and no real flight was changed.")}</p>
        </section>

        <section class="section" aria-labelledby="calc" id="calculator">
          <div class="sec-head rv">
            <p class="label red" id="calc">
              {T("§3 · What would it cost?")}
            </p>
            <span class="mono-s">{T("per year · from our decision runs (D-006)")}</span>
          </div>
          {dec === null && <p class="muted mono">{T("The decision data are not published yet.")}</p>}
          {p && y && (
            <>
              <form class="fp-form al-form" onSubmit={(e) => e.preventDefault()}>
                <label>
                  <span class="label">{T("Airline")}</span>
                  <select value={who} onChange={(e) => setWho((e.target as HTMLSelectElement).value)}>
                    <option value="all">{T("All airlines over India")}</option>
                    {airlines.map((a) => (
                      <option value={a.key}>{a.key}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="label">{T("Jet fuel, ₹ per litre")}</span>
                  <input type="number" min={1} step={1} value={atf} onInput={(e) => setAtf(Number((e.target as HTMLInputElement).value) || 0)} />
                </label>
                <label>
                  <span class="label">{T("Carbon price, € per tonne")}</span>
                  <input type="number" min={0} step={1} value={eur} onInput={(e) => setEur(Number((e.target as HTMLInputElement).value) || 0)} />
                </label>
                <label>
                  <span class="label">{T("₹ per €")}</span>
                  <input type="number" min={1} step={0.01} value={fx} onInput={(e) => setFx(Number((e.target as HTMLInputElement).value) || 0)} />
                </label>
              </form>

              <div class="rt-tiles al-tiles">
                <div>
                  <b>{Math.round(y.alerts).toLocaleString()}</b>
                  <span>{tx(`altitude changes a year (${(p.perDay * share).toFixed(1)} a day)`, `ऊँचाई बदलाव प्रति वर्ष (${(p.perDay * share).toFixed(1)} प्रति दिन)`)}</span>
                </div>
                <div>
                  <b>{rs(y.fuelCostRs)}</b>
                  <span>{tx(`extra fuel (${Math.round(y.fuelT).toLocaleString()} t a year)`, `अतिरिक्त ईंधन (${Math.round(y.fuelT).toLocaleString()} t प्रति वर्ष)`)}</span>
                </div>
                <div class="al-good">
                  <b>{Math.round(y.avoidedT).toLocaleString()} t</b>
                  <span>{tx(`CO₂e of warming avoided (100 years, median; cautious: ${Math.round(y.cautiousT).toLocaleString()} t)`, `CO₂e गर्मी टली (100 वर्ष, माध्यिका; सतर्क: ${Math.round(y.cautiousT).toLocaleString()} t)`)}</span>
                </div>
                <div class="al-good">
                  <b>{rs(y.rsPerTonne)}</b>
                  <span>{tx(`per tonne avoided, against a carbon price of ${rupees(y.carbonRsPerT)} a tonne`, `प्रति टन टली गर्मी, जबकि कार्बन की कीमत ${rupees(y.carbonRsPerT)} प्रति टन`)}</span>
                </div>
              </div>

              <p class="lede al-line rv">
                {tx(
                  <>
                    Avoiding contrails would cost about <b>{rs(y.rsPerTonne)}</b> of fuel per tonne of CO₂-equivalent warming avoided:{" "}
                    <b>{y.carbonRsPerT > 0 ? Math.round(y.carbonRsPerT / y.rsPerTonne) : "—"}×</b> cheaper than the EU's carbon price. At that price the avoided warming
                    is worth <b>{rs(y.valueRs)}</b> a year.
                  </>,
                  <>
                    कंट्रेल से बचने में हर टन CO₂ के बराबर टली गर्मी पर लगभग <b>{rs(y.rsPerTonne)}</b> का ईंधन लगेगा: EU की कार्बन कीमत से{" "}
                    <b>{y.carbonRsPerT > 0 ? Math.round(y.carbonRsPerT / y.rsPerTonne) : "—"}×</b> सस्ता। उस कीमत पर टली गर्मी का मूल्य हर साल <b>{rs(y.valueRs)}</b> है।
                  </>,
                )}
              </p>

              <p class="small muted">
                {tx(
                  <>
                    How: our decision layer redone with STRATUM's probabilities (second analysis D-006) flagged {dec!.alerts} altitude changes on{" "}
                    {dec!.days} days over India; each used {Math.round(p.fuelKg)} kg of extra fuel and avoided about {(p.avoidedKg / 1000).toFixed(1)} t CO₂e of warming
                    (100-year median; 20 years: {(p.avoided20Kg / 1000).toFixed(1)} t). An airline's share of the alerts is its share of STRATUM-weighted contrail warming
                    (Routes & airlines). Only the 60 strongest stretches a day were checked, so the real number of useful changes is higher. Fuel at{" "}
                    {ATF_KG_PER_L} kg per litre; the extra fuel's own CO₂ is already subtracted from the warming avoided. Contrail warming is converted to CO₂e with
                    efficacy 0.42 and GWP-100, as pre-registered; other metrics give other numbers. Not modelled: air traffic control, schedules, and whether a
                    level is free. Defaults (24 Oct 2026): ATF in Delhi from 1 Oct, EU carbon allowance mid-October, reference rate of 19 Oct; change them above.
                  </>,
                  <>
                    कैसे: STRATUM की संभावनाओं से दोबारा चलाई गई हमारी निर्णय परत (दूसरा विश्लेषण D-006) ने भारत के ऊपर {dec!.days} दिनों में {dec!.alerts} ऊँचाई बदलाव
                    चिह्नित किए; हर एक में {Math.round(p.fuelKg)} kg अतिरिक्त ईंधन लगा और लगभग {(p.avoidedKg / 1000).toFixed(1)} t CO₂e गर्मी टली (100 वर्ष माध्यिका; 20 वर्ष:{" "}
                    {(p.avoided20Kg / 1000).toFixed(1)} t)। किसी एयरलाइन का हिस्सा STRATUM-भारित कंट्रेल गर्मी में उसका हिस्सा है (रूट और एयरलाइन)। हर दिन केवल 60 सबसे प्रबल
                    हिस्से जाँचे गए, इसलिए उपयोगी बदलावों की असली संख्या ज़्यादा है। ईंधन {ATF_KG_PER_L} kg प्रति लीटर; अतिरिक्त ईंधन का अपना CO₂ टली गर्मी से पहले ही घटाया गया
                    है। कंट्रेल गर्मी को पहले से दर्ज तरीके से CO₂e में बदला गया है (प्रभावकारिता 0.42, GWP-100); दूसरे माप दूसरे अंक देते हैं। मॉडल नहीं किया गया: हवाई यातायात
                    नियंत्रण, समय-सारणी, और लेवल खाली है या नहीं। डिफ़ॉल्ट (24 अक्टूबर 2026): दिल्ली में 1 अक्टूबर से ATF, अक्टूबर मध्य का EU कार्बन मूल्य, 19 अक्टूबर की
                    संदर्भ दर; इन्हें ऊपर बदलें।
                  </>,
                )}
              </p>
            </>
          )}
        </section>

        {dash && (
          <section class="section al-dash" aria-labelledby="where">
            <div class="sec-head rv">
              <p class="label red" id="where">
                {T("§4 · Where the warming comes from")}
              </p>
              <span class="mono-s">{tx(`${dash.totals.flights.toLocaleString()} commercial flights · 12 days`, `${dash.totals.flights.toLocaleString()} व्यावसायिक उड़ानें · 12 दिन`)}</span>
            </div>
            <div class="rt-tiles rv">
              <div>
                <b>{pc(dash.concentration.top_1pct_flights, 0)}</b>
                <span>{T("of the warming came from the top 1 % of flights")}</span>
              </div>
              <div>
                <b>{pc(dash.concentration.top_10pct_flights, 0)}</b>
                <span>{T("from the top 10 %")}</span>
              </div>
              <div>
                <b>{pc(dash.totals.flights_warming / dash.totals.flights, 0)}</b>
                <span>{T("of flights made any warming contrail")}</span>
              </div>
              <div>
                <b>{pc(night(dash.by_hour_ist, "share_warm_w"), 0)}</b>
                <span>{tx(`of the warming at night (18:00–06:00 IST), for ${pc(night(dash.by_hour_ist, "share_km"), 0)} of the distance`, `गर्मी रात में (18:00–06:00 IST), जबकि दूरी केवल ${pc(night(dash.by_hour_ist, "share_km"), 0)}`)}</span>
              </div>
            </div>
            <p class="rt-key mono-s rv">
              <i class="rt-key-bar" /> {T("share of the warming")} <i class="rt-key-tick" /> {T("share of the distance flown")}
            </p>
            <div class="al-where">
              <div class="rt-sec">
                <p class="label red">{T("By hour of day (IST)")}</p>
                <Hours rows={dash.by_hour_ist} metric="share_warm_w" />
              </div>
              <div class="rt-sec">
                <p class="label red">{T("By airline")}</p>
                <Bars rows={dash.by_airline} metric="share_warm_w" label={(r) => (r.key === "other" ? T("Other airlines (under 3 flights each)") : r.key)} />
              </div>
            </div>
            <p class="small muted">
              {T("STRATUM-weighted warming (second analysis D-006, descriptive). An airline's share mostly reflects where and when it flies, not how it flies.")}{" "}
              <a href="/routes">{T("By route, flight level, aircraft and month")} →</a>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

const night = (rows: Row[] | undefined, k: "share_warm_w" | "share_km") => (rows ?? []).filter((r) => Number(r.key) >= 18 || Number(r.key) < 6).reduce((n, r) => n + r[k], 0);
