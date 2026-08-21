// ICIS kill-switch service worker (one-way cleanup).
//
// This file exists ONLY to take over any legacy PWA/offline worker that was
// historically registered at this path and remove it deterministically.
// The app never registers a functional service worker anymore.
//
// Bump ICIS_SW_KILL_VERSION on every change: the byte-diff is what makes the
// browser's update check adopt this worker instead of keeping the old one.
const ICIS_SW_KILL_VERSION = "2026-08-21-2";
const CLEANUP_PARAM = "__icis_sw_cleanup";

self.addEventListener("install", () => self.skipWaiting());

// Navigations must ALWAYS hit the network. Never cache-first.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "reload" }));
  }
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        // Only Cache Storage + SW registration are touched.
        // localStorage / IndexedDB / cookies (auth session) are never cleared.
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
            if (url.origin !== self.location.origin) return undefined;
            if (url.searchParams.get(CLEANUP_PARAM) === ICIS_SW_KILL_VERSION) return undefined;
            url.searchParams.set(CLEANUP_PARAM, ICIS_SW_KILL_VERSION);
            return client.navigate(url.toString());
          }),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
