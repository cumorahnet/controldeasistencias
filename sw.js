const CACHE_NAME = "control-asistencia-36.76.0-pwa-v41";
const APP_BASE_URL = new URL("./", self.location.href);
const appUrl = (path) => new URL(path, APP_BASE_URL).href;
const APP_SHELL = [
  "./",
  "index.html",
  "app.js",
  "app-check-config.js",
  "app-startup.js",
  "school-timetable.js",
  "attendance-report-export.js",
  "camera-data-scanner.js",
  "pwa-install.js",
  "vendor/xlsx.full.min.js",
  "manifest.webmanifest",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png",
  "icons/app-icon-maskable-512.png",
  "icons/apple-touch-icon.png",
].map(appUrl);
const OFFLINE_DOCUMENT = appUrl("index.html");
const CACHEABLE_PATHS = new Set(APP_SHELL.map((url) => new URL(url).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    self.skipWaiting(),
  ]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("control-asistencia-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin
    || !CACHEABLE_PATHS.has(url.pathname) || event.request.headers.has("Authorization")) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && !response.redirected && !/\b(no-store|private)\b/i.test(response.headers.get("Cache-Control") || "")) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        } catch { /* Storage failure must not discard a successful network response. */ }
      }
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request))
        || (event.request.mode === "navigate" ? await cache.match(OFFLINE_DOCUMENT) : null)
        || Response.error();
    }
  })());
});
