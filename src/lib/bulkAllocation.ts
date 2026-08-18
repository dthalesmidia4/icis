/**
 * ALOCAÇÃO EM MASSA de demandas para UM colaborador.
 *
 * Não é um `update` em massa de `assigned_to`. Para cada card selecionado o
 * motor:
 *   1. resolve a ETAPA que aquele colaborador pode executar (mesma semântica de
 *      `evaluateReassign` → `resolveFunctionForAssignee` + `userHasFunction`);
 *   2. calcula a DURAÇÃO REAL da etapa/tipo com os overrides do tenant
 *      (`flow_functions.config.durations` / `durations_by_type`);
 *   3. junta os cards selecionados à FILA ATUAL do colaborador e reorganiza tudo
 *      com `computeReorder` (prioridade por data de publicação SEMPRE ligada);
 *   4. devolve uma PRÉVIA (nada é gravado);
 *   5. em `applyBulkAllocation`, revalida contra concorrência (preflight) e só
 *      então grava — transferências via `applyReassign` (com o reagendamento no
 *      MESMO update, exigência do trigger de conflito de agenda) e cards antigos
 *      do destinatário via update de agenda com lock otimista.
 *
 * Estruturado para evoluir para distribuição entre vários colaboradores: o
 * planner recebe um único `targetUserId`, mas todo o cálculo é feito por card.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildReorderScheduleUpdate,
  computeReorder,
  DEFAULT_WORK_HOURS,
  type AreaScheduleMap,
  type ReorderCardInput,
  type ReorderProposal,
  type WorkHoursConfig,
} from "@/lib/reorderSequence";
import { getCachedDurationsByArea, type StageDurations } from "@/lib/flowDurations";
import {
  loadReorderPriority,
  DEFAULT_REORDER_PRIORITY_BY_AREA,
  type ReorderPriorityByArea,
} from "@/lib/reorderPriority";
import {
  applyReassign as applyReassignReal,
  evaluateReassign as evaluateReassignReal,
  type ApplyReassignInput,
  type ApplyReassignResult,
  type ReassignEvaluation,
} from "@/lib/reassignDemand";

export const STALE_BULK_MESSAGE = "A fila mudou desde a prévia. Recalcule antes de aplicar.";

export type BulkSourceScreen = "overview" | "feed";

/** Colunas mínimas lidas do banco para planejar. */
export const BULK_CARD_COLUMNS =
  "id, tenant_id, title, client_id, assigned_to, current_function_key, demand_type, demand_type_key, work_area, origin, due_date, due_time, delivery_date, delivery_time, publish_date, publish_time, is_daily_card, is_draft, archived_at, updated_at";

export interface BulkCardRow {
  id: string;
  tenant_id?: string | null;
  title?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  current_function_key?: string | null;
  demand_type?: string | null;
  demand_type_key?: string | null;
  work_area?: string | null;
  origin?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  publish_date?: string | null;
  publish_time?: string | null;
  is_daily_card?: boolean | null;
  is_draft?: boolean | null;
  archived_at?: string | null;
  updated_at?: string | null;
}

export interface BulkCardSignature {
  updated_at: string | null;
  assigned_to: string | null;
  current_function_key: string | null;
  due_date: string | null;
  due_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
}

export interface BulkAssignment {
  cardId: string;
  title: string;
  clientName: string | null;
  fromUserId: string | null;
  fromUserName: string | null;
  originalFunctionKey: string | null;
  resolvedFunctionKey: string | null;
  direction: "same" | "forward" | "backward";
  /** Já era do destinatário: só o horário pode mudar. */
  sameAssignee: boolean;
  durationMin: number | null;
  publishDate: string | null;
  publishTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  /** Horário atual (antes da alocação) — para exibir "de → para". */
  currentDueDate: string | null;
  currentDueTime: string | null;
  /** Card fixo no motor (captar / card diário): horário preservado. */
  fixed: boolean;
  /** Etapa sem tempo operacional (aguardando cliente) ou dispatch ativo. */
  untimed: boolean;
  scheduleChanged: boolean;
  warnings: string[];
}

