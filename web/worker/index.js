// STRATUM website Worker: static assets, plus two small server-side routes.
//
// * /data/outlook/*  the daily contrail outlook (ECMWF open data, built by the `outlook` GitHub
//   Action and kept as one commit on the repo's `outlook-data` branch), cached for 10 minutes.
// * /api/live        cruising airline flights over India: the `live` GitHub Action's OpenSky
//   snapshot of the whole country (every 5 min, `live-data` branch; OpenSky and adsb.fi do not
//   answer Cloudflare's servers) merged with adsb.lol's live positions around the visitor
//   (cached 60 s per 0.5° cell). Only callsign, type, position, level, track and speed reach
//   the browser: no ICAO24 address, nothing is stored.
//
// Everything else is the static site (wrangler.jsonc: assets, single-page fallback).

import { cell, fromReadsb, merge, USER_AGENT } from "./live.js";

const OUTLOOK_RAW = "https://raw.githubusercontent.com/ShrugalVinod/stratum/outlook-data/";
const SNAPSHOT = "https://raw.githubusercontent.com/ShrugalVinod/stratum/live-data/india.json";
const ADSB_LOL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/250";
const TTL_S = 60;
const STALE_MIN = 30;
const TYPES = { json: "application/json; charset=utf-8", png: "image/png", geojson: "application/geo+json" };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.startsWith("/data/outlook/")) return outlook(url);
    if (req.method === "GET" && url.pathname === "/api/live") return live(url, env, ctx);
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

async function live(url, env, ctx) {
  const lat = cell(url.searchParams.get("lat"), 4, 39);
  const lon = cell(url.searchParams.get("lon"), 66, 100);
  if (lat == null || lon == null) return json({ error: "lat/lon outside India's region" }, 400, 0);
  const [snap0, lol] = await Promise.all([snapshot(ctx), near(lat, lon, ctx)]);
  // a snapshot older than STALE_MIN (the Action did not run) would show planes where they were,
  // not where they are: leave it out and say so
  const age = snap0.t ? (Date.now() - snap0.t) / 60_000 : null;
  const snap = age != null && age > STALE_MIN ? { ...snap0, status: `stale (${Math.round(age)} min)`, list: [] } : snap0;
  const ac = merge(snap.list, lol.list);
  if (!ac.length && snap.status !== "ok" && lol.status !== "ok") return json({ error: "live feeds busy, try again in a minute" }, 503, 0);
  return json(
    {
      t: Date.now(),
      centre: [lat, lon],
      radius_nm: 250,
      credit: "Live aircraft: The OpenSky Network, adsb.lol (ODbL)",
      snapshot_t: snap.t ?? null,
      sources: { opensky: snap.status === "ok" ? snap.list.length : snap.status, adsb_lol: lol.status === "ok" ? lol.list.length : lol.status },
      ac,
    },
    200,
    30,
  );
}

/** Get a cached source answer, or fetch it and cache it (server side). */
async function cached(key, ttl, ctx, load) {
  const k = new Request(`https://stratum-cache.invalid/${key}`);
  const hit = await caches.default.match(k);
  if (hit) return hit.json();
  const v = await load();
  ctx.waitUntil(caches.default.put(k, new Response(JSON.stringify(v), { headers: { "cache-control": `public, max-age=${ttl}` } })));
  return v;
}

function snapshot(ctx) {
  return cached("snapshot/india", TTL_S, ctx, async () => {
    try {
      const r = await fetch(SNAPSHOT, { cf: { cacheTtl: 30 } });
      if (!r.ok) return { status: `HTTP ${r.status}`, list: [] };
      const d = await r.json();
      return { status: "ok", t: d.t, list: d.ac ?? [] };
    } catch {
      return { status: "unreachable", list: [] };
    }
  });
}

function near(lat, lon, ctx) {
  return cached(`adsb_lol/${lat}/${lon}`, TTL_S, ctx, async () => {
    try {
      const r = await fetch(ADSB_LOL.replace("{lat}", lat).replace("{lon}", lon), { headers: { "user-agent": USER_AGENT } });
      if (!r.ok) return { status: `HTTP ${r.status}`, list: [] };
      return { status: "ok", list: fromReadsb((await r.json()).ac, Date.now()) };
    } catch {
      return { status: "unreachable", list: [] };
    }
  });
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
}
