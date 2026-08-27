import { supabase } from "@/integrations/supabase/client";

export type SystemsClientStatus = "ativo" | "pausado" | "cancelado";

/** Posição da conta na jornada comercial (antes x depois da venda). */
export type SystemsLifecycle = "prospect" | "customer";

/** Etapa comercial (só faz sentido para lifecycle = prospect). */
export type CommercialStage =
  | "mapeado"
  | "contato"
  | "demonstracao"
  | "avaliacao"
  | "negociacao"
  | "ganho"
  | "perdido"
  | "pausado";

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
  /* Camada comercial */
  lifecycle: SystemsLifecycle;
  commercial_stage: CommercialStage | null;
  segment: string | null;
  current_system: string | null;
  address: string | null;
  commercial_owner_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  last_contact_result: string | null;
  loss_reason: string | null;
  lead_source: string | null;
  /** Campanha de marketing legada (retrocompatibilidade — não é fonte de verdade). */
  acquisition_campaign_id: string | null;
  /** Cidade/etapa do plano de expansão que originou a oportunidade (opcional). */
  acquisition_market_id: string | null;
  /** Cidade/carteira operacional canônica do registro (nunca derivada da aquisição). */
  market_id: string | null;
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

export const STAGE_LABEL: Record<CommercialStage, string> = {
  mapeado: "Mapeado",
  contato: "Contato",
  demonstracao: "Demonstração",
  avaliacao: "Avaliação",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
  pausado: "Pausado",
};

export const STAGE_OPTIONS: { value: CommercialStage; label: string }[] = (
  Object.keys(STAGE_LABEL) as CommercialStage[]
).map((value) => ({ value, label: STAGE_LABEL[value] }));

/** Etapas que saem da rotina comercial ativa. */
export const FINAL_STAGES: CommercialStage[] = ["ganho", "perdido", "pausado"];

export function isFinalStage(stage?: string | null): boolean {
  return !!stage && FINAL_STAGES.includes(stage as CommercialStage);
}

export function stageLabel(stage?: string | null): string {
  if (!stage) return "—";
  return STAGE_LABEL[stage as CommercialStage] || stage;
}

