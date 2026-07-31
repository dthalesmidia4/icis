import { supabase } from "@/integrations/supabase/client";
import { recordStageTouchpoint } from "@/lib/recordTouchpoint";
import { recordFlowHistory, recordFlowHistoryForUsers } from "@/lib/flowHistory";
import { getStageCompletions, lastUserOfStage } from "@/lib/stageCompletions";
import { buildReturnFromClientDates } from "@/lib/flowDurations";
import { isReviewFunction } from "@/lib/flowFunctions";
import { checkAssignmentConflicts, suggestFreeSlot } from "@/lib/scheduleOccupancy";


/**
 * Duração anterior do card (fim − início), em minutos. Usada como fallback
 * quando a etapa de destino não tem duração configurada.
 */
async function previousDurationMinutes(demandId: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("demands")
      .select("due_date, due_time, delivery_date, delivery_time")
      .eq("id", demandId)
      .maybeSingle();
    const d: any = data;
    if (!d?.due_date || !d?.delivery_date) return null;
    const s = new Date(`${d.due_date}T${(d.due_time || "00:00").slice(0, 5)}:00`).getTime();
    const e = new Date(`${d.delivery_date}T${(d.delivery_time || "00:00").slice(0, 5)}:00`).getTime();
    const min = Math.round((e - s) / 60000);
    return Number.isFinite(min) && min > 0 ? min : null;
  } catch {
    return null;
  }
}

/**
 * Ao sair de "Aguardando clientes" para uma etapa operacional, o card é
 * reagendado para começar agora — evita reentrar em atraso por causa do
 * tempo parado no cliente.
 */
async function applyReturnFromClientSchedule(
  payload: any,
  tenantId: string,
  demandId: string,
  targetStage: string,
  demandTypeKey?: string | null,
): Promise<void> {
  const fallback = await previousDurationMinutes(demandId);
  const meta = await getDemandFlowMeta(demandId);
  const dates = await buildReturnFromClientDates(
    tenantId,
    targetStage,
    demandTypeKey,
    fallback,
    meta.workArea === "sistemas" ? "sistemas" : "midia",
  );
  Object.assign(payload, dates);
}

/**
 * Avanço automático de etapa NUNCA pode deixar o novo responsável com dois
 * cards no mesmo horário. Se a janela resultante choca com a agenda dele,
 * o card é deslocado para o primeiro slot livre.
 */
async function avoidScheduleConflict(
  payload: any,
  tenantId: string,
  demandId: string,
  assignedTo: string | null,
  targetStage: string | null,
): Promise<void> {
  if (!tenantId || !assignedTo || !targetStage) return;
  try {
    const { data } = await supabase
      .from("demands")
      .select(
        "id, title, work_area, due_date, due_time, delivery_date, delivery_time, publish_date, publish_time, demand_type, demand_type_key, is_daily_card, current_function_key",
      )
      .eq("id", demandId)
      .maybeSingle();
    if (!data) return;
    const probe: any = { ...(data as any), ...payload, current_function_key: targetStage };
    const res = await checkAssignmentConflicts({
      tenantId,
      userId: assignedTo,
      card: probe,
      targetStage,
    });
    if (res.hard.length === 0) return;
    const slot = await suggestFreeSlot({
      tenantId,
      userId: assignedTo,
      card: probe,
      targetStage,
    });
    if (!slot) return;
    payload.due_date = slot.date;
    payload.due_time = slot.startTime;
    payload.delivery_date = slot.date;
    payload.delivery_time = slot.endTime;
  } catch {
    /* silencioso: nunca bloquear o fluxo por causa da checagem */
  }
}



/**
 * Fonte da verdade da etapa atual: o banco. O valor vindo da tela pode estar
 * desatualizado (o card muda por realtime, por outro usuário ou por trigger),
 * e usar valor velho já causou registros de histórico em etapas erradas.
 */
async function resolveCurrentStage(
  demandId: string,
  fallback?: string | null,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("demands")
      .select("current_function_key")
      .eq("id", demandId)
      .maybeSingle();
    const key = (data as any)?.current_function_key;
    if (key) return key as string;
  } catch (e) {
    console.warn("[proceedDemand] resolveCurrentStage error:", e);
  }
  return fallback ?? null;
}

/**
 * Quando um card "Captar" muda de etapa, todos os `additional_assignees`
 * são desligados (a próxima etapa tem responsável único).
 * - Retorna a lista para uso no histórico multi-usuário.
 * - Faz a limpeza defensiva na base após a transição.
 */
async function fetchCaptarExtras(demandId: string): Promise<string[]> {
  const { data } = await supabase
    .from("demands")
    .select("additional_assignees" as any)
    .eq("id", demandId)
    .maybeSingle();
  const raw = (data as any)?.additional_assignees;
  return Array.isArray(raw) ? (raw.filter(Boolean) as string[]) : [];
}

/**
 * Verifica se o card já teve entregas parciais na etapa `captar`.
 * Usado para decidir se o último captador (que clica Prosseguir) também
 * deve ficar registrado como `partial_delivered` no histórico.
 */
