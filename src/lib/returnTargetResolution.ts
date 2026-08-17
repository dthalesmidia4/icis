/**
 * RESOLUÇÃO DE DESTINO EM RETORNOS (regressão / salto para etapa anterior)
 *
 * Regra: quando o retorno tem um usuário-alvo conhecido (histórico da etapa ou
 * escolha explícita no menu "Voltar demanda") e esse usuário NÃO possui a função
 * da etapa calculada, o motor não falha: ele reconfigura a etapa para a função
 * válida mais coerente que o usuário realmente possui, sempre ANTES da posição
 * atual do card (retorno nunca avança).
 *
 * Este módulo é puro (sem rede) para poder ser testado isoladamente.
 */

export interface PipelineStage {
  function_key: string;
  name: string;
}

export type ReturnRoutingSource = "requested_stage" | "compatible_stage_return";

export interface CompatibleReturnStage {
  stage: PipelineStage;
  /** true quando a etapa aplicada é diferente da originalmente pedida. */
  reconfigured: boolean;
  routing: ReturnRoutingSource;
}

/**
 * Escolhe a etapa de retorno compatível com as funções do usuário-alvo.
 *
 * - candidatas = etapas do pipeline ANTERIORES ao índice atual que o usuário possui;
 * - se a etapa pedida está entre elas, ela vence;
 * - caso contrário, vence a mais próxima da etapa pedida, com desempate
 *   determinístico pela etapa ANTERIOR (índice menor);
 * - sem candidata → null (chamador cai no roteamento automático da etapa pedida).
 */
export function pickCompatibleReturnStage(
  sequence: PipelineStage[],
  currentIndex: number,
  requestedFunctionKey: string,
  allowedFunctionKeys: Iterable<string>,
): CompatibleReturnStage | null {
  if (currentIndex <= 0) return null;
  const allowed = new Set(allowedFunctionKeys);
  const previous = sequence.slice(0, currentIndex);
  const candidates = previous
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => allowed.has(stage.function_key));
  if (candidates.length === 0) return null;

  const requested = candidates.find(({ stage }) => stage.function_key === requestedFunctionKey);
  if (requested) {
    return { stage: requested.stage, reconfigured: false, routing: "requested_stage" };
  }

  const requestedIndex = previous.findIndex((s) => s.function_key === requestedFunctionKey);
  const anchor = requestedIndex >= 0 ? requestedIndex : previous.length - 1;

  const best = candidates.reduce((a, b) => {
    const da = Math.abs(a.index - anchor);
    const db = Math.abs(b.index - anchor);
    if (da !== db) return da < db ? a : b;
    // Empate: preferir a etapa anterior (índice menor) — nunca a mais avançada.
    return a.index <= b.index ? a : b;
  });

  return { stage: best.stage, reconfigured: true, routing: "compatible_stage_return" };
}
