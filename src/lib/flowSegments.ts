/**
 * SEGMENTOS ADMINISTRATIVOS DO FLUXO
 *
 * Etapas de cliente (`enviar_cliente`, `aguardando_cliente`, `entregar_cliente`,
 * `feedback_cliente`) são BARREIRAS de processo. Uma reatribuição administrativa
 * (bulk / reassign / atribuição manual) nunca pode "encaixar" um colaborador
 * atravessando uma dessas barreiras — nem para frente, nem para trás.
 *
 * Este módulo é 100% puro: recebe a sequência real do fluxo (já filtrada por
 * área/tipo/origem) e responde perguntas de segmento.
 */
import { isClientFacingFunction, isReviewFunction } from "@/lib/flowFunctions";

/** Uma etapa é barreira de processo? */
export function isProcessGate(key?: string | null): boolean {
  return isClientFacingFunction(key);
}

/**
 * Mapa `functionKey -> id do segmento`. Cada barreira é um segmento próprio;
 * etapas operacionais contíguas compartilham o mesmo segmento.
 */
export function buildSegmentMap(sequence: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  let segment = 0;
  let lastWasGate = true; // força abrir um segmento operacional no primeiro item
  for (const key of sequence) {
    if (isProcessGate(key)) {
      segment += 1;
      out[key] = segment;
      lastWasGate = true;
      continue;
    }
    if (lastWasGate) segment += 1;
    out[key] = segment;
    lastWasGate = false;
  }
  return out;
}

/** `a` e `b` pertencem ao mesmo segmento administrativo? */
export function sameAdministrativeSegment(
  sequence: string[],
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return false;
  const map = buildSegmentMap(sequence);
  if (!(a in map) || !(b in map)) return false;
  return map[a] === map[b];
}

/** A etapa atual existe na sequência válida do tipo? */
export function isStageOutsideFlow(sequence: string[], currentKey?: string | null): boolean {
  const key = (currentKey || "").trim();
  if (!key) return false;
  return !sequence.includes(key);
}

export interface PickAdministrativeStageParams {
  sequence: string[];
  currentKey?: string | null;
  /** A etapa é executável por este colaborador neste card? */
  usable: (key: string) => boolean;
}

/**
 * Etapa de destino para uma reatribuição ADMINISTRATIVA.
 *
 *  - barreira atual: só transfere preservando EXATAMENTE a mesma barreira;
 *  - etapa atual fora do fluxo do tipo: `null` (exige escolha explícita);
 *  - sem etapa atual: primeira operacional utilizável da sequência;
 *  - etapa operacional: preserva; senão procura à frente e depois atrás,
 *    SEMPRE dentro do mesmo segmento operacional contíguo.
 */
export function pickAdministrativeStage(params: PickAdministrativeStageParams): string | null {
  const { sequence, usable } = params;
  const current = (params.currentKey || "").trim() || null;

  if (!current) {
    return sequence.find((k) => !isProcessGate(k) && usable(k)) || null;
  }
  if (!sequence.includes(current)) return null;
  if (isProcessGate(current)) return usable(current) ? current : null;

  if (usable(current)) return current;

  const map = buildSegmentMap(sequence);
  const seg = map[current];
  const idx = sequence.indexOf(current);
  const inSegment = (k: string) => map[k] === seg && !isProcessGate(k);

  // Para frente: não atravessa um gate de revisão que o colaborador não executa
  // (encaixar alguém em `publicar` pulando `revisar` quebraria o controle).
  let forward: string | null = null;
  for (const k of sequence.slice(idx + 1)) {
    if (!inSegment(k)) break;
    if (usable(k)) {
      forward = k;
      break;
    }
    if (isReviewFunction(k)) break;
  }
  if (forward) return forward;
  const backward = [...sequence.slice(0, idx)].reverse().find((k) => inSegment(k) && usable(k));
  if (backward) return backward;
  return null;
}
