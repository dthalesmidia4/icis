import { supabase } from "@/integrations/supabase/client";
import { normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";

/**
 * Etapas voltadas ao cliente que exigem atribuição explícita de função.
 * Ficar em "Aguardando cliente"/"Enviar cliente" não pode ser resultado de uma
 * reatribuição manual para quem não tem a função habilitada.
 */
export const CLIENT_STAGE_KEYS = ["aguardando_cliente", "enviar_cliente", "entregar_cliente"] as const;

export function isClientStageKey(key?: string | null): boolean {
  if (!key) return false;
  return (CLIENT_STAGE_KEYS as readonly string[]).includes(key.toLowerCase().trim());
}

/**
 * Colaboradores com a função habilitada (allowed = true) NA ÁREA informada.
 * Chaves homônimas (`revisar`, `aguardando_cliente`) existem em Mídia e em
 * Sistemas: sem o filtro de área, um revisor de Sistemas era considerado
 * elegível para cards de Mídia.
 */
export async function fetchAllowedUsersForFunction(
  tenantId: string,
  functionKey: string,
  workArea?: WorkArea | string | null,
): Promise<Set<string>> {
  const area = normalizeWorkArea(typeof workArea === "string" ? workArea : workArea ?? undefined);
  const { data } = await (supabase
    .from("collaborator_function_assignments") as any)
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("function_key", functionKey)
    .eq("work_area", area)
    .eq("allowed", true);
  return new Set(((data || []) as any[]).map((r) => r.user_id).filter(Boolean));
}

export async function userHasFunction(
  tenantId: string,
  userId: string,
  functionKey: string,
  workArea?: WorkArea | string | null,
): Promise<boolean> {
  const area = normalizeWorkArea(typeof workArea === "string" ? workArea : workArea ?? undefined);
  const { data } = await (supabase
    .from("collaborator_function_assignments") as any)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("function_key", functionKey)
    .eq("work_area", area)
    .eq("allowed", true)
    .maybeSingle();
  return !!data;
}
