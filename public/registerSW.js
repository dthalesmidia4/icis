// Legacy PWA registration neutralizer.
// If an old build still loads /registerSW.js, this file performs the same
// cleanup as the app bootstrap instead of registering another worker.
(function () {
  var RELOAD_KEY = "icis-registersw-cleanup-2026-07-28";
  var CLEANUP_PARAM = "__icis_legacy_sw_cleanup";

  function reloadFromNetwork() {
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "done") return;
      sessionStorage.setItem(RELOAD_KEY, "done");
      var url = new URL(window.location.href);
      url.searchParams.set(CLEANUP_PARAM, Date.now().toString());
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
        var hadRegistrations = registrations.length > 0;
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
          return hadRegistrations;
        });
      })
      .then(function (hadRegistrations) {
        if (!("caches" in window)) return hadRegistrations;
        return caches.keys().then(function (names) {
          return Promise.allSettled(
            names.map(function (name) {
              return caches.delete(name);
            }),
          ).then(function () {
            return hadRegistrations;
          });
        });
      })
      .then(function (hadRegistrations) {
        if (navigator.serviceWorker.controller || hadRegistrations) reloadFromNetwork();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    window.addEventListener("load", cleanup, { once: true });
  } else {
    cleanup();
  }
})();