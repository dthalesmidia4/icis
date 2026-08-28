import { lazy, type ComponentType } from "react";

/**
 * Import dinâmico resiliente a deploys.
 *
 * Após um novo build, o `index.js` antigo em memória aponta para chunks que já
 * não existem no servidor (hash novo). O import falha com
 * "Failed to fetch dynamically imported module" e a tela fica branca.
 *
 * Estratégia: 1 retry com cache-busting; se ainda falhar, recarrega a página
 * UMA vez (guardado em sessionStorage) para buscar o `index.html` atualizado.
 * Nunca toca em localStorage/IndexedDB/cookies (sessão Supabase preservada).
 */
const RELOAD_KEY = "icis-chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
    message,
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      try {
        return await factory();
      } catch (retryError) {
        if (!isChunkLoadError(retryError) || typeof window === "undefined") throw retryError;

        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "done";
          sessionStorage.setItem(RELOAD_KEY, "done");
        } catch {
          /* storage indisponível: segue para o reload */
        }

        if (alreadyReloaded) throw retryError;

        window.location.reload();
        // Mantém o Suspense suspenso até o reload acontecer.
        return await new Promise<{ default: T }>(() => {});
      }
    }
  });
}
