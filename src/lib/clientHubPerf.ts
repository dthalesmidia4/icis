/**
 * INSTRUMENTAÇÃO DE PERCEPÇÃO (só dev, só console).
 *
 * Mede o caminho real "clique no cliente → shell do Hub utilizável" e a carga
 * de cada aba. Nada é gravado no banco: só `sessionStorage` + `console`.
 */
const KEY = "clientHub:selectAt";

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** Chamado no clique da lista de clientes. */
export function markClientSelected(): void {
  try {
    sessionStorage.setItem(KEY, String(now()));
  } catch {
    /* storage indisponível não pode quebrar a navegação */
  }
}

/** Chamado no primeiro effect do Hub após o paint. */
export function measureClientHubShell(): number | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const elapsed = now() - Number(raw);
    if (!Number.isFinite(elapsed)) return null;
    if (import.meta.env.DEV) {
      console.info(`[perf] client-hub-shell ${Math.round(elapsed)}ms`);
    }
    return elapsed;
  } catch {
    return null;
  }
}

/** Carga de uma aba específica. */
export function measureClientHubTab(tab: string, startedAt: number): number {
  const elapsed = now() - startedAt;
  if (import.meta.env.DEV) {
    console.info(`[perf] client-hub-tab:${tab} ${Math.round(elapsed)}ms`);
  }
  return elapsed;
}

export function perfNow(): number {
  return now();
}
