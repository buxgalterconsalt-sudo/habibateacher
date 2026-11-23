const CACHE_NAME = "habiba-shell-v16";
const SHELL_ASSETS = ["/assets/platform.css?v=20261123home16", "/img/habiba-app-icon.svg", "/img/habiba-app-icon-192.png", "/img/habiba-app-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("habiba-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname !== "/assets/platform.css" && !url.pathname.startsWith("/img/habiba-app-icon")) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" }).then((response) => {
      if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())));
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