async function hadPriorCaptarPartialDelivery(tenantId: string, demandId: string): Promise<boolean> {
  try {
    const { count } = await supabase
      .from("demand_flow_history")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("demand_id", demandId)
      .eq("action", "partial_delivered")
      .eq("from_function_key", "captar");
    return (count || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Lista de responsáveis extras (`additional_assignees`) de qualquer etapa.
 */
async function fetchExtraAssignees(demandId: string): Promise<string[]> {
  return fetchCaptarExtras(demandId);
}

/**
 * Registra automaticamente a entrega (`partial_delivered`) de cada responsável
 * da etapa de origem quando o card avança no fluxo.
 * Vale para QUALQUER etapa (não só `captar`) e evita duplicar quem já havia
 * usado o botão "Entregar minha parte".
 */
export async function recordStageDeliveries(
  tenantId: string,
  demandId: string,
  fromFunctionKey: string | null,
  userIds: Array<string | null | undefined>,
): Promise<void> {
  const stage = (fromFunctionKey || "").trim();
  if (!tenantId || !demandId || !stage) return;
  // Etapas sem execução operacional não geram entrega.
  if (stage === "aguardando_cliente") return;

  const unique = Array.from(new Set((userIds || []).filter(Boolean))) as string[];
  if (unique.length === 0) return;

  try {
    const { data } = await supabase
      .from("demand_flow_history")
      .select("from_user_id")
      .eq("tenant_id", tenantId)
      .eq("demand_id", demandId)
      .eq("action", "partial_delivered")
      .eq("from_function_key", stage);
    const already = new Set(((data as any[]) || []).map((r) => r.from_user_id).filter(Boolean));
    const pending = unique.filter((uid) => !already.has(uid));
    if (pending.length === 0) return;
    await Promise.all(
      pending.map((uid) =>
        recordFlowHistory({
          tenantId,
          demandId,
          action: "partial_delivered",
          fromUserId: uid,
          toUserId: uid,
          fromFunctionKey: stage,
          toFunctionKey: stage,
          metadata: { auto: true },
        }),
      ),
    );
  } catch (e) {
    console.warn("[proceedDemand] recordStageDeliveries error:", e);
  }
}

/**
 * Toda entrada em "Aguardando clientes" carimba a data/hora do envio e
 * registra o envio no histórico (`sent_to_client`) com o número do envio.
 */
export async function recordClientSend(
  tenantId: string,
  demandId: string,
  fromFunctionKey: string | null,
  userId: string | null,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("demands")
      .select("client_resend_count" as any)
      .eq("id", demandId)
      .maybeSingle();
    const sendNumber = (Number((data as any)?.client_resend_count) || 0) + 1;
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "sent_to_client",
      fromUserId: userId,
      toUserId: userId,
      fromFunctionKey,
      toFunctionKey: "aguardando_cliente",
      metadata: { send_number: sendNumber },
    });
  } catch (e) {
    console.warn("[proceedDemand] recordClientSend error:", e);
  }
}


async function clearAdditionalAssignees(demandId: string): Promise<void> {
  try {
    await supabase
      .from("demands")
      .update({ additional_assignees: [] } as any)
      .eq("id", demandId);
  } catch (e) {
    console.warn("[proceedDemand] clearAdditionalAssignees error:", e);
  }
}

/**
 * Chaves técnicas oficiais de tipo de demanda. Usadas pelo botão Prosseguir
 * e por `demand_type_flow_rules`. Nunca inventar novas keys aqui.
 */
export type MediaDemandTypeKey =
  | "criativo_estatico"
  | "carrossel"
  | "video_captado"
  | "video_gerado"
  | "outro";

export type SystemsDemandTypeKey =
  | "bug_n1"
  | "bug_n2"
  | "bug_n3"
  | "desenvolvimento"
  | "melhoria"
  | "suporte";

export type DemandTypeKey = MediaDemandTypeKey | SystemsDemandTypeKey;

/** Origem da demanda — define se o fluxo passa pelas etapas de cliente. */
export type DemandOrigin = "interno" | "cliente_solicitacao" | "cliente_feedback" | "suporte";

export const DEMAND_ORIGINS: { key: DemandOrigin; label: string; description: string }[] = [
  { key: "interno", label: "Interna", description: "Ideia ou manutenção da própria equipe" },
  { key: "cliente_solicitacao", label: "Solicitação do cliente", description: "O cliente pediu" },
  { key: "cliente_feedback", label: "Feedback coletado", description: "Veio de visita, reunião ou feedback" },
  { key: "suporte", label: "Suporte", description: "Chamado ou incidente do cliente" },
];

export const DEMAND_ORIGIN_LABEL: Record<DemandOrigin, string> = {
  interno: "Interna",
  cliente_solicitacao: "Solicitação do cliente",
  cliente_feedback: "Feedback coletado",
  suporte: "Suporte",
};

export function isClientOrigin(origin?: string | null): boolean {
  const o = (origin || "interno") as DemandOrigin;
  return o !== "interno";
}

export const OFFICIAL_DEMAND_TYPES: { key: DemandTypeKey; label: string }[] = [
  { key: "criativo_estatico", label: "Criativo estático" },
  { key: "carrossel", label: "Carrossel" },
  { key: "video_captado", label: "Vídeo captado" },
  { key: "video_gerado", label: "Vídeo gerado" },
  { key: "outro", label: "Outro" },
];

export const SYSTEMS_DEMAND_TYPES: { key: DemandTypeKey; label: string }[] = [
  { key: "bug_n1", label: "Bug nível 1" },
  { key: "bug_n2", label: "Bug nível 2" },
  { key: "bug_n3", label: "Bug nível 3" },
  { key: "desenvolvimento", label: "Desenvolvimento" },
  { key: "melhoria", label: "Melhoria" },
  { key: "suporte", label: "Suporte" },
];

/** Tipos disponíveis para uma área de trabalho. */
export function demandTypesForArea(workArea?: string | null): { key: DemandTypeKey; label: string }[] {
  return workArea === "sistemas" ? SYSTEMS_DEMAND_TYPES : OFFICIAL_DEMAND_TYPES;
}

export const DEMAND_TYPE_LABEL: Record<DemandTypeKey, string> = {
  criativo_estatico: "Criativo estático",
  carrossel: "Carrossel",
  video_captado: "Vídeo captado",
  video_gerado: "Vídeo gerado",
  outro: "Outro",
  bug_n1: "Bug nível 1",
  bug_n2: "Bug nível 2",
  bug_n3: "Bug nível 3",
  desenvolvimento: "Desenvolvimento",
  melhoria: "Melhoria",
  suporte: "Suporte",
};

/**
 * Normaliza texto livre de tipo (vindo da IA/usuário) para uma das keys
 * oficiais — ou `null` quando não houver certeza.
 *
 * Segurança: nunca faz fallback silencioso para `criativo_estatico`.
 * Compostos (com "+") retornam null. Vídeos ambíguos retornam null.
 */
export function normalizeDemandTypeKey(text?: string | null): DemandTypeKey | null {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  // Tipos compostos com "+" (ex.: "Carrossel (5 slides) + PDF complementar"):
  // usar apenas a parte antes do "+" como tipo primário. O complemento vira
  // anexo e não altera a natureza do card.
  const primary = raw.includes("+") ? raw.split("+")[0].trim() : raw;
  if (!primary) return null;

  const l = primary.toLowerCase();
  if (l.includes("carrossel") || l.includes("carousel")) return "carrossel";
  if (l.includes("captad")) return "video_captado";
  if ((l.includes("gerad") || l.includes("gerar")) && (l.includes("vídeo") || l.includes("video"))) {
    return "video_gerado";
  }
  const looksLikeVideo = /(\bv[ií]deo\b|\breels?\b|\btiktok\b|v[ií]deos?\s+curtos)/.test(l);
  if (looksLikeVideo) return null;
  if (/(est[aá]t|\bpost\b|stor(y|ies))/.test(l)) return "criativo_estatico";
  return null;
}

