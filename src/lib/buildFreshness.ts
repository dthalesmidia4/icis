/**
 * Watchdog de frescor de build.
 *
 * O bundle local conhece seu próprio BUILD_ID/BUILD_TIME. O servidor publica
 * /version.json (gerado em todo build pelo Vite). Se o servidor passar a
 * servir um build MAIS NOVO que o carregado, recarregamos UMA vez.
 *
 * Nunca mexe em localStorage/IndexedDB/cookies/sessão Supabase.
 */
import { BUILD_ID, BUILD_TIME } from "./buildVersion";

export interface RemoteBuild {
  version?: string;
  builtAt?: string;
  id?: string;
}

export type FreshnessDecision =
  | { action: "none"; reason: string }
  | { action: "reload"; remoteId: string; remoteBuiltAt: string };

const RELOAD_PARAM = "__icis_build";

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export interface DecideOptions {
  remote: unknown;
  localBuiltAt?: string;
  localId?: string;
  /** Retorna true se já recarregamos para esse remote id nesta sessão. */
  alreadyReloaded?: (remoteId: string) => boolean;
}

export function decideFreshness({
  remote,
  localBuiltAt = BUILD_TIME,
  localId = BUILD_ID,
  alreadyReloaded,
}: DecideOptions): FreshnessDecision {
  if (!remote || typeof remote !== "object") {
    return { action: "none", reason: "invalid_payload" };
  }

  const data = remote as RemoteBuild;
  const remoteId = typeof data.id === "string" && data.id ? data.id : null;

  if (remoteId && remoteId === localId) {
    return { action: "none", reason: "same_build" };
  }

  const remoteMs = parseTime(data.builtAt);
  if (remoteMs === null) {
    return { action: "none", reason: "invalid_remote_builtAt" };
  }

  const localMs = parseTime(localBuiltAt);
  if (localMs === null) {
    // Build local sem timestamp válido (dev): nunca force reload.
    return { action: "none", reason: "invalid_local_builtAt" };
  }

  if (remoteMs <= localMs) {
    return { action: "none", reason: "remote_not_newer" };
  }

  const id = remoteId ?? (data.builtAt as string);

  if (alreadyReloaded?.(id)) {
    return { action: "none", reason: "already_reloaded" };
  }

  return { action: "reload", remoteId: id, remoteBuiltAt: data.builtAt as string };
}

export function isPreviewHost(hostname: string): boolean {
  return hostname.startsWith("id-preview--") || hostname.startsWith("preview--");
}

export function checkIntervalMs(hostname: string): number {
  return isPreviewHost(hostname) ? 15_000 : 60_000;
}

function sessionKey(remoteId: string) {
  return `icis-build-refresh-${remoteId}`;
}

function log(...args: unknown[]) {
  if (typeof window === "undefined") return;
  const host = window.location.hostname;
  if (!import.meta.env.PROD || isPreviewHost(host)) {
    // eslint-disable-next-line no-console
    console.info(...args);
  }
}

function clearReloadParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RELOAD_PARAM)) return;
  url.searchParams.delete(RELOAD_PARAM);
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function fetchRemote(): Promise<unknown | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function runCheck(): Promise<void> {
  const remote = await fetchRemote();
  if (!remote) return;

  (window as unknown as Record<string, unknown>).__ICIS_REMOTE_BUILD__ = remote;

  const decision = decideFreshness({
    remote,
    alreadyReloaded: (id) => {
      try {
        return sessionStorage.getItem(sessionKey(id)) === "done";
      } catch {
        return false;
      }
    },
  });

  if (decision.action !== "reload") return;

  log(`[ICIS] remote build ${decision.remoteId}`);
  log("[ICIS] newer build detected, refreshing...");

  try {
    sessionStorage.setItem(sessionKey(decision.remoteId), "done");
  } catch {
    /* storage indisponível: ainda recarrega uma vez */
  }

  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, decision.remoteBuiltAt);
  window.location.replace(url.toString());
}

let started = false;

/** Inicializa o watchdog. Idempotente. */
export function startBuildFreshnessWatchdog(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  clearReloadParam();
  log(`[ICIS] local build ${BUILD_ID}`);

  const interval = checkIntervalMs(window.location.hostname);

  window.setTimeout(() => {
    void runCheck();
  }, 2_500);

  window.setInterval(() => {
    void runCheck();
  }, interval);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void runCheck();
  });
}
