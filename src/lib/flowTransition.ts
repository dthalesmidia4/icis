/**
 * Commit condicional (compare-and-set) das transições de fluxo.
 *
 * Todo `proceed` / `voltar` / `salto manual` lê a etapa atual, calcula o destino
 * e só então grava. Entre a leitura e a gravação outra aba (ou outro usuário)
 * pode ter movido o card. Sem compare-and-set as duas ações "vencem" e o
 * histórico fica com transições duplicadas/incoerentes.
 *
 * Aqui a gravação é condicionada ao estado esperado: se 0 linhas voltarem,
 * a transição é considerada `stale` e NADA é registrado.
 */
import { supabase } from "@/integrations/supabase/client";

export * from "@/lib/flowTransitionCore";
import {
  applyFlowCasFilters,
  buildFlowState,
  FLOW_STATE_COLUMNS,
  type FlowCasExpectation,
  type FlowState,
} from "@/lib/flowTransitionCore";

export type FlowCommitResult =
  | { status: "ok"; flowState: FlowState }
  | { status: "stale" }
  | { status: "error"; error: unknown };

/**
 * Gravação condicional. Só devolve `ok` (e libera o registro de histórico)
 * quando a linha ainda estava no estado esperado.
 */
export async function commitFlowTransition(params: {
  demandId: string;
  payload: Record<string, any>;
} & FlowCasExpectation): Promise<FlowCommitResult> {
  const { demandId, payload, ...expectation } = params;
  let query: any = supabase.from("demands").update(payload as any).eq("id", demandId);
  query = applyFlowCasFilters(query, expectation as FlowCasExpectation);
  const { data, error } = await query.select(FLOW_STATE_COLUMNS).maybeSingle();
  if (error) return { status: "error", error };
  const flowState = buildFlowState(data as any);
  if (!flowState) return { status: "stale" };
  return { status: "ok", flowState };
}

/** Estado atual (DB truth) — usado quando a transição foi rejeitada por concorrência. */
export async function fetchFlowState(demandId: string): Promise<FlowState | undefined> {
  const { data } = await supabase
    .from("demands")
    .select(FLOW_STATE_COLUMNS)
    .eq("id", demandId)
    .maybeSingle();
  return buildFlowState(data as any);
}
