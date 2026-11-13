import { useEffect, useMemo, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import { loadDashboard, loadWeightedSummary } from "../data/load";
import { Bars, Hours, pc, type Row } from "../components/WarmingCharts";
import { T } from "../i18n";
import { ATF_KG_PER_L, type Decisions, perAlert, rupees, year } from "../lib/business";

/** /airlines — the business case: the EU now makes airlines monitor and report their contrails'
 *  climate effect (from 2027 for every flight between India and Europe), where STRATUM fits, and
 *  a calculator for what avoiding contrails would cost an Indian airline in rupees. Facts checked
 *  against the European Commission's aviation page and EUR-Lex on 24 Oct 2026; calculator from
 *  the D-006 decisions (lib/business.ts). */

// defaults, editable on the page (checked 24 Oct 2026)
const ATF_RS_PER_L = 137; // Delhi ATF from 1 Oct 2026, ₹121 → ₹137 a litre (Business Standard, 1 Oct 2026)
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
  const rs = (v: number) => rupees(v);
  const cautiousRsPerT = y && y.cautiousT > 0 ? y.fuelCostRs / y.cautiousT : Infinity;

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
              <b class="mono">{"1 Jan 2025"}</b>
              <span>{T("Monitoring starts for flights between airports in the European Economic Area (and from there to Switzerland and the UK), reported once a year.")}</span>
            </li>
            <li>
              <b class="mono">2025–26</b>
              <span>{T("Flights to and from the rest of the world, India included, may report voluntarily.")}</span>
            </li>
            <li class="al-key">
              <b class="mono">{"1 Jan 2027"}</b>
              <span>{T("Mandatory for all flights into and out of the European Economic Area: every flight between India and Europe.")}</span>
            </li>
            <li>
              <b class="mono">{"End 2027"}</b>
              <span>{T("The European Commission reports on the results and, if appropriate, proposes a law to address aviation's non-CO₂ effects.")}</span>
            </li>
            <li>
              <b class="mono">{"India, 2027"}</b>
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
                {T("A daily check of the forecast against Meteosat-9, a model trained on the contrails Meteosat-9 saw that ranks which flights are likely to make one, a footprint for any flight, and altitude advice only where the cautious estimate says it helps.")}{" "}
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
                  <span>{`altitude changes a year (${(p.perDay * share).toFixed(1)} a day)`}</span>
                </div>
                <div>
                  <b>{rs(y.fuelCostRs)}</b>
                  <span>{`extra fuel (${Math.round(y.fuelT).toLocaleString()} t a year)`}</span>
                </div>
                <div class="al-good">
                  <b>{Math.round(y.cautiousT).toLocaleString()} t</b>
                  <span>{`CO₂e of warming avoided, cautious estimate (100 years; median ${Math.round(y.avoidedT).toLocaleString()} t)`}</span>
                </div>
                <div class="al-good">
                  <b>{rs(cautiousRsPerT)}</b>
                  <span>{`of fuel per tonne avoided on the cautious estimate (median ${rs(y.rsPerTonne)}), against a carbon price of ${rupees(y.carbonRsPerT)} a tonne`}</span>
                </div>
              </div>

              <p class="lede al-line rv">
                {<>
                    Even on the cautious estimate, avoiding contrails would cost about <b>{rs(cautiousRsPerT)}</b> of fuel per tonne of CO₂-equivalent warming
                    avoided: <b>{y.carbonRsPerT > 0 && cautiousRsPerT > 0 ? Math.round(y.carbonRsPerT / cautiousRsPerT) : "—"}×</b> cheaper than the EU's carbon price
                    (median estimate: {rs(y.rsPerTonne)} a tonne). Contrails carry no carbon price today; the comparison shows how cheap this warming is to avoid.
                  </>}
              </p>

              <p class="now-warn mono-s">
                {T("These yearly numbers scale up 12 sample days of flights (the 1st of each month) and only the 60 strongest stretches a day. Read them as an order of magnitude, not a forecast.")}
              </p>

              <p class="small muted">
                {<>
                    How: our decision layer redone with STRATUM's probabilities (second analysis D-006) flagged {dec!.alerts} altitude changes on{" "}
                    {dec!.days} days over India; each used {Math.round(p.fuelKg)} kg of extra fuel and avoided about {(p.avoidedKg / 1000).toFixed(1)} t CO₂e of warming
                    (100-year median; 20 years: {(p.avoided20Kg / 1000).toFixed(1)} t). An airline's share of the alerts is its share of STRATUM-weighted contrail warming
                    (Routes & airlines). Only the 60 strongest stretches a day were checked, so the real number of useful changes is higher. Fuel at{" "}
                    {ATF_KG_PER_L} kg per litre; the extra fuel's own CO₂ is already subtracted from the warming avoided. Contrail warming is converted to CO₂e with
                    efficacy 0.42 and GWP-100, as pre-registered; other metrics give other numbers. Not modelled: air traffic control, schedules, and whether a
                    level is free. Defaults (24 Oct 2026): ATF in Delhi from 1 Oct, EU carbon allowance mid-October, reference rate of 19 Oct; change them above.
                  </>}
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
              <span class="mono-s">{`${dash.totals.flights.toLocaleString()} commercial flights · 12 days`}</span>
            </div>
            <div class="rt-tiles rv">
              <div>
                <b>{pc(dash.concentration.top_1pct_flights, 0)}</b>
                <span>{T("of the warming came from the top 1 % of flights")}</span>
              </div>
              <div>
                <b>{pc(dash.totals.flights_warming / dash.totals.flights, 0)}</b>
                <span>{T("of flights made any warming contrail")}</span>
              </div>
              <div>
                <b>{pc(night(dash.by_hour_ist, "share_warm_w"), 0)}</b>
                <span>{`of the warming at night (18:00–06:00 India time), for ${pc(night(dash.by_hour_ist, "share_km"), 0)} of the distance`}</span>
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
              {T("STRATUM-weighted warming (second analysis D-006, descriptive). An airline's share mostly reflects where and when it flies, not how it flies. Night here is 18:00–06:00 India time (IST); the H4 test on the Results page uses local solar time, which over India is within about an hour of IST.")}{" "}
              <a href="/routes">{T("By route, flight level, aircraft and month")} →</a>
            </p>
          </section>
        )}

        <section class="section" aria-labelledby="pilot">
          <div class="sec-head rv">
            <p class="label red" id="pilot">
              {T("§5 · Try it with us")}
            </p>
            <span class="mono-s">{T("a free shadow trial, no flights changed")}</span>
          </div>
          <div class="j-card rv">
            <h3>{T("Fly to Europe? Let the satellite score our forecast for your flights.")}</h3>
            <p>
              {T("We are looking for one Indian airline for a free three-month shadow trial: STRATUM forecasts your flights every day and Meteosat-9 scores the forecast. Nothing changes in how you fly. Write to us at")}{" "}
              <a href="mailto:aerospaceonyx@gmail.com?subject=STRATUM%20shadow%20trial">aerospaceonyx@gmail.com</a>. <a href="/business">{T("Our business plan")} →</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

const night = (rows: Row[] | undefined, k: "share_warm_w" | "share_km") => (rows ?? []).filter((r) => Number(r.key) >= 18 || Number(r.key) < 6).reduce((n, r) => n + r[k], 0);
