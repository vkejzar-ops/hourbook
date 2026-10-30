/* Hourbook offline cache.
   Bump CACHE when you upload a new index.html — that is what makes
   phones pick the new version up instead of the old cached one. */
const CACHE = "hourbook-v1.37";
const FILES = ["./", "./index.html", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

/* v1.32: every copy the worker keeps is fetched fresh from the site, never
   from the phone's own HTTP cache — otherwise a new worker could fill its
   offline copy with the old page and the update would not stick. */
const fresh = req => {
  const url = typeof req === "string" ? req : req.url;
  return fetch(new Request(url, { cache: "no-cache", credentials: "same-origin" }));
};

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(FILES.map(f =>
        fresh(f).then(r => { if (r && r.ok) return c.put(f, r); }).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Serve from the cache first so it opens instantly and works with no
   signal. In the background, fetch a fresh copy for next time. */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  /* other sites (map tiles, Home Assistant) go straight to the network */
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  /* v1.32: "Check for updates" asks the site directly. never answer that
     from the offline copy, or it would always look up to date. */
  if (e.request.cache === "no-store" || e.request.cache === "reload" || url.searchParams.has("fresh")) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      /* keep the browser's own request (redirect handling and all), just
         tell it not to answer from the HTTP cache */
      let req = e.request;
      try { req = new Request(e.request, { cache: "no-cache" }); } catch (err) {}
      const live = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
