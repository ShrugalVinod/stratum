import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// The labelling guide is bundled from docs/ so the app works offline with the current version.
export default defineConfig({
  plugins: [preact()],
  build: { target: "es2022", sourcemap: false },
  server: { fs: { allow: [".."] } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
