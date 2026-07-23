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
  const cleanupReloadKey = "icis-sw-cleanup-reload";

  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((registration) => registration.unregister().catch(() => false))))
    .then(() => {
      if (navigator.serviceWorker.controller && sessionStorage.getItem(cleanupReloadKey) !== "done") {
        sessionStorage.setItem(cleanupReloadKey, "done");
        window.location.reload();
      }
    })
    .catch(() => {});

  if ("caches" in window) {
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n).catch(() => false))))
      .catch(() => {});
  }
}
