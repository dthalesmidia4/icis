import { supabase } from "@/integrations/supabase/client";
import { pickAssigneeForFunction } from "@/lib/proceedDemand";
import { recordFlowHistory } from "@/lib/flowHistory";
import { getStageCompletions, hasUserCompletedStage } from "@/lib/stageCompletions";
import { isClientFacingFunction, isReviewFunction, normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";
import { isClientOrigin } from "@/lib/proceedDemand";
import { pickAdministrativeStage } from "@/lib/flowSegments";



/** Contexto de área/origem do card — obrigatório para não misturar Mídia × Sistemas. */
export interface FlowAreaContext {
  workArea?: string | null;
  origin?: string | null;
  /**
   * `flow` (default) = transição real de processo (Prosseguir/Enviar/Entregar).
   * `administrative_reassign` = apenas troca de responsável (reatribuição,
   * alocação em massa, atribuição manual): NUNCA pode escolher uma etapa
   * client-facing (aguardando/enviar/entregar/feedback do cliente) só para
   * encaixar o colaborador — isso exige evento real de processo.
   */
  mode?: "flow" | "administrative_reassign";
}

export interface InitialFunction {
  functionKey: string;
  functionName: string;
}

/**
 * Resolve a primeira função de fluxo (ordenada por `position`) para o tipo
 * de demanda. Se não houver regras `required` para o tipo, cai na primeira
 * `flow_functions` ativa da tenant.
 */
export async function resolveInitialFunction(
  tenantId: string,
  demandTypeKey?: string | null,
  ctx?: FlowAreaContext,
): Promise<InitialFunction | null> {
  const area: WorkArea = normalizeWorkArea(ctx?.workArea);
  const clientOrigin = isClientOrigin(ctx?.origin);
  const [{ data: fns, error: fnErr }, { data: rules }] = await Promise.all([
    (supabase.from("flow_functions") as any)
      .select("function_key, name, position, active, requires_client_origin")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("work_area", area)
      .neq("function_key", "avaliar")
      .order("position"),
    demandTypeKey
      ? (supabase.from("demand_type_flow_rules") as any)
          .select("function_key, requirement")
          .eq("tenant_id", tenantId)
          .eq("work_area", area)
          .eq("demand_type_key", demandTypeKey)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  if (fnErr || !fns || fns.length === 0) return null;

  const required = new Set(
    ((rules as any[]) || [])
      .filter((r) => r.requirement === "required" && r.function_key !== "avaliar")
      .map((r) => r.function_key),
  );

  const sequence = (required.size > 0
    ? (fns as any[]).filter((f: any) => required.has(f.function_key))
    : (fns as any[])
  ).filter((f: any) => (f.requires_client_origin ? clientOrigin : true));

  if (sequence.length === 0) return null;
  const first: any = sequence[0];
  return { functionKey: first.function_key, functionName: first.name };
}

/**
 * Resolve a etapa (`current_function_key`) apropriada para um responsável
 * específico, respeitando (a) a sequência do fluxo do tipo de demanda e
 * (b) as funções permitidas ao usuário em `collaborator_function_assignments`.
 *
 * Regra:
 *  - Se `currentFunctionKey` já é permitido para o usuário na sequência: mantém.
 *  - Se `currentFunctionKey` existe na sequência (mas não é permitido): avança
 *    para a próxima função permitida a partir daquela posição.
 *  - Senão: retorna a primeira função permitida da sequência.
 *  - Se o usuário não tem nenhuma função permitida na sequência: retorna null.
 */
export async function resolveFunctionForAssignee(
  tenantId: string,
  assigneeUserId: string,
  demandTypeKey?: string | null,
  currentFunctionKey?: string | null,
  demandId?: string | null,
  ctx?: FlowAreaContext,
): Promise<string | null> {
  const area: WorkArea = normalizeWorkArea(ctx?.workArea);
  const clientOrigin = isClientOrigin(ctx?.origin);
  // Mesma carga do lote (aqui com um único user_id): as regras vivem no núcleo
  // puro `pickFunctionForAssignee`, compartilhado com o dropdown em lote.
  const context = await loadSharedFlowContext({
    tenantId,
    area,
    clientOrigin,
    demandTypeKey,
    demandId,
    userIds: [assigneeUserId],
  });
  if (context.sequence.length === 0) return null;

  return pickFunctionForAssignee({
    sequence: context.sequence,
    allowedKeys: context.allowedByUser.get(assigneeUserId) || new Set<string>(),
    completions: context.completions,
    assigneeUserId,
    currentFunctionKey,
    administrative: ctx?.mode === "administrative_reassign",
  });
}


/**
 * Atribui a etapa inicial + responsável ao card recém-criado.
 * - Preserva `assigned_to` se já veio preenchido.
 * - Registra `flow_history` action=created.
 * Falhas são logadas mas nunca lançam — a criação do card não pode regredir.
 */
export async function assignInitialResponsible(
  demandId: string,
  tenantId: string,
  demandTypeKey?: string | null,
  opts?: { metadataSource?: string; workArea?: string | null; origin?: string | null },
): Promise<void> {
  try {
    const ctx: FlowAreaContext = { workArea: opts?.workArea, origin: opts?.origin };
    const initial = await resolveInitialFunction(tenantId, demandTypeKey, ctx);
    if (!initial) {
      console.warn("[assignInitialResponsible] no initial function for", { tenantId, demandTypeKey });
      return;
    }

    const { data: current } = await supabase
      .from("demands")
      .select("assigned_to, current_function_key")
      .eq("id", demandId)
      .maybeSingle();

    const existingAssignee = (current as any)?.assigned_to || null;
    let assigneeId: string | null = existingAssignee;
    let functionKey: string = initial.functionKey;

    if (existingAssignee) {
      // Responsável já pré-definido (ex.: draft manual): ajustar etapa para
      // uma função permitida ao usuário, respeitando o fluxo do tipo.
      const resolved = await resolveFunctionForAssignee(
        tenantId,
        existingAssignee,
        demandTypeKey,
        initial.functionKey,
        demandId,
        ctx,
      );
      if (resolved) functionKey = resolved;
    } else {
      const picked = await pickAssigneeForFunction(tenantId, initial.functionKey, initial.functionName, {
        workArea: normalizeWorkArea(opts?.workArea),
      });

      if (picked.success && picked.userId) assigneeId = picked.userId;
    }

    const update: Record<string, any> = { current_function_key: functionKey };
    if (assigneeId) update.assigned_to = assigneeId;

    const { error: upErr } = await supabase.from("demands").update(update).eq("id", demandId);
    if (upErr) {
      console.warn("[assignInitialResponsible] update error:", upErr);
      return;
    }

    await recordFlowHistory({
      tenantId,
      demandId,
      action: "created",
      fromUserId: null,
      toUserId: assigneeId,
      fromFunctionKey: null,
      toFunctionKey: functionKey,
      metadata: opts?.metadataSource ? { source: opts.metadataSource } : undefined,
    });
  } catch (err) {
    console.warn("[assignInitialResponsible] unexpected error:", err);
  }
}
