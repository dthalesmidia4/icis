import { supabase } from "@/integrations/supabase/client";
import { pickAssigneeForFunction } from "@/lib/proceedDemand";
import { recordFlowHistory } from "@/lib/flowHistory";
import { getStageCompletions, hasUserCompletedStage } from "@/lib/stageCompletions";

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
): Promise<InitialFunction | null> {
  const [{ data: fns, error: fnErr }, { data: rules }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, name, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .neq("function_key", "avaliar")
      .order("position"),
    demandTypeKey
      ? supabase
          .from("demand_type_flow_rules")
          .select("function_key, requirement")
          .eq("tenant_id", tenantId)
          .eq("demand_type_key", demandTypeKey)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  if (fnErr || !fns || fns.length === 0) return null;

  const required = new Set(
    ((rules as any[]) || [])
      .filter((r) => r.requirement === "required" && r.function_key !== "avaliar")
      .map((r) => r.function_key),
  );

  const sequence = required.size > 0
    ? fns.filter((f: any) => required.has(f.function_key))
    : fns;

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
): Promise<string | null> {
  const [{ data: fns }, { data: rules }, { data: allowedRows }] = await Promise.all([
    supabase
      .from("flow_functions")
      .select("function_key, position, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .neq("function_key", "avaliar")
      .order("position"),
    demandTypeKey
      ? supabase
          .from("demand_type_flow_rules")
          .select("function_key, requirement")
          .eq("tenant_id", tenantId)
          .eq("demand_type_key", demandTypeKey)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("collaborator_function_assignments")
      .select("function_key, allowed")
      .eq("tenant_id", tenantId)
      .eq("user_id", assigneeUserId)
      .eq("allowed", true)
      .neq("function_key", "avaliar"),
  ]);

  if (!fns || fns.length === 0) return null;

  const required = new Set(
    ((rules as any[]) || [])
      .filter((r) => r.requirement === "required")
      .map((r) => r.function_key),
  );
  const sequence: string[] = (required.size > 0
    ? (fns as any[]).filter((f) => required.has(f.function_key))
    : (fns as any[])
  ).map((f) => f.function_key);

  const allowedKeys = new Set(
    ((allowedRows as any[]) || []).map((r) => r.function_key),
  );
  const allowedSeq = sequence.filter((k) => allowedKeys.has(k));
  if (allowedSeq.length === 0) return null;

  // Etapas que este usuário já concluiu neste card nunca são reatribuídas a ele.
  const completions = demandId ? await getStageCompletions(tenantId, demandId) : null;
  const usable = (k: string) =>
    allowedKeys.has(k) &&
    !(completions && hasUserCompletedStage(completions, k, assigneeUserId));

  if (currentFunctionKey && sequence.includes(currentFunctionKey)) {
    if (usable(currentFunctionKey)) return currentFunctionKey;
    const idx = sequence.indexOf(currentFunctionKey);
    // Somente para frente: trocar de responsável nunca pode regredir o fluxo.
    const next = sequence.slice(idx + 1).find(usable);
    if (next) return next;
    // Sem etapa válida à frente: mantém a etapa atual.
    return currentFunctionKey;
  }

  const firstUsable = allowedSeq.find(usable);
  return firstUsable ?? allowedSeq[0];
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
  opts?: { metadataSource?: string },
): Promise<void> {
  try {
    const initial = await resolveInitialFunction(tenantId, demandTypeKey);
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
      );
      if (resolved) functionKey = resolved;
    } else {
      const picked = await pickAssigneeForFunction(tenantId, initial.functionKey, initial.functionName);
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