const ALL_TYPE_KEYS = new Set<string>([
  ...OFFICIAL_DEMAND_TYPES.map((t) => t.key),
  ...SYSTEMS_DEMAND_TYPES.map((t) => t.key),
]);

/** Aceita apenas uma das keys oficiais; caso contrário retorna null. */
export function coerceDemandTypeKey(value?: string | null): DemandTypeKey | null {
  if (!value) return null;
  const v = String(value).trim();
  return ALL_TYPE_KEYS.has(v) ? (v as DemandTypeKey) : null;
}

export interface DemandFlowMeta {
  workArea: "midia" | "sistemas";
  origin: DemandOrigin;
  typeKey: DemandTypeKey | null;
}

/**
 * Área e origem da demanda — determinam qual conjunto de etapas vale e se as
 * etapas de cliente (`requires_client_origin`) entram no fluxo.
 */
export async function getDemandFlowMeta(demandId: string): Promise<DemandFlowMeta> {
  try {
    const { data } = await supabase
      .from("demands")
      .select("work_area, origin, demand_type_key" as any)
      .eq("id", demandId)
      .maybeSingle();
    const d: any = data || {};
    return {
      workArea: d.work_area === "sistemas" ? "sistemas" : "midia",
      origin: (d.origin || "interno") as DemandOrigin,
      typeKey: coerceDemandTypeKey(d.demand_type_key),
    };
  } catch {
    return { workArea: "midia", origin: "interno", typeKey: null };
  }
}


export interface ProceedResult {
  success: boolean;
  message: string;
  assignedTo?: string;
  assignedName?: string;
  functionKey?: string;
  functionName?: string;
  end?: boolean;
  needsTypeKey?: boolean;
}

interface ProceedInput {
  demandId: string;
  tenantId: string;
  /** Chave técnica salva em `demands.demand_type_key`. Único sinal aceito. */
  demandTypeKey?: string | null;
  currentFunctionKey?: string | null;
}

export interface PickAssigneeResult {
  success: boolean;
  message?: string;
  userId?: string;
  name?: string;
}

/**
 * Escolhe o colaborador de menor carga para uma função de fluxo.
 * Regras:
 *  - `collaborator_function_assignments.allowed = true` e `function_key = <fn>`.
 *  - Somente usuários internos (agency_admin / manager / user).
 *  - Menor contagem de `demands.assigned_to` não arquivadas; desempate alfabético.
 */
export async function pickAssigneeForFunction(
  tenantId: string,
  functionKey: string,
  functionName?: string,
  opts?: { excludeUserIds?: Array<string | null | undefined>; preferUserIds?: Array<string | null | undefined> },
): Promise<PickAssigneeResult> {
  const label = functionName || functionKey;

  const { data: assigns, error: aErr } = await supabase
    .from("collaborator_function_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("function_key", functionKey)
    .eq("allowed", true);
  if (aErr) return { success: false, message: "Erro ao buscar colaboradores." };

  const candidateIds = Array.from(new Set((assigns || []).map((a: any) => a.user_id))).filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: false, message: `Nenhum colaborador tem a função "${label}" atribuída.` };
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("user_id", candidateIds)
    .in("role", ["agency_admin", "agency_manager", "agency_user"]);
  let internalIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
  if (internalIds.length === 0) {
    return { success: false, message: `Nenhum colaborador interno com a função "${label}".` };
  }

  // Exclusão (ex.: etapas de revisão nunca caem em quem executou a etapa anterior).
  const excluded = new Set((opts?.excludeUserIds || []).filter(Boolean) as string[]);
  if (excluded.size > 0) {
    internalIds = internalIds.filter((id) => !excluded.has(id));
    if (internalIds.length === 0) {
      return { success: false, message: `Nenhum outro colaborador disponível para "${label}".` };
    }
  }

  const [{ data: profiles }, { data: demands }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", internalIds),
    supabase
      .from("demands")
      .select("assigned_to")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .in("assigned_to", internalIds),
  ]);

  const counts = new Map<string, number>();
  (demands || []).forEach((d: any) => {
    if (d.assigned_to) counts.set(d.assigned_to, (counts.get(d.assigned_to) || 0) + 1);
  });
  const profileById = new Map<string, string>();
  (profiles || []).forEach((p: any) => profileById.set(p.id, p.full_name || "Colaborador"));

  // Preferência (sticky): se alguém que já está no card pode exercer a função, fica com ele.
  const preferred = (opts?.preferUserIds || []).filter(Boolean) as string[];
  const stickyMatch = preferred.find((id) => internalIds.includes(id));
  if (stickyMatch) {
    return { success: true, userId: stickyMatch, name: profileById.get(stickyMatch) || "Colaborador" };
  }

  internalIds.sort((a, b) => {
    const ca = counts.get(a) || 0;
    const cb = counts.get(b) || 0;
    if (ca !== cb) return ca - cb;
    return (profileById.get(a) || "").localeCompare(profileById.get(b) || "", "pt-BR");
  });
  const chosen = internalIds[0];
  return {
    success: true,
    userId: chosen,
    name: profileById.get(chosen) || "Colaborador",
  };
}

/**
 * Quem fica com o card enquanto ele espera o cliente.
 * Regra: prioriza colaborador com a função `aguardando_cliente` atribuída
 * (sticky se o responsável anterior já a tiver). Sem alguém habilitado, a
 * transição deve ser bloqueada — nunca deixa o card com um dono incompatível.
 */
async function resolveClientWaitOwner(
  tenantId: string,
  previousAssignee: string | null,
): Promise<string | null> {
  try {
    const picked = await pickAssigneeForFunction(tenantId, "aguardando_cliente", "Aguardando cliente", {
      preferUserIds: previousAssignee ? [previousAssignee] : [],
    });
    if (picked.success && picked.userId) return picked.userId;
  } catch (e) {
    console.warn("[proceedDemand] resolveClientWaitOwner error:", e);
  }
  return null;
}



