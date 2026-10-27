// STRATUM website Worker: static assets, plus two small server-side routes.
//
// * /data/report/*   the daily report card (the `report` Action: yesterday's outlook against the
//   contrails Meteosat-9 saw; `report-data` branch), cached for 10 minutes.
// * /data/outlook/*  the daily contrail outlook (ECMWF open data, built by the `outlook` GitHub
//   Action and kept as one commit on the repo's `outlook-data` branch), cached for 10 minutes.
//   If a visitor finds the build is not from today's model run (after 09:30 UTC), the Worker asks
//   GitHub to build it now (same token as below; at most once an hour per location).
// * /api/live        cruising airline flights over India: the `live` GitHub Action's OpenSky
//   snapshot of the whole country (`live-data` branch; OpenSky and adsb.fi do not answer
//   Cloudflare's servers) merged with adsb.lol's live positions around the visitor (cached 60 s
//   per 0.5° cell). GitHub starts scheduled runs hours late, so when a visitor finds the snapshot
//   older than REFRESH_MIN the Worker asks GitHub to run the Action now (secret GH_DISPATCH_TOKEN:
//   a fine-grained token with Actions read/write on this repository only; at most one request
//   per 10 min per Cloudflare location). Only callsign, type, position, level, track and speed
//   reach the browser: no ICAO24 address, nothing is stored.
//
// Everything else is the static site (wrangler.jsonc: assets, single-page fallback).

import { cell, fromReadsb, merge, outlookStale, scheduleStale, USER_AGENT } from "./live.js";

const RAW = "https://raw.githubusercontent.com/ShrugalVinod/stratum/";
const SNAPSHOT = "https://raw.githubusercontent.com/ShrugalVinod/stratum/live-data/india.json";
// the last snapshot with a full sky (kept by the `live` Action), and a recorded one shipped with
// the site: shown, clearly labelled, when the live feed is down (pages that ask with ?fallback=)
const GOOD_SNAPSHOT = "https://raw.githubusercontent.com/ShrugalVinod/stratum/live-data/india-good.json";
const THIN = 80; // fewer airliners than this over India: the live feed is down
const ADSB_LOL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/250";
const TTL_S = 60;
const STALE_MIN = 180; // older than this, a snapshot is no longer shown at all
const REFRESH_MIN = 6;
const DISPATCH = "https://api.github.com/repos/ShrugalVinod/stratum/actions/workflows/{wf}/dispatches";
const TYPES = { json: "application/json; charset=utf-8", png: "image/png", geojson: "application/geo+json" };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.startsWith("/data/outlook/")) return branchFile(url, "outlook", env, ctx);
    if (req.method === "GET" && url.pathname.startsWith("/data/report/")) return branchFile(url, "report", env, ctx);
    if (req.method === "GET" && url.pathname.startsWith("/data/schedule/")) return branchFile(url, "schedule", env, ctx);
    if (req.method === "GET" && url.pathname === "/api/live") return live(url, env, ctx);
    return env.ASSETS.fetch(req);
  },
};

/** A file of a data branch: /data/<name>/* → `<name>-data` (outlook, report, schedule). */
async function branchFile(url, name, env, ctx) {
  const path = url.pathname.slice(`/data/${name}/`.length);
  if (!/^[\w./-]+$/.test(path) || path.includes("..")) return new Response("bad path", { status: 400 });
  const r = await fetch(`${RAW}${name}-data/${path}`, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) return new Response("not found", { status: r.status === 404 ? 404 : 502 });
  const ext = path.split(".").pop();
  if (name === "schedule" && path === "schedule.json") {
    // a skipped daily run: a visitor who finds an old file asks for a new one
    const text = await r.text();
    let day = null;
    try {
      day = JSON.parse(text).day;
    } catch {
      /* served as is */
    }
    if (scheduleStale(day, Date.now())) await refresh(env, ctx, "schedule.yml", 3600);
    return new Response(text, { headers: { "content-type": TYPES.json, "cache-control": "public, max-age=600" } });
  }
  if (name === "outlook" && path === "outlook.json") {
    // GitHub's daily schedule can skip a day: a visitor who finds yesterday's forecast asks for today's
    const text = await r.text();
    let run = null;
    try {
      run = JSON.parse(text).run;
    } catch {
      /* served as is */
    }
    if (outlookStale(run, Date.now())) await refresh(env, ctx, "outlook.yml", 3600);
    return new Response(text, { headers: { "content-type": TYPES.json, "cache-control": "public, max-age=600" } });
  }
  return new Response(r.body, {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=600" },
  });
}

