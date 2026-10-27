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

// In development there is no Worker. By default /api/live comes from the deployed site (with
// aircraft types and routes); with STRATUM_LOCAL_LIVE=1 it is answered here like
// worker/index.js does (OpenSky for India, anonymous, cached 10 min, like the `live` Action's
// snapshot; adsb.lol near the point, 60 s), merged by callsign.
function devLiveApi(): Plugin {
  const memo = new Map<string, { until: number; v: Promise<unknown[]> }>();
  const once = (key: string, ttl: number, load: () => Promise<unknown[]>) => {
    const m = memo.get(key);
    if (m && m.until > Date.now()) return m.v;
    const v = load().catch(() => []);
    memo.set(key, { until: Date.now() + ttl * 1000, v });
    return v;
  };
  return {
    name: "stratum-dev-live-api",
    apply: () => process.env.STRATUM_LOCAL_LIVE === "1",
    configureServer(server) {
      server.middlewares.use("/api/live", async (req, res) => {
        const { cell, fromOpenSky, fromReadsb, merge, INDIA_BOX, USER_AGENT } = await import("./worker/live.js");
        const q = new URL(req.url ?? "", "http://x").searchParams;
        const lat = cell(q.get("lat"), 4, 39);
        const lon = cell(q.get("lon"), 66, 100);
        res.setHeader("content-type", "application/json");
        if (lat == null || lon == null) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "lat/lon outside India's region" }));
          return;
        }
        const get = async (url: string) => {
          const r = await fetch(url, { headers: { "user-agent": USER_AGENT } });
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        };
        const box = new URLSearchParams(Object.entries(INDIA_BOX).map(([k, v]) => [k, String(v)]));
        const [os, lol] = await Promise.all([
          once("opensky", 600, async () => fromOpenSky((await get(`https://opensky-network.org/api/states/all?${box}`)).states)),
          once(`lol/${lat}/${lon}`, 60, async () => fromReadsb((await get(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/250`)).ac, Date.now())),
        ]);
        const ac = merge(os as never, lol as never);
        res.end(JSON.stringify({ t: Date.now(), centre: [lat, lon], radius_nm: 250, credit: "Live aircraft: The OpenSky Network, adsb.lol (ODbL)", sources: { opensky: os.length, adsb_lol: lol.length }, ac }));
      });
    },
  };
}

// The data the Worker serves from data branches (forecast, report card, expected flights), and in
// `vite preview` the live feed too, come from the deployed site when testing locally.
const SITE = "https://stratum.aerospaceonyx.workers.dev";
const fromSite = {
  ...Object.fromEntries(["/data/outlook", "/data/report"].map((p) => [p, { target: SITE, changeOrigin: true }])),
  // straight from its branch, as the Worker reads it
  "/data/schedule": { target: "https://raw.githubusercontent.com", changeOrigin: true, rewrite: (p: string) => p.replace("/data/schedule", "/ShrugalVinod/stratum/schedule-data") },
};

// `base` is set per host at deploy time (e.g. "/" for Cloudflare Pages).
export default defineConfig({
  plugins: [preact(), preloadFonts(), devLiveApi()],
  base: BASE,
  server: { proxy: process.env.STRATUM_LOCAL_LIVE === "1" ? fromSite : { ...fromSite, "/api/live": { target: SITE, changeOrigin: true } } },
  preview: { proxy: { ...fromSite, "/api/live": { target: SITE, changeOrigin: true } } },
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
