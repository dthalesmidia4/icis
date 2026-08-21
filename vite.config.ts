import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Identificador de build criado UMA única vez por processo de build/dev.
// O mesmo valor é injetado no bundle (__ICIS_BUILD_TIME__) e emitido em
// /version.json, garantindo que app e endpoint nunca divirjam.
const BUILD_VERSION = "2026-08-21-3";
const BUILD_TIME = new Date().toISOString();
const BUILD_ID = `${BUILD_VERSION}+${BUILD_TIME}`;

const versionManifest = {
  version: BUILD_VERSION,
  builtAt: BUILD_TIME,
  id: BUILD_ID,
};

/** Emite /version.json no build e serve o mesmo JSON no dev server. */
function icisVersionEndpoint(): Plugin {
  const body = `${JSON.stringify(versionManifest, null, 2)}\n`;

  return {
    name: "icis-version-endpoint",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.split("?")[0].endsWith("/version.json")) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: body });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  },
  preview: {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  },
  define: {
    // Sentinela de build: permite confirmar exatamente qual build o browser executa.
    __ICIS_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __ICIS_BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [
    react(),
    icisVersionEndpoint(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),


  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

