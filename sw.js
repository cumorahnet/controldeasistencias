const CACHE_NAME = "control-asistencia-36.38.0-pwa-v13";
const APP_BASE_URL = new URL("./", self.location.href);
const appUrl = (path) => new URL(path, APP_BASE_URL).href;
const APP_SHELL = [
  "./",
  "index.html",
  "app.js",
  "camera-data-scanner.js",
  "pwa-install.js",
  "manifest.webmanifest",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png",
  "icons/app-icon-maskable-512.png",
  "icons/apple-touch-icon.png",
].map(appUrl);
const OFFLINE_DOCUMENT = appUrl("index.html");

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    self.skipWaiting(),
  ]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(event.request))
        || (event.request.mode === "navigate" ? caches.match(OFFLINE_DOCUMENT) : Response.error());
    }
  })());
});
