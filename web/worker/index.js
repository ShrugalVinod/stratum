// STRATUM website Worker: static assets, plus two small server-side routes.
//
// * /data/outlook/*  the daily contrail outlook (ECMWF open data, built by the `outlook` GitHub
//   Action and kept as one commit on the repo's `outlook-data` branch), cached for 10 minutes.
// * /api/live        cruising airline flights over India: the OpenSky Network for the whole
//   country (one request, cached 90 s with the team's OpenSky API client in the Worker secrets
//   OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET, else 15 min anonymously), plus adsb.fi and
//   adsb.lol around the visitor (cached 60 s per 0.5° cell), merged. Only callsign, type,
//   position, level, track and speed reach the browser: no ICAO24 address, nothing is stored.
//
// Everything else is the static site (wrangler.jsonc: assets, single-page fallback).

import { cell, fromOpenSky, fromReadsb, INDIA_BOX, merge, USER_AGENT } from "./live.js";

const OUTLOOK_RAW = "https://raw.githubusercontent.com/ShrugalVinod/stratum/outlook-data/";
const OPENSKY = "https://opensky-network.org/api/states/all";
const OPENSKY_TOKEN = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const READSB = {
  adsb_fi: { url: "https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/250", key: "aircraft" },
  adsb_lol: { url: "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/250", key: "ac" },
};
const NEAR_TTL_S = 60;
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
  const [os, fi, lol] = await Promise.all([
    openSky(env, ctx),
    near("adsb_fi", lat, lon, ctx),
    near("adsb_lol", lat, lon, ctx),
  ]);
  const ac = merge(os.list, fi.list, lol.list);
  if (!ac.length && os.status !== "ok" && fi.status !== "ok" && lol.status !== "ok") return json({ error: "live feeds busy, try again in a minute" }, 503, 0);
  return json(
    {
      t: Date.now(),
      centre: [lat, lon],
      radius_nm: 250,
      credit: "Live aircraft: The OpenSky Network, adsb.fi, adsb.lol (ODbL)",
      sources: { opensky: os.status === "ok" ? os.list.length : os.status, adsb_fi: fi.status === "ok" ? fi.list.length : fi.status, adsb_lol: lol.status === "ok" ? lol.list.length : lol.status },
      ac,
    },
    200,
    30,
  );
}

/** Get a cached source answer, or fetch it and cache it (server side only: it keeps the match keys). */
async function cached(key, ttl, ctx, load) {
  const k = new Request(`https://stratum-cache.invalid/${key}`);
  const hit = await caches.default.match(k);
  if (hit) return hit.json();
  const v = await load();
  const t = v.status === "ok" ? ttl : Math.min(ttl, 120); // a failure is retried sooner
  ctx.waitUntil(caches.default.put(k, new Response(JSON.stringify(v), { headers: { "cache-control": `public, max-age=${t}` } })));
  return v;
}

let token = null; // { value, exp } per Worker instance

async function bearer(env) {
  if (!env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return null;
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch(OPENSKY_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.OPENSKY_CLIENT_ID, client_secret: env.OPENSKY_CLIENT_SECRET }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  token = { value: j.access_token, exp: Date.now() + 1000 * (j.expires_in ?? 1800) };
  return token.value;
}

function openSky(env, ctx) {
  const authed = !!(env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET);
  // the India box costs 4 API credits: 90 s with the team's client (4,000 credits a day),
  // 15 min anonymously (400 a day)
  return cached(`opensky/india/${authed ? "a" : "anon"}`, authed ? 90 : 900, ctx, async () => {
    try {
      const b = await bearer(env);
      const q = new URLSearchParams(Object.entries(INDIA_BOX).map(([k, v]) => [k, String(v)]));
      const r = await fetch(`${OPENSKY}?${q}`, { headers: b ? { authorization: `Bearer ${b}` } : {} });
      if (!r.ok) return { status: `HTTP ${r.status}`, list: [] };
      return { status: "ok", list: fromOpenSky((await r.json()).states) };
    } catch {
      return { status: "unreachable", list: [] };
    }
  });
}

function near(src, lat, lon, ctx) {
  const s = READSB[src];
  return cached(`${src}/${lat}/${lon}`, NEAR_TTL_S, ctx, async () => {
    try {
      const r = await fetch(s.url.replace("{lat}", lat).replace("{lon}", lon), { headers: { "user-agent": USER_AGENT } });
      if (!r.ok) return { status: `HTTP ${r.status}`, list: [] };
      return { status: "ok", list: fromReadsb((await r.json())[s.key], Date.now()) };
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
