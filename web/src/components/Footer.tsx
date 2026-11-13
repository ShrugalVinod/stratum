import { site } from "../content/site";
import { T } from "../i18n";
import { useState } from "preact/hooks";
import { Runway } from "./Runway";
import { motionOff, setMotionOff } from "./motion";

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <p class="footer-tag rv rv-fade">{T(site.tagline)}</p>
            <p class="footer-warn">{T("Computational research prototype. No real flight was changed.")}</p>
          </div>
          <div>
            <p class="label">{T("Credits")}</p>
            <p class="footer-credits">
              Contains modified Copernicus Climate Change Service information 2026 · Meteosat-9 imagery © EUMETSAT 2026 · Flight data:
              ADS-B Exchange · Aircraft metadata and live aircraft: The OpenSky Network · Live aircraft: adsb.lol (ODbL) · Forecast: ECMWF open
              data (CC BY 4.0) · Detector training: OpenContrails (Ng et al. 2023, CC BY 4.0) and DLR expert labels (CC BY-NC 4.0) · Made with
              Natural Earth · Earth at night: NASA Black Marble 2016 (NASA Earth Observatory) · Stars: Yale Bright Star Catalogue
            </p>
            <nav class="footer-links" aria-label="Footer">
              <a class="link" href="/team#contact">
                {T("Contact")}
              </a>
              <a class="link" href="/about-data#privacy">
                {T("Privacy")}
              </a>
              <a class="link" href="/about-data#ai-use">
                {T("AI use")}
              </a>
              <a class="link" href={site.paperPdf} target="_blank" rel="noopener">
                {T("Protocol PDF")} ↗
              </a>
              <a class="link" href="/glossary">
                {T("Glossary")}
              </a>
              <a class="link" href="/references">
                {T("References")}
              </a>
              <MotionSwitch />
            </nav>
          </div>
          <div class="footer-origin">
            <p class="label">{T("Origin")}</p>
            <p class="mono">
              12.97°N 77.59°E
              <br />
              {T("BENGALURU")}
              <br />
              CONRAD 2026–27
            </p>
          </div>
        </div>
        <div class="footer-base mono-s">
          <span>{T(site.school)}</span>
          <span>{T("No cookies · no analytics · no trackers")}</span>
        </div>
      </div>
      <Runway />
    </footer>
  );
}

export function Arrow() {
  return (
    <svg class="arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** Lets a visitor stop the animations (the films become still storyboards). Reloads so every
 *  animated part starts in the new mode. */
function MotionSwitch() {
  const [off] = useState(() => (typeof window !== "undefined" ? motionOff() : false));
  return (
    <button
      class="link motion-switch"
      type="button"
      aria-pressed={off}
      onClick={() => {
        setMotionOff(!off);
        location.reload();
      }}
    >
      {off ? T("Turn animations on") : T("Reduce motion")}
    </button>
  );
}
