// STRATUM website Worker: static assets, plus two small server-side routes.
//
// * /data/outlook/*  the daily contrail outlook (ECMWF open data, built by the `outlook` GitHub
//   Action and kept as one commit on the repo's `outlook-data` branch), cached for 10 minutes.
// * /api/live        commercial aircraft above FL200 near a point, from adsb.lol (ODbL). adsb.lol
//   sends no CORS header and allows few requests per IP, so the browser asks us; answers are
//   cached for 60 s per 0.5° cell. Only callsign, type, position, level, track and speed are
//   passed on: no ICAO24 address, nothing is stored.
//
// Everything else is the static site (wrangler.jsonc: assets, single-page fallback).

import { cell, slim, USER_AGENT } from "./live.js";

const OUTLOOK_RAW = "https://raw.githubusercontent.com/ShrugalVinod/stratum/outlook-data/";
const ADSB = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}";
const LIVE_TTL_S = 60;
const LIVE_RADIUS_NM = 160;
const TYPES = { json: "application/json; charset=utf-8", png: "image/png", geojson: "application/geo+json" };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.startsWith("/data/outlook/")) return outlook(url);
    if (req.method === "GET" && url.pathname === "/api/live") return live(url, ctx);
    return env.ASSETS.fetch(req);
  },
};

async function outlook(url) {
  const path = url.pathname.slice("/data/outlook/".length);
  if (!/^[\w./-]+$/.test(path) || path.includes("..")) return new Response("bad path", { status: 400 });
  const r = await fetch(OUTLOOK_RAW + path, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) return new Response("not found", { status: r.status === 404 ? 404 : 502 });
  const ext = path.split(".").pop();
  return new Response(r.body, {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=600" },
  });
}

async function live(url, ctx) {
  const lat = cell(url.searchParams.get("lat"), 4, 39);
  const lon = cell(url.searchParams.get("lon"), 66, 100);
  if (lat == null || lon == null) return json({ error: "lat/lon outside India's region" }, 400, 0);
  const key = new Request(`https://stratum-cache.invalid/live/${lat}/${lon}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const src = ADSB.replace("{lat}", lat).replace("{lon}", lon).replace("{nm}", LIVE_RADIUS_NM);
  let r;
  try {
    r = await fetch(src, { headers: { "user-agent": USER_AGENT } });
  } catch {
    return json({ error: "live feed unreachable" }, 502, 0);
  }
  if (!r.ok) return json({ error: r.status === 429 ? "live feed busy, try again in a minute" : `live feed HTTP ${r.status}` }, 503, 0);
  const now = Date.now();
  const body = { t: now, centre: [lat, lon], radius_nm: LIVE_RADIUS_NM, credit: "Live aircraft: adsb.lol (ODbL)", ac: slim((await r.json()).ac, now) };
  const res = json(body, 200, LIVE_TTL_S);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
}
