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

/**
 * A aba "Execução" existe em QUALQUER card — inclusive durante a criação
 * manual (rascunho). No rascunho o checklist vive só em memória e é
 * materializado no banco depois que a demanda é criada.
 */
export function shouldShowExecutionTab(_opts: { isDraft?: boolean } = {}): boolean {
  return true;
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

/* ============================== CONTEXTO OPERACIONAL ============================== */

/** Card em execução humana agora (independente de existir checklist). */
export interface OperationalContextCard {
  id?: string | null;
  assigned_to?: string | null;
  current_function_key?: string | null;
  is_draft?: boolean | null;
  archived_at?: string | null;
}

/**
 * "Contexto operacional humano atual": existe responsável, existe etapa e a
 * etapa é efetivamente de execução (não client-facing / aguardando cliente /
 * untimed). A classificação de etapa vem de `flowFunctions` — sem listas
 * duplicadas.
 */
export function hasOperationalExecutionContext(
  card: OperationalContextCard | null | undefined,
  classify: {
    isClientFacing: (key?: string | null) => boolean;
    isEvaluation?: (key?: string | null) => boolean;
  },
): boolean {
  if (!card) return false;
  if (card.is_draft) return false;
  if (card.archived_at) return false;
  const stage = norm(card.current_function_key);
  if (!stage) return false;
  if (!card.assigned_to) return false;
  if (classify.isClientFacing(stage)) return false;
  if (classify.isEvaluation?.(stage)) return false;
  return true;
}

/**
 * Aba inicial do card — resolvida SINCRONICAMENTE a partir do próprio card
 * (sem esperar carregamentos), para não abrir em Conteúdo e trocar depois.
 */
export function resolveInitialSection<T extends string>(params: {
  isDraft?: boolean;
  hasBriefing?: boolean;
  operational: boolean;
  showExecutionTab: boolean;
  /** Aba padrão quando não há contexto operacional (Briefing/Conteúdo). */
  fallback: T;
  briefingSection: T;
  executionSection: T;
}): T {
  if (!params.isDraft && params.operational && params.showExecutionTab) {
    return params.executionSection;
  }
  if (params.hasBriefing) return params.briefingSection;
  return params.fallback;
}

/**
 * Único override permitido depois do carregamento: Alterações pendentes.
 * Só ocorre se o usuário ainda não navegou manualmente nesta abertura.
 */
export function resolvePostLoadOverride<T extends string>(params: {
  isDraft?: boolean;
  userNavigated: boolean;
  alterationsPending: number;
  alterationsSection: T;
}): T | null {
  if (params.isDraft) return null;
  if (params.userNavigated) return null;
  if (params.alterationsPending > 0) return params.alterationsSection;
  return null;
}

/* ============================== ORDEM DO CHECKLIST ============================== */

/**
 * Ordem canônica do checklist: PENDENTES primeiro (na ordem de `position`),
 * CONCLUÍDOS depois (também por `position`). Usada tanto na UI quanto na
 * persistência, para nunca divergirem.
 */
export function sortExecutionItems<T extends { is_completed: boolean; position: number }>(
  items: T[] | null | undefined,
): T[] {
  return [...(items ?? [])].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    return a.position - b.position;
  });
}

/** Partição em pendentes/concluídos já na ordem canônica. */
export function partitionExecutionItems<T extends { is_completed: boolean; position: number }>(
  items: T[] | null | undefined,
): { pending: T[]; completed: T[] } {
  const sorted = sortExecutionItems(items);
  return {
    pending: sorted.filter((i) => !i.is_completed),
    completed: sorted.filter((i) => i.is_completed),
  };
}

/** Reindexa `position` para 0..n-1 respeitando a ordem recebida. */
function reindex<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, position: index }));
}

/**
 * Reordena manualmente um item na LISTA VISÍVEL (ordem canônica).
 * A movimentação é limitada ao grupo do item arrastado: pendentes trocam de
 * lugar entre pendentes, concluídos entre concluídos. Se o destino cruzar a
 * fronteira, ele é limitado (clamp) à borda do próprio grupo.
 *
 * Retorna a lista completa, na nova ordem, com posições contíguas 0..n-1.
 */
