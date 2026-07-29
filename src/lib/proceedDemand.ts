import { supabase } from "@/integrations/supabase/client";
import { recordFlowHistory, recordFlowHistoryForUsers } from "@/lib/flowHistory";

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
export type DemandTypeKey =
  | "criativo_estatico"
  | "carrossel"
  | "video_captado"
  | "video_gerado"
  | "outro";

export const OFFICIAL_DEMAND_TYPES: { key: DemandTypeKey; label: string }[] = [
  { key: "criativo_estatico", label: "Criativo estático" },
  { key: "carrossel", label: "Carrossel" },
  { key: "video_captado", label: "Vídeo captado" },
  { key: "video_gerado", label: "Vídeo gerado" },
  { key: "outro", label: "Outro" },
];

export const DEMAND_TYPE_LABEL: Record<DemandTypeKey, string> = {
  criativo_estatico: "Criativo estático",
  carrossel: "Carrossel",
  video_captado: "Vídeo captado",
  video_gerado: "Vídeo gerado",
  outro: "Outro",
};

/**
 * Normaliza texto livre de tipo (vindo da IA/usuário) para uma das 4 keys
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

/** Aceita apenas uma das 4 keys oficiais; caso contrário retorna null. */
export function coerceDemandTypeKey(value?: string | null): DemandTypeKey | null {
  if (!value) return null;
  const v = String(value).trim() as DemandTypeKey;
  if (
    v === "criativo_estatico" ||
    v === "carrossel" ||
    v === "video_captado" ||
    v === "video_gerado" ||
    v === "outro"
  ) {
    return v;
  }
  return null;
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
  const internalIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
  if (internalIds.length === 0) {
    return { success: false, message: `Nenhum colaborador interno com a função "${label}".` };
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
 * Devolve a sequência ordenada de funções obrigatórias para um `demand_type_key`.
 */
export async function getPipelineSequence(
  tenantId: string,
  demandTypeKey?: string | null,
): Promise<{ function_key: string; name: string }[]> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey || !tenantId) return [];
  const [{ data: fns }, { data: rules }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, name, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
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
  const seq = await getPipelineSequence(tenantId, demandTypeKey);
  const target = seq.find((f) => f.function_key === targetFunctionKey);
  if (!target) return { success: false, message: "Etapa não encontrada no fluxo." };

  if (currentFunctionKey === "enviar_cliente" && target.function_key === "aguardando_cliente") {
    const { data: cur } = await supabase.from("demands").select("assigned_to").eq("id", demandId).maybeSingle();
    const keep = (cur as any)?.assigned_to || null;
    const { error } = await supabase.from("demands").update({ current_function_key: target.function_key, client_wait_started_at: new Date().toISOString() } as any).eq("id", demandId);
    if (error) return { success: false, message: "Erro ao atualizar etapa." };
    await recordFlowHistory({ tenantId, demandId, action: "proceeded", fromUserId: keep, toUserId: keep, fromFunctionKey: currentFunctionKey || null, toFunctionKey: target.function_key });
    return { success: true, assignedTo: keep || undefined, functionKey: target.function_key, functionName: target.name, message: `Demanda movida para ${target.name}.` };
  }

  const picked = await pickAssigneeForFunction(tenantId, target.function_key, target.name);
  if (!picked.success || !picked.userId) return { success: false, message: picked.message || "Nenhum responsável para a etapa." };

  const { data: cur } = await supabase.from("demands").select("assigned_to").eq("id", demandId).maybeSingle();
  const prevUser = (cur as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];

  const updatePayload: any = { assigned_to: picked.userId, current_function_key: target.function_key };
  if (currentFunctionKey === "aguardando_cliente" && target.function_key !== "enviar_cliente") {
    updatePayload.client_wait_started_at = null;
    updatePayload.client_resend_count = 0;
    updatePayload.client_last_resend_at = null;
  }
  if (currentFunctionKey === "captar") {
    updatePayload.additional_assignees = [];
  }
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
    await recordFlowHistory({ tenantId, demandId, action: "proceeded", fromUserId: prevUser, toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: target.function_key });
  }
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

  const [{ data: fns, error: fnErr }, { data: rules, error: rErr }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, name, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("position"),
    supabase
      .from("demand_type_flow_rules")
      .select("function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("demand_type_key", typeKey),
  ]);
  if (fnErr || rErr) return { success: false, message: "Erro ao carregar fluxo configurado." };
  if (!fns || fns.length === 0) return { success: false, message: "Nenhuma função de fluxo configurada." };

  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));

  const sequence = fns.filter((f: any) => req.get(f.function_key) === "required");
  if (sequence.length === 0) return { success: false, message: "Este tipo de demanda não tem funções configuradas." };

  let nextIndex = 0;
  if (currentFunctionKey) {
    const idx = sequence.findIndex((f: any) => f.function_key === currentFunctionKey);
    nextIndex = idx === -1 ? 0 : idx + 1;
  }
  if (nextIndex >= sequence.length) {
    return { success: false, end: true, message: "Essa demanda já chegou ao final do fluxo." };
  }
  const nextFn = sequence[nextIndex] as { function_key: string; name: string };

  // Transição especial: enviar_cliente → aguardando_cliente mantém o mesmo responsável.
  if (currentFunctionKey === "enviar_cliente" && nextFn.function_key === "aguardando_cliente") {
    const { data: current } = await supabase
      .from("demands")
      .select("assigned_to")
      .eq("id", demandId)
      .maybeSingle();
    const keepAssignee = (current as any)?.assigned_to || null;
    const { error: upErr } = await supabase
      .from("demands")
      .update({ current_function_key: nextFn.function_key, client_wait_started_at: new Date().toISOString() } as any)
      .eq("id", demandId);
    if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "proceeded",
      fromUserId: keepAssignee,
      toUserId: keepAssignee,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: nextFn.function_key,
    });
    return {
      success: true,
      assignedTo: keepAssignee || undefined,
      assignedName: "mesmo responsável",
      functionKey: nextFn.function_key,
      functionName: nextFn.name,
      message: `Demanda marcada como enviada — aguardando retorno do cliente.`,
    };
  }

  const { data: currentDemand } = await supabase
    .from("demands")
    .select("assigned_to")
    .eq("id", demandId)
    .maybeSingle();
  const previousAssignee = (currentDemand as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];

  const picked = await pickAssigneeForFunction(tenantId, nextFn.function_key, nextFn.name);
  if (!picked.success || !picked.userId) {
    return { success: false, message: picked.message || "Não foi possível escolher colaborador." };
  }

  const proceedPayload: any = { assigned_to: picked.userId, current_function_key: nextFn.function_key };
  if (currentFunctionKey === "aguardando_cliente" && nextFn.function_key !== "enviar_cliente") {
    proceedPayload.client_wait_started_at = null;
    proceedPayload.client_resend_count = 0;
    proceedPayload.client_last_resend_at = null;
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
      { tenantId, demandId, action: "proceeded", toUserId: picked.userId, fromFunctionKey: currentFunctionKey || null, toFunctionKey: nextFn.function_key },
      [previousAssignee, ...captarExtras],
    );
  } else {
    await recordFlowHistory({
      tenantId,
      demandId,
      action: "proceeded",
      fromUserId: previousAssignee,
      toUserId: picked.userId,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: nextFn.function_key,
    });
  }

  return {
    success: true,
    assignedTo: picked.userId,
    assignedName: picked.name,
    functionKey: nextFn.function_key,
    functionName: nextFn.name,
    message: `Demanda enviada para ${picked.name} na função ${nextFn.name}.`,
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
}: ProceedInput): Promise<ProceedResult> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey) {
    return { success: false, needsTypeKey: true, message: "Defina o tipo da demanda antes de voltar." };
  }
  if (!currentFunctionKey) {
    return { success: false, message: "Esta demanda ainda não iniciou o fluxo." };
  }
  const [{ data: fns, error: fnErr }, { data: rules, error: rErr }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, name, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("position"),
    supabase
      .from("demand_type_flow_rules")
      .select("function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("demand_type_key", typeKey),
  ]);
  if (fnErr || rErr) return { success: false, message: "Erro ao carregar fluxo configurado." };
  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));
  const sequence = (fns || []).filter((f: any) => req.get(f.function_key) === "required");
  const idx = sequence.findIndex((f: any) => f.function_key === currentFunctionKey);
  if (idx <= 0) {
    return { success: false, message: "Esta demanda já está na primeira etapa do fluxo." };
  }
  const prevFn = sequence[idx - 1] as { function_key: string; name: string };

  // Transição especial: aguardando_cliente → enviar_cliente mantém o mesmo responsável.
  if (currentFunctionKey === "aguardando_cliente" && prevFn.function_key === "enviar_cliente") {
    const { data: current } = await supabase
      .from("demands")
      .select("assigned_to, client_resend_count")
      .eq("id", demandId)
      .maybeSingle();
    const keepAssignee = (current as any)?.assigned_to || null;
    const prevCount = (current as any)?.client_resend_count || 0;
    const { error: upErr } = await supabase
      .from("demands")
      .update({
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
      fromUserId: keepAssignee,
      toUserId: keepAssignee,
      fromFunctionKey: currentFunctionKey || null,
      toFunctionKey: prevFn.function_key,
    });
    return {
      success: true,
      assignedTo: keepAssignee || undefined,
      assignedName: "mesmo responsável",
      functionKey: prevFn.function_key,
      functionName: prevFn.name,
      message: `Demanda devolvida para "Enviar cliente" com o mesmo responsável.`,
    };
  }

  const { data: currentDemand } = await supabase
    .from("demands")
    .select("assigned_to")
    .eq("id", demandId)
    .maybeSingle();
  const previousAssignee = (currentDemand as any)?.assigned_to || null;
  const captarExtras = currentFunctionKey === "captar" ? await fetchCaptarExtras(demandId) : [];

  const picked = await pickAssigneeForFunction(tenantId, prevFn.function_key, prevFn.name);
  if (!picked.success || !picked.userId) {
    return { success: false, message: picked.message || "Não foi possível escolher colaborador." };
  }
  const regressPayload: any = { assigned_to: picked.userId, current_function_key: prevFn.function_key };
  if (currentFunctionKey === "aguardando_cliente" && prevFn.function_key !== "enviar_cliente") {
    regressPayload.client_wait_started_at = null;
    regressPayload.client_resend_count = 0;
    regressPayload.client_last_resend_at = null;
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
): Promise<boolean> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey || !currentFunctionKey) return false;

  const [{ data: fns }, { data: rules }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("position"),
    supabase
      .from("demand_type_flow_rules")
      .select("function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("demand_type_key", typeKey),
  ]);
  if (!fns || fns.length === 0) return false;
  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));
  const sequence = fns.filter((f: any) => req.get(f.function_key) === "required");
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
): Promise<ResolveInitialFunctionResult> {
  const typeKey = coerceDemandTypeKey(demandTypeKey);
  if (!typeKey) {
    return { success: false, shouldUpdate: false, message: "Tipo de demanda inválido." };
  }
  const [{ data: fns, error: fErr }, { data: rules, error: rErr }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("position"),
    supabase
      .from("demand_type_flow_rules")
      .select("function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("demand_type_key", typeKey),
  ]);
  if (fErr || rErr) {
    return { success: false, shouldUpdate: false, message: "Erro ao carregar fluxo configurado." };
  }
  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));
  const sequence = (fns || []).filter((f: any) => req.get(f.function_key) === "required");
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

  const wasCaptar = ((currentDemand as any)?.current_function_key || "") === "captar";
  const extras: string[] = wasCaptar && Array.isArray((currentDemand as any)?.additional_assignees)
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


