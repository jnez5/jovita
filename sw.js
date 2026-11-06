// Keeps the app available with no signal. The app's own files are served from the phone first,
// then quietly refreshed in the background whenever there is a connection.
const VERSION = "litter-log-v1";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "litter-fonts").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: keep a copy the first time they load, then always use the saved copy
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open("litter-fonts").then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try { const res = await fetch(req); if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }
        catch (e) { return new Response("", {status: 504}); }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: answer from the phone right away, refresh in the background
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const key = req.mode === "navigate" ? "./index.html" : req;
      const hit = await cache.match(key, {ignoreSearch: true});
      const refresh = fetch(req).then(res => {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { event.waitUntil(refresh); return hit; }
      const res = await refresh;
      return res || new Response("Offline", {status: 503, headers: {"Content-Type": "text/plain"}});
    })
  );
});
