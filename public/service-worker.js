// Kill-switch service worker. Replaces any previously registered app SW at this
// path, evicts app-shell caches, and then unregisters itself so the browser
// stops using a service worker for this app. It does not navigate clients.
function isAppShellCache(name) {
  return /workbox|precache|runtime|google-fonts-cache|gstatic-fonts-cache/.test(name);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const appShellCacheNames = cacheNames.filter(isAppShellCache);
        await Promise.allSettled(appShellCacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
