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
  estimateDurationMinutesWithOverrides,
  type AreaScheduleMap,
  type ReorderCardInput,
  type ReorderManualOverride,
  type ReorderProposal,
  type WorkHoursConfig,
  zonedWallclockKey,
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
import {
  loadStageOptionsForAssignee,
  stageChoiceError,
  type LoadStageOptionsResult,
  type StageOption,
} from "@/lib/stageOptions";
import {
  loadStageDurationOverrides,
  normalizeDurationInput,
  overrideKey,
  saveStageDurationOverrides,
} from "@/lib/durationOverrides";


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
  /** De onde veio a etapa de destino exibida na prévia. */
  stageSource: "current" | "suggested" | "manual";
  /** Etapas do fluxo deste card, com válidas/inválidas e motivo (seletor da UI). */
  stageOptions: StageOption[];
  /** Duração aplicada na prévia (override manual quando existir). */
  durationMin: number | null;
  /** Duração padrão da etapa/tipo (para o gestor comparar antes de editar). */
  defaultDurationMin: number | null;
  durationSource: "default" | "manual";
  publishDate: string | null;
  publishTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  /** Horário atual (antes da alocação) — para exibir "de → para". */
  currentDueDate: string | null;
  currentDueTime: string | null;
  /** Card com horário REALMENTE fixo (captar / card diário): preservado. */
  fixed: boolean;
  /** Etapa sem agenda operacional (aguardando cliente) ou dispatch ativo. */
  untimed: boolean;
  /** Motivo de o card não receber horário novo. */
  untimedReason: "awaiting_client" | "active_dispatch" | null;
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
  /**
   * Próximo horário operacional REAL do colaborador, derivado da mesma agenda
   * consolidada da prévia (primeiro slot efetivamente usado pela fila).
   */
  nextAvailable: { date: string; time: string; cardId: string; area: string | null } | null;
  signatures: Record<string, BulkCardSignature>;
  /** Snapshot interno usado pelo apply (não renderizar). */
  cards: Record<string, BulkCardRow>;
  proposals: Record<string, ReorderProposal>;
  /** Etapas escolhidas manualmente pelo gestor (eco para recálculo). */
  stageOverrides: Record<string, string>;
  /** Durações escolhidas manualmente (minutos), por card. */
  durationOverrides: Record<string, number>;
  summary: {
    selected: number;
    eligible: number;
    rejected: number;
    reassigned: number;
    rescheduledExisting: number;
    /** Soma do tempo operacional dos cards selecionados que consomem agenda. */
    totalOperationalMin: number;
    stageChanged: number;
    durationCustomized: number;
  };
}

export interface BulkExternalBlock {
  cardId: string;
  title: string;
  start: Date;
  end: Date;
}

/** Item enviado ao RPC atômico. */
export interface BulkAtomicItem {
  card_id: string;
  expected_updated_at: string | null;
  expected_assigned_to?: string | null;
  expected_function_key?: string | null;
  next_function_key?: string | null;
  same_assignee?: boolean;
  schedule: {
    due_date: string;
    due_time: string;
    delivery_date: string;
    delivery_time: string;
  } | null;
}

export interface BulkAtomicPayload {
  tenant_id: string;
  target_user_id: string;
  bulk_allocation_id: string;
  source_screen: BulkSourceScreen;
  items: BulkAtomicItem[];
  queue: BulkAtomicItem[];
}

export interface BulkAtomicResponse {
  status: "applied" | "stale" | "blocked" | "nothing" | "error";
  message?: string;
  appliedIds?: string[];
  cardId?: string;
}

