import { supabase } from "@/integrations/supabase/client";
import { recordFlowHistory } from "@/lib/flowHistory";

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
  if (raw.includes("+")) return null;

  const l = raw.toLowerCase();
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
      .update({ current_function_key: nextFn.function_key } as any)
      .eq("id", demandId);
    if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
    return {
      success: true,
      assignedTo: keepAssignee || undefined,
      assignedName: "mesmo responsável",
      functionKey: nextFn.function_key,
      functionName: nextFn.name,
      message: `Demanda marcada como enviada — aguardando retorno do cliente.`,
    };
  }

  const picked = await pickAssigneeForFunction(tenantId, nextFn.function_key, nextFn.name);
  if (!picked.success || !picked.userId) {
    return { success: false, message: picked.message || "Não foi possível escolher colaborador." };
  }

  const { error: upErr } = await supabase
    .from("demands")
    .update({ assigned_to: picked.userId, current_function_key: nextFn.function_key } as any)
    .eq("id", demandId);
  if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };

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
      .select("assigned_to")
      .eq("id", demandId)
      .maybeSingle();
    const keepAssignee = (current as any)?.assigned_to || null;
    const { error: upErr } = await supabase
      .from("demands")
      .update({ current_function_key: prevFn.function_key } as any)
      .eq("id", demandId);
    if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
    return {
      success: true,
      assignedTo: keepAssignee || undefined,
      assignedName: "mesmo responsável",
      functionKey: prevFn.function_key,
      functionName: prevFn.name,
      message: `Demanda devolvida para "Enviar cliente" com o mesmo responsável.`,
    };
  }

  const picked = await pickAssigneeForFunction(tenantId, prevFn.function_key, prevFn.name);
  if (!picked.success || !picked.userId) {
    return { success: false, message: picked.message || "Não foi possível escolher colaborador." };
  }
  const { error: upErr } = await supabase
    .from("demands")
    .update({ assigned_to: picked.userId, current_function_key: prevFn.function_key } as any)
    .eq("id", demandId);
  if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };
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
  const { error: uErr } = await supabase
    .from("demands")
    .update({
      status_id: done.id,
      current_function_key: null,
      assigned_to: null,
      archived_at: new Date().toISOString(),
    } as any)
    .eq("id", demandId);
  if (uErr) return { success: false, message: "Erro ao entregar a demanda." };
  return {
    success: true,
    statusId: done.id,
    statusName: done.name,
    message: "Demanda entregue e movida para Demandas Completas.",
  };
}

