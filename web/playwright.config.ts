import { defineConfig } from "@playwright/test";

// The dev server is used (not `vite preview`) because the map test reads the MapLibre instance
// that the dev build exposes as window.__map. Locally: installed Google Chrome; in CI:
// Playwright's Chromium. WebGL runs on SwiftShader (software), so no GPU is needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:5181",
    viewport: { width: 1440, height: 900 },
    ...(process.env.CI ? {} : { channel: "chrome" }),
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: { command: "npx vite --port 5181 --strictPort", url: "http://localhost:5181", reuseExistingServer: true, timeout: 90_000 },
});
