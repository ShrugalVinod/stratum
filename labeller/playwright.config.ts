import { defineConfig } from "@playwright/test";

// Locally: uses the installed Google Chrome. In CI: Playwright's own Chromium (npx playwright install).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5180",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: { command: "npx vite --port 5180 --strictPort", url: "http://localhost:5180", reuseExistingServer: true, timeout: 60_000 },
});