export interface BulkQueueReschedule {
  cardId: string;
  title: string;
  clientName: string | null;
  functionKey: string | null;
  fromDueDate: string | null;
  fromDueTime: string | null;
  fromDeliveryDate: string | null;
  fromDeliveryTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  durationMin: number | null;
  warnings: string[];
}

export interface BulkRejected {
  cardId: string;
  title: string;
  reason: string;
}

export interface BulkAllocationPlan {
  bulkAllocationId: string;
  tenantId: string;
  targetUserId: string;
  targetUserName: string;
  sourceScreen: BulkSourceScreen;
  computedAt: string;
  assignments: BulkAssignment[];
  queueReschedules: BulkQueueReschedule[];
  rejected: BulkRejected[];
  signatures: Record<string, BulkCardSignature>;
  /** Snapshot interno usado pelo apply (não renderizar). */
  cards: Record<string, BulkCardRow>;
  proposals: Record<string, ReorderProposal>;
  summary: {
    selected: number;
    eligible: number;
    rejected: number;
    reassigned: number;
    rescheduledExisting: number;
  };
}

export interface BulkApplyResult {
  status: "applied" | "partial" | "stale" | "nothing" | "error";
  message: string;
  appliedIds: string[];
  failed: Array<{ cardId: string; reason: string }>;
}

// ------------------------------------------------------------------
// Puro
// ------------------------------------------------------------------

export function signatureOf(row: BulkCardRow): BulkCardSignature {
  return {
    updated_at: row.updated_at ?? null,
    assigned_to: row.assigned_to ?? null,
    current_function_key: row.current_function_key ?? null,
    due_date: row.due_date ?? null,
    due_time: row.due_time ?? null,
    delivery_date: row.delivery_date ?? null,
    delivery_time: row.delivery_time ?? null,
  };
}

export function signaturesMatch(a: BulkCardSignature, b: BulkCardSignature): boolean {
  return (
    a.updated_at === b.updated_at &&
    a.assigned_to === b.assigned_to &&
    a.current_function_key === b.current_function_key &&
    a.due_date === b.due_date &&
    a.due_time === b.due_time &&
    a.delivery_date === b.delivery_date &&
    a.delivery_time === b.delivery_time
  );
}

/** Motivo pelo qual um card não pode entrar na alocação em massa (ou null). */
export function ineligibleReason(row: BulkCardRow | undefined): string | null {
  if (!row) return "Card não encontrado";
  if (row.archived_at) return "Card arquivado";
  if (row.is_draft) return "Rascunho (ainda não é uma demanda)";
  return null;
}

export function toReorderInput(row: BulkCardRow, overrides?: Partial<ReorderCardInput>): ReorderCardInput {
  return {
    id: row.id,
    title: row.title || "Sem título",
    demand_type: row.demand_type ?? null,
    demand_type_key: row.demand_type_key ?? null,
    is_daily_card: !!row.is_daily_card,
    publish_date: row.publish_date ?? null,
    publish_time: row.publish_time ?? null,
    due_date: row.due_date ?? null,
    due_time: row.due_time ?? null,
    delivery_date: row.delivery_date ?? null,
    delivery_time: row.delivery_time ?? null,
    current_function_key: row.current_function_key ?? null,
    work_area: (row.work_area === "sistemas" ? "sistemas" : "midia") as any,
    updated_at: row.updated_at ?? null,
    ...overrides,
  };
}