/**
 * Todos os usuários que executaram a etapa atual do card: responsável,
 * `additional_assignees` e quem registrou entrega parcial no histórico.
 * Usado para (a) manter o card com a mesma pessoa na próxima etapa de produção
 * e (b) impedir auto-revisão.
 */
async function collectStageExecutors(
  tenantId: string,
  demandId: string,
  currentFunctionKey: string | null | undefined,
  previousAssignee: string | null,
  extras: string[],
): Promise<string[]> {
  const set = new Set<string>();
  if (previousAssignee) set.add(previousAssignee);
  extras.filter(Boolean).forEach((id) => set.add(id));
  if (currentFunctionKey) {
    try {
      const completions = await getStageCompletions(tenantId, demandId);
      (completions.get(currentFunctionKey)?.userIds || []).forEach((id) => set.add(id));
    } catch (e) {
      console.warn("[proceedDemand] collectStageExecutors error:", e);
    }
  }
  return Array.from(set);
}

/**
 * Etapas de produção em que o card deve "colar" no responsável atual quando ele
 * tem a função permitida (ex.: quem planejou e também cria roteiro continua com o card).
 */
const STICKY_STAGES = new Set([
  "criar_roteiro",
  "criar_arte",
  "captar",
  "gerar_video",
  "editar_video",
  "enviar_cliente",
  "publicar",
]);

export interface ResolvedNextStage {
  fn: { function_key: string; name: string };
  /** `null` para `aguardando_cliente` (mantém o mesmo responsável). */
  picked: PickAssigneeResult | null;
  /** Etapas de revisão puladas por não haver revisor diferente do executor. */
  skipped: string[];
}

/**
 * Resolve a próxima etapa + responsável a partir de `startIndex`, aplicando:
 *  - sticky nas etapas de produção (mantém quem já está no card);
 *  - revisão nunca é auto-revisão: se o único revisor possível for quem executou,
 *    a etapa de revisão é pulada e o fluxo avança (em cascata).
 */
async function resolveNextStage(
  tenantId: string,
  sequence: { function_key: string; name: string }[],
  startIndex: number,
  executors: string[],
): Promise<ResolvedNextStage | null> {
  const skipped: string[] = [];
  for (let i = startIndex; i < sequence.length; i++) {
    const fn = sequence[i];
    if (fn.function_key === "aguardando_cliente") {
      return { fn, picked: null, skipped };
    }
    if (isReviewFunction(fn.function_key)) {
      const picked = await pickAssigneeForFunction(tenantId, fn.function_key, fn.name, {
        excludeUserIds: executors,
      });
      if (picked.success && picked.userId) return { fn, picked, skipped };
      skipped.push(fn.function_key);
      continue;
    }
    const picked = await pickAssigneeForFunction(tenantId, fn.function_key, fn.name, {
      preferUserIds: STICKY_STAGES.has(fn.function_key) ? executors : [],
    });
    return { fn, picked, skipped };
  }
  return null;
}


export interface SequenceOptions {
  /** Quando informado, área e origem são lidas do próprio card. */
  demandId?: string | null;
  workArea?: "midia" | "sistemas" | null;
  origin?: string | null;
}

/**
 * Devolve a sequência ordenada de funções obrigatórias para um `demand_type_key`.
 * Filtros aplicados:
 *  - `flow_functions.work_area` = área do card (Mídia × Sistemas);
 *  - etapas com `requires_client_origin` só entram quando a demanda tem
 *    origem de cliente (solicitação, feedback ou suporte).
 */
export async function getPipelineSequence(
  tenantId: string,
  demandTypeKey?: string | null,
  opts?: SequenceOptions,
): Promise<{ function_key: string; name: string }[]> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey || !tenantId) return [];

  let workArea = opts?.workArea ?? null;
  let origin = opts?.origin ?? null;
  if ((!workArea || !origin) && opts?.demandId) {
    const meta = await getDemandFlowMeta(opts.demandId);
    workArea = workArea || meta.workArea;
    origin = origin || meta.origin;
  }
  const area: "midia" | "sistemas" = workArea === "sistemas" ? "sistemas" : "midia";
  const clientOrigin = isClientOrigin(origin);

  const [{ data: fns }, { data: rules }] = await Promise.all([
    (supabase.from("flow_functions") as any)
      .select("function_key, name, position, active, work_area, requires_client_origin")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("work_area", area)
      .order("position"),
    supabase
      .from("demand_type_flow_rules")
      .select("function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("demand_type_key", typeKey),
  ]);
  if (!fns) return [];
  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));
  return (fns as any[])
    .filter((f) => req.get(f.function_key) === "required")
    .filter((f) => (f.requires_client_origin ? clientOrigin : true))
    .map((f) => ({ function_key: f.function_key, name: f.name }));
}


/**
 * Pula diretamente a demanda para uma função específica do pipeline configurado.
 */
