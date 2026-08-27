import type { CommercialStage, SystemsLifecycle } from "@/lib/systemsClients";

/**
 * REGRA EXPLÍCITA DA EDIÇÃO INLINE DE ETAPA.
 *
 * `Etapa` (funil), `Último resultado` (o que aconteceu) e `Próxima ação` (o que
 * vem depois) são campos INDEPENDENTES: mudar a etapa nunca preenche nem apaga
 * os outros dois.
 *
 * Escolher `ganho` num prospect NÃO é um patch de coluna: é conversão do
 * registro (`markOpportunityWon`), senão o lead ficaria `lifecycle='prospect'`
 * com etapa ganho. Customer nunca edita etapa pelo grid.
 */
export type StageInlineAction =
  | { kind: "blocked"; reason: string }
  | { kind: "convert-won" }
  | { kind: "patch"; patch: { commercial_stage: CommercialStage | null } };

export function resolveStageInlineChange(
  client: { lifecycle: SystemsLifecycle; commercial_stage: CommercialStage | null },
  next: string | null,
): StageInlineAction {
  if (client.lifecycle === "customer") {
    return { kind: "blocked", reason: "Clientes não mudam de etapa pelo grid." };
  }
  if (next === "ganho") return { kind: "convert-won" };
  return { kind: "patch", patch: { commercial_stage: (next as CommercialStage) || null } };
}

/** Situação apresentada na subtabela da cidade. */
export function lifecycleSituationLabel(lifecycle: SystemsLifecycle): string {
  return lifecycle === "customer" ? "Cliente" : "Oportunidade";
}

/** Selo estático do customer: `Ganho` quando o funil registrou a conversão. */
export function customerStageBadgeLabel(stage: CommercialStage | null): string {
  return stage === "ganho" ? "Ganho" : "Cliente";
}
