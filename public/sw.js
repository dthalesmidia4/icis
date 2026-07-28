// Definitive kill-switch service worker.
//
// Old PWA builds may still control the preview and keep serving app bundles from
// Cache Storage. This worker intentionally replaces any legacy worker registered
// at this path, deletes every origin cache, reloads controlled tabs through the
// network once, and unregisters itself. The current app does not register a new
// worker, so this is a one-way cleanup path.
const CLEANUP_PARAM = "__icis_sw_cleanup";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "reload" }));
  }
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();

        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        await Promise.allSettled(
          windowClients.map((client) => {
            const url = new URL(client.url);
            if (url.origin !== self.location.origin || url.searchParams.has(CLEANUP_PARAM)) {
              return undefined;
            }
            url.searchParams.set(CLEANUP_PARAM, Date.now().toString());
            return client.navigate(url.toString());
          }),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