export async function jumpToFunction({
  demandId,
  tenantId,
  demandTypeKey,
  targetFunctionKey,
  currentFunctionKey,
}: {
  demandId: string;
  tenantId: string;
  demandTypeKey?: string | null;
  targetFunctionKey: string;
  currentFunctionKey?: string | null;
}): Promise<ProceedResult> {
  currentFunctionKey = await resolveCurrentStage(demandId, currentFunctionKey);
  const seq = await getPipelineSequence(tenantId, demandTypeKey, { demandId });
  const target = seq.find((f) => f.function_key === targetFunctionKey);
  if (!target) return { success: false, message: "Etapa não encontrada no fluxo." };

  // Entrada em "Aguardando clientes": prioriza quem tem a função atribuída;
  // sem ninguém habilitado, mantém o responsável anterior.
  if (target.function_key === "aguardando_cliente") {
    const { data: cur } = await supabase.from("demands").select("assigned_to").eq("id", demandId).maybeSingle();
    const previous = (cur as any)?.assigned_to || null;
    const keep = await resolveClientWaitOwner(tenantId, previous);
    if (!keep) return { success: false, message: 'Nenhum colaborador possui a função "Aguardando cliente" habilitada.' };
    const updateWait: any = {
      assigned_to: keep,
      current_function_key: target.function_key,
      client_wait_started_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("demands").update(updateWait).eq("id", demandId);
    if (error) return { success: false, message: "Erro ao atualizar etapa." };
    await recordFlowHistory({ tenantId, demandId, action: "proceeded", fromUserId: previous, toUserId: keep, fromFunctionKey: currentFunctionKey || null, toFunctionKey: target.function_key });
    await recordClientSend(tenantId, demandId, currentFunctionKey || null, keep);
    await recordStageTouchpoint(tenantId, demandId, target.function_key);
    // A etapa que enviou ao cliente foi concluída: registra a entrega (trava regressão).
    await recordStageDeliveries(tenantId, demandId, currentFunctionKey || null, [
      previous,
      ...(await fetchExtraAssignees(demandId)),
    ]);
    return { success: true, assignedTo: keep || undefined, functionKey: target.function_key, functionName: target.name, message: `Demanda movida para ${target.name}.` };
  }


  const { data: cur } = await supabase.from("demands").select("assigned_to").eq("id", demandId).maybeSingle();
  const prevUser = (cur as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];
  const stageExtras = currentFunctionKey === "captar" ? captarExtras : await fetchExtraAssignees(demandId);
  const jumpExecutors = await collectStageExecutors(tenantId, demandId, currentFunctionKey, prevUser, stageExtras);

  // Salto manual: mantém quem já está no card quando a etapa é de produção;
  // etapas de revisão nunca caem em quem executou a etapa anterior.
  const isReviewTarget = isReviewFunction(target.function_key);
  let picked = await pickAssigneeForFunction(tenantId, target.function_key, target.name, {
    preferUserIds: !isReviewTarget && STICKY_STAGES.has(target.function_key) ? jumpExecutors : [],
    excludeUserIds: isReviewTarget ? jumpExecutors : [],
  });
  if (isReviewTarget && (!picked.success || !picked.userId)) {
    // Sem revisor alternativo: usa a escolha normal por carga (o usuário pediu esta etapa).
    picked = await pickAssigneeForFunction(tenantId, target.function_key, target.name);
  }
  if (!picked.success || !picked.userId) return { success: false, message: picked.message || "Nenhum responsável para a etapa." };


  const updatePayload: any = { assigned_to: picked.userId, current_function_key: target.function_key };
  if (currentFunctionKey === "aguardando_cliente" && target.function_key !== "enviar_cliente") {
    updatePayload.client_wait_started_at = null;
    updatePayload.client_resend_count = 0;
    updatePayload.client_last_resend_at = null;
    await applyReturnFromClientSchedule(updatePayload, tenantId, demandId, target.function_key, demandTypeKey);
  }
  if (currentFunctionKey === "captar") {
    updatePayload.additional_assignees = [];
  }
  await avoidScheduleConflict(updatePayload, tenantId, demandId, picked.userId, target.function_key);
  const { error } = await supabase
    .from("demands")
    .update(updatePayload)
    .eq("id", demandId);
  if (error) return { success: false, message: "Erro ao atualizar etapa." };
  if (currentFunctionKey === "captar" && captarExtras.length > 0) {
    await recordFlowHistoryForUsers(
      { tenantId, demandId, action: "proceeded", toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: target.function_key },
      [prevUser, ...captarExtras],
    );
  } else {
    // Se este é o último captador de uma captação que teve entregas parciais, registra sua entrega também.
    if (currentFunctionKey === "captar" && prevUser && await hadPriorCaptarPartialDelivery(tenantId, demandId)) {
      await recordFlowHistory({ tenantId, demandId, action: "partial_delivered", fromUserId: prevUser, toUserId: prevUser, fromFunctionKey: "captar", toFunctionKey: "captar", metadata: { final_of_capture: true } as any });
    }
    await recordFlowHistory({ tenantId, demandId, action: "proceeded", fromUserId: prevUser, toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: target.function_key });
  }
  await recordStageDeliveries(tenantId, demandId, currentFunctionKey || null, [prevUser, ...stageExtras]);
  await recordStageTouchpoint(tenantId, demandId, target.function_key);
  return { success: true, assignedTo: picked.userId, assignedName: picked.name, functionKey: target.function_key, functionName: target.name, message: `Demanda movida para ${target.name} com ${picked.name}.` };
}

export async function proceedDemand({
  demandId,
  tenantId,
  demandTypeKey,
  currentFunctionKey,
}: ProceedInput): Promise<ProceedResult> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey) {
    return {
      success: false,
      needsTypeKey: true,
      message: "Defina o tipo da demanda antes de prosseguir.",
    };
  }
  currentFunctionKey = await resolveCurrentStage(demandId, currentFunctionKey);

  const sequence = await getPipelineSequence(tenantId, typeKey, { demandId });
  if (sequence.length === 0) return { success: false, message: "Este tipo de demanda não tem funções configuradas." };


  let nextIndex = 0;
  if (currentFunctionKey) {
    const idx = sequence.findIndex((f: any) => f.function_key === currentFunctionKey);
    nextIndex = idx === -1 ? 0 : idx + 1;
  }
  if (nextIndex >= sequence.length) {
    return { success: false, end: true, message: "Essa demanda já chegou ao final do fluxo." };
  }

  const { data: currentDemand } = await supabase
    .from("demands")
    .select("assigned_to")
    .eq("id", demandId)
    .maybeSingle();
  const previousAssignee = (currentDemand as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];
  const stageExtras = currentFunctionKey === "captar" ? captarExtras : await fetchExtraAssignees(demandId);
  const executors = await collectStageExecutors(
    tenantId,
    demandId,
    currentFunctionKey,
    previousAssignee,
    stageExtras,
  );

  const resolved = await resolveNextStage(
    tenantId,
    sequence as any,
    nextIndex,
    executors,
  );
  if (!resolved) {
    return { success: false, end: true, message: "Essa demanda já chegou ao final do fluxo." };
  }
  const nextFn = resolved.fn;
  const skipped = resolved.skipped;
  const skipMeta = skipped.length > 0 ? { skipped } : undefined;
  const skipNote = skipped.length > 0 ? " (revisão dispensada: mesma pessoa executou)" : "";

  // Entrada em "Aguardando clientes": dono da espera sempre vem da função atribuída.
  if (nextFn.function_key === "aguardando_cliente") {
    const keepAssignee = await resolveClientWaitOwner(tenantId, previousAssignee);
    if (!keepAssignee) {
      return { success: false, message: 'Nenhum colaborador possui a função "Aguardando cliente" habilitada.' };
    }
    const waitPayload: any = {
      assigned_to: keepAssignee,
      current_function_key: nextFn.function_key,
      client_wait_started_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase
      .from("demands")
      .update(waitPayload)
      .eq("id", demandId);
    if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "proceeded",
      fromUserId: previousAssignee,
      toUserId: keepAssignee,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: nextFn.function_key,
      metadata: skipMeta as any,
    });
    await recordClientSend(tenantId, demandId, currentFunctionKey || null, keepAssignee);
    await recordStageTouchpoint(tenantId, demandId, nextFn.function_key);
    // Registra a entrega da etapa que enviou ao cliente (impede regressão para ela).
    await recordStageDeliveries(tenantId, demandId, currentFunctionKey || null, [
      previousAssignee,
      ...stageExtras,
    ]);

    return {
      success: true,
      assignedTo: keepAssignee || undefined,
      assignedName: "mesmo responsável",
      functionKey: nextFn.function_key,
      functionName: nextFn.name,
      message: `Demanda marcada como enviada — aguardando retorno do cliente.${skipNote}`,
    };
  }

  const picked = resolved.picked;
  if (!picked || !picked.success || !picked.userId) {
    return { success: false, message: picked?.message || "Não foi possível escolher colaborador." };
  }

  const proceedPayload: any = { assigned_to: picked.userId, current_function_key: nextFn.function_key };

  if (currentFunctionKey === "aguardando_cliente" && nextFn.function_key !== "enviar_cliente") {
    proceedPayload.client_wait_started_at = null;
    proceedPayload.client_resend_count = 0;
    proceedPayload.client_last_resend_at = null;
    await applyReturnFromClientSchedule(proceedPayload, tenantId, demandId, nextFn.function_key, typeKey);
  }
  if (currentFunctionKey === "captar") {
    proceedPayload.additional_assignees = [];
  }
  const { error: upErr } = await supabase
    .from("demands")
    .update(proceedPayload)
    .eq("id", demandId);
  if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };

  if (currentFunctionKey === "captar" && captarExtras.length > 0) {
    await recordFlowHistoryForUsers(
      { tenantId, demandId, action: "proceeded", toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: nextFn.function_key, metadata: skipMeta as any },
      [previousAssignee, ...captarExtras],
    );
  } else {
    // Último captador de uma captação com entregas parciais anteriores: registra também sua entrega.
    if (currentFunctionKey === "captar" && previousAssignee && await hadPriorCaptarPartialDelivery(tenantId, demandId)) {
      await recordFlowHistory({
        tenantId,
        demandId,
        action: "partial_delivered",
        fromUserId: previousAssignee,
        toUserId: previousAssignee,
        fromFunctionKey: "captar",
        toFunctionKey: "captar",
        metadata: { final_of_capture: true } as any,
      });
    }
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "proceeded",
      fromUserId: previousAssignee,
      toUserId: picked.userId,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: nextFn.function_key,
      metadata: skipMeta as any,
    });
  }

  await recordStageDeliveries(tenantId, demandId, currentFunctionKey || null, [previousAssignee, ...stageExtras]);
  await recordStageTouchpoint(tenantId, demandId, nextFn.function_key);

  const samePerson = picked.userId === previousAssignee;
  return {
    success: true,
    assignedTo: picked.userId,
    assignedName: picked.name,
    functionKey: nextFn.function_key,
    functionName: nextFn.name,
    message: samePerson
      ? `Demanda avançou para ${nextFn.name} e continua com ${picked.name}.${skipNote}`
      : `Demanda enviada para ${picked.name} na função ${nextFn.name}.${skipNote}`,
  };


}