export function buildAreaScheduleMap(
  rows: Array<{ work_area?: string | null; weekday: number | string; start_time: string; end_time: string }>,
): AreaScheduleMap | undefined {
  if (!rows || rows.length === 0) return undefined;
  const toMinutes = (t: string | null | undefined): number => {
    if (!t) return 0;
    const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  const map: AreaScheduleMap = { midia: {}, sistemas: {} };
  for (const row of rows) {
    const area = row.work_area === "sistemas" ? "sistemas" : "midia";
    const w = Number(row.weekday);
    const s = toMinutes(row.start_time);
    const e = toMinutes(row.end_time);
    if (!Number.isFinite(w) || e <= s) continue;
    if (!map[area][w]) map[area][w] = [];
    map[area][w].push({ s, e });
  }
  for (const area of ["midia", "sistemas"] as const) {
    for (const k of Object.keys(map[area])) map[area][+k].sort((a, b) => a.s - b.s);
  }
  if (Object.keys(map.midia).length === 0 && Object.keys(map.sistemas).length === 0) return undefined;
  return map;
}

const scheduleDiffers = (row: BulkCardRow, p: ReorderProposal): boolean =>
  (row.due_date ?? null) !== p.startISO ||
  (row.due_time || "").slice(0, 5) !== p.startTime ||
  (row.delivery_date ?? null) !== p.endISO ||
  (row.delivery_time || "").slice(0, 5) !== p.endTime;

// ------------------------------------------------------------------
// Dependências (injetáveis nos testes)
// ------------------------------------------------------------------

export interface BulkAllocationDeps {
  loadCards(tenantId: string, ids: string[]): Promise<BulkCardRow[]>;
  loadUserQueue(tenantId: string, userId: string, excludeIds: string[]): Promise<BulkCardRow[]>;
  loadStageStarts(ids: string[], stageByCard: Record<string, string>): Promise<Record<string, string>>;
  loadWorkHours(tenantId: string): Promise<WorkHoursConfig>;
  loadAreaSchedule(tenantId: string, userId: string): Promise<AreaScheduleMap | undefined>;
  loadDurations(tenantId: string): Promise<StageDurations>;
  loadPriority(tenantId: string): Promise<ReorderPriorityByArea>;
  loadActiveDispatchIds(tenantId: string, ids: string[]): Promise<Set<string>>;
  loadUserName(userId: string): Promise<string>;
  loadUserNames(userIds: string[]): Promise<Record<string, string>>;
  evaluate(params: {
    tenantId: string;
    card: BulkCardRow;
    newAssignedTo: string;
    collaboratorName?: string;
  }): Promise<ReassignEvaluation>;
  applyReassign(input: ApplyReassignInput): Promise<ApplyReassignResult>;
  updateSchedule(
    cardId: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt: string | null,
  ): Promise<"ok" | "conflict" | "error">;
  loadSignatures(tenantId: string, ids: string[]): Promise<Record<string, BulkCardSignature>>;
  now(): Date;
  uuid(): string;
}

const nameOfClient = (row: any): string | null => {
  const c = row?.tenant_companies;
  if (!c) return null;
  if (Array.isArray(c)) return c[0]?.name ?? null;
  return c.name ?? null;
};

export const defaultBulkDeps: BulkAllocationDeps = {
  async loadCards(tenantId, ids) {
    if (ids.length === 0) return [];
    const { data, error } = await (supabase.from("demands") as any)
      .select(`${BULK_CARD_COLUMNS}, tenant_companies(name)`)
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) throw error;
    return ((data || []) as any[]).map((r) => ({ ...r, client_name: nameOfClient(r) })) as BulkCardRow[];
  },

  async loadUserQueue(tenantId, userId, excludeIds) {
    const { data, error } = await (supabase.from("demands") as any)
      .select(`${BULK_CARD_COLUMNS}, tenant_companies(name)`)
      .eq("tenant_id", tenantId)
      .eq("assigned_to", userId)
      .is("archived_at", null)
      .eq("is_draft", false);
    if (error) throw error;
    const skip = new Set(excludeIds);
    return ((data || []) as any[])
      .filter((r) => !skip.has(r.id))
      .map((r) => ({ ...r, client_name: nameOfClient(r) })) as BulkCardRow[];
  },

  async loadStageStarts(ids, stageByCard) {
    if (ids.length === 0) return {};
    const { data } = await supabase
      .from("demand_flow_history")
      .select("demand_id, to_function_key, created_at")
      .in("demand_id", ids)
      .order("created_at", { ascending: true });
    const out: Record<string, string> = {};
    for (const row of (data || []) as any[]) {
      const stage = (stageByCard[row.demand_id] || "").trim();
      if (!stage || (row.to_function_key || "").trim() !== stage) continue;
      out[row.demand_id] = row.created_at;
    }
    return out;
  },

  async loadWorkHours(tenantId) {
    const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
    const wh = (((data as any)?.settings || {}).work_hours || {}) as any;
    return {
      start: wh.start || DEFAULT_WORK_HOURS.start,
      end: wh.end || DEFAULT_WORK_HOURS.end,
      lunchStart: wh.lunch_start || wh.lunchStart || DEFAULT_WORK_HOURS.lunchStart,
      lunchEnd: wh.lunch_end || wh.lunchEnd || DEFAULT_WORK_HOURS.lunchEnd,
      tz: wh.tz || DEFAULT_WORK_HOURS.tz,
    };
  },

  async loadAreaSchedule(tenantId, userId) {
    const { data } = await (supabase.from("user_area_schedules") as any)
      .select("work_area, weekday, start_time, end_time")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);
    return buildAreaScheduleMap((data as any[]) || []);
  },

  loadDurations(tenantId) {
    return getCachedDurationsByArea(tenantId);
  },

  loadPriority(tenantId) {
    return loadReorderPriority(tenantId).catch(() => ({ ...DEFAULT_REORDER_PRIORITY_BY_AREA }));
  },

  async loadActiveDispatchIds(tenantId, ids) {
    if (ids.length === 0) return new Set<string>();
    const { data } = await (supabase.from("scheduled_publication_dispatches") as any)
      .select("card_id, status")
      .eq("tenant_id", tenantId)
      .in("card_id", ids)
      .in("status", ["pending", "scheduled", "processing", "dispatched"]);
    return new Set(((data || []) as any[]).map((r) => r.card_id));
  },

  async loadUserName(userId) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    return ((data as any)?.full_name as string) || "Colaborador";
  },

  async loadUserNames(userIds) {
    const ids = userIds.filter(Boolean);
    if (ids.length === 0) return {};
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const out: Record<string, string> = {};
    for (const row of (data || []) as any[]) out[row.id] = row.full_name || "Colaborador";
    return out;
  },

  evaluate({ tenantId, card, newAssignedTo, collaboratorName }) {
    return evaluateReassignReal({
      tenantId,
      card: card as any,
      newAssignedTo,
      collaboratorName,
      skipSuggestion: true,
    });
  },

  applyReassign: applyReassignReal,

  async updateSchedule(cardId, payload, expectedUpdatedAt) {
    let q = (supabase.from("demands") as any)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", cardId);
    if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
    const { data, error } = await q.select("id");
    if (error) {
      console.error("[bulkAllocation] schedule update error", cardId, error);
      return "error";
    }
    if (!data || data.length === 0) return "conflict";
    return "ok";
  },

  async loadSignatures(tenantId, ids) {
    if (ids.length === 0) return {};
    const { data, error } = await (supabase.from("demands") as any)
      .select(
        "id, updated_at, assigned_to, current_function_key, due_date, due_time, delivery_date, delivery_time, archived_at",
      )
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) throw error;
    const out: Record<string, BulkCardSignature> = {};
    for (const row of (data || []) as any[]) out[row.id] = signatureOf(row as BulkCardRow);
    return out;
  },

  now: () => new Date(),
  uuid: () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bulk-${Date.now()}-${Math.random().toString(16).slice(2)}`,
};

// ------------------------------------------------------------------
// Planejamento
// ------------------------------------------------------------------

export interface PlanBulkAllocationParams {
  tenantId: string;
  cardIds: string[];
  targetUserId: string;
  sourceScreen: BulkSourceScreen;
  /** Dispatches ativos já conhecidos pela tela (evita nova consulta). */
  activeDispatchIds?: Set<string> | string[];
}

export async function planBulkAllocation(
  params: PlanBulkAllocationParams,
  depsOverride?: Partial<BulkAllocationDeps>,
): Promise<BulkAllocationPlan> {
  const deps: BulkAllocationDeps = { ...defaultBulkDeps, ...(depsOverride || {}) };
  const { tenantId, targetUserId, sourceScreen } = params;
  const cardIds = Array.from(new Set(params.cardIds.filter(Boolean)));

  const targetUserName = await deps.loadUserName(targetUserId);

  // 1. Verdade do banco — nunca o snapshot da tela.
  const rows = await deps.loadCards(tenantId, cardIds);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const rejected: BulkRejected[] = [];
  const eligible: Array<{ row: BulkCardRow; resolvedFunctionKey: string | null; direction: "same" | "forward" | "backward"; sameAssignee: boolean; warnings: string[] }> = [];

  for (const id of cardIds) {
    const row = byId.get(id);
    const reason = ineligibleReason(row);
    if (!row || reason) {
      rejected.push({ cardId: id, title: row?.title || "Card", reason: reason || "Card inválido" });
      continue;
    }

    if ((row.assigned_to ?? null) === targetUserId) {
      eligible.push({
        row,
        resolvedFunctionKey: row.current_function_key ?? null,
        direction: "same",
        sameAssignee: true,
        warnings: [],
      });
      continue;
    }

    let evaluation: ReassignEvaluation;
    try {
      evaluation = await deps.evaluate({ tenantId, card: row, newAssignedTo: targetUserId, collaboratorName: targetUserName });
    } catch (err) {
      console.error("[bulkAllocation] evaluate error", id, err);
      rejected.push({ cardId: id, title: row.title || "Card", reason: "Não foi possível resolver a etapa deste card" });
      continue;
    }

    // Bloqueio por FUNÇÃO é definitivo: nunca persistir combinação inválida.
    if (evaluation.blockedBy === "function" || !evaluation.nextFunctionKey) {
      rejected.push({
        cardId: id,
        title: row.title || "Card",
        reason: evaluation.message || `${targetUserName} não tem etapa compatível com este card`,
      });
      continue;
    }

    // Bloqueio por AGENDA não rejeita: a alocação existe justamente para
    // reorganizar a fila e encontrar um horário livre.
    const warnings = [...(evaluation.softMessages || [])];
    if (evaluation.remapMessage) warnings.push(evaluation.remapMessage);

    eligible.push({
      row,
      resolvedFunctionKey: evaluation.nextFunctionKey,
      direction: evaluation.direction || "same",
      sameAssignee: false,
      warnings,
    });
  }

  const eligibleIds = eligible.map((e) => e.row.id);

  // 2. Fila operacional atual do destinatário (fora dos selecionados).
  const queueRows = eligibleIds.length > 0 || cardIds.length > 0
    ? await deps.loadUserQueue(tenantId, targetUserId, cardIds)
    : [];

  // 3. Insumos reais do tenant.
  const allIds = [...eligibleIds, ...queueRows.map((r) => r.id)];
  const stageByCard: Record<string, string> = {};
  for (const e of eligible) stageByCard[e.row.id] = (e.resolvedFunctionKey || "").trim();
  for (const r of queueRows) stageByCard[r.id] = (r.current_function_key || "").trim();

  const [workHours, areaSchedule, durations, priority, stageStarts, dispatchIds, fromNames] = await Promise.all([
    deps.loadWorkHours(tenantId),
    deps.loadAreaSchedule(tenantId, targetUserId),
    deps.loadDurations(tenantId),
    deps.loadPriority(tenantId),
    deps.loadStageStarts(allIds, stageByCard),
    params.activeDispatchIds
      ? Promise.resolve(new Set(Array.from(params.activeDispatchIds as any)) as Set<string>)
      : deps.loadActiveDispatchIds(tenantId, allIds),
    deps.loadUserNames(
      Array.from(new Set(eligible.map((e) => e.row.assigned_to).filter(Boolean) as string[])),
    ),
  ]);

  // 4. Fila combinada: selecionados já simulados no destinatário + fila atual.
  const combined: ReorderCardInput[] = [
    ...eligible.map((e) =>
      toReorderInput(e.row, {
        current_function_key: e.resolvedFunctionKey,
        stage_started_at: stageStarts[e.row.id] ?? null,
      }),
    ),
    ...queueRows.map((r) => toReorderInput(r, { stage_started_at: stageStarts[r.id] ?? null })),
  ];

  const proposals = await computeReorder(combined, {
    startFrom: deps.now(),
    workHours,
    durations,
    areaSchedule,
    scheduledPublishIds: dispatchIds,
    priority,
    // Nesta funcionalidade a prioridade por publicação é SEMPRE ativa.
    prioritizePublishDate: true,
  });
  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  // 5. Prévia.
  const assignments: BulkAssignment[] = eligible.map((e) => {
    const p = proposalById.get(e.row.id);
    const warnings = [...e.warnings];
    if (p?.warning) warnings.push(p.warning);
    return {
      cardId: e.row.id,
      title: e.row.title || "Sem título",
      clientName: e.row.client_name ?? null,
      fromUserId: e.row.assigned_to ?? null,
      fromUserName: e.row.assigned_to ? fromNames[e.row.assigned_to] || "Colaborador" : null,
      originalFunctionKey: e.row.current_function_key ?? null,
      resolvedFunctionKey: e.resolvedFunctionKey,
      direction: e.direction,
      sameAssignee: e.sameAssignee,
      durationMin: p?.durationMin ?? null,
      publishDate: e.row.publish_date ?? null,
      publishTime: e.row.publish_time ? e.row.publish_time.slice(0, 5) : null,
      dueDate: p ? p.startISO : e.row.due_date ?? null,
      dueTime: p ? p.startTime : (e.row.due_time || "").slice(0, 5) || null,
      deliveryDate: p ? p.endISO : e.row.delivery_date ?? null,
      deliveryTime: p ? p.endTime : (e.row.delivery_time || "").slice(0, 5) || null,
      currentDueDate: e.row.due_date ?? null,
      currentDueTime: e.row.due_time ? e.row.due_time.slice(0, 5) : null,
      fixed: !!p?.skipped,
      untimed: !p,
      scheduleChanged: !!p && !p.skipped && scheduleDiffers(e.row, p),
      warnings,
    };
  });

  const queueReschedules: BulkQueueReschedule[] = [];
  for (const r of queueRows) {
    const p = proposalById.get(r.id);
    if (!p || p.skipped) continue;
    if (!scheduleDiffers(r, p)) continue;
    queueReschedules.push({
      cardId: r.id,
      title: r.title || "Sem título",
      clientName: r.client_name ?? null,
      functionKey: r.current_function_key ?? null,
      fromDueDate: r.due_date ?? null,
      fromDueTime: r.due_time ? r.due_time.slice(0, 5) : null,
      fromDeliveryDate: r.delivery_date ?? null,
      fromDeliveryTime: r.delivery_time ? r.delivery_time.slice(0, 5) : null,
      dueDate: p.startISO,
      dueTime: p.startTime,
      deliveryDate: p.endISO,
      deliveryTime: p.endTime,
      durationMin: p.durationMin,
      warnings: p.warning ? [p.warning] : [],
    });
  }

  const signatures: Record<string, BulkCardSignature> = {};
  const cards: Record<string, BulkCardRow> = {};
  for (const e of eligible) {
    signatures[e.row.id] = signatureOf(e.row);
    cards[e.row.id] = e.row;
  }
  for (const q of queueReschedules) {
    const row = queueRows.find((r) => r.id === q.cardId)!;
    signatures[row.id] = signatureOf(row);
    cards[row.id] = row;
  }

  const proposalsMap: Record<string, ReorderProposal> = {};
  for (const p of proposals) {
    if (signatures[p.id]) proposalsMap[p.id] = p;
  }

  return {
    bulkAllocationId: deps.uuid(),
    tenantId,
    targetUserId,
    targetUserName,
    sourceScreen,
    computedAt: deps.now().toISOString(),
    assignments,
    queueReschedules,
    rejected,
    signatures,
    cards,
    proposals: proposalsMap,
    summary: {
      selected: cardIds.length,
      eligible: assignments.length,
      rejected: rejected.length,
      reassigned: assignments.filter((a) => !a.sameAssignee).length,
      rescheduledExisting: queueReschedules.length,
    },
  };
}

// ------------------------------------------------------------------
// Aplicação
// ------------------------------------------------------------------

export async function applyBulkAllocation(
  plan: BulkAllocationPlan,
  depsOverride?: Partial<BulkAllocationDeps>,
): Promise<BulkApplyResult> {
  const deps: BulkAllocationDeps = { ...defaultBulkDeps, ...(depsOverride || {}) };
  const appliedIds: string[] = [];
  const failed: Array<{ cardId: string; reason: string }> = [];

  const ids = Object.keys(plan.signatures);
  if (ids.length === 0) {
    return { status: "nothing", message: "Nada para alocar.", appliedIds, failed };
  }

  // PREFLIGHT — antes de QUALQUER write.
  let live: Record<string, BulkCardSignature>;
  try {
    live = await deps.loadSignatures(plan.tenantId, ids);
  } catch (err) {
    console.error("[bulkAllocation] preflight error", err);
    return { status: "error", message: "Não foi possível verificar o estado atual da fila.", appliedIds, failed };
  }
  for (const id of ids) {
    const current = live[id];
    if (!current || !signaturesMatch(plan.signatures[id], current)) {
      return { status: "stale", message: STALE_BULK_MESSAGE, appliedIds, failed };
    }
  }

  const scheduleOf = (cardId: string) => {
    const p = plan.proposals[cardId];
    if (!p || p.skipped) return null;
    return buildReorderScheduleUpdate(p);
  };

  // 1. Cards que já eram do destinatário: só horários (o trigger de conflito
  //    valida na troca de responsável, então aqui não há reprovação de agenda).
  for (const q of plan.queueReschedules) {
    const payload = scheduleOf(q.cardId);
    if (!payload) continue;
    const res = await deps.updateSchedule(q.cardId, payload, plan.signatures[q.cardId]?.updated_at ?? null);
    if (res === "ok") {
      appliedIds.push(q.cardId);
      continue;
    }
    failed.push({
      cardId: q.cardId,
      reason: res === "conflict" ? "A fila mudou durante a aplicação" : "Falha ao reagendar",
    });
    return partial(appliedIds, failed);
  }

  // 2. Selecionados, em ordem cronológica da proposta.
  const ordered = [...plan.assignments].sort((a, b) => {
    const ka = `${a.dueDate || "9999-12-31"}T${a.dueTime || "23:59"}`;
    const kb = `${b.dueDate || "9999-12-31"}T${b.dueTime || "23:59"}`;
    return ka.localeCompare(kb);
  });

  for (const a of ordered) {
    const row = plan.cards[a.cardId];
    if (!row) continue;
    const payload = scheduleOf(a.cardId);

    if (a.sameAssignee) {
      // Já era do destinatário: nunca mexer em responsável/etapa.
      if (!payload) continue;
      const res = await deps.updateSchedule(a.cardId, payload, plan.signatures[a.cardId]?.updated_at ?? null);
      if (res === "ok") {
        appliedIds.push(a.cardId);
        continue;
      }
      failed.push({
        cardId: a.cardId,
        reason: res === "conflict" ? "A fila mudou durante a aplicação" : "Falha ao reagendar",
      });
      return partial(appliedIds, failed);
    }

    const reschedule =
      payload && payload.due_date && payload.delivery_date
        ? {
            due_date: String(payload.due_date),
            due_time: String(payload.due_time),
            delivery_date: String(payload.delivery_date),
            delivery_time: String(payload.delivery_time),
          }
        : a.fixed || a.untimed
          ? null
          : a.dueDate && a.deliveryDate
            ? {
                due_date: a.dueDate,
                due_time: a.dueTime || "09:00",
                delivery_date: a.deliveryDate,
                delivery_time: a.deliveryTime || "18:00",
              }
            : null;

    const result = await deps.applyReassign({
      tenantId: plan.tenantId,
      card: row as any,
      newAssignedTo: plan.targetUserId,
      nextFunctionKey: a.resolvedFunctionKey,
      reschedule,
      direction: a.direction,
      historySource: "bulk_allocation",
      metadata: {
        bulk_allocation_id: plan.bulkAllocationId,
        source_screen: plan.sourceScreen,
        selected_count: plan.summary.selected,
        original_function_key: a.originalFunctionKey,
        resolved_function_key: a.resolvedFunctionKey,
        schedule_before: {
          due_date: row.due_date ?? null,
          due_time: row.due_time ?? null,
          delivery_date: row.delivery_date ?? null,
          delivery_time: row.delivery_time ?? null,
        },
        schedule_after: reschedule,
      },
    });

    if (result.status === "ok") {
      appliedIds.push(a.cardId);
      continue;
    }

    failed.push({
      cardId: a.cardId,
      reason:
        result.status === "stale"
          ? "A demanda mudou durante a aplicação"
          : result.status === "conflict"
            ? result.message
            : "Falha ao alocar",
    });
    return partial(appliedIds, failed);
  }

  if (appliedIds.length === 0) {
    return { status: "nothing", message: "Nada mudou — a fila já estava organizada.", appliedIds, failed };
  }
  return {
    status: "applied",
    message: `${appliedIds.length} card${appliedIds.length === 1 ? "" : "s"} alocado${appliedIds.length === 1 ? "" : "s"} para o colaborador.`,
    appliedIds,
    failed,
  };
}

function partial(appliedIds: string[], failed: Array<{ cardId: string; reason: string }>): BulkApplyResult {
  return {
    status: "partial",
    message: `${appliedIds.length} aplicados, ${failed.length} não aplicados. Recalcule para continuar.`,
    appliedIds,
    failed,
  };
}

// ------------------------------------------------------------------
// Elegibilidade grosseira do seletor de colaboradores
// ------------------------------------------------------------------

/**
 * Colaboradores que possuem PELO MENOS uma função habilitada nas áreas dos
 * cards selecionados. Filtro grosseiro (uma consulta) só para desabilitar quem
 * não pode receber nada — a validação real é por card, no planner.
 */
export async function loadCollaboratorAreaFunctions(
  tenantId: string,
): Promise<Record<string, Set<string>>> {
  const { data } = await (supabase.from("collaborator_function_assignments") as any)
    .select("user_id, work_area, allowed")
    .eq("tenant_id", tenantId)
    .eq("allowed", true);
  const out: Record<string, Set<string>> = {};
  for (const row of ((data || []) as any[])) {
    const area = row.work_area === "sistemas" ? "sistemas" : "midia";
    if (!out[row.user_id]) out[row.user_id] = new Set<string>();
    out[row.user_id].add(area);
  }
  return out;
}

export function collaboratorMayReceive(
  areasByUser: Record<string, Set<string>>,
  userId: string,
  selectedAreas: Set<string>,
): boolean {
  const areas = areasByUser[userId];
  // Sem configuração carregada não bloqueamos: o planner decide por card.
  if (!areas || areas.size === 0) return true;
  if (selectedAreas.size === 0) return true;
  for (const a of selectedAreas) if (areas.has(a)) return true;
  return false;
}

// ------------------------------------------------------------------
// Guardas puras de UI (testáveis sem DOM)
// ------------------------------------------------------------------

/** Somente gestor operacional / super admin acessam a alocação em massa. */
export function canBulkAllocate(role: { isSuperAdmin?: boolean; isAgencyManager?: boolean }): boolean {
  return !!(role?.isSuperAdmin || role?.isAgencyManager);
}

/** Drag-and-drop fica desabilitado no modo seleção e no registro de entregas. */
export function isDragEnabled(state: { selectionMode: boolean; historyMode: boolean }): boolean {
  return !state.selectionMode && !state.historyMode;
}