export interface BulkApplyResult {
  /**
   * `partial` NUNCA ocorre por falha técnica: a aplicação é atômica (uma única
   * transação no banco). O status existe apenas para compatibilidade histórica.
   */
  status: "applied" | "partial" | "stale" | "blocked" | "nothing" | "error";
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
  /** Etapas possíveis do card para o destinatário (com motivo de bloqueio). */
  loadStageOptions(params: {
    tenantId: string;
    card: BulkCardRow;
    userId: string;
  }): Promise<LoadStageOptionsResult>;
  /** Durações personalizadas já gravadas para estes cards. */
  loadDurationOverrides(tenantId: string, ids: string[]): Promise<Record<string, number>>;
  /** Persiste as durações personalizadas escolhidas na alocação. */
  saveDurationOverrides(
    tenantId: string,
    rows: Array<{ demandId: string; functionKey: string; durationMin: number }>,
  ): Promise<void>;
  applyReassign(input: ApplyReassignInput): Promise<ApplyReassignResult>;
  updateSchedule(
    cardId: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt: string | null,
  ): Promise<"ok" | "conflict" | "error">;
  loadSignatures(tenantId: string, ids: string[]): Promise<Record<string, BulkCardSignature>>;
  /**
   * Compromissos do destinatário que esta fila NÃO pode reagendar (ele é apenas
   * `additional_assignee`). Só bloqueiam horários.
   */
  loadExternalBlocks(
    tenantId: string,
    userId: string,
    excludeIds: string[],
  ): Promise<BulkExternalBlock[]>;
  /** Aplicação ATÔMICA do lote (uma transação: tudo ou nada). */
  applyAtomic(payload: BulkAtomicPayload): Promise<BulkAtomicResponse>;
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

  loadStageOptions({ tenantId, card, userId }) {
    return loadStageOptionsForAssignee({
      tenantId,
      card: {
        id: card.id,
        demand_type_key: card.demand_type_key ?? null,
        work_area: card.work_area ?? null,
        origin: card.origin ?? null,
        current_function_key: card.current_function_key ?? null,
      },
      userId,
      administrative: true,
    });
  },

  loadDurationOverrides(tenantId, ids) {
    return loadStageDurationOverrides(tenantId, ids);
  },

