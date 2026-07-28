import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}

// Desregistra qualquer Service Worker antigo (que servia versões em cache) e
// limpa caches residuais. Não registra nenhum SW novo — evita loops e impede
// que o preview continue preso em builds antigos.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const cleanupReloadKey = "icis-sw-cleanup-reload-2026-07-28";
  const cleanupParam = "__icis_cache_bust";

  const reloadFromNetwork = () => {
    if (sessionStorage.getItem(cleanupReloadKey) === "done") return;

    sessionStorage.setItem(cleanupReloadKey, "done");
    const url = new URL(window.location.href);
    url.searchParams.set(cleanupParam, Date.now().toString());
    window.location.replace(url.toString());
  };

  const removeCleanupParams = () => {
    const url = new URL(window.location.href);
    let changed = false;

    [cleanupParam, "__icis_sw_cleanup"].forEach((param) => {
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
      const hadRegistrations = regs.length > 0;
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

      if (navigator.serviceWorker.controller || hadRegistrations) {
        reloadFromNetwork();
        return;
      }

      removeCleanupParams();
    })
    .catch(() => {});
}