/**
 * Volta a demanda para a etapa anterior do fluxo configurado. Reatribui para um
 * colaborador dessa função (menor carga). Não altera `status_id`.
 */
export async function regressDemand({
  demandId,
  tenantId,
  demandTypeKey,
  currentFunctionKey,
  targetFunctionKey,
}: ProceedInput & { targetFunctionKey?: string | null }): Promise<ProceedResult> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey) {
    return { success: false, needsTypeKey: true, message: "Defina o tipo da demanda antes de voltar." };
  }
  currentFunctionKey = await resolveCurrentStage(demandId, currentFunctionKey);
  if (!currentFunctionKey) {
    return { success: false, message: "Esta demanda ainda não iniciou o fluxo." };
  }
  const sequence = await getPipelineSequence(tenantId, typeKey, { demandId });

  const idx = sequence.findIndex((f: any) => f.function_key === currentFunctionKey);
  if (idx <= 0) {
    return { success: false, message: "Esta demanda já está na primeira etapa do fluxo." };
  }
  let prevFn = sequence[idx - 1] as { function_key: string; name: string };
  if (targetFunctionKey) {
    const chosen = sequence
      .slice(0, idx)
      .find((f: any) => f.function_key === targetFunctionKey) as any;
    if (!chosen) {
      return { success: false, message: "Etapa anterior inválida para este fluxo." };
    }
    prevFn = chosen;
  }

  // Transição especial: aguardando_cliente → enviar_cliente escolhe alguém com
  // a função de envio; o responsável da espera pode não executar o reenvio.
  if (currentFunctionKey === "aguardando_cliente" && prevFn.function_key === "enviar_cliente") {
    const { data: current } = await supabase
      .from("demands")
      .select("assigned_to, client_resend_count")
      .eq("id", demandId)
      .maybeSingle();
    const waitAssignee = (current as any)?.assigned_to || null;
    const picked = await pickAssigneeForFunction(tenantId, "enviar_cliente", prevFn.name, {
      preferUserIds: waitAssignee ? [waitAssignee] : [],
    });
    if (!picked.success || !picked.userId) {
      return { success: false, message: picked.message || 'Nenhum colaborador possui a função "Enviar cliente" habilitada.' };
    }
    const prevCount = (current as any)?.client_resend_count || 0;
    const { error: upErr } = await supabase
      .from("demands")
      .update({
        assigned_to: picked.userId,
        current_function_key: prevFn.function_key,
        client_resend_count: prevCount + 1,
        client_last_resend_at: new Date().toISOString(),
        client_wait_started_at: null,
      } as any)
      .eq("id", demandId);
    if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "moved_back",
      fromUserId: waitAssignee,
      toUserId: picked.userId,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: prevFn.function_key,
    });
    return {
      success: true,
      assignedTo: picked.userId,
      assignedName: picked.name,
      functionKey: prevFn.function_key,
      functionName: prevFn.name,
      message: `Demanda devolvida para "Enviar cliente" com ${picked.name}.`,
    };
  }

  const { data: currentDemand } = await supabase
    .from("demands")
    .select("assigned_to")
    .eq("id", demandId)
    .maybeSingle();
  const previousAssignee = (currentDemand as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];

  // Ao voltar, o responsável natural é quem já executou aquela etapa.
  let picked = await (async (): Promise<PickAssigneeResult> => {
    const completions = await getStageCompletions(tenantId, demandId);
    const historic = lastUserOfStage(completions, prevFn.function_key);
    if (historic) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", historic)
        .maybeSingle();
      return { success: true, userId: historic, name: (prof as any)?.full_name || "Colaborador" };
    }
    return pickAssigneeForFunction(tenantId, prevFn.function_key, prevFn.name);
  })();
  if (!picked.success || !picked.userId) {
    return { success: false, message: picked.message || "Não foi possível escolher colaborador." };
  }
  const regressPayload: any = { assigned_to: picked.userId, current_function_key: prevFn.function_key };
  if (currentFunctionKey === "aguardando_cliente" && prevFn.function_key !== "enviar_cliente") {
    regressPayload.client_wait_started_at = null;
    regressPayload.client_resend_count = 0;
    regressPayload.client_last_resend_at = null;
    await applyReturnFromClientSchedule(regressPayload, tenantId, demandId, prevFn.function_key, typeKey);
  }
  if (currentFunctionKey === "captar") {
    regressPayload.additional_assignees = [];
  }
  const { error: upErr } = await supabase
    .from("demands")
    .update(regressPayload)
    .eq("id", demandId);
  if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
  if (currentFunctionKey === "captar" && captarExtras.length > 0) {
    await recordFlowHistoryForUsers(
      { tenantId, demandId, action: "moved_back", toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: prevFn.function_key },
      [previousAssignee, ...captarExtras],
    );
  } else {
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "moved_back",
      fromUserId: previousAssignee,
      toUserId: picked.userId,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: prevFn.function_key,
    });
  }
  return {
    success: true,
    assignedTo: picked.userId,
    assignedName: picked.name,
    functionKey: prevFn.function_key,
    functionName: prevFn.name,
    message: `Demanda devolvida para ${picked.name} na função ${prevFn.name}.`,
  };

}

