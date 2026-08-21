import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { exposeBuildSentinel } from "./lib/buildVersion";
import { startBuildFreshnessWatchdog } from "./lib/buildFreshness";

exposeBuildSentinel();
startBuildFreshnessWatchdog();


const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}

// Rede de segurança: se algum Service Worker legado ainda estiver registrado
// (ou controlando a página), remove registros e Cache Storage. NUNCA registra
// um novo worker e NUNCA toca em localStorage/IndexedDB/cookies (sessão).
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const KILL_VERSION = "2026-08-21-2";
  const reloadKey = `icis-sw-cleanup-reload-${KILL_VERSION}`;
  const cleanupParam = "__icis_cache_bust";

  const reloadFromNetwork = () => {
    if (sessionStorage.getItem(reloadKey) === "done") return;

    sessionStorage.setItem(reloadKey, "done");
    const url = new URL(window.location.href);
    url.searchParams.set(cleanupParam, KILL_VERSION);
    window.location.replace(url.toString());
  };

  const removeCleanupParams = () => {
    const url = new URL(window.location.href);
    let changed = false;

    [cleanupParam, "__icis_sw_cleanup", "__icis_legacy_sw_cleanup"].forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    });

    if (changed) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  };

  navigator.serviceWorker
    .getRegistrations()
    .then(async (regs) => {
      const hadRegistrations = regs.length > 0 || !!navigator.serviceWorker.controller;

      await Promise.allSettled(
        regs.map((registration) =>
          registration
            .update()
            .catch(() => undefined)
            .then(() => registration.unregister().catch(() => false)),
        ),
      );

      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.allSettled(names.map((name) => caches.delete(name)));
      }

      if (hadRegistrations) {
        reloadFromNetwork();
        return;
      }

      removeCleanupParams();
    })
    .catch(() => {});
}
