import { Arrow } from "../components/Footer";
import { PageHead } from "../components/PageHead";
import { site } from "../content/site";

export function Contact() {
  return (
    <>
      <PageHead
        eyebrow="Contact / Research"
        title="Open to careful questions."
        side={<p>For judges, researchers, and anyone who wants to understand the protocol before the promise.</p>}
      />
      <div class="wrap">
        <div class="contact-grid">
          <div>
            <p class="eyebrow">Team email</p>
            {site.email ? (
              <a class="contact-mail" href={`mailto:${site.email}`}>
                {site.email} <Arrow />
              </a>
            ) : (
              <p class="contact-mail muted">Email address coming soon</p>
            )}
          </div>
          <div>
            <p class="eyebrow">School</p>
            <p>
              Indus International School
              <br />
              Bengaluru
            </p>
          </div>
          <div>
            <p class="eyebrow">Context</p>
            <p>
              {site.competition}
              <br />
              Computational research prototype
            </p>
          </div>
        </div>
      </div>
      <div style="height:160px" />
    </>
  );
}
