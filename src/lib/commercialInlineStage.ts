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

/**
 * SITUAÇÃO É LIFECYCLE, NÃO COLUNA SOLTA.
 *
 * Trocar `Oportunidade` → `Cliente` é a conversão canônica
 * (`markOpportunityWon`): o MESMO registro vira customer com etapa `ganho`.
 * `Cliente` → `Oportunidade` é a reabertura canônica (`reopenOpportunity`),
 * que devolve lifecycle `prospect` e etapa `contato` preservando histórico,
 * status e `onboarded_at`. Nunca é um patch direto de `lifecycle`.
 */
export type SituationInlineAction =
  | { kind: "noop" }
  | { kind: "convert-won" }
  | { kind: "reopen" };

export const SITUATION_OPTIONS: { value: SystemsLifecycle; label: string }[] = [
  { value: "prospect", label: "Oportunidade" },
  { value: "customer", label: "Cliente" },
];

export function resolveSituationInlineChange(
  client: { lifecycle: SystemsLifecycle },
  next: string | null,
): SituationInlineAction {
  if (!next || next === client.lifecycle) return { kind: "noop" };
  if (next === "customer") return { kind: "convert-won" };
  if (next === "prospect") return { kind: "reopen" };
  return { kind: "noop" };
}

/** Situação apresentada na subtabela da cidade. */
export function lifecycleSituationLabel(lifecycle: SystemsLifecycle): string {
  return lifecycle === "customer" ? "Cliente" : "Oportunidade";
}

/** Selo estático do customer: `Ganho` quando o funil registrou a conversão. */
export function customerStageBadgeLabel(stage: CommercialStage | null): string {
  return stage === "ganho" ? "Ganho" : "Cliente";
}

