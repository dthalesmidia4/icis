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
  if (count <= 2) return 340;
  if (count <= 4) return 300;
  if (count <= 8) return 244;
  if (count <= 12) return 208;
  return 184;
}

export function computeDeskSlots(count: number): DeskSlot[] {
  if (count <= 0) return [];
  const perRow = deskPerRow(count);
  const rows = Math.ceil(count / perRow);
  const slots: DeskSlot[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const posInRow = i % perRow;

    const rowT = rows > 1 ? row / (rows - 1) : 0.55;
    const topPct = 34 + rowT * 58;
    const scale = rows > 1 ? 0.78 + rowT * 0.26 : 1;

    // Fileiras do fundo recuam levemente para dentro (perspectiva).
    const inset = 8 + (1 - rowT) * 6;
    const span = 100 - inset * 2;
    const step = span / inRow;
    const leftPct = inset + step * (posInRow + 0.5) + jitter(i + row, 2.2);

    slots.push({
      leftPct: Math.min(94, Math.max(6, leftPct)),
      topPct: Math.min(96, topPct + jitter(i, 1.4)),
      scale,
      z: 10 + row * 10,
      row,
    });
  }

  return slots;
}

/** Camadas de folhas desenhadas + rótulo do total (a fila real pode ser muito maior). */
export function paperStackShape(queueCount: number): { sheets: number; step: number } {
  if (queueCount <= 0) return { sheets: 0, step: 0 };
  if (queueCount <= 3) return { sheets: Math.min(queueCount, 3), step: 4 };
  if (queueCount <= 8) return { sheets: 5, step: 5 };
  if (queueCount <= 15) return { sheets: 7, step: 6 };
  return { sheets: 8, step: 7.5 };
}
