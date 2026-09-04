/**
 * AUTORIDADE ÚNICA DE TRANSIÇÃO (adapter da RPC canônica).
 *
 * Toda intenção de mudar RESPONSÁVEL, ETAPA, TIPO, ÁREA ou ORIGEM de uma
 * demanda é enviada para `transition_demand_v2` no banco, que:
 *   1. trava a linha (`FOR UPDATE`);
 *   2. confere o estado esperado (compare-and-set);
 *   3. resolve etapa/responsável VÁLIDOS com o kernel do fluxo
 *      (`demand_flow_sequence` / `resolve_valid_stage_for_assignee` /
 *       `resolve_valid_assignee_for_stage`) — etapas `disabled`, inativas ou
 *      fora do fluxo do tipo são impossíveis;
 *   4. grava tudo de uma vez e registra o histórico.
 *
 * Nenhuma regra de validade é reimplementada aqui: este arquivo só traduz
 * intenção → payload e resposta → mensagem.
 */
import { supabase } from "@/integrations/supabase/client";

export type TransitionIntent =
  | "reassign"
  | "unassign"
  | "jump_stage"
  | "proceed"
  | "move_back"
  | "change_type"
  | "change_area"
  | "change_origin"
  | "auto_return"
  | "publication_review"
  | "schedule_publication"
  | "deliver"
  | "partial_deliver"
  | "reconcile_context";

export type TransitionCode =
  | "OK"
  | "NO_CHANGE"
  | "INVALID_STAGE_FOR_FLOW"
  | "NO_VALID_STAGE"
  | "NO_ASSIGNEE"
  | "END_OF_FLOW"
  | "FIRST_OF_FLOW"
  | "SCHEDULE_CONFLICT"
  | "NO_FINAL_STATUS"
  | "INVARIANT_VIOLATION"
  | "STALE_STATE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "ERROR";

export interface TransitionFinalState {
  assigned_to: string | null;
  function_key: string | null;
  type_key: string | null;
  work_area: string | null;
  origin: string | null;
  status_id?: string | null;
  archived_at?: string | null;
  updated_at?: string | null;
  additional_assignees?: string[] | null;
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  client_wait_started_at?: string | null;
  client_resend_count?: number | null;
  client_last_resend_at?: string | null;
}

/** Agenda gravada DENTRO da mesma transição (nunca em um segundo update). */
export interface TransitionSchedule {
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
}

export interface TransitionResult {
  status: "applied" | "nothing" | "blocked" | "stale" | "end" | "error";
  code: TransitionCode;
  message: string;
  previous?: { assigned_to: string | null; function_key: string | null };
  final?: TransitionFinalState;
  /** Etapas de revisão dispensadas pelo kernel. */
  skipped?: string[];
  conflict?: { demand_id: string; title: string | null } | null;
}


export interface TransitionRequest {
  demandId: string;
  intent: TransitionIntent;
  /** Responsável desejado (alvo duro). Ausente = o banco mantém/resolve. */
  targetUserId?: string | null;
  /** Preferência de responsável: o banco troca se ele não puder a etapa. */
  preferredUserId?: string | null;
  /** Etapa desejada. Ausente = o banco resolve a etapa válida. */
  targetFunctionKey?: string | null;
  targetTypeKey?: string | null;
  targetTypeLabel?: string | null;
  targetWorkArea?: string | null;
  targetOrigin?: string | null;
  /** Sentido forçado da resolução de etapa. */
  direction?: "auto" | "forward" | "backward";
  /** `false` = transição real de processo (pode assumir etapa de cliente). */
  administrative?: boolean;
  /** Agenda aplicada na MESMA transição (nunca em segundo update). */
  schedule?: TransitionSchedule | null;
  /** Status de destino explícito (entrega, agendamento de publicação). */
  targetStatusId?: string | null;
  /** Participante da ação (entrega parcial). Ausente = auth.uid(). */
  actorUserId?: string | null;
  expected?: {
    assignedTo?: string | null;
    functionKey?: string | null;
    updatedAt?: string | null;
  };
  source?: string;
  metadata?: Record<string, unknown>;
}

/** Mensagens canônicas por código (a UI nunca inventa a sua). */
export const TRANSITION_MESSAGE: Record<TransitionCode, string> = {
  OK: "Transição aplicada.",
  NO_CHANGE: "Nada a alterar nesta demanda.",
  INVALID_STAGE_FOR_FLOW: "Esta etapa não faz parte do fluxo atual desta demanda.",
  NO_VALID_STAGE: "Não há etapa válida deste fluxo para o colaborador escolhido.",
  NO_ASSIGNEE: "Não há colaborador habilitado para esta etapa neste fluxo.",
  END_OF_FLOW: "Essa demanda já chegou ao final do fluxo.",
  FIRST_OF_FLOW: "Esta demanda já está na primeira etapa do fluxo.",
  SCHEDULE_CONFLICT: "O responsável já tem outra demanda ocupando este horário.",
  NO_FINAL_STATUS: 'Não foi encontrado um status final "Feito" neste pipeline.',
  INVARIANT_VIOLATION: "O estado resultante violaria uma regra do fluxo.",
  STALE_STATE:
    "A demanda foi alterada por outra ação enquanto você decidia. Nada foi alterado — recarregue e tente novamente.",
  FORBIDDEN: "Você não tem acesso a esta demanda.",
  NOT_FOUND: "Demanda não encontrada.",
  BAD_REQUEST: "Requisição inválida de transição.",
  ERROR: "Não foi possível aplicar a transição.",
};