async function live(url, env, ctx) {
  const lat = cell(url.searchParams.get("lat"), 4, 39);
  const lon = cell(url.searchParams.get("lon"), 66, 100);
  if (lat == null || lon == null) return json({ error: "lat/lon outside India's region" }, 400, 0);
  const [snap0, lol] = await Promise.all([snapshot(ctx), near(lat, lon, ctx)]);
  // an old snapshot (the Action has not run for a while) is still shown, with its age, while a
  // fresh one is fetched: better than an empty page. Past STALE_MIN it is left out.
  const age = snap0.t ? (Date.now() - snap0.t) / 60_000 : null;
  const asked = age == null || age > REFRESH_MIN ? await refresh(env, ctx, "live.yml", 600) : false;
  const snap =
    age != null && age > STALE_MIN
      ? { ...snap0, status: `stale (${Math.round(age)} min)${asked ? ", refreshing" : ""}`, list: [] }
      : snap0;
  const ac = merge(snap.list, lol.list);
  // ?fallback=allow: the last full sky when the live one is thin; ?fallback=1: always (demos)
  const fb = url.searchParams.get("fallback");
  if (fb === "1" || (fb === "allow" && snap.list.length < THIN)) {
    const good = await goodSky(url, env, ctx);
    if (good.list.length >= THIN) {
      const now = Date.now();
      return json(
        {
          t: now,
          centre: [lat, lon],
          radius_nm: 250,
          credit: "Live aircraft (recorded): The OpenSky Network",
          snapshot_t: good.t,
          snapshot_age_min: 0,
          sources: { opensky: snap.list.length, recorded: good.list.length },
          fallback: { recorded_t: good.t, reason: fb === "1" ? "asked" : "thin", live_count: ac.length },
          // shown as if now: positions, levels and routes as recorded
          ac: good.list.map((a) => ({ ...a, t: now })),
        },
        200,
        30,
      );
    }
  }
  if (!ac.length) return json({ error: "live feeds busy, try again in a minute", refreshing: asked }, 503, 0);
  return json(
    {
      t: Date.now(),
      centre: [lat, lon],
      radius_nm: 250,
      credit: "Live aircraft: The OpenSky Network, adsb.lol (ODbL)",
      snapshot_t: snap.t ?? null,
      snapshot_age_min: age == null ? null : Math.round(age),
      refreshing: asked,
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
      // a per-minute query string: raw.githubusercontent.com may otherwise serve a 5-min-old copy
      const r = await fetch(`${SNAPSHOT}?m=${Math.floor(Date.now() / 60_000)}`, { cf: { cacheTtl: 30 } });
      if (!r.ok) return { status: `HTTP ${r.status}`, list: [] };
      const d = await r.json();
      return { status: "ok", t: d.t, list: d.ac ?? [] };
    } catch {
      return { status: "unreachable", list: [] };
    }
  });
}

/** The last full sky: the `live` Action's last good snapshot, else the one shipped with the site. */
async function goodSky(url, env, ctx) {
  const kept = await cached("snapshot/good", 600, ctx, async () => {
    try {
      const r = await fetch(GOOD_SNAPSHOT, { cf: { cacheTtl: 300 } });
      if (!r.ok) return { t: null, list: [] };
      const d = await r.json();
      return { t: d.t, list: d.ac ?? [] };
    } catch {
      return { t: null, list: [] };
    }
  });
  if (kept.list.length >= THIN) return kept;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/data/live-fallback.json", url)));
    if (r.ok) {
      const d = await r.json();
      return { t: d.t, list: d.ac ?? [] };
    }
  } catch {
    /* none */
  }
  return { t: null, list: [] };
}

/** Ask GitHub to run a workflow now (its data are old). True if a run was requested now or in
 *  the last ``every`` seconds from this Cloudflare location; false without the token. */
async function refresh(env, ctx, wf, every) {
  if (!env.GH_DISPATCH_TOKEN) return false;
  const k = new Request(`https://stratum-cache.invalid/dispatch/${wf}`);
  if (await caches.default.match(k)) return true;
  ctx.waitUntil(caches.default.put(k, new Response("1", { headers: { "cache-control": `public, max-age=${every}` } })));
  ctx.waitUntil(
    fetch(DISPATCH.replace("{wf}", wf), {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({ ref: "main" }),
    }).catch(() => undefined),
  );
  return true;
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
