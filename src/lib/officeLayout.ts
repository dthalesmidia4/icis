/**
 * Posicionamento das mesas dentro da sala do Escritório (`/escritorio`).
 * Somente apresentação: converte a quantidade de estações em coordenadas
 * percentuais + escala de profundidade, com pequenos deslocamentos para o
 * resultado parecer um ambiente físico e não um grid de cards.
 */
export interface DeskSlot {
  /** Posição horizontal do centro da mesa, em % da largura da sala. */
  leftPct: number;
  /** Posição vertical da base da mesa, em % da altura da sala. */
  topPct: number;
  /** Escala de profundidade (fundo menor, frente maior). */
  scale: number;
  /** z-index para sobreposição correta (frente sobre o fundo). */
  z: number;
  /** Índice da fileira (0 = fundo). */
  row: number;
}

const jitter = (index: number, amplitude: number) => {
  // Determinístico: mesmo índice sempre gera o mesmo deslocamento.
  const seq = [0, -1, 0.6, -0.4, 1, -0.8, 0.3, -0.6];
  return seq[index % seq.length] * amplitude;
};

export function deskPerRow(count: number): number {
  if (count <= 2) return Math.max(count, 1);
  if (count <= 4) return 2;
  if (count <= 8) return 3;
  return 4;
}

/** Largura base (px) da estação antes da escala de profundidade. */
export function deskBaseWidth(count: number): number {
  if (count <= 2) return 372;
  if (count <= 4) return 332;
  if (count <= 8) return 272;
  if (count <= 12) return 232;
  return 200;
}

/**
 * Faixa vertical útil das BASES das mesas. O elemento da estação cresce para
 * CIMA da base (monitor + personagem), então a faixa começa bem abaixo da
 * parede (20%) para o card do monitor nunca invadir a decoração.
 */
const TOP_BAND_PCT = 52;
const BOTTOM_BAND_PCT = 97;
/** Distância vertical fixa entre fileiras (evita vazio gigante com 2 fileiras). */
const ROW_STEP_PCT = 26;

export function computeDeskSlots(count: number): DeskSlot[] {
  if (count <= 0) return [];
  const perRow = deskPerRow(count);
  const rows = Math.ceil(count / perRow);
  const band = BOTTOM_BAND_PCT - TOP_BAND_PCT;
  // Passo fixo, comprimido apenas quando há fileiras demais para a faixa.
  const step = rows > 1 ? Math.min(ROW_STEP_PCT, band / (rows - 1)) : 0;
  const span = step * (rows - 1);
  // Conjunto de fileiras centralizado na faixa útil: sem buraco no meio.
  const start = TOP_BAND_PCT + (band - span) / 2;
  const slots: DeskSlot[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const posInRow = i % perRow;

    const rowT = rows > 1 ? row / (rows - 1) : 0.5;
    const topPct = start + row * step;
    const scale = 0.88 + rowT * 0.2;

    // Fileiras do fundo recuam levemente para dentro (perspectiva).
    const inset = 8 + (1 - rowT) * 6;
    const span2 = 100 - inset * 2;
    const stepX = span2 / inRow;
    const leftPct = inset + stepX * (posInRow + 0.5) + jitter(i + row, 2.2);

    slots.push({
      leftPct: Math.min(94, Math.max(6, leftPct)),
      topPct: Math.min(BOTTOM_BAND_PCT, Math.max(30, topPct + jitter(i, 1.1))),
      scale,
      z: 10 + row * 10,
      row,
    });
  }

  return slots;
}


/**
 * Faixas de volume da pilha. As camadas do DOM ficam SEMPRE sobrepostas
 * (step < altura da folha), então a pilha parece compacta; o que muda por
 * faixa é a quantidade de camadas e um passo levemente maior.
 * 3, 9 e 35 precisam parecer claramente diferentes.
 */
/**
 * Volume visual da pilha. Regra: a quantidade de folhas NUNCA passa do número
 * real de demandas — 1 demanda = 1 folha (nunca duas pilhas). De 2 a 5 vira uma
 * pilha mais evidente; acima de 5 cresce; a partir de 16 o badge fica em alerta.
 */
export function paperStackShape(
  queueCount: number,
): { sheets: number; step: number; overload: boolean } {
  if (queueCount <= 0) return { sheets: 0, step: 0, overload: false };
  if (queueCount <= 5) return { sheets: Math.min(queueCount, 3), step: 3.2, overload: false };
  if (queueCount <= 15) return { sheets: 5, step: 3.6, overload: false };
  if (queueCount <= 24) return { sheets: 7, step: 4, overload: true };
  return { sheets: 8, step: 4.4, overload: true };
}