/**
 * Checks whether `currentFunctionKey` is the LAST required function of the flow
 * for the given demand type. Returns false when data is missing (safe default:
 * keeps showing "Prosseguir").
 */
export async function isAtLastFlowFunction(
  tenantId: string,
  demandTypeKey?: string | null,
  currentFunctionKey?: string | null,
  opts?: SequenceOptions,
): Promise<boolean> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey || !currentFunctionKey) return false;
  const sequence = await getPipelineSequence(tenantId, typeKey, opts);
  if (sequence.length === 0) return false;
  return sequence[sequence.length - 1].function_key === currentFunctionKey;
}


export interface ResolveInitialFunctionResult {
  success: boolean;
  message?: string;
  functionKey?: string | null;
  /** true quando devemos atualizar `current_function_key` no card. */
  shouldUpdate: boolean;
}

/**
 * Resolve a etapa inicial (ou a etapa corrente ajustada) para um tipo de demanda.
 * Regras:
 *  - Se `currentFunctionKey` estiver vazio → devolve a primeira função obrigatória.
 *  - Se existir e ainda estiver no fluxo do novo tipo → mantém (shouldUpdate=false).
 *  - Se existir mas não estiver no fluxo novo → substitui pela primeira função obrigatória.
 *  - Se o tipo não tem funções required configuradas → erro claro, shouldUpdate=false.
 */
export async function resolveInitialFunctionKey(
  tenantId: string,
  demandTypeKey?: string | null,
  currentFunctionKey?: string | null,
  opts?: SequenceOptions,
): Promise<ResolveInitialFunctionResult> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey) {
    return { success: false, shouldUpdate: false, message: "Tipo de demanda inválido." };
  }
  const sequence = await getPipelineSequence(tenantId, typeKey, opts);

  if (sequence.length === 0) {
    return {
      success: false,
      shouldUpdate: false,
      message: "Este tipo ainda não possui fluxo configurado. Configure as etapas antes de usar.",
    };
  }
  const first = sequence[0].function_key as string;
  if (!currentFunctionKey) {
    return { success: true, shouldUpdate: true, functionKey: first };
  }
  const stillValid = sequence.some((f: any) => f.function_key === currentFunctionKey);
  if (stillValid) {
    return { success: true, shouldUpdate: false, functionKey: currentFunctionKey };
  }
  return { success: true, shouldUpdate: true, functionKey: first };
}

export interface DeliverResult {
  success: boolean;
  message: string;
  statusId?: string;
  statusName?: string;
}

/**
 * Ação "Entregar" — move a demanda para o status final ("Feito"/"Feitos") do
 * pipeline dela e limpa `current_function_key`. Não altera `assigned_to`.
 */
