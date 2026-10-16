import { site } from "../content/site";

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-top">
          <div>
            <div class="wordmark static">STRATUM</div>
            <p class="muted">Computational research prototype — no real flight was changed.</p>
          </div>
          <nav class="footer-links" aria-label="Footer">
            <a href="/contact">Contact</a>
            <a href="/about-data#privacy">Privacy</a>
            <a href="/about-data#ai-use">AI-use statement</a>
            <a href={site.paperPdf} target="_blank" rel="noopener">
              Research paper PDF <ExtIcon />
            </a>
          </nav>
        </div>
        <hr class="rule" />
        <p class="credits">
          Contains modified Copernicus Climate Change Service information 2026 · Meteosat-9 imagery © EUMETSAT 2026 · Flight data: ADS-B
          Exchange · Aircraft metadata: OpenSky Network · Made with Natural Earth
        </p>
      </div>
    </footer>
  );
}

export function ExtIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" style="display:inline;vertical-align:-2px">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg class="arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
