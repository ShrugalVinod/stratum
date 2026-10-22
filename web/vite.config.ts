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

// In development there is no Worker: answer /api/live the same way worker/index.js does
// (adsb.lol, commercial flights above FL200, no ICAO24), without its cache.
function devLiveApi(): Plugin {
  return {
    name: "stratum-dev-live-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/live", async (req, res) => {
        const { cell, slim, USER_AGENT } = await import("./worker/live.js");
        const q = new URL(req.url ?? "", "http://x").searchParams;
        const lat = cell(q.get("lat"), 4, 39);
        const lon = cell(q.get("lon"), 66, 100);
        res.setHeader("content-type", "application/json");
        if (lat == null || lon == null) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "lat/lon outside India's region" }));
          return;
        }
        const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/160`, { headers: { "user-agent": USER_AGENT } });
        const now = Date.now();
        const ac = r.ok ? slim(((await r.json()) as { ac?: unknown[] }).ac, now) : [];
        res.end(JSON.stringify({ t: now, centre: [lat, lon], radius_nm: 160, credit: "Live aircraft: adsb.lol (ODbL)", ac }));
      });
    },
  };
}

// `base` is set per host at deploy time (e.g. "/" for Cloudflare Pages).
export default defineConfig({
  plugins: [preact(), preloadFonts(), devLiveApi()],
  base: BASE,
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
