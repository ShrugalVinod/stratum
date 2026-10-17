import { Arrow } from "../components/Footer";
import { PageHead } from "../components/PageHead";

export function NotFound() {
  return (
    <div class="page">
      <PageHead label="404 · Signal lost" lines={["Signal lost."]} lede="This page drifted away like an old contrail." />
      <div class="wrap">
        <a class="btn primary" href="/">
          Back home <Arrow />
        </a>
      </div>
      <div class="spacer" />
    </div>
  );
}
