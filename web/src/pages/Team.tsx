import { PageHead } from "../components/PageHead";
import { site, supervisor, team } from "../content/site";

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
          <span class="label red">Boarding pass · STRATUM</span>
          <span class="mono-s muted">BLR → FL380</span>
        </div>
        <p class="label">Passenger</p>
        <h2 class="display pass-name">{p.name}</h2>
        <dl class="pass-fields">
          <div>
            <dt class="label">Role</dt>
            <dd class="mono">{p.role}</dd>
          </div>
          <div>
            <dt class="label">Seat</dt>
            <dd class="mono big">{p.initials}</dd>
          </div>
          <div>
            <dt class="label">Gate</dt>
            <dd class="mono">C26–27</dd>
          </div>
        </dl>
      </div>
      <div class="pass-stub">
        <div class="photo mono-s">Photo to come</div>
        <b class="display">{p.initials}</b>
        <Barcode seed={p.name} />
      </div>
    </article>
  );
}

export function Team() {
  return (
    <div class="page">
      <PageHead label="Crew list · Bengaluru" note="Photos to come" lines={["The crew."]} lede={`${site.school} · ${site.competition}.`} />
      <div class="wrap">
        <div class="passes">
          {team.map((t, i) => (
            <Pass {...t} i={i} />
          ))}
          <Pass {...supervisor} wide i={0} />
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
