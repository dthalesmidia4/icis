/**
 * Sentinela de versão do build.
 *
 * BUILD_VERSION é mantido manualmente (não há SHA de commit disponível em
 * runtime neste ambiente). __ICIS_BUILD_TIME__ é injetado pelo Vite no build,
 * então dois deploys diferentes nunca têm o mesmo identificador.
 */
export const BUILD_VERSION = "2026-08-21-2";

declare const __ICIS_BUILD_TIME__: string;

export const BUILD_TIME: string =
  typeof __ICIS_BUILD_TIME__ === "string" ? __ICIS_BUILD_TIME__ : "dev";

export const BUILD_ID = `${BUILD_VERSION}+${BUILD_TIME}`;

export interface BuildSentinel {
  version: string;
  builtAt: string;
  id: string;
}

export function buildSentinel(): BuildSentinel {
  return { version: BUILD_VERSION, builtAt: BUILD_TIME, id: BUILD_ID };
}

/** Expõe a versão executada em window.__ICIS_BUILD__ (sem poluição visual). */
export function exposeBuildSentinel(): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__ICIS_BUILD__ = buildSentinel();

  const host = window.location.hostname;
  const isPreview =
    !import.meta.env.PROD ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.app");

  if (isPreview) {
    // eslint-disable-next-line no-console
    console.info(`[ICIS] build ${BUILD_ID}`);
  }
}
