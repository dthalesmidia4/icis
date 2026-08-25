/**
 * Métricas visuais da pilha de folhas do Escritório Virtual.
 *
 * A pilha precisa crescer de forma perceptível depois de 6 demandas, sem
 * desenhar literalmente uma folha por demanda (o que invadiria a estação em
 * cargas altas). A regra é 1:1 até 6 e, a partir daí, compressão progressiva
 * com teto em 14 folhas visuais.
 *
 * Pontos de calibração (queueCount -> sheets):
 *   0  -> 0   (vazio)
 *   1..6 -> 1..6 (1:1)
 *   10 -> 7
 *   15 -> 9
 *   16 -> 9
 *   20 -> 10
 *   25 -> 11
 *   30 -> 12
 *   35 -> 14 (teto)
 *   50 -> 14
 */
const SHEET_BREAKPOINTS: ReadonlyArray<readonly [number, number]> = [
  [6, 6],
  [10, 7],
  [15, 9],
  [20, 10],
  [30, 12],
  [35, 14],
];

/** Teto de folhas visuais (carga muito alta comprime para este valor). */
export const MAX_SHEETS = 14;

/** Largura base da folha em pixels. */
const BASE_SHEET_WIDTH = 30;

/** Largura extra aplicada por faixa de carga alta (aumenta percepção de volume). */
const WIDTH_BREAKPOINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 30],
  [24, 32],
  [32, 34],
];

function interpolate(
  breakpoints: ReadonlyArray<readonly [number, number]>,
  x: number,
): number {
  if (x <= breakpoints[0][0]) return breakpoints[0][1];
  const last = breakpoints[breakpoints.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < breakpoints.length; i++) {
    const [x0, y0] = breakpoints[i - 1];
    const [x1, y1] = breakpoints[i];
    if (x <= x1) {
      if (x1 === x0) return y1;
      const t = (x - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }
  return last[1];
}

/**
 * Calcula as métricas visuais da pilha a partir do número real de demandas.
 *
 * Retorna a quantidade de folhas a renderizar, a largura de cada folha e
 * flags derivadas. O contador numérico continua mostrando `queueCount` real.
 */
export function paperStackVisualMetrics(queueCount: number): {
  sheets: number;
  sheetWidth: number;
  overload: boolean;
  empty: boolean;
} {
  const count = Math.max(0, Math.floor(queueCount));
  const empty = count === 0;
  const overload = count >= 16;

  let sheets: number;
  if (empty) {
    sheets = 0;
  } else if (count <= 6) {
    sheets = count;
  } else {
    sheets = Math.min(MAX_SHEETS, interpolate(SHEET_BREAKPOINTS, count));
  }

  const sheetWidth = interpolate(WIDTH_BREAKPOINTS, count);

  return { sheets, sheetWidth, overload, empty };
}
