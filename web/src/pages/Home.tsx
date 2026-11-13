import { Arrow } from "../components/Footer";
import { SpreadFigure } from "../components/Figures";
import { HomeFilm } from "../components/film/HomeFilm";
import { Plane } from "../components/Plane";
import { Split } from "../components/Split";
import { facts, loop, phases, refs, site, statusUpdated, whyCards } from "../content/site";
import { cantDo } from "../content/judges";
import { T } from "../i18n";

const STATUS = { done: "Done", current: "Active", upcoming: "Scheduled" } as const;

/** the light under the pointer on the tool tiles (two CSS variables per tile) */
function spot(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".try-tile");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** One small instrument drawing per tool; each comes alive when its tile is hovered. */
function Glyph({ k }: { k: string }) {
  const body =
    k === "/3d" ? (
      <>
        <circle cx="24" cy="24" r="15" />
        <ellipse cx="24" cy="24" rx="15" ry="5.5" />
        <ellipse cx="24" cy="24" rx="6" ry="15" />
        <circle class="g-dot g-orbit" cx="39" cy="24" r="2.4" />
      </>
    ) : k === "/now" ? (
      <>
        <circle cx="24" cy="24" r="15" />
        <circle cx="24" cy="24" r="8" />
        <path class="g-sweep" d="M24 24 36 15" />
        <circle class="g-dot g-blink" cx="31" cy="30" r="2.2" />
      </>
    ) : k === "/replay" ? (
      <>
        <path d="M6 16h36M6 32h36" />
        <path class="g-thick" d="M10 16h20" />
        <path class="g-dot" d="M32 13.5 37 16l-5 2.5Z" />
        <path class="g-climb" d="M10 32h8l5-6h14" />
      </>
    ) : k === "/flight" ? (
      <>
        <path class="g-arc" d="M7 36C14 12 34 12 41 36" />
        <circle cx="7" cy="36" r="2.2" />
        <circle cx="41" cy="36" r="2.2" />
        <circle class="g-dot g-along" cx="24" cy="18" r="2.6" />
      </>
    ) : k === "/spot" ? (
      <>
        <path d="M8 16V9h7M33 9h7v7M40 32v7h-7M15 39H8v-7" />
        <path class="g-thick g-draw" d="M13 33 35 15" />
      </>
    ) : k === "/sandbox" ? (
      <>
        <path d="M8 14h32M8 24h32M8 34h32" />
        <circle class="g-knob k1" cx="18" cy="14" r="3.2" />
        <circle class="g-knob k2" cx="30" cy="24" r="3.2" />
        <circle class="g-knob k3" cx="22" cy="34" r="3.2" />
      </>
    ) : k === "/report" ? (
      <>
        <rect x="10" y="7" width="28" height="34" />
        <path d="M16 15h16M16 21h10" />
        <path class="g-thick g-draw" d="m16 31 5 5 11-12" />
      </>
    ) : (
      <>
        <path d="M8 40h32" />
        <path class="g-bar b1" d="M14 40V28" />
        <path class="g-bar b2" d="M24 40V18" />
        <path class="g-bar b3" d="M34 40V10" />
      </>
    );
  return (
    <svg class="glyph" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      {body}
    </svg>
  );
}

