// STRATUM service worker (build prompt §8.2): a visited site keeps working offline.
// Pages: network first, falling back to the cached app shell. Hashed assets, data builds
// (their paths carry the build id), images, media and fonts: cache first — they never change
// under the same URL; the daily outlook (/data/outlook/) is network first. Anything else goes to
// the network as usual.
const CACHE = "stratum-v1";
const SHELL = "/index.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const IMMUTABLE = /^\/(assets|img|media|geo)\/|^\/data\/(?!outlook\/)[^/]+\//;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // the pointer to the current data build and the daily outlook must stay fresh
  if (url.pathname === "/data/current.json" || url.pathname.startsWith("/data/outlook/")) {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => put(new Request(SHELL), r))
        .catch(() => caches.match(SHELL)),
    );
    return;
  }
  if (IMMUTABLE.test(url.pathname) || url.pathname.endsWith(".woff2")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
  }
});

function put(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
