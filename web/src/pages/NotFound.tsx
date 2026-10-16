import { Arrow } from "../components/Footer";

export function NotFound() {
  return (
    <div class="wrap" style="padding:160px var(--gutter) 200px">
      <p class="eyebrow">404</p>
      <h1 class="display l">This page drifted away like an old contrail.</h1>
      <div class="hero-actions">
        <a class="btn primary" href="/">
          Back home <Arrow />
        </a>
      </div>
    </div>
  );
}
