import { supabase } from "@/integrations/supabase/client";

export type TouchpointType =
  | "solicitacao"
  | "visita"
  | "reuniao"
  | "ligacao"
  | "mensagem"
  | "treinamento"
  | "entrega"
  | "feedback"
  | "outro";

export const TOUCHPOINT_LABEL: Record<TouchpointType, string> = {
  solicitacao: "Solicitação do cliente",
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  mensagem: "Mensagem",
  treinamento: "Treinamento",
  entrega: "Entrega",
  feedback: "Feedback",
  outro: "Outro",
};

export const TOUCHPOINT_OPTIONS: { value: TouchpointType; label: string }[] = (
  Object.keys(TOUCHPOINT_LABEL) as TouchpointType[]
).map((value) => ({ value, label: TOUCHPOINT_LABEL[value] }));

export function touchpointLabel(type?: string | null): string {
  if (!type) return "—";
  return TOUCHPOINT_LABEL[type as TouchpointType] || type;
}

/** Últimos contatos registrados de um cliente de Sistemas (subcliente). */
export interface TouchpointRecord {
  id: string;
  touchpoint_type: string;
  occurred_at: string;
  summary: string | null;
  source: string;
}


/** Etapas que representam contato real com o cliente. */
const STAGE_TOUCHPOINT: Record<string, TouchpointType> = {
  enviar_cliente: "entrega",
  aguardando_cliente: "entrega",
  entregar_cliente: "entrega",
  feedback_cliente: "feedback",
};

export function touchpointTypeForStage(stage?: string | null): TouchpointType | null {
  if (!stage) return null;
  return STAGE_TOUCHPOINT[stage.toLowerCase().trim()] ?? null;
}

/**
 * Registra automaticamente um ponto de contato quando um card avança para uma
 * etapa voltada ao cliente. Idempotente por (card, tipo, dia) para não inflar
 * a régua de relacionamento quando o card vai e volta no mesmo dia.
 * Nunca lança — falhar aqui não pode bloquear o fluxo do card.
 */
export async function recordStageTouchpoint(
  tenantId: string,
  demandId: string,
  stage?: string | null,
): Promise<void> {
  try {
    const type = touchpointTypeForStage(stage);
    if (!type) return;

    const { data: demand } = await supabase
      .from("demands")
      .select("client_id, title")
      .eq("id", demandId)
      .maybeSingle();
    const clientId = (demand as any)?.client_id;
    if (!clientId) return;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { data: existing } = await supabase
      .from("client_touchpoints")
      .select("id")
      .eq("demand_id", demandId)
      .eq("touchpoint_type", type)
      .gte("occurred_at", dayStart.toISOString())
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: auth } = await supabase.auth.getUser();

    await supabase.from("client_touchpoints").insert({
      tenant_id: tenantId,
      client_id: clientId,
      demand_id: demandId,
      touchpoint_type: type,
      source: "auto",
      summary: `Etapa "${stage}": ${(demand as any)?.title || "demanda"}`,
      created_by: auth?.user?.id ?? null,
    } as any);
  } catch (err) {
    console.warn("[recordStageTouchpoint] falha ao registrar contato:", err);
  }
}

/** Registro manual de contato feito pelo time (tela de Customer Success). */
export async function recordManualTouchpoint(params: {
  tenantId: string;
  clientId: string;
  subclientId?: string | null;
  touchpointType: TouchpointType;
  occurredAt: string;
  summary?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("client_touchpoints").insert({
    tenant_id: params.tenantId,
    client_id: params.clientId,
    subclient_id: params.subclientId || null,
    touchpoint_type: params.touchpointType,
    source: "manual",
    occurred_at: params.occurredAt,
    summary: params.summary || null,
    created_by: auth?.user?.id ?? null,
  } as any);
  if (error) return { success: false, message: error.message };
  return { success: true };
}


/** Histórico de contatos de um cliente de Sistemas (subcliente). */
export async function loadSubclientTouchpoints(
  tenantId: string,
  subclientId: string,
  limit = 30,
): Promise<TouchpointRecord[]> {
  const { data, error } = await supabase
    .from("client_touchpoints")
    .select("id, touchpoint_type, occurred_at, summary, source")
    .eq("tenant_id", tenantId)
    .eq("subclient_id", subclientId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as TouchpointRecord[];
}
