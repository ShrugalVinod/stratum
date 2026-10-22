import { site } from "../content/site";
import { Split } from "./Split";

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <p class="footer-mark">
              <Split text="STRATUM" />
            </p>
            <p class="footer-tag rv rv-fade" style={{ "--d": 250 }}>
              {site.tagline}
            </p>
            <p class="footer-warn">Computational research prototype — no real flight was changed.</p>
          </div>
          <div>
            <p class="label">Credits</p>
            <p class="footer-credits">
              Contains modified Copernicus Climate Change Service information 2026 · Meteosat-9 imagery © EUMETSAT 2026 · Flight data:
              ADS-B Exchange · Aircraft metadata and live aircraft: The OpenSky Network · Live aircraft: adsb.lol (ODbL) · Forecast: ECMWF open
              data (CC BY 4.0) · Detector training: OpenContrails (Ng et al. 2024, CC BY 4.0) and DLR expert labels (CC BY-NC 4.0) · Made with
              Natural Earth
            </p>
            <nav class="footer-links" aria-label="Footer">
              <a class="link" href="/contact">
                Contact
              </a>
              <a class="link" href="/about-data#privacy">
                Privacy
              </a>
              <a class="link" href="/about-data#ai-use">
                AI use
              </a>
              <a class="link" href={site.paperPdf} target="_blank" rel="noopener">
                Protocol PDF ↗
              </a>
            </nav>
          </div>
          <div class="footer-origin">
            <p class="label">Origin</p>
            <p class="mono">
              12.97°N 77.59°E
              <br />
              BENGALURU
              <br />
              CONRAD 2026–27
            </p>
          </div>
        </div>
        <div class="footer-base mono-s">
          <span>{site.school}</span>
          <span>No cookies · no analytics · no trackers</span>
        </div>
      </div>
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
