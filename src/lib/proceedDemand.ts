import { supabase } from "@/integrations/supabase/client";

/**
 * Normaliza o texto livre `demand_type` da demanda para um dos keys
 * configurados em `demand_type_flow_rules`.
 */
export function normalizeDemandTypeKey(demandType?: string | null): string | null {
  if (!demandType) return null;
  const t = demandType.toLowerCase();
  if (t.includes("anúncio") || t.includes("anuncio") || t.includes("ad ") || t.includes("ads")) return "anuncio";
  if (t.includes("carrossel") || t.includes("carousel")) return "carrossel";
  if (t.includes("captad")) return "video_captado";
  if (t.includes("gerad") && t.includes("vídeo")) return "video_gerado";
  if (t.includes("gerad") && t.includes("video")) return "video_gerado";
  if (t.includes("reel") || t.includes("tiktok") || t.includes("vídeo") || t.includes("video")) return "video_captado";
  if (t.includes("estát") || t.includes("estat") || t.includes("post") || t.includes("stories") || t.includes("imagem")) return "criativo_estatico";
  return "criativo_estatico";
}

export interface ProceedResult {
  success: boolean;
  message: string;
  assignedTo?: string;
  assignedName?: string;
  functionKey?: string;
  functionName?: string;
  end?: boolean;
}

interface ProceedInput {
  demandId: string;
  tenantId: string;
  demandType?: string | null;
  currentFunctionKey?: string | null;
}

export async function proceedDemand({
  demandId,
  tenantId,
  demandType,
  currentFunctionKey,
}: ProceedInput): Promise<ProceedResult> {
  const typeKey = normalizeDemandTypeKey(demandType);
  if (!typeKey) {
    return { success: false, message: "Tipo de demanda não identificado. Defina o tipo antes de prosseguir." };
  }

  // Load flow functions (order) + rules for this demand type
  const [{ data: fns, error: fnErr }, { data: rules, error: rErr }] = await Promise.all([
    supabase.from("flow_functions").select("function_key, name, position, active").eq("tenant_id", tenantId).eq("active", true).order("position"),
    supabase.from("demand_type_flow_rules").select("function_key, requirement").eq("tenant_id", tenantId).eq("demand_type_key", typeKey),
  ]);
  if (fnErr || rErr) return { success: false, message: "Erro ao carregar fluxo configurado." };
  if (!fns || fns.length === 0) return { success: false, message: "Nenhuma função de fluxo configurada." };

  const req = new Map<string, string>();
  (rules || []).forEach((r: any) => req.set(r.function_key, r.requirement));

  // Sequence: only functions that participate (required)
  const sequence = fns.filter((f: any) => req.get(f.function_key) === "required");
  if (sequence.length === 0) return { success: false, message: "Este tipo de demanda não tem funções configuradas." };

  // Determine next
  let nextIndex = 0;
  if (currentFunctionKey) {
    const idx = sequence.findIndex((f: any) => f.function_key === currentFunctionKey);
    nextIndex = idx === -1 ? 0 : idx + 1;
  }
  if (nextIndex >= sequence.length) {
    return { success: false, end: true, message: "Essa demanda já chegou ao final do fluxo." };
  }
  const nextFn = sequence[nextIndex] as { function_key: string; name: string };

  // Find collaborators with this function
  const { data: assigns, error: aErr } = await supabase
    .from("collaborator_function_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("function_key", nextFn.function_key)
    .eq("allowed", true);
  if (aErr) return { success: false, message: "Erro ao buscar colaboradores." };
  const candidateIds = Array.from(new Set((assigns || []).map((a: any) => a.user_id))).filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: false, message: `Nenhum colaborador tem a função "${nextFn.name}" atribuída.` };
  }

  // Restrict to internal tenant roles (agency_*)
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("user_id", candidateIds)
    .in("role", ["agency_admin", "agency_manager", "agency_user"]);
  const internalIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
  if (internalIds.length === 0) {
    return { success: false, message: `Nenhum colaborador interno com a função "${nextFn.name}".` };
  }

  // Profiles + active demand counts
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
  const chosenName = profileById.get(chosen) || "Colaborador";

  const { error: upErr } = await supabase
    .from("demands")
    .update({ assigned_to: chosen, current_function_key: nextFn.function_key } as any)
    .eq("id", demandId);
  if (upErr) return { success: false, message: "Erro ao atualizar a demanda." };

  return {
    success: true,
    assignedTo: chosen,
    assignedName: chosenName,
    functionKey: nextFn.function_key,
    functionName: nextFn.name,
    message: `Demanda enviada para ${chosenName} na função ${nextFn.name}.`,
  };
}
