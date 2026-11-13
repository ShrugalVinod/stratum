import { PageHead } from "../components/PageHead";
import { site, supervisor, team, teamPhoto } from "../content/site";
import { mission, roles, story, supervisorRole, values, vision } from "../content/judges";
import { T } from "../i18n";
import { ContactBlock } from "./Contact";

/** Deterministic barcode from the name (decoration only). */
function Barcode({ seed }: { seed: string }) {
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (let i = 0; x < 120; i++) {
    const c = seed.charCodeAt(i % seed.length) + i * 7;
    const w = 1 + (c % 3);
    bars.push({ x, w });
    x += w + 1 + ((c >> 2) % 3);
  }
  return (
    <svg class="barcode" viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b) => (
        <rect x={b.x} y="0" width={b.w} height="26" />
      ))}
    </svg>
  );
}

function Pass(p: { name: string; role: string; initials: string; wide?: boolean; i: number }) {
  return (
    <article class={`pass rv ${p.wide ? "wide" : ""}`} style={{ "--d": (p.i % 2) * 110 }}>
      <div class="pass-main">
        <div class="pass-top">
          <span class="label red">{T("Boarding pass")} · STRATUM</span>
          <span class="mono-s muted">BLR → FL380</span>
        </div>
        <p class="label">{T("Passenger")}</p>
        <h2 class="display pass-name">{p.name}</h2>
        <dl class="pass-fields">
          <div>
            <dt class="label">{T("Role")}</dt>
            <dd class="mono">{T(p.role)}</dd>
          </div>
          <div>
            <dt class="label">{T("Seat")}</dt>
            <dd class="mono big">{p.initials}</dd>
          </div>
          <div>
            <dt class="label">{T("Gate")}</dt>
            <dd class="mono">C26–27</dd>
          </div>
        </dl>
      </div>
      <div class="pass-stub">
        <div class="photo mono-s">{T("Photo to come")}</div>
        <b class="display">{p.initials}</b>
        <Barcode seed={p.name} />
      </div>
    </article>
  );
}

export function Team() {
  return (
    <div class="page">
      <PageHead label="Team & story · Bengaluru" note="Indus International School" lines={["The crew."]} lede={`${site.school} · ${site.competition}.`} />
      <div class="wrap">
        <section class="section pt0" aria-labelledby="story-title">
          <div class="sec-head rv">
            <p class="label red" id="story-title">
              §1 · Our story
            </p>
            <span class="mono-s">October 2026 · Bengaluru</span>
          </div>
          <div class="openly">
            <div class="j-prose rv">
              {story.map((p) => (
                <p>{p}</p>
              ))}
            </div>
            <figure class="sat rv rv-fade">
              <div class="j-photo">
                {teamPhoto ? (
                  <img src={teamPhoto.src} alt={teamPhoto.alt} width="1600" height="900" loading="lazy" />
                ) : (
                  <img
                    src="/img/contrail_south_india_2026-10-18.webp"
                    alt="A single long, straight white contrail crossing a clear blue sky diagonally, with palm fronds in the top left corner."
                    width="1600"
                    height="1200"
                    loading="lazy"
                  />
                )}
              </div>
              <figcaption class="caption">
                {teamPhoto ? teamPhoto.caption : "The contrail we photographed over South India on 18 Oct 2026."}
              </figcaption>
            </figure>
          </div>
        </section>

        <section class="section" aria-labelledby="mv-title">
          <div class="sec-head rv">
            <p class="label red" id="mv-title">
              §2 · Mission, vision and values
            </p>
          </div>
          <div class="j-mv rv">
            <div class="j-card">
              <span class="j-k label">Mission</span>
              <p>{mission}</p>
            </div>
            <div class="j-card">
              <span class="j-k label">Vision</span>
              <p>{vision}</p>
            </div>
          </div>
          <div class="j-grid j-grid-5 rv stagger">
            {values.map(([t, b], i) => (
              <article class="j-card" style={{ "--i": i }}>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="section" aria-labelledby="roles-title">
          <div class="sec-head rv">
            <p class="label red" id="roles-title">
              §3 · Who does what
            </p>
          </div>
          <ul class="j-roles rv">
            {roles.map((r) => (
              <li>
                <div>
                  <b>{r.name}</b>
                  <span class="mono-s">{r.role}</span>
                </div>
                <p>
                  {r.does}
                  <br />
                  <span class="muted">Skills and experience: {r.skills}</span>
                </p>
              </li>
            ))}
            <li>
              <div>
                <b>{supervisor.name}</b>
                <span class="mono-s">{supervisor.role}</span>
              </div>
              <p>{supervisorRole}</p>
            </li>
          </ul>
          <div class="passes" style={{ "margin-top": "40px" }}>
            {team.map((t, i) => (
              <Pass {...t} i={i} />
            ))}
            <Pass {...supervisor} wide i={0} />
          </div>
        </section>

        <section class="section" id="contact" aria-labelledby="contact-title">
          <div class="sec-head rv">
            <p class="label red" id="contact-title">
              {T("Get in touch")}
            </p>
            <span class="mono-s">12.97°N 77.59°E · Bengaluru</span>
          </div>
          <hr class="rule rule-draw" />
          <ContactBlock />
        </section>
      </div>
      <div class="spacer" />
    </div>
  );
}