/** Payload enviado à RPC — puro, para poder ser testado sem rede. */
export function buildTransitionPayload(req: TransitionRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    demand_id: req.demandId,
    intent: req.intent,
    source: req.source || req.intent,
  };
  const norm = (v?: string | null) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };

  if (req.targetUserId !== undefined) payload.target_user_id = req.targetUserId ?? null;
  if (req.preferredUserId !== undefined) payload.preferred_user_id = req.preferredUserId ?? null;
  if (req.targetFunctionKey !== undefined) payload.target_function_key = norm(req.targetFunctionKey);
  if (req.targetTypeKey !== undefined) payload.target_type_key = norm(req.targetTypeKey);
  if (req.targetTypeLabel !== undefined) payload.target_type_label = norm(req.targetTypeLabel);
  if (req.targetWorkArea !== undefined) payload.target_work_area = norm(req.targetWorkArea);
  if (req.targetOrigin !== undefined) payload.target_origin = norm(req.targetOrigin);
  if (req.direction) payload.direction = req.direction;
  if (req.administrative !== undefined) payload.administrative = req.administrative;
  if (req.targetStatusId !== undefined) payload.target_status_id = req.targetStatusId ?? null;
  if (req.actorUserId !== undefined) payload.actor_user_id = req.actorUserId ?? null;
  if (req.schedule) {
    const s: Record<string, unknown> = {};
    if (req.schedule.due_date !== undefined) s.due_date = req.schedule.due_date ?? "";
    if (req.schedule.due_time !== undefined) s.due_time = req.schedule.due_time ?? "";
    if (req.schedule.delivery_date !== undefined) s.delivery_date = req.schedule.delivery_date ?? "";
    if (req.schedule.delivery_time !== undefined) s.delivery_time = req.schedule.delivery_time ?? "";
    if (Object.keys(s).length > 0) payload.schedule = s;
  }
  if (req.expected) {
    if (req.expected.assignedTo !== undefined)
      payload.expected_assigned_to = req.expected.assignedTo ?? "";
    if (req.expected.functionKey !== undefined)
      payload.expected_function_key = req.expected.functionKey ?? "";
    if (req.expected.updatedAt) payload.expected_updated_at = req.expected.updatedAt;
  }
  if (req.metadata) payload.metadata = req.metadata;
  return payload;
}

/** Normaliza a resposta da RPC (defensivo contra formato inesperado). */
export function parseTransitionResponse(raw: any): TransitionResult {
  const code = (raw?.code as TransitionCode) || "ERROR";
  const status = (raw?.status as TransitionResult["status"]) || "error";
  const skipped = raw?.warnings ?? raw?.skipped;
  return {
    status,
    code,
    message: (raw?.message as string) || TRANSITION_MESSAGE[code] || TRANSITION_MESSAGE.ERROR,
    previous: raw?.previous ?? undefined,
    final: raw?.final ?? undefined,
    skipped: Array.isArray(skipped) ? (skipped.filter(Boolean) as string[]) : undefined,
    conflict: raw?.conflict ?? undefined,
  };
}


/** Executa a transição. Único caminho de escrita de responsável/etapa. */
export async function transitionDemand(req: TransitionRequest): Promise<TransitionResult> {
  let data: any = null;
  let error: any = null;
  try {
    ({ data, error } = await (supabase as any).rpc("transition_demand_v2", {
      p_payload: buildTransitionPayload(req),
    }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[demandTransition] rpc error", error);
    return { status: "error", code: "ERROR", message: TRANSITION_MESSAGE.ERROR };
  }
  return parseTransitionResponse(data);
}

// ---------------------------------------------------------------------
// PREVIEW (mesmas funções SQL usadas no commit — nunca uma cópia de regra)
// ---------------------------------------------------------------------

export interface StagePreviewCard {
  id: string;
  demand_type_key?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
}

/** Etapa que o banco daria a este responsável (sem gravar). */
export async function previewStageForAssignee(params: {
  tenantId: string;
  card: StagePreviewCard;
  userId: string;
  administrative?: boolean;
  direction?: "auto" | "forward" | "backward";
}): Promise<string | null> {
  const { tenantId, card, userId } = params;
  let data: any = null;
  let error: any = null;
  try {
    ({ data, error } = await (supabase as any).rpc("resolve_valid_stage_for_assignee", {
      _tenant_id: tenantId,
      _user_id: userId,
      _demand_type_key: card.demand_type_key ?? null,
      _work_area: (card.work_area as any) === "sistemas" ? "sistemas" : "midia",
      _origin: card.origin ?? null,
      _current_key: card.current_function_key ?? null,
      _demand_id: card.id ?? null,
      _administrative: params.administrative !== false,
      _direction: params.direction || "auto",
    }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[demandTransition] preview error", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Sequência real do fluxo da demanda, direto do kernel. */
export async function loadFlowSequenceKeys(params: {
  tenantId: string;
  card: StagePreviewCard;
}): Promise<string[]> {
  const { tenantId, card } = params;
  let data: any = null;
  let error: any = null;
  try {
    ({ data, error } = await (supabase as any).rpc("demand_flow_sequence", {
      _tenant_id: tenantId,
      _demand_type_key: card.demand_type_key ?? null,
      _work_area: (card.work_area as any) === "sistemas" ? "sistemas" : "midia",
      _origin: card.origin ?? null,
    }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[demandTransition] sequence error", error);
    return [];
  }
  return ((data as any[]) || [])
    .slice()
    .sort((a, b) => (a.seq_position ?? 0) - (b.seq_position ?? 0))
    .map((r) => r.function_key as string);
}
