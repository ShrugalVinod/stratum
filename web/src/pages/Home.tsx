import { Arrow } from "../components/Footer";
import { loop, phases, site, whyCards } from "../content/site";

export function Home() {
  return (
    <>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-sky" aria-hidden="true">
          <HeroSky />
        </div>
        <div class="wrap">
          <div class="hero-content">
            <div class="hero-meta">
              <span class="school">{site.school}</span>
              <span class="badge">{site.competition}</span>
            </div>
            <h1 id="hero-title" class="display xl">
              {site.heroTitle[0]}
              <br />
              <span class="accent">{site.heroTitle[1]}</span>
            </h1>
            <p class="lede">{site.heroLede}</p>
            <div class="hero-actions">
              <a class="btn primary" href="/map">
                Explore the contrail map <Arrow />
              </a>
              <a class="btn" href="/how-it-works">
                How it works <Arrow />
              </a>
            </div>
          </div>
        </div>
        <div class="hero-coords" aria-hidden="true">
          12.97° N &nbsp; 77.59° E
          <br />
          <span class="tag">ILLUSTRATION · TEAM PHOTO COMING</span>
        </div>
      </section>

      <section class="section" aria-labelledby="why-title">
        <div class="wrap why">
          <div>
            <p class="eyebrow">01 / Why this matters</p>
            <h2 id="why-title" class="display l">
              Read the sky before you redraw the route.
            </h2>
          </div>
          <div class="cards3">
            {whyCards.map((c, i) => (
              <article class="card">
                <span class="num">0{i + 1}</span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="loop-title" style="padding-top:0">
        <div class="wrap">
          <div class="loop-head">
            <div>
              <p class="eyebrow">02 / The study loop</p>
              <h2 id="loop-title" class="display l">
                From flight tracks to better questions.
              </h2>
            </div>
            <p>Every step is inspectable. Every claim waits for its evidence.</p>
          </div>
          <ol class="loop">
            {loop.map((s) => (
              <li>
                <span class="num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="section" aria-labelledby="status-title" style="padding-top:0">
        <div class="wrap">
          <div class="status-head">
            <div>
              <p class="eyebrow">03 / Status</p>
              <h2 id="status-title" class="display l">
                A research trail, not a launch claim.
              </h2>
            </div>
            <a class="badge" href="/progress">
              Progress log →
            </a>
          </div>
          <ol class="stepper">
            {phases.map((p) => (
              <li class={p.state} aria-label={`Phase ${p.n}: ${p.name} — ${p.state}`}>
                <span class="step-box">
                  {p.state === "done" ? (
                    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                  ) : (
                    p.n
                  )}
                </span>
                <div class="ph">Phase {p.n}</div>
                <div class="nm">{p.name}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="section open-sci" aria-labelledby="open-title">
        <div class="wrap open-grid">
          <div>
            <p class="eyebrow">04 / Built openly</p>
            <h2 id="open-title" class="display m">
              Good science leaves room for “not yet”.
            </h2>
            <p class="lede" style="margin-top:28px">
              Our analysis plan was locked before any result existed. The limits are part of the interface. Results arrive only after the
              correction model is finished.
            </p>
            <div class="hero-actions" style="margin-top:36px">
              <a class="btn" href={site.paperPdf} target="_blank" rel="noopener">
                Read the protocol <Arrow />
              </a>
            </div>
          </div>
          <figure style="margin:0">
            <div class="figure-frame">
              <img
                src="/img/meteosat_arabian_sea_2026-01-15_0000.webp"
                alt="Meteosat-9 infrared image over the Arabian Sea at night: two long, thin, bright diagonal lines — contrails — on a smooth grey sea background."
                loading="lazy"
                width="1008"
                height="1008"
              />
              <span class="cap">Real satellite image · not a result</span>
            </div>
            <figcaption class="fc">
              Two contrails over the Arabian Sea, 15 Jan 2026, 00:00 UTC (05:30 IST), found by the STRATUM detector. Meteosat-9 BTD
              10.8 − 12.0 µm © EUMETSAT 2026.
            </figcaption>
          </figure>
        </div>
      </section>
    </>
  );
}

function HeroSky() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="trail" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#e7eaf0" stop-opacity="0" />
          <stop offset="0.35" stop-color="#e7eaf0" stop-opacity="0.35" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0.85" />
        </linearGradient>
        <filter id="soft" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="softer" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g opacity="0.07" stroke="#8fa9e6">
        {[200, 400, 600, 800, 1000, 1200, 1400].map((x) => (
          <line x1={x} y1="0" x2={x} y2="900" />
        ))}
      </g>
      <path class="contrail-path" d="M820 640 C 1050 520, 1300 380, 1620 210" stroke="url(#trail)" stroke-width="14" fill="none" filter="url(#softer)" opacity="0.45" />
      <path class="contrail-path" d="M820 636 C 1050 516, 1300 376, 1620 206" stroke="url(#trail)" stroke-width="2.4" fill="none" filter="url(#soft)" />
      <path class="contrail-path" d="M826 644 C 1056 524, 1306 384, 1620 214" stroke="url(#trail)" stroke-width="1.6" fill="none" filter="url(#soft)" opacity="0.8" />
      <path d="M0 900 L0 862 L120 850 L210 866 L330 842 L460 858 L560 836 L700 852 L820 828 L950 846 L1080 822 L1210 840 L1330 818 L1460 836 L1600 820 L1600 900 Z" fill="#06080d" opacity="0.85" />
    </svg>
  );
}
