import { defineConfig, type Plugin } from "vitest/config";
import preact from "@preact/preset-vite";

const BASE = process.env.STRATUM_BASE ?? "/";

// The four Latin web fonts are needed for the first paint of every page. Without a preload they
// arrive after the CSS on slow connections and the hero reflows (Lighthouse CLS 0.24 on /).
// Their file names are hashed, so the links are added after the bundle is written.
function preloadFonts(): Plugin {
  return {
    name: "stratum-preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((f) => /\/(archivo|public-sans|martian-mono|newsreader)-latin-(wdth|wght)-(normal|italic)-[^/]+\.woff2$/.test(f))
          .map((f) => ({
            tag: "link",
            attrs: { rel: "preload", as: "font", type: "font/woff2", href: BASE + f, crossorigin: "" },
            injectTo: "head" as const,
          }));
      },
    },
  };
}

// `base` is set per host at deploy time (e.g. "/" for Cloudflare Pages).
export default defineConfig({
  plugins: [preact(), preloadFonts()],
  base: BASE,
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
