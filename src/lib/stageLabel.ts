/**
 * NOME DA ETAPA OPERACIONAL DE UM CARD.
 *
 * A etapa é SEMPRE `demands.current_function_key` resolvida em `flow_functions`.
 * `pipeline_statuses.name` é status de pipeline, não etapa: só serve como
 * último fallback quando o card não tem etapa operacional definida.
 */

export const FALLBACK_STAGE_NAMES: Record<string, string> = {
  planejar: "Planejar",
  criar_roteiro: "Criar roteiro",
  criar_arte: "Criar arte",
  captar: "Captar",
  descarregar_captacao: "Descarregar captação",
  gerar_video: "Gerar vídeo",
  editar_video: "Editar vídeo",
  revisar: "Revisar",
  revisar_arte: "Revisar arte",
  revisar_roteiro: "Revisar roteiro",
  enviar_cliente: "Enviar cliente",
  aguardando_cliente: "Aguardando cliente",
  entregar_cliente: "Entregar cliente",
  publicar: "Publicar",
  revisar_publicacao: "Revisar publicação",
  avaliar: "Avaliar",
  testar: "Testar",
};

/** Humaniza uma chave desconhecida (`criar_post` → `Criar post`). */
export function humanizeStageKey(key: string): string {
  const clean = key.replace(/_/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Resolve o rótulo da etapa. Ordem: `flow_functions` → fallback conhecido →
 * chave humanizada → status do pipeline (apenas sem etapa) → null.
 */
export function resolveStageName(
  functionKey: string | null | undefined,
  stageNames: Record<string, string> = {},
  statusFallback?: string | null,
): string | null {
  const key = (functionKey ?? "").trim();
  if (key) {
    return stageNames[key] || FALLBACK_STAGE_NAMES[key] || humanizeStageKey(key);
  }
  return statusFallback?.trim() || null;
}