/** Normaliza o nome do sistema atual (sem acento, minúsculo, sem separadores). */
export function normalizeCurrentSystem(value?: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Regra derivada: importador rápido existe somente para SimplesVet. */
export function hasMigrationAvailable(currentSystem?: string | null): boolean {
  return normalizeCurrentSystem(currentSystem) === "simplesvet";
}

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

/** Clientes pós-venda (lifecycle = customer). */
export async function loadSystemsClients(
  tenantId: string,
  parentCompanyId?: string | null,
): Promise<SystemsClient[]> {
  let query = supabase
    .from("systems_clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("lifecycle", "customer")
    .order("name");
  if (parentCompanyId) query = query.eq("parent_company_id", parentCompanyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as SystemsClient[];
}

/**
 * Clientes elegíveis para NOVAS demandas: pós-venda e ativos.
 * Prospect, pausado e cancelado nunca aparecem aqui.
 */
export async function loadActiveSystemsClients(
  tenantId: string,
  parentCompanyId?: string | null,
): Promise<SystemsClient[]> {
  let query = supabase
    .from("systems_clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("lifecycle", "customer")
    .eq("status", "ativo")
    .order("name");
  if (parentCompanyId) query = query.eq("parent_company_id", parentCompanyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as SystemsClient[];
}

/**
 * Recupera registros por id independentemente de lifecycle/status (sempre dentro
 * do tenant). Usado para manter vínculos históricos visíveis em demandas antigas.
 */
export async function loadSystemsSubclientsByIds(
  tenantId: string,
  ids: string[],
): Promise<SystemsClient[]> {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("systems_clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("id", unique);
  if (error) throw error;
  return (data || []) as unknown as SystemsClient[];
}

/** Oportunidades comerciais (lifecycle = prospect). */
export async function loadSystemsProspects(
  tenantId: string,
  parentCompanyId?: string | null,
): Promise<SystemsClient[]> {
  let query = supabase
    .from("systems_clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("lifecycle", "prospect")
    .order("name");
  if (parentCompanyId) query = query.eq("parent_company_id", parentCompanyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as SystemsClient[];
}

export interface SaveSystemsClientPayload {
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
  /* Camada comercial */
  lifecycle?: SystemsLifecycle;
  commercialStage?: CommercialStage | null;
  segment?: string | null;
  currentSystem?: string | null;
  address?: string | null;
  commercialOwnerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  lastContactResult?: string | null;
  lossReason?: string | null;
  leadSource?: string | null;
  acquisitionCampaignId?: string | null;
  /** Cidade/etapa de origem (atribuição de aquisição, opcional). */
  acquisitionMarketId?: string | null;
  /** Cidade/carteira operacional; independente da aquisição. */
  marketId?: string | null;
}

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export async function saveSystemsClient(
  payload: SaveSystemsClientPayload,
): Promise<{ success: boolean; message?: string; id?: string; client?: SystemsClient }> {

  const row: Record<string, unknown> = {
    tenant_id: payload.tenantId,
    parent_company_id: payload.parentCompanyId,
    name: payload.name.trim(),
    contact_name: clean(payload.contactName),
    email: clean(payload.email),
    phone: clean(payload.phone),
    city: clean(payload.city),
    state: clean(payload.state),
    plan: clean(payload.plan),
    notes: clean(payload.notes),
    contact_cadence_days: payload.contactCadenceDays ?? 30,
    status: payload.status ?? "ativo",
    onboarded_at: payload.onboardedAt || null,
    // lifecycle é definido abaixo: no update só quando explicitamente informado.
    commercial_stage: payload.commercialStage ?? null,
    segment: clean(payload.segment),
    current_system: clean(payload.currentSystem),
    address: clean(payload.address),
    commercial_owner_id: payload.commercialOwnerId || null,
    next_action: clean(payload.nextAction),
    next_action_at: payload.nextActionAt || null,
    last_contact_result: clean(payload.lastContactResult),
    loss_reason: clean(payload.lossReason),
    lead_source: clean(payload.leadSource),
    acquisition_campaign_id: payload.acquisitionCampaignId || null,
    acquisition_market_id: payload.acquisitionMarketId || null,
  };

  // Carteira operacional: NUNCA sincronizada/derivada de acquisition_market_id.
  if (payload.marketId !== undefined) row.market_id = payload.marketId || null;


  if (payload.id) {
    // No update, lifecycle só entra quando informado — nunca converte silenciosamente.
    const updateRow = payload.lifecycle
      ? { ...row, lifecycle: payload.lifecycle }
      : row;
    const { error } = await supabase
      .from("systems_clients")
      .update(updateRow as any)
      .eq("id", payload.id);
    if (error) return { success: false, message: error.message };
    return { success: true, id: payload.id };
  }

  const { data: auth } = await supabase.auth.getUser();
  // Retorna a linha completa: a planilha insere o lead no estado local sem
  // recarregar o workspace inteiro.
  const { data, error } = await supabase
    .from("systems_clients")
    .insert({
      ...row,
      lifecycle: payload.lifecycle ?? "customer",
      created_by: auth?.user?.id ?? null,
    } as any)
    .select("*")
    .single();
  if (error) return { success: false, message: error.message };
  return {
    success: true,
    id: (data as any)?.id,
    client: data ? ((data as unknown) as SystemsClient) : undefined,
  };
}


export async function deleteSystemsClient(id: string): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase.from("systems_clients").delete().eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Ganho → customer. O MESMO registro é convertido: nada é copiado, nenhum
 * histórico de touchpoints é perdido.
 */
export async function markOpportunityWon(
  id: string,
  currentOnboardedAt?: string | null,
): Promise<{ success: boolean; message?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("systems_clients")
    .update({
      lifecycle: "customer",
      commercial_stage: "ganho",
      status: "ativo",
      onboarded_at: currentOnboardedAt || today,
      next_action: null,
      next_action_at: null,
    } as any)
    .eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Reabrir oportunidade: devolve um customer ao ciclo comercial sem apagar
 * status, onboarded_at, notas ou histórico.
 */
export async function reopenOpportunity(id: string): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from("systems_clients")
    .update({ lifecycle: "prospect", commercial_stage: "contato" } as any)
    .eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/** Atualiza apenas o resumo do resultado comercial mais recente. */
export async function updateLastContactResult(
  id: string,
  result: string,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from("systems_clients")
    .update({ last_contact_result: result } as any)
    .eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Colunas do lead liberadas para EDIÇÃO INLINE no CRM.
 * A gravação é PARCIAL: apenas as colunas informadas vão ao banco, então
 * nenhum outro campo do registro é sobrescrito.
 */
export const INLINE_CLIENT_COLUMNS = [
  "commercial_stage",
  "current_system",
  "next_action",
  "next_action_at",
  "last_contact_result",
  "commercial_owner_id",
  "market_id",
] as const;

export type InlineClientColumn = (typeof INLINE_CLIENT_COLUMNS)[number];

export async function patchSystemsClient(
  id: string,
  patch: Partial<Record<InlineClientColumn, unknown>>,
): Promise<{ success: boolean; message?: string }> {
  const columns = Object.keys(patch || {});
  if (columns.length === 0) return { success: true };
  const invalid = columns.filter(
    (c) => !(INLINE_CLIENT_COLUMNS as readonly string[]).includes(c),
  );
  if (invalid.length > 0) {
    return { success: false, message: `Campo não editável inline: ${invalid.join(", ")}.` };
  }
  const { error } = await supabase
    .from("systems_clients")
    .update(patch as any)
    .eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
