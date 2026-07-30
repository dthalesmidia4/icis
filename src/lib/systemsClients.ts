import { supabase } from "@/integrations/supabase/client";

export type SystemsClientStatus = "ativo" | "pausado" | "cancelado";

export interface SystemsClient {
  id: string;
  tenant_id: string;
  parent_company_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  plan: string | null;
  notes: string | null;
  contact_cadence_days: number;
  status: SystemsClientStatus;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemsCompany {
  id: string;
  name: string;
  fantasy_name: string | null;
}

export const STATUS_LABEL: Record<SystemsClientStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

/** Empresas da área Sistemas (ex.: SmartVety) — donas dos clientes de sistemas. */
export async function loadSystemsCompanies(tenantId: string): Promise<SystemsCompany[]> {
  const { data, error } = await supabase
    .from("tenant_companies")
    .select("id, name, fantasy_name")
    .eq("tenant_id", tenantId)
    .eq("default_work_area", "sistemas")
    .order("name");
  if (error) throw error;
  return (data || []) as SystemsCompany[];
}

export async function loadSystemsClients(
  tenantId: string,
  parentCompanyId?: string | null,
): Promise<SystemsClient[]> {
  let query = supabase
    .from("systems_clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (parentCompanyId) query = query.eq("parent_company_id", parentCompanyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SystemsClient[];
}

export async function saveSystemsClient(payload: {
  id?: string;
  tenantId: string;
  parentCompanyId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  plan?: string | null;
  notes?: string | null;
  contactCadenceDays?: number;
  status?: SystemsClientStatus;
  onboardedAt?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const row: Record<string, unknown> = {
    tenant_id: payload.tenantId,
    parent_company_id: payload.parentCompanyId,
    name: payload.name.trim(),
    contact_name: payload.contactName?.trim() || null,
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    plan: payload.plan?.trim() || null,
    notes: payload.notes?.trim() || null,
    contact_cadence_days: payload.contactCadenceDays ?? 30,
    status: payload.status ?? "ativo",
    onboarded_at: payload.onboardedAt || null,
  };

  if (payload.id) {
    const { error } = await supabase.from("systems_clients").update(row as any).eq("id", payload.id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  }

  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("systems_clients")
    .insert({ ...row, created_by: auth?.user?.id ?? null } as any);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteSystemsClient(id: string): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase.from("systems_clients").delete().eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
