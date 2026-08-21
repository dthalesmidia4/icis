// Legacy PWA registration neutralizer (versioned).
//
// Old builds may still request /registerSW.js. Instead of registering a worker,
// this file hands control to the kill-switch worker and reloads once.
(function () {
  var ICIS_SW_KILL_VERSION = "2026-08-21-2";
  var RELOAD_KEY = "icis-registersw-cleanup-" + ICIS_SW_KILL_VERSION;
  var CLEANUP_PARAM = "__icis_legacy_sw_cleanup";

  function reloadOnce() {
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "done") return;
      sessionStorage.setItem(RELOAD_KEY, "done");
      var url = new URL(window.location.href);
      url.searchParams.set(CLEANUP_PARAM, ICIS_SW_KILL_VERSION);
      window.location.replace(url.toString());
    } catch (error) {
      window.location.reload();
    }
  }

  function cleanup() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then(function (registrations) {
        var had = registrations.length > 0 || !!navigator.serviceWorker.controller;
        return Promise.allSettled(
          registrations.map(function (registration) {
            return Promise.resolve()
              .then(function () {
                return registration.update().catch(function () {});
              })
              .then(function () {
                return registration.unregister().catch(function () {
                  return false;
                });
              });
          }),
        ).then(function () {
          return had;
        });
      })
      .then(function (had) {
        if (!("caches" in window)) return had;
        return caches.keys().then(function (names) {
          return Promise.allSettled(
            names.map(function (name) {
              return caches.delete(name);
            }),
          ).then(function () {
            return had;
          });
        });
      })
      .then(function (had) {
        if (had) reloadOnce();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    window.addEventListener("load", cleanup, { once: true });
  } else {
    cleanup();
  }
})();
