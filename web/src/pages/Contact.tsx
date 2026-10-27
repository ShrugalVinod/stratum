import { PageHead } from "../components/PageHead";
import { site, supervisor } from "../content/site";
import { T } from "../i18n";

/** The team email, school and context (here and on the Team page). */
export function ContactBlock() {
  return (
    <div class="contact rv stagger">
      <div>
        <p class="label">{T("Team email")}</p>
        {site.email ? (
          <a class="contact-big mono" href={`mailto:${site.email}`}>
            {site.email}
          </a>
        ) : (
          <p class="contact-big mono">{T("coming soon")}</p>
        )}
      </div>
      <div>
        <p class="label">{T("Institution")}</p>
        <p class="contact-text">
          {T("Indus International School, Bengaluru")}
          <br />
          <span class="muted">
            {T("Supervisor")}: {supervisor.name}
          </span>
        </p>
      </div>
      <div>
        <p class="label">{T("Context")}</p>
        <p class="contact-text">
          {T(site.competition)}
          <br />
          <span class="muted">{T("Computational research prototype")}</span>
        </p>
      </div>
    </div>
  );
}

export function Contact() {
  return (
    <div class="page">
      <PageHead label="Contact" note="12.97°N 77.59°E · Bengaluru" lines={["Radio check."]} />
      <div class="wrap">
        <hr class="rule rule-draw" />
        <ContactBlock />
      </div>
      <div class="spacer" />
    </div>
  );
}