export function reorderExecutionItems<T extends { id: string; is_completed: boolean; position: number }>(
  items: T[] | null | undefined,
  sourceIndex: number,
  destinationIndex: number,
): T[] {
  const sorted = sortExecutionItems(items);
  if (sourceIndex < 0 || sourceIndex >= sorted.length) return reindex(sorted);

  const { pending, completed } = partitionExecutionItems(sorted);
  const moving = sorted[sourceIndex];
  const group = moving.is_completed ? completed : pending;
  const offset = moving.is_completed ? pending.length : 0;

  const localFrom = sourceIndex - offset;
  const localTo = Math.max(0, Math.min(group.length - 1, destinationIndex - offset));
  if (localFrom === localTo) return reindex(sorted);

  const nextGroup = [...group];
  nextGroup.splice(localFrom, 1);
  nextGroup.splice(localTo, 0, moving);

  const merged = moving.is_completed ? [...pending, ...nextGroup] : [...nextGroup, ...completed];
  return reindex(merged);
}

/**
 * Alterna a conclusão de um item e o joga para o FIM do grupo de destino
 * (concluído → fim dos concluídos; reaberto → fim dos pendentes).
 * Retorna a lista completa reindexada.
 */
export function applyExecutionToggleOrder<T extends { id: string; is_completed: boolean; position: number }>(
  items: T[] | null | undefined,
  itemId: string,
  completed: boolean,
): T[] {
  const sorted = sortExecutionItems(items).map((i) =>
    i.id === itemId ? ({ ...i, is_completed: completed } as T) : i,
  );
  const { pending, completed: done } = partitionExecutionItems(sorted);
  const move = (list: T[]) => {
    const idx = list.findIndex((i) => i.id === itemId);
    if (idx < 0) return list;
    const [item] = list.splice(idx, 1);
    list.push(item);
    return list;
  };
  return reindex(
    completed ? [...pending, ...move([...done])] : [...move([...pending]), ...done],
  );
}

/** Lista de `{ id, position }` para gravar depois de uma reordenação. */
export function executionPositionUpdates(
  items: Array<{ id: string; position: number }>,
): Array<{ id: string; position: number }> {
  return items.map((i, index) => ({ id: i.id, position: index }));
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

/* ============================== RASCUNHO (CRIAÇÃO) ============================== */

/** Item do checklist enquanto a demanda ainda é rascunho (só memória). */
export interface DraftExecutionItem {
  id: string;
  text: string;
  is_completed: boolean;
}

let draftSeq = 0;
export function makeDraftExecutionItem(text: string): DraftExecutionItem {
  draftSeq += 1;
  return { id: `draft-${draftSeq}`, text: text.trim(), is_completed: false };
}

/**
 * Run SINTÉTICO para o rascunho: permite reusar exatamente o mesmo
 * `ExecutionPanel` da demanda salva, sem componente paralelo e sem gravar nada.
 */
export function buildDraftExecutionRun(
  items: DraftExecutionItem[],
  ctx: ExecutionContext,
): ExecutionRunWithItems {
  const now = new Date().toISOString();
  return {
    id: "draft-run",
    tenant_id: "",
    demand_id: "draft",
    function_key: ctx.functionKey,
    demand_type_key: ctx.demandTypeKey,
    assigned_to: ctx.assignedTo,
    pass_number: 1,
    status: "active",
    created_by: null,
    created_at: now,
    completed_at: null,
    updated_at: now,
    metadata: { draft: true },
    items: items.map((i, index) => ({
      id: i.id,
      execution_run_id: "draft-run",
      tenant_id: "",
      text: i.text,
      is_completed: i.is_completed,
      position: index,
      completed_by: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    })),
  };
}

/** Textos que devem ser materializados no banco após criar a demanda. */
export function draftExecutionItemTexts(items: DraftExecutionItem[]): string[] {
  return normalizeExecutionItemTexts(items.map((i) => i.text)).map((i) => i.text);
}

/**
 * Reordena o checklist do RASCUNHO (só memória) usando exatamente as mesmas
 * regras de grupo da demanda salva. A ordem resultante é a ordem que será
 * materializada no banco quando a demanda for criada.
 */
export function reorderDraftExecutionItems(
  items: DraftExecutionItem[],
  sourceIndex: number,
  destinationIndex: number,
): DraftExecutionItem[] {
  const withPosition = sortExecutionItems(
    items.map((item, index) => ({ ...item, position: index })),
  );
  return reorderExecutionItems(withPosition, sourceIndex, destinationIndex).map(
    ({ id, text, is_completed }) => ({ id, text, is_completed }),
  );
}

/** Move o item alternado para o fim do grupo correto, no rascunho. */
export function applyDraftExecutionToggleOrder(
  items: DraftExecutionItem[],
  itemId: string,
  completed: boolean,
): DraftExecutionItem[] {
  const withPosition = items.map((item, index) => ({ ...item, position: index }));
  return applyExecutionToggleOrder(withPosition, itemId, completed).map(
    ({ id, text, is_completed }) => ({ id, text, is_completed }),
  );
}
