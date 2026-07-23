import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Desregistra qualquer Service Worker antigo (que servia versões em cache) e
// limpa caches Workbox residuais. Não registra nenhum SW novo — evita loops de
// navigate() do kill-switch. No-op quando não há SW.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
    .catch(() => {});
  if ("caches" in window) {
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n).catch(() => false))))
      .catch(() => {});
  }
}
