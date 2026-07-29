import { supabase } from "@/integrations/supabase/client";

export type FlowHistoryAction =
  | "created"
  | "proceeded"
  | "moved_back"
  | "delivered"
  | "partial_delivered"
  | "sent_to_client"
  | "manual_assignment";

export interface RecordFlowHistoryInput {
  tenantId: string;
  demandId: string;
  action: FlowHistoryAction;
  fromUserId?: string | null;
  toUserId?: string | null;
  fromFunctionKey?: string | null;
  toFunctionKey?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra um evento no histórico operacional de um card.
 * Nunca deve bloquear o fluxo principal — falhas são apenas logadas.
 */
export async function recordFlowHistory(input: RecordFlowHistoryInput): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const createdBy = userRes?.user?.id ?? null;
    const { error } = await supabase.from("demand_flow_history" as any).insert({
      tenant_id: input.tenantId,
      demand_id: input.demandId,
      from_user_id: input.fromUserId ?? null,
      to_user_id: input.toUserId ?? null,
      from_function_key: input.fromFunctionKey ?? null,
      to_function_key: input.toFunctionKey ?? null,
      action: input.action,
      created_by: createdBy,
      metadata: input.metadata ?? {},
    } as any);
    if (error) console.warn("[flowHistory] insert error:", error);
  } catch (err) {
    console.warn("[flowHistory] unexpected error:", err);
  }
}

/**
 * Registra uma transição envolvendo múltiplos usuários "from" — usada quando
 * um card com `additional_assignees` (etapa Captar) prossegue para a próxima
 * função. Cada usuário responsável gera uma linha em `demand_flow_history`
 * para aparecer no histórico de entregas da coluna dele.
 */
export async function recordFlowHistoryForUsers(
  input: Omit<RecordFlowHistoryInput, "fromUserId">,
  fromUserIds: Array<string | null | undefined>,
): Promise<void> {
  const unique = Array.from(new Set((fromUserIds || []).filter(Boolean))) as string[];
  if (unique.length === 0) {
    await recordFlowHistory({ ...input, fromUserId: null });
    return;
  }
  await Promise.all(
    unique.map((uid) => recordFlowHistory({ ...input, fromUserId: uid })),
  );
}
