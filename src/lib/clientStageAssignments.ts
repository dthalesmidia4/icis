import { supabase } from "@/integrations/supabase/client";

/**
 * Etapas voltadas ao cliente que exigem atribuição explícita de função.
 * Ficar em "Aguardando cliente"/"Enviar cliente" não pode ser resultado de uma
 * reatribuição manual para quem não tem a função habilitada.
 */
export const CLIENT_STAGE_KEYS = ["aguardando_cliente", "enviar_cliente"] as const;

export function isClientStageKey(key?: string | null): boolean {
  if (!key) return false;
  return (CLIENT_STAGE_KEYS as readonly string[]).includes(key.toLowerCase().trim());
}

/** Colaboradores com a função habilitada (allowed = true). */
export async function fetchAllowedUsersForFunction(
  tenantId: string,
  functionKey: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("collaborator_function_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("function_key", functionKey)
    .eq("allowed", true);
  return new Set(((data || []) as any[]).map((r) => r.user_id).filter(Boolean));
}

export async function userHasFunction(
  tenantId: string,
  userId: string,
  functionKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("collaborator_function_assignments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("function_key", functionKey)
    .eq("allowed", true)
    .maybeSingle();
  return !!data;
}
