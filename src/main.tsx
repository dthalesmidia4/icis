import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Kill-switch: força navegadores com Service Worker antigo (que servia versões
// em cache do app) a baixarem o SW kill-switch atual, que limpa caches Workbox
// e se auto-desregistra. Também remove qualquer cache remanescente da API
// Cache Storage. Seguro para rodar sempre — no-op quando não há SW registrado.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length === 0) return;
      // Aciona atualização em qualquer SW previamente registrado; o novo
      // sw.js/service-worker.js é um kill-switch que desregistra a si mesmo.
      registrations.forEach((reg) => {
        reg.update().catch(() => {});
      });
      // Também tenta registrar explicitamente o kill-switch caso o antigo
      // tenha um script URL diferente.
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          navigator.serviceWorker.register("/service-worker.js").catch(() => {});
        });
    });
    // Limpa caches Workbox residuais mesmo sem SW ativo.
    if ("caches" in window) {
      caches.keys().then((names) => {
        names
          .filter((n) => /(^|-)precache-v\d+-|(^|-)runtime-/.test(n))
          .forEach((n) => caches.delete(n).catch(() => {}));
      });
    }
  });
}