export function Home() {
  return (
    <div class="page home">
      <HomeFilm skipTo="why-title-sec" />

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

      {/* for judges: the path through the site, and the four results in one sentence each */}
      <section class="section" aria-labelledby="start-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red" id="start-title">
              Start here
            </p>
            <span class="mono-s">five pages, about ten minutes</span>
          </div>
          <nav class="j-path rv" aria-label="Start here">
            <a href="#why-title-sec">
              <b>The problem</b>
              <span>Why some contrails warm the planet, and why India is unchecked</span>
            </a>
            <a href="/how-it-works">
              <b>What we built</b>
              <span>Flight tracks, weather, physics, the satellite check and the advice</span>
            </a>
            <a href="/results">
              <b>What we found</b>
              <span>Four hypotheses, tested once each, including the two that failed</span>
            </a>
            <a href="/next">
              <b>What's next</b>
              <span>Roadmap with dates, and what STRATUM can't do yet</span>
            </a>
            <a href="/business">
              <b>Business case</b>
              <span>Who pays, who uses it, the price and the costs</span>
            </a>
          </nav>
        </div>
      </section>

      <section class="section pt0" aria-labelledby="found-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red" id="found-title">
              What we found
            </p>
            <a class="mono-s link" href="/results">
              all four results →
            </a>
          </div>
          <div class="j-grid rv stagger">
            <article class="j-card j-no" style={{ "--i": 0 }}>
              <span class="j-k">
                <b class="mono">H1</b> <span class="j-verdict">· not supported</span>
              </span>
              <p>We expected the physics to miss contrails over India. It predicts about 6 times more lasting contrails than the satellite sees, mostly because thin ones are invisible from space.</p>
            </article>
            <article class="j-card j-yes" style={{ "--i": 1 }}>
              <span class="j-k">
                <b class="mono">H2</b> <span class="j-verdict">· supported, with a catch</span>
              </span>
              <p>Our model beat the pycontrails latitude correction, but so does a constant guess. Where it clearly helps is ranking which flights will make a visible contrail.</p>
            </article>
            <article class="j-card j-yes" style={{ "--i": 2 }}>
              <span class="j-k">
                <b class="mono">H3</b> <span class="j-verdict">· supported</span>
              </span>
              <p>In our model runs, 0.48 % of the distance flown carried 80 % of the contrail warming. Moving a few flights could avoid most of it.</p>
            </article>
            <article class="j-card j-no" style={{ "--i": 3 }}>
              <span class="j-k">
                <b class="mono">H4</b> <span class="j-verdict">· not supported</span>
              </span>
              <p>Night flights (18:00–06:00 local solar time) carried 84 % of the warming for 49 % of the distance, but our pre-set test's range dipped below zero, so it did not pass.</p>
            </article>
          </div>
          <div class="j-limits rv" style={{ "margin-top": "18px" }}>
            <p class="label">What STRATUM can't do yet</p>
            <ul>
              {cantDo.map((c) => (
                <li>{c}</li>
              ))}
            </ul>
          </div>
          {site.videoUrl && (
            <div class="rv" style={{ "margin-top": "28px" }}>
              <p class="label red">Our Innovation Video</p>
              <iframe class="j-video" src={site.videoUrl} title="STRATUM Innovation Video" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          )}
        </div>
      </section>

      {/* §1 */}
      <section class="section" id="why-title-sec" aria-labelledby="why-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="label red">{T("§1 · The problem · Few checks over India · Our approach")}</p>
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
                {T("Nine phases, all done. The analysis plan was locked on 13 Oct 2026, before any result, and all four hypotheses are tested. The flight-data coverage audit finished on 11 Nov 2026. Next: more flight days, expert review, and a first airline trial with no flights changed.")}
              </p>
              <p class="rv" style={{ "--d": 320, display: "flex", gap: "18px", "flex-wrap": "wrap" }}>
                <a class="link" href="/results">
                  {T("Results")} →
                </a>
                <a class="link" href="/next">
                  {T("What's next")} →
                </a>
                <a class="link" href="/progress">
                  {T("The lab diary")} →
                </a>
              </p>
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
                  <span class="mono-s muted">{T("Pre-registered 13 Oct 2026 · 19 pp + cover note")}</span>
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
            <span class="mono-s">{T("Live data · a new forecast every day")}</span>
          </div>
          <h2 id="try-title" class="display d-m">
            <Split text={T("Look up, then look it up.")} />
          </h2>
          <div class="try-grid rv stagger" onPointerMove={spot}>
            {(
              [
                ["/3d", "The sky in 3D", "One real day over India: watch lasting contrails being born behind the planes, then switch on STRATUM's advice and watch the planes dodge the humid air. With a one-minute story."],
                ["/now", "Live advice", "Every airliner over India right now, and the flights expected next: which ones are heading into air where their contrail would last, and the level that avoids it."],
                ["/replay", "What if we'd listened?", "One real day over India, played twice side by side: as flown, and as if every STRATUM alert had been followed. Watch the lasting contrails disappear and the warming avoided add up."],
                ["/flight", "Your flight", "Pick a trip and see its hidden footprint: the minutes it cruises through air where contrails last, its fuel CO₂ next to its contrail's warming, and the level that avoids it."],
                ["/spot", "Spot a contrail", "Took a photo of a contrail? Find the airliner that drew it. Your photo stays on your phone."],
                ["/sandbox", "Make a contrail", "Pick the level, the air's temperature and humidity and the engine, and watch whether a contrail forms and whether it lasts."],
                ["/report", "Report card", "Once a day, yesterday's forecast is checked against the contrails the satellite saw, and the score is kept in public."],
                ["/airlines", "For airlines", "The EU's contrail reporting rule from 2027, where India's contrail warming comes from, and what avoiding it would cost in rupees."],
              ] as const
            ).map(([href, t, b], i) => (
              <a class={i < 2 ? "try-tile try-featured" : "try-tile"} href={href} style={{ "--i": i }}>
                <span class="try-top">
                  <span class="mono-s">{i < 2 ? T("New") : `0${i - 1}`}</span>
                  <Glyph k={href} />
                </span>
                <b class="display">{T(t)}</b>
                <span class="try-body">{T(b)}</span>
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
          <span class="mono-s">{T("1 Jan 2026 · 1,909 flights · every hour · 8 flight levels")}</span>
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
