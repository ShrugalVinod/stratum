import { Arrow } from "../components/Footer";
import { SpreadFigure } from "../components/Figures";
import { Hero } from "../components/Hero";
import { Plane } from "../components/Plane";
import { Split } from "../components/Split";
import { facts, loop, phases, refs, site, statusUpdated, whyCards } from "../content/site";
import { T } from "../i18n";

const STATUS = { done: "Done", current: "Active", upcoming: "Scheduled" } as const;

export function Home() {
  return (
    <div class="page home">
      <Hero />

      <div class="ticker" aria-label={T("Project facts")}>
        <div class="ticker-track">
          {[0, 1].map((copy) => (
            <ul aria-hidden={copy === 1 ? "true" : undefined}>
              {facts.map((f) => (
                <li class="mono-s">
                  <i aria-hidden="true">◆</i> {T(f)}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* §1 */}
      <section class="section" aria-labelledby="why-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§1 · The problem · The India gap · Our approach")}</p>
            <span class="mono-s">{T("Ref.")} Lee et al. 2021¹</span>
          </div>
          <div class="why">
            <div>
              <h2 id="why-title" class="display d-l">
                <Split text={T("A few flights make most of the warming.")} />
              </h2>
              <hr class="rule rule-draw" style={{ "--d": 300 }} />
              <SpreadFigure />
            </div>
            <ol class="why-list rv stagger">
              {whyCards.map((c, i) => (
                <li style={{ "--i": i }}>
                  <span class="n mono">0{i + 1}</span>
                  <div>
                    <h3 class="label ink">{T(c.title)}</h3>
                    <p>{T(c.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <ol class="refs rv rv-fade">
            {refs.map((r, i) => (
              <li>
                <sup>{i + 1}</sup> {r}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* §2 */}
      <section class="section pt0" aria-labelledby="loop-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red" id="loop-title">
              {T("§2 · The study loop")}
            </p>
            <span class="mono-s">{T("Flight plan")} · {loop.length} WPT</span>
          </div>
          <ol class="route rv">
            <span class="route-line" aria-hidden="true" />
            <span class="route-plane" aria-hidden="true">
              <Plane width={34} />
            </span>
            {loop.map((s, i) => (
              <li style={{ "--i": i }}>
                <span class="wpt" aria-hidden="true" />
                <p class="mono-s red">
                  WPT {i + 1} · {s.code}
                </p>
                <h3 class="display d-s">{T(s.title)}</h3>
                <p class="muted">{T(s.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* §3 */}
      <section class="section pt0" aria-labelledby="status-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§3 · Status")}</p>
            <span class="mono-s">{T("Updated")} {statusUpdated}</span>
          </div>
          <div class="dep">
            <div>
              <h2 id="status-title" class="display d-l">
                <Split text={T("Departures")} />
              </h2>
              <p class="lede rv" style={{ "--d": 200 }}>
                {T("Nine phases. The analysis plan was locked on 13 Oct 2026, before any result. All four hypotheses are now tested; the results are on the Methods page.")}
              </p>
              <a class="link rv" style={{ "--d": 320 }} href="/methods">
                {T("Methods and the lab diary")} →
              </a>
            </div>
            <div class="board rv rv-scale" role="table" aria-label={T("Project phases")}>
              <div class="b-row b-head" role="row">
                <span role="columnheader">{T("Phase")}</span>
                <span role="columnheader">{T("Destination")}</span>
                <span role="columnheader">{T("Status")}</span>
                <span role="columnheader">{T("Logged")}</span>
              </div>
              {phases.map((p, i) => (
                <div class={`b-row ${p.state}`} role="row">
                  <span role="cell">
                    <span class="tile">{p.n}</span>
                  </span>
                  <span role="cell" class="b-dest" data-flap={T(p.name).toUpperCase()} data-flap-delay={i * 90}>
                    {T(p.name).toUpperCase()}
                  </span>
                  <span role="cell" class={`b-status ${p.state}`}>
                    {p.state === "current" && <i class="dot" aria-hidden="true" />}
                    <span data-flap={T(STATUS[p.state]).toUpperCase()} data-flap-delay={300 + i * 90}>
                      {T(STATUS[p.state]).toUpperCase()}
                    </span>
                  </span>
                  <span role="cell" class="b-log">
                    {p.logged ?? (p.state === "current" ? T("NOW") : "—")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* §4 */}
      <section class="section pt0" aria-labelledby="ground-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§4 · From the ground")}</p>
            <span class="mono-s">{T("Team photo · South India")} · 18 Oct 2026</span>
          </div>
          <div class="openly ground">
            <figure class="sat rv rv-fade">
              <div class="sat-frame">
                <img
                  src="/img/contrail_south_india_2026-10-18.webp"
                  alt="A single long, straight white contrail crossing a clear blue sky diagonally, with palm fronds in the top left corner."
                  loading="lazy"
                  width="1600"
                  height="1200"
                />
                <span class="sat-tl mono-s">{T("Seen from below")}</span>
              </div>
              <figcaption class="caption">{T("Fig. 3 — A contrail over South India, photographed by the team on 18 Oct 2026.")}</figcaption>
            </figure>
            <div class="open-text">
              <h2 id="ground-title" class="display d-m">
                <Split text={T("The line we are trying to predict.")} />
              </h2>
              <p class="rv" style={{ "--d": 200 }}>
                {T("A contrail like this one spreads into cirrus and lasts for hours only when the air is supersaturated with ice — and that is exactly what weather models struggle to see. From 36,000 km up, Meteosat sees the same kind of line as a thin bright stroke (Fig. 4).")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* §5 */}
      <section class="section pt0" aria-labelledby="open-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§5 · Built openly")}</p>
            <span class="mono-s">{T("Real satellite image · not a result")}</span>
          </div>
          <div class="openly">
            <figure class="sat rv rv-fade">
              <div class="sat-frame">
                <img
                  src="/img/meteosat_arabian_sea_2026-01-15_0000.webp"
                  alt="Meteosat-9 infrared image over the Arabian Sea at night: two long, thin, bright diagonal lines — contrails — on a smooth grey sea background."
                  loading="lazy"
                  width="1008"
                  height="1008"
                />
                <span class="sat-tl mono-s">MSG-2 · 45.5°E · SEVIRI</span>
                <span class="sat-br mono-s">15 Jan 2026 · 0000 UTC</span>
                <span class="sat-scan" aria-hidden="true" />
              </div>
              <figcaption class="caption">
                {T("Fig. 4 — Two contrails over the Arabian Sea at night, found by the STRATUM detector.")} BTD 10.8 − 12.0 µm, Meteosat-9 © EUMETSAT 2026.
              </figcaption>
            </figure>
            <div class="open-text">
              <h2 id="open-title" class="display d-m">
                <Split text={T("Good science leaves room for “not yet”.")} />
              </h2>
              <p class="rv" style={{ "--d": 200 }}>
                {T("Our plan, our code assumptions and our limits were written down before we saw any result. Anyone can check them.")}
              </p>
              <div class="open-links rv stagger" style={{ "--d": 300 }}>
                <a class="row-link" href={site.paperPdf} target="_blank" rel="noopener">
                  <span class="label red">{T("Research protocol (PDF)")} ↓</span>
                  <span class="mono-s muted">{T("Pre-registered 13 Oct 2026 · 19 pp")}</span>
                </a>
                <a class="row-link" href="/methods">
                  <span class="label red">{T("Read the methods")} →</span>
                  <span class="mono-s muted">{T("Hypotheses H1–H4")}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* §6 */}
      <section class="section pt0" aria-labelledby="try-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§6 · Try it")}</p>
            <span class="mono-s">{T("Live data · forecast every morning")}</span>
          </div>
          <h2 id="try-title" class="display d-m">
            <Split text={T("Look up, then look it up.")} />
          </h2>
          <div class="try-grid rv stagger">
            {(
              [
                ["/3d", "The sky in 3D", "One real day over India: watch lasting contrails being born behind the planes, then switch on STRATUM's advice and watch the planes dodge the humid air. With a one-minute story."],
                ["/now", "Live advice", "Every airliner over India right now, and the flights expected next: which ones are heading into air where their contrail would last, and the level that avoids it."],
                ["/replay", "What if we'd listened?", "One real day over India, played twice side by side: as flown, and as if every STRATUM alert had been followed. Watch the lasting contrails disappear and the warming avoided add up."],
                ["/flight", "Your flight", "Pick a trip and see its hidden footprint: the minutes it cruises through air where contrails last, its fuel CO₂ next to its contrail's warming, and the level that avoids it."],
                ["/spot", "Spot a contrail", "Took a photo of a contrail? Find the airliner that drew it. Your photo stays on your phone."],
                ["/sandbox", "Make a contrail", "Pick the level, the air's temperature and humidity and the engine, and watch whether a contrail forms and whether it lasts."],
                ["/report", "Report card", "Every morning, yesterday's forecast is checked against the contrails the satellite saw, and the score is kept in public."],
                ["/airlines", "For airlines", "The EU's contrail reporting rule from 2027, where India's contrail warming comes from, and what avoiding it would cost in rupees."],
              ] as const
            ).map(([href, t, b], i) => (
              <a class={i < 2 ? "try-tile try-featured" : "try-tile"} href={href} style={{ "--i": i }}>
                <span class="mono-s">{i < 2 ? T("New") : `0${i - 1}`}</span>
                <b class="display">{T(t)}</b>
                <span>{T(b)}</span>
                <span class="try-go" aria-hidden="true">
                  <Arrow />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <a class="cta-band" href="/map">
        <span class="wrap cta-inner">
          <span class="mono-s">{T("1 Jan 2026 · 1,458 flights · every hour · 8 flight levels")}</span>
          <span class="display cta-big">
            {T("Open the contrail map")} <Arrow />
          </span>
          <span class="cta-plane" aria-hidden="true">
            <Plane width={64} />
          </span>
        </span>
      </a>
    </div>
  );
}
