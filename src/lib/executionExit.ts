/**
 * SAÍDA DE UMA PASSAGEM DE EXECUÇÃO — regras puras + orquestrador.
 *
 * Regra conceitual: o aviso de pendência não pertence ao botão "Prosseguir".
 * Ele pertence ao evento semântico "esta ação, se der certo, ENCERRA a passagem
 * atual `(function_key + demand_type_key + assigned_to)` ou finaliza a demanda".
 *
 * Ordem transacional obrigatória (corrige a implementação anterior):
 *   1. executa a mutação;
 *   2. confirma semanticamente o sucesso (`success`, nunca "a Promise resolveu");
 *   3. só então marca itens (quando o usuário escolheu) e fecha o run ANTIGO,
 *      por `id`, com compare-and-set em `status = 'active'`.
 *
 * `stale` / `failure` NUNCA marcam itens nem fecham run.
 */
import {
  buildExecutionTransitionWarning,
  type ExecutionRunWithItems,
} from "@/lib/demandExecutionRules";

/** Resultado semântico confiável de uma mutação de fluxo. */
export type ExitOutcome = "success" | "stale" | "failure";

export interface ExecutionExitPreflight {
  /** Run ativo que será encerrado se a ação der certo. */
  runId: string;
  demandId: string;
  pending: number;
  total: number;
  pendingTexts: string[];
}

/** Escolha do usuário no diálogo (sem hard-block). */
export type ExecutionExitChoice = "complete_all" | "keep_pending";

export type ExecutionExitClosure = "completed" | "completed_with_pending" | null;

export interface ExecutionExitDeps {
  completeAllPending: (runId: string) => Promise<void>;
  /** CAS: fecha somente `id = runId AND status = 'active'`. Retorna se fechou. */
  closeRun: (params: {
    runId: string;
    status: "completed" | "completed_with_pending";
    reason: string;
  }) => Promise<boolean>;
}

export interface ExecutionExitResult {
  outcome: ExitOutcome;
  closed: ExecutionExitClosure;
  markedAll: boolean;
}

/**
 * Preflight: há algo para avisar antes da mutação?
 * `null` = pode seguir direto (sem diálogo).
 */
export function buildExecutionExitPreflight(
  run: ExecutionRunWithItems | null | undefined,
): ExecutionExitPreflight | null {
  const warning = buildExecutionTransitionWarning(run);
  if (!run || !warning) return null;
  return {
    runId: run.id,
    demandId: run.demand_id,
    pending: warning.pending,
    total: warning.total,
    pendingTexts: warning.pendingTexts,
  };
}

/** Normaliza resultados heterogêneos das libs de mutação em `ExitOutcome`. */
export function toExitOutcome(result: unknown): ExitOutcome {
  if (result === true) return "success";
  if (result === false || result == null) return "failure";
  if (result === "success" || result === "stale" || result === "failure") return result;
  if (typeof result !== "object") return "failure";
  const r = result as Record<string, any>;
  if (typeof r.status === "string") {
    if (r.status === "ok" || r.status === "success") return "success";
    if (r.status === "stale") return "stale";
    return "failure";
  }
  if (r.stale === true) return "stale";
  if (r.success === true) return "success";
  return "failure";
}

/**
 * Executa a mutação e, SOMENTE em caso de sucesso, encerra a passagem antiga.
 * Idempotente e seguro para corrida: o fechamento é por `runId` com CAS, logo
 * nunca fecha um run criado depois nem fecha o mesmo run duas vezes.
 */
export async function performExecutionExit(params: {
  /** Run ativo lido ANTES da mutação (null = nada a encerrar). */
  preflight?: ExecutionExitPreflight | null;
  /** Run ativo mesmo sem pendências (saída bem-sucedida também o fecha). */
  runId?: string | null;
  choice?: ExecutionExitChoice;
  reason: string;
  perform: () => Promise<unknown> | unknown;
  deps: ExecutionExitDeps;
}): Promise<ExecutionExitResult> {
  const runId = params.preflight?.runId ?? params.runId ?? null;
  const hadPending = (params.preflight?.pending ?? 0) > 0;
  const choice: ExecutionExitChoice = params.choice ?? "keep_pending";

  const outcome = toExitOutcome(await params.perform());
  if (outcome !== "success") {
    return { outcome, closed: null, markedAll: false };
  }
  if (!runId) return { outcome, closed: null, markedAll: false };

  let markedAll = false;
  if (hadPending && choice === "complete_all") {
    await params.deps.completeAllPending(runId);
    markedAll = true;
  }

  const status =
    hadPending && !markedAll ? "completed_with_pending" : "completed";
  const closed = await params.deps.closeRun({ runId, status, reason: params.reason });
  return { outcome, closed: closed ? status : null, markedAll };
}

/* ============================== LOTE (BULK) ============================== */

export interface BulkExecutionExitEntry {
  cardId: string;
  cardLabel?: string;
  preflight: ExecutionExitPreflight;
}

export interface BulkExecutionExitSummary {
  entries: BulkExecutionExitEntry[];
  cards: number;
  pending: number;
}

/** Uma única confirmação para todo o lote (nunca N diálogos). */
export function buildBulkExecutionExitSummary(
  runs: Array<{ cardId: string; cardLabel?: string; run: ExecutionRunWithItems | null }>,
): BulkExecutionExitSummary | null {
  const entries: BulkExecutionExitEntry[] = [];
  for (const r of runs) {
    const preflight = buildExecutionExitPreflight(r.run);
    if (!preflight) continue;
    entries.push({ cardId: r.cardId, cardLabel: r.cardLabel, preflight });
  }
  if (entries.length === 0) return null;
  return {
    entries,
    cards: entries.length,
    pending: entries.reduce((s, e) => s + e.preflight.pending, 0),
  };
}

/**
 * Encerra as passagens SOMENTE dos cards cuja transição individual deu certo.
 * Partial failure nunca silencia pendência de card que não se moveu.
 */
export async function finalizeBulkExecutionExit(params: {
  /** Runs ativos lidos antes do apply (com ou sem pendência). */
  runsByCard: Record<string, ExecutionRunWithItems | null | undefined>;
  appliedCardIds: string[];
  choice?: ExecutionExitChoice;
  reason: string;
  deps: ExecutionExitDeps;
}): Promise<{ closedCardIds: string[] }> {
  const closedCardIds: string[] = [];
  for (const cardId of params.appliedCardIds) {
    const run = params.runsByCard[cardId];
    if (!run || run.status !== "active") continue;
    const result = await performExecutionExit({
      preflight: buildExecutionExitPreflight(run),
      runId: run.id,
      choice: params.choice,
      reason: params.reason,
      perform: () => "success",
      deps: params.deps,
    });
    if (result.closed) closedCardIds.push(cardId);
  }
  return { closedCardIds };
}
