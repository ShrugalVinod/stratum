import { PageHead } from "../components/PageHead";
import { site, supervisor } from "../content/site";

export function Contact() {
  return (
    <div class="page">
      <PageHead label="Contact" note="12.97°N 77.59°E · Bengaluru" lines={["Radio check."]} />
      <div class="wrap">
        <hr class="rule rule-draw" />
        <div class="contact rv stagger">
          <div>
            <p class="label">Team email</p>
            {site.email ? (
              <a class="contact-big mono" href={`mailto:${site.email}`}>
                {site.email}
              </a>
            ) : (
              <p class="contact-big mono">coming soon</p>
            )}
          </div>
          <div>
            <p class="label">Institution</p>
            <p class="contact-text">
              Indus International School, Bengaluru
              <br />
              <span class="muted">Supervisor: {supervisor.name}</span>
            </p>
          </div>
          <div>
            <p class="label">Context</p>
            <p class="contact-text">
              {site.competition}
              <br />
              <span class="muted">Computational research prototype</span>
            </p>
          </div>
        </div>
      </div>
      <div class="spacer" />
    </div>
  );
}