  saveDurationOverrides(tenantId, rows) {
    return saveStageDurationOverrides(tenantId, rows);
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

  async loadExternalBlocks(tenantId, userId, excludeIds) {
    const { data, error } = await (supabase.from("demands") as any)
      .select("id, title, due_date, due_time, delivery_date, delivery_time, additional_assignees")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .eq("is_draft", false)
      .contains("additional_assignees", [userId]);
    if (error) {
      console.warn("[bulkAllocation] loadExternalBlocks error", error);
      return [];
    }
    const skip = new Set(excludeIds);
    const out: BulkExternalBlock[] = [];
    for (const row of ((data || []) as any[])) {
      if (skip.has(row.id)) continue;
      if (!row.due_date || !row.due_time || !row.delivery_date || !row.delivery_time) continue;
      const start = new Date(`${row.due_date}T${String(row.due_time).slice(0, 5)}:00`);
      const end = new Date(`${row.delivery_date}T${String(row.delivery_time).slice(0, 5)}:00`);
      if (!(end > start)) continue;
      out.push({ cardId: row.id, title: row.title || "Card", start, end });
    }
    return out;
  },

  async applyAtomic(payload) {
    const { data, error } = await (supabase.rpc as any)("apply_bulk_allocation_atomic_v1", {
      p_payload: payload as any,
    });
    if (error) {
      console.error("[bulkAllocation] atomic rpc error", error);
      return { status: "error", message: error.message || "Falha ao aplicar a alocação" };
    }
    const res = (data || {}) as any;
    return {
      status: (res.status as BulkAtomicResponse["status"]) || "error",
      message: res.message,
      appliedIds: Array.isArray(res.applied_ids) ? (res.applied_ids as string[]) : [],
      cardId: res.card_id,
    };
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
  /**
   * Etapa escolhida EXPLICITAMENTE pelo gestor por card (`cardId -> functionKey`).
   * Só é aceita quando é válida para o destinatário — caso contrário o card é
   * rejeitado com o motivo, nunca gravado com etapa inválida.
   */
  stageOverrides?: Record<string, string>;
  /** Tempo operacional (minutos) escolhido pelo gestor por card. */
  durationOverrides?: Record<string, number>;
}

interface EligibleEntry {
  row: BulkCardRow;
  resolvedFunctionKey: string | null;
  direction: "same" | "forward" | "backward";
  sameAssignee: boolean;
  stageSource: "current" | "suggested" | "manual";
  stageOptions: StageOption[];
  warnings: string[];
}

/** Sentido do movimento de etapa dentro da sequência do card. */
function directionBetween(
  options: StageOption[],
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
): "same" | "forward" | "backward" {
  if (!fromKey || !toKey || fromKey === toKey) return "same";
  const from = options.findIndex((o) => o.functionKey === fromKey);
  const to = options.findIndex((o) => o.functionKey === toKey);
  if (from < 0 || to < 0) return "forward";
  return to < from ? "backward" : "forward";
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
  const eligible: EligibleEntry[] = [];
  const stageOverridesIn = params.stageOverrides || {};

  for (const id of cardIds) {
    const row = byId.get(id);
    const reason = ineligibleReason(row);
    if (!row || reason) {
      rejected.push({ cardId: id, title: row?.title || "Card", reason: reason || "Card inválido" });
      continue;
    }

    const sameAssignee = (row.assigned_to ?? null) === targetUserId;
    const manualStage = (stageOverridesIn[id] || "").trim() || null;

    // Etapas possíveis do card para o destinatário: alimenta o seletor da UI e
    // valida a escolha manual do gestor.
    let stageOptions: StageOption[] = [];
    try {
      const loaded = await deps.loadStageOptions({ tenantId, card: row, userId: targetUserId });
      stageOptions = loaded.options;
    } catch (err) {
      console.warn("[bulkAllocation] loadStageOptions error", id, err);
    }

    // 1) Escolha MANUAL do gestor tem precedência absoluta — desde que válida.
    if (manualStage) {
      const err = stageOptions.length > 0 ? stageChoiceError(stageOptions, manualStage) : null;
      if (err) {
        rejected.push({ cardId: id, title: row.title || "Card", reason: `${targetUserName}: ${err}` });
        continue;
      }
      eligible.push({
        row,
        resolvedFunctionKey: manualStage,
        direction: directionBetween(stageOptions, row.current_function_key, manualStage),
        sameAssignee,
        stageSource: "manual",
        stageOptions,
        warnings: [],
      });
      continue;
    }

    // 2) Já era do destinatário e o gestor não mudou a etapa: nada de etapa muda.
    if (sameAssignee) {
      eligible.push({
        row,
        resolvedFunctionKey: row.current_function_key ?? null,
        direction: "same",
        sameAssignee: true,
        stageSource: "current",
        stageOptions,
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
      stageSource:
        (evaluation.nextFunctionKey ?? null) === (row.current_function_key ?? null) ? "current" : "suggested",
      stageOptions,
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

  const [
    workHours,
    areaSchedule,
    durations,
    priority,
    stageStarts,
    dispatchIds,
    fromNames,
    storedDurations,
    externalBlocks,
  ] =
    await Promise.all([
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
      deps.loadDurationOverrides(tenantId, allIds).catch(() => ({}) as Record<string, number>),
      deps
        .loadExternalBlocks(tenantId, targetUserId, allIds)
        .catch(() => [] as BulkExternalBlock[]),
    ]);

  // 3b. Duração efetiva por card: escolha desta sessão > override já gravado >
  //     padrão da etapa/tipo. Um único lugar decide, e é o mesmo valor usado
  //     pela reorganização, pela prévia e pelo total exibido.
  const durationOverridesIn = params.durationOverrides || {};
  const effectiveDuration: Record<string, number> = {};
  const durationIsManual: Record<string, boolean> = {};
  for (const [cardId, stage] of Object.entries(stageByCard)) {
    const fromSession = normalizeDurationInput(durationOverridesIn[cardId]);
    const stored = stage ? storedDurations[overrideKey(cardId, stage)] : undefined;
    const chosen = fromSession ?? normalizeDurationInput(stored);
    if (chosen) {
      effectiveDuration[cardId] = chosen;
      durationIsManual[cardId] = true;
    }
  }
  const manualOverrides: Record<string, ReorderManualOverride> = {};
  for (const [cardId, durationMin] of Object.entries(effectiveDuration)) {
    manualOverrides[cardId] = { durationMin };
  }

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

  // Cards que estão CHEGANDO de outro responsável nunca preservam o início
  // histórico do responsável anterior.
  const transferredIds = new Set(eligible.filter((e) => !e.sameAssignee).map((e) => e.row.id));

  const proposals = await computeReorder(combined, {
    startFrom: deps.now(),
    transferredIds,
    workHours,
    durations,
    areaSchedule,
    scheduledPublishIds: dispatchIds,
    externalBlocks: externalBlocks.map((b) => ({
      start: b.start,
      end: b.end,
      cardId: b.cardId,
      title: b.title,
    })),
    priority,
    manualOverrides,
    // Nesta funcionalidade a prioridade por publicação é SEMPRE ativa.
    prioritizePublishDate: true,
  });
  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  /** Duração padrão (sem override) da etapa resolvida — referência para a UI. */
  const defaultDurationOf = (row: BulkCardRow, stage: string | null): number | null => {
    try {
      return estimateDurationMinutesWithOverrides(
        toReorderInput(row, { current_function_key: stage }),
        durations,
      );
    } catch {
      return null;
    }
  };


  // 5. Prévia.
  const rawAssignments: BulkAssignment[] = eligible.map((e) => {
    const p = proposalById.get(e.row.id);
    const warnings = [...e.warnings];
    if (p?.warning) warnings.push(p.warning);
    // Sem agenda operacional: etapa aguardando cliente (skipKind=awaiting) ou
    // dispatch ativo (card não entra na fila). Nesses casos a prévia NÃO pode
    // apresentar a janela histórica como se fosse a proposta nova.
    const untimed = !p || p.skipKind === "awaiting";
    const fixed = !!p && (p.skipKind === "captar" || p.skipKind === "daily");
    const untimedReason: BulkAssignment["untimedReason"] = untimed
      ? p?.skipKind === "awaiting"
        ? "awaiting_client"
        : "active_dispatch"
      : null;
    const hasNewSchedule = !!p && !p.skipped;
    const manualDuration = effectiveDuration[e.row.id] ?? null;
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
      stageSource: e.stageSource,
      stageOptions: e.stageOptions,
      durationMin: hasNewSchedule ? p!.durationMin : manualDuration,
      defaultDurationMin: defaultDurationOf(e.row, e.resolvedFunctionKey),
      durationSource: durationIsManual[e.row.id] ? "manual" : "default",
      publishDate: e.row.publish_date ?? null,
      publishTime: e.row.publish_time ? e.row.publish_time.slice(0, 5) : null,
      dueDate: hasNewSchedule ? p!.startISO : fixed ? e.row.due_date ?? null : null,
      dueTime: hasNewSchedule ? p!.startTime : fixed ? (e.row.due_time || "").slice(0, 5) || null : null,
      deliveryDate: hasNewSchedule ? p!.endISO : fixed ? e.row.delivery_date ?? null : null,
      deliveryTime: hasNewSchedule ? p!.endTime : fixed ? (e.row.delivery_time || "").slice(0, 5) || null : null,
      currentDueDate: e.row.due_date ?? null,
      currentDueTime: e.row.due_time ? e.row.due_time.slice(0, 5) : null,
      fixed,
      untimed,
      untimedReason,
      scheduleChanged: hasNewSchedule && scheduleDiffers(e.row, p!),
      warnings,
    };
  });

  // 5b. Cards de horário FIXO (captar / diário) não são reagendáveis: se a janela
  //     preservada colide com um compromisso não-reagendável do destinatário, o
  //     card é rejeitado com motivo explícito — nunca gravado em cima do conflito.
  const overlaps = (aStart: string, aEnd: string, bStart: number, bEnd: number): boolean =>
    Date.parse(aStart) < bEnd && bStart < Date.parse(aEnd);
  const conflictedFixed = new Map<string, string>();
  for (const a of rawAssignments) {
    if (!a.fixed || !a.dueDate || !a.dueTime || !a.deliveryDate || !a.deliveryTime) continue;
    const start = `${a.dueDate}T${a.dueTime}:00`;
    const end = `${a.deliveryDate}T${a.deliveryTime}:00`;
    const clash = externalBlocks.find((b) =>
      overlaps(start, end, b.start.getTime(), b.end.getTime()),
    );
    if (clash) {
      conflictedFixed.set(
        a.cardId,
        `Horário fixo conflita com "${clash.title}" (compromisso não reagendável de ${targetUserName})`,
      );
    }
  }
  const assignments = rawAssignments.filter((a) => !conflictedFixed.has(a.cardId));
  for (const [cardId, reason] of conflictedFixed) {
    const found = rawAssignments.find((a) => a.cardId === cardId);
    rejected.push({ cardId, title: found?.title || "Card", reason });
  }

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
    if (conflictedFixed.has(e.row.id)) continue;
    signatures[e.row.id] = signatureOf(e.row);
    cards[e.row.id] = e.row;
  }
  for (const q of queueReschedules) {
    const row = queueRows.find((r) => r.id === q.cardId)!;
    signatures[row.id] = signatureOf(row);
    cards[row.id] = row;
  }

  // Próximo horário operacional: primeiro slot realmente usado pela fila
  // proposta (mesma agenda consolidada), nunca no passado.
  const nowKey = zonedWallclockKey(deps.now(), workHours.tz || "America/Sao_Paulo");

  let nextAvailable: BulkAllocationPlan["nextAvailable"] = null;
  for (const p of proposals) {
    if (p.skipped) continue;
    if (p.keepStart) continue; // início histórico do próprio colaborador
    const key = `${p.startISO}T${p.startTime}`;
    if (key < nowKey) continue;
    if (!nextAvailable || key < `${nextAvailable.date}T${nextAvailable.time}`) {
      nextAvailable = { date: p.startISO, time: p.startTime, cardId: p.id, area: p.workArea ?? null };
    }
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
    nextAvailable,
    signatures,
    cards,
    proposals: proposalsMap,
    stageOverrides: Object.fromEntries(
      assignments
        .filter((a) => a.stageSource === "manual" && a.resolvedFunctionKey)
        .map((a) => [a.cardId, a.resolvedFunctionKey as string]),
    ),
    durationOverrides: { ...effectiveDuration },
    summary: {
      selected: cardIds.length,
      eligible: assignments.length,
      rejected: rejected.length,
      reassigned: assignments.filter((a) => !a.sameAssignee).length,
      rescheduledExisting: queueReschedules.length,
      totalOperationalMin: assignments.reduce(
        (sum, a) => sum + (a.untimed ? 0 : a.durationMin || 0),
        0,
      ),
      stageChanged: assignments.filter(
        (a) => (a.resolvedFunctionKey ?? null) !== (a.originalFunctionKey ?? null),
      ).length,
      durationCustomized: assignments.filter((a) => a.durationSource === "manual").length,
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
    const payload = buildReorderScheduleUpdate(p);
    if (!payload.due_date || !payload.delivery_date) return null;
    return {
      due_date: String(payload.due_date),
      due_time: String(payload.due_time),
      delivery_date: String(payload.delivery_date),
      delivery_time: String(payload.delivery_time),
    };
  };

  // Uma ÚNICA transação no banco: reagendamento da fila do destinatário +
  // transferências dos selecionados. Qualquer erro/conflito reverte tudo, de
  // modo que "partial técnico" deixa de existir.
  const queueItems: BulkAtomicItem[] = plan.queueReschedules
    .map((q) => ({
      card_id: q.cardId,
      expected_updated_at: plan.signatures[q.cardId]?.updated_at ?? null,
      schedule: scheduleOf(q.cardId),
    }))
    .filter((i) => !!i.schedule);

  const items: BulkAtomicItem[] = [];
  const ordered = [...plan.assignments].sort((a, b) => {
    const ka = `${a.dueDate || "9999-12-31"}T${a.dueTime || "23:59"}`;
    const kb = `${b.dueDate || "9999-12-31"}T${b.dueTime || "23:59"}`;
    return ka.localeCompare(kb);
  });
  for (const a of ordered) {
    const sig = plan.signatures[a.cardId];
    if (!sig) continue;
    const schedule = a.fixed || a.untimed ? null : scheduleOf(a.cardId);
    if (a.sameAssignee && !schedule) continue;
    items.push({
      card_id: a.cardId,
      expected_updated_at: sig.updated_at ?? null,
      expected_assigned_to: sig.assigned_to ?? null,
      expected_function_key: sig.current_function_key ?? null,
      next_function_key: a.sameAssignee ? null : a.resolvedFunctionKey,
      same_assignee: a.sameAssignee,
      schedule,
    });
  }

  if (items.length === 0 && queueItems.length === 0) {
    return { status: "nothing", message: "Nada mudou — a fila já estava organizada.", appliedIds, failed };
  }

  const res = await deps.applyAtomic({
    tenant_id: plan.tenantId,
    target_user_id: plan.targetUserId,
    bulk_allocation_id: plan.bulkAllocationId,
    source_screen: plan.sourceScreen,
    items,
    queue: queueItems,
  });

  if (res.status === "stale") {
    return { status: "stale", message: res.message || STALE_BULK_MESSAGE, appliedIds, failed };
  }
  if (res.status === "blocked") {
    return {
      status: "blocked",
      message: res.message || "Alocação bloqueada pelas regras de fluxo. Nada foi gravado.",
      appliedIds,
      failed: res.cardId ? [{ cardId: res.cardId, reason: res.message || "Bloqueado" }] : failed,
    };
  }
  if (res.status === "nothing") {
    return { status: "nothing", message: "Nada mudou — a fila já estava organizada.", appliedIds, failed };
  }
  if (res.status !== "applied") {
    return {
      status: "error",
      message: res.message || "Falha ao aplicar a alocação. Nada foi gravado.",
      appliedIds,
      failed,
    };
  }

  appliedIds.push(...(res.appliedIds && res.appliedIds.length > 0
    ? res.appliedIds
    : [...queueItems, ...items].map((i) => i.card_id)));

  // Tempos personalizados sobrevivem à alocação: futuras reorganizações usam o
  // mesmo tempo que o gestor definiu aqui.
  await persistDurationOverrides(plan, appliedIds, deps);

  return {
    status: "applied",
    message: `${appliedIds.length} card${appliedIds.length === 1 ? "" : "s"} alocado${appliedIds.length === 1 ? "" : "s"} para o colaborador.`,
    appliedIds,
    failed,
  };
}

async function persistDurationOverrides(
  plan: BulkAllocationPlan,
  appliedIds: string[],
  deps: BulkAllocationDeps,
): Promise<void> {
  const applied = new Set(appliedIds);
  const rows = plan.assignments
    .filter((a) => applied.has(a.cardId) && a.durationSource === "manual" && a.resolvedFunctionKey)
    .map((a) => ({
      demandId: a.cardId,
      functionKey: a.resolvedFunctionKey as string,
      durationMin: plan.durationOverrides[a.cardId],
    }))
    .filter((r) => !!r.durationMin);
  if (rows.length === 0) return;
  try {
    await deps.saveDurationOverrides(plan.tenantId, rows);
  } catch (err) {
    console.warn("[bulkAllocation] persist duration overrides failed", err);
  }
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
