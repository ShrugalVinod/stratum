import { PageHead } from "../components/PageHead";
import { site, supervisor, team } from "../content/site";

export function Team() {
  return (
    <>
      <PageHead
        eyebrow="Team / Bengaluru"
        title="A small team, a careful question."
        side={
          <>
            <p>
              {site.school} · {site.competition}
            </p>
            <span class="badge">Photos coming soon</span>
          </>
        }
      />
      <div class="wrap">
        <div class="team-grid">
          {[...team, supervisor].map((p) => (
            <article class="card person">
              <div class="avatar" aria-hidden="true">
                {p.initials}
              </div>
              <h2>{p.name}</h2>
              <p class="muted">{p.role}</p>
            </article>
          ))}
        </div>
      </div>
      <div style="height:120px" />
    </>
  );
}
