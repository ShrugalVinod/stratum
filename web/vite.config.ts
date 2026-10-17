import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// `base` is set per host at deploy time (e.g. "/" for Cloudflare Pages).
export default defineConfig({
  plugins: [preact()],
  base: process.env.STRATUM_BASE ?? "/",
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