export async function deliverDemand(
  demandId: string,
  pipelineId: string,
): Promise<DeliverResult> {
  const { data: statuses, error: sErr } = await supabase
    .from("pipeline_statuses")
    .select("id, name")
    .eq("pipeline_id", pipelineId);
  if (sErr) return { success: false, message: "Erro ao carregar status do pipeline." };
  const done = (statuses || []).find((s: any) => {
    const n = String(s.name || "").trim().toLowerCase();
    return n === "feito" || n === "feitos";
  });
  if (!done) {
    return {
      success: false,
      message: 'Não foi encontrado um status final "Feito" neste pipeline.',
    };
  }
  const { data: currentDemand } = await supabase
    .from("demands")
    .select("tenant_id, assigned_to, current_function_key, additional_assignees")
    .eq("id", demandId)
    .maybeSingle() as { data: any | null };

  const extras: string[] = Array.isArray((currentDemand as any)?.additional_assignees)
    ? ((currentDemand as any).additional_assignees.filter(Boolean) as string[])
    : [];

  const { error: uErr } = await supabase
    .from("demands")
    .update({
      status_id: done.id,
      current_function_key: null,
      assigned_to: null,
      additional_assignees: [],
      archived_at: new Date().toISOString(),
    } as any)
    .eq("id", demandId);
  if (uErr) return { success: false, message: "Erro ao entregar a demanda." };

  if (currentDemand?.tenant_id) {
    const primary = (currentDemand as any).assigned_to ?? null;
    if (extras.length > 0) {
      await recordFlowHistoryForUsers(
        {
          tenantId: currentDemand.tenant_id as string,
          demandId,
          action: "delivered",
          toUserId: null,
          fromFunctionKey: (currentDemand as any).current_function_key ?? null,
          toFunctionKey: null,
        },
        [primary, ...extras],
      );
    } else {
      await recordFlowHistory({
        tenantId: currentDemand.tenant_id as string,
        demandId,
        action: "delivered",
        fromUserId: primary,
        toUserId: null,
        fromFunctionKey: (currentDemand as any).current_function_key ?? null,
        toFunctionKey: null,
      });
    }
    await recordStageDeliveries(
      currentDemand.tenant_id as string,
      demandId,
      (currentDemand as any).current_function_key ?? null,
      [primary, ...extras],
    );
  }
  return {
    success: true,
    statusId: done.id,
    statusName: done.name,
    message: "Demanda entregue e movida para Demandas Completas.",
  };
}

/**
 * "Entregar minha parte" para cards de Captar com múltiplos responsáveis.
 * Remove o usuário atual da lista de responsáveis e registra `partial_delivered`
 * no histórico. Quando resta apenas um responsável, mantém o card com esse
 * responsável (o próximo `proceedDemand` faz a transição para a próxima etapa).
 * Se o usuário for o `assigned_to` principal, promove um dos `additional_assignees`.
 */
export interface PartialDeliverResult {
  success: boolean;
  message: string;
  removed?: boolean;
  becamePrimary?: string | null;
  remainingCount?: number;
}

export async function deliverMyPart(
  demandId: string,
  userId: string,
): Promise<PartialDeliverResult> {
  const { data: cur } = await supabase
    .from("demands")
    .select("tenant_id, assigned_to, additional_assignees, current_function_key")
    .eq("id", demandId)
    .maybeSingle() as { data: any | null };
  if (!cur) return { success: false, message: "Demanda não encontrada." };
  if ((cur.current_function_key || "") !== "captar") {
    return { success: false, message: "Ação disponível apenas para cards em Captar." };
  }
  const primary: string | null = cur.assigned_to || null;
  const extras: string[] = Array.isArray(cur.additional_assignees)
    ? (cur.additional_assignees.filter(Boolean) as string[])
    : [];
  const allSet = new Set<string>([...(primary ? [primary] : []), ...extras]);
  if (!allSet.has(userId)) {
    return { success: false, message: "Você não é responsável por este card." };
  }
  if (allSet.size <= 1) {
    return { success: false, message: "Apenas um responsável — use Prosseguir para entregar o card." };
  }

  let newPrimary = primary;
  let newExtras = [...extras];
  if (primary === userId) {
    // promove o primeiro extra a responsável principal
    newPrimary = newExtras.shift() || null;
  } else {
    newExtras = newExtras.filter((u) => u !== userId);
  }

  const { error } = await supabase
    .from("demands")
    .update({ assigned_to: newPrimary, additional_assignees: newExtras } as any)
    .eq("id", demandId);
  if (error) return { success: false, message: "Erro ao remover você do card." };

  await recordFlowHistory({
    tenantId: cur.tenant_id as string,
    demandId,
    action: "partial_delivered",
    fromUserId: userId,
    toUserId: newPrimary,
    fromFunctionKey: "captar",
    toFunctionKey: "captar",
    metadata: { remaining_count: (newPrimary ? 1 : 0) + newExtras.length },
  });

  return {
    success: true,
    removed: true,
    becamePrimary: newPrimary,
    remainingCount: (newPrimary ? 1 : 0) + newExtras.length,
    message: "Sua parte foi entregue. O card continua com os demais responsáveis.",
  };
}



export interface RegressOption {
  functionKey: string;
  functionName: string;
  /** Último responsável conhecido daquela etapa (histórico). */
  lastUserId: string | null;
  lastUserName: string | null;
  lastAt: string | null;
  /** true quando a etapa já foi concluída/entregue por alguém. */
  completed: boolean;
  /** true quando é a sugestão padrão do botão Voltar. */
  suggested: boolean;
}

/**
 * Opções de "Voltar demanda": todas as etapas anteriores do fluxo, com quem as
 * executou. A sugestão padrão é a última etapa anterior **ainda não entregue**;
 * se todas já foram entregues, sugere a imediatamente anterior.
 */
export async function getRegressOptions(
  tenantId: string,
  demandId: string,
  demandTypeKey?: string | null,
  currentFunctionKey?: string | null,
): Promise<RegressOption[]> {
  const seq = await getPipelineSequence(tenantId, demandTypeKey, { demandId });
  if (seq.length === 0) return [];
  const curKey = await resolveCurrentStage(demandId, currentFunctionKey);
  const idx = seq.findIndex((f) => f.function_key === curKey);
  if (idx <= 0) return [];
  const previous = seq.slice(0, idx);

  const completions = await getStageCompletions(tenantId, demandId);
  const userIds = Array.from(
    new Set(previous.map((f) => lastUserOfStage(completions, f.function_key)).filter(Boolean) as string[]),
  );
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    (data as any[] | null)?.forEach((p) => nameById.set(p.id, p.full_name || "Colaborador"));
  }

  const pendingIdx = [...previous]
    .map((f, i) => ({ f, i }))
    .reverse()
    .find(({ f }) => !completions.has(f.function_key))?.i;
  const suggestedIdx = pendingIdx ?? previous.length - 1;

  return previous.map((f, i) => {
    const uid = lastUserOfStage(completions, f.function_key);
    return {
      functionKey: f.function_key,
      functionName: f.name,
      lastUserId: uid,
      lastUserName: uid ? nameById.get(uid) || "Colaborador" : null,
      lastAt: completions.get(f.function_key)?.lastAt ?? null,
      completed: completions.has(f.function_key),
      suggested: i === suggestedIdx,
    };
  });
}
