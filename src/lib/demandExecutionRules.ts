/**
 * EXECUÇÃO OPERACIONAL POR PASSAGEM — regras puras (sem rede).
 *
 * Semântica (NÃO confundir com "Alterações"):
 *  - "Alterações" = retrabalho/correção solicitada por outra pessoa;
 *  - "Execução"   = o que o RESPONSÁVEL DESTA ETAPA precisa executar agora.
 *
 * Cada passagem da demanda por (etapa + responsável) é um `run`. Quando a
 * demanda muda de etapa, de tipo ou de responsável, o run ativo é FECHADO e um
 * novo run nasce — o histórico das passagens anteriores nunca é reescrito.
 */

export type ExecutionRunStatus =
  | "active"
  | "completed"
  | "completed_with_pending"
  | "superseded"
  | "cancelled";

export interface ExecutionItem {
  id: string;
  execution_run_id: string;
  tenant_id: string;
  text: string;
  is_completed: boolean;
  position: number;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionRun {
  id: string;
  tenant_id: string;
  demand_id: string;
  function_key: string | null;
  demand_type_key: string | null;
  assigned_to: string | null;
  pass_number: number;
  status: ExecutionRunStatus;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface ExecutionRunWithItems extends ExecutionRun {
  items: ExecutionItem[];
}

/** Identidade da passagem atual do card (etapa + tipo + responsável). */
export interface ExecutionContext {
  functionKey: string | null;
  demandTypeKey: string | null;
  assignedTo: string | null;
}

const norm = (v?: string | null) => (v ?? "").trim() || null;

/* ============================== PROGRESSO ============================== */

/** Itens pendentes do run ATIVO (runs históricos nunca geram pendência). */
export function countPendingExecutionItems(
  run: ExecutionRunWithItems | null | undefined,
): number {
  if (!run || run.status !== "active") return 0;
  return run.items.filter((i) => !i.is_completed).length;
}

export function computeExecutionProgress(run: ExecutionRunWithItems | null | undefined): {
  done: number;
  total: number;
} {
  const items = run?.items ?? [];
  return { done: items.filter((i) => i.is_completed).length, total: items.length };
}

/** Todos os itens concluídos (com pelo menos 1 item). */
export function isExecutionRunFullyDone(
  run: ExecutionRunWithItems | null | undefined,
): boolean {
  if (!run) return false;
  if (run.items.length === 0) return false;
  return run.items.every((i) => i.is_completed);
}

/* ============================== IDENTIDADE ============================== */

/** O run ativo corresponde à passagem atual do card? */
export function runMatchesContext(
  run: ExecutionRun | null | undefined,
  ctx: ExecutionContext,
): boolean {
  if (!run) return false;
  return (
    norm(run.function_key) === norm(ctx.functionKey) &&
    norm(run.demand_type_key) === norm(ctx.demandTypeKey) &&
    (run.assigned_to ?? null) === (ctx.assignedTo ?? null)
  );
}

/**
 * Número da passagem: quantas vezes esta etapa já foi executada neste card + 1.
 * Independe do responsável (a etapa pode voltar para outra pessoa).
 */
export function nextPassNumber(
  runs: ExecutionRun[] | null | undefined,
  functionKey: string | null,
): number {
  const key = norm(functionKey);
  const same = (runs ?? []).filter((r) => norm(r.function_key) === key);
  return same.length + 1;
}

/** Status de fechamento de um run conforme o checklist. */
export function closingStatusFor(
  run: ExecutionRunWithItems | null | undefined,
): Extract<ExecutionRunStatus, "completed" | "completed_with_pending"> {
  return countPendingExecutionItems(run) > 0 ? "completed_with_pending" : "completed";
}

/* ============================== ABAS / BADGES ============================== */

/** A aba "Execução" existe em qualquer card já salvo (mesmo sem checklist). */
export function shouldShowExecutionTab(opts: { isDraft?: boolean } = {}): boolean {
  return !opts.isDraft;
}

/** Badge da aba: número de itens pendentes da passagem atual. */
export function executionBadgeCount(
  run: ExecutionRunWithItems | null | undefined,
): number {
  return countPendingExecutionItems(run);
}

/**
 * Qual aba deve sequestrar a abertura do card.
 * "Alterações" (retrabalho) tem prioridade sobre "Execução".
 */
export function resolveAutoOpenTab(params: {
  isDraft?: boolean;
  alterationsPending: number;
  executionPending: number;
}): "alteracoes" | "execucao" | null {
  if (params.isDraft) return null;
  if (params.alterationsPending > 0) return "alteracoes";
  if (params.executionPending > 0) return "execucao";
  return null;
}

/* ============================== DRAFTS ============================== */

/** Normaliza itens digitados: remove vazios, deduplica e reindexa posições. */
export function normalizeExecutionItemTexts(
  texts: Array<string | null | undefined>,
): Array<{ text: string; position: number }> {
  const seen = new Set<string>();
  const out: Array<{ text: string; position: number }> = [];
  for (const raw of texts ?? []) {
    const text = (raw ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, position: out.length });
  }
  return out;
}

/* ============================== TRANSIÇÃO ============================== */

export interface ExecutionTransitionWarning {
  pending: number;
  total: number;
  /** Itens pendentes, em ordem, para exibir no aviso antes de prosseguir. */
  pendingTexts: string[];
}

/**
 * O checklist de execução NUNCA bloqueia o fluxo — ele apenas avisa.
 * `null` = pode prosseguir sem aviso.
 */
export function buildExecutionTransitionWarning(
  run: ExecutionRunWithItems | null | undefined,
): ExecutionTransitionWarning | null {
  const pendingItems = (run?.status === "active" ? run.items : []).filter(
    (i) => !i.is_completed,
  );
  if (pendingItems.length === 0) return null;
  return {
    pending: pendingItems.length,
    total: run?.items.length ?? 0,
    pendingTexts: [...pendingItems]
      .sort((a, b) => a.position - b.position)
      .map((i) => i.text),
  };
}

/** Rótulo curto da passagem: "1ª passagem", "2ª passagem"… */
export function passLabel(passNumber: number): string {
  const n = Number.isFinite(passNumber) && passNumber > 0 ? Math.floor(passNumber) : 1;
  return `${n}ª passagem`;
}
