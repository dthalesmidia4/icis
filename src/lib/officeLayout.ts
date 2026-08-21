/**
 * Posicionamento das mesas dentro da sala do Escritório (`/escritorio`).
 * Somente apresentação: converte a quantidade de estações + o TAMANHO REAL do
 * mundo (medido por ResizeObserver em `Office.tsx`) em coordenadas percentuais
 * e escala de profundidade.
 *
 * Por que responsivo: percentuais verticais fixos deixavam as mesas afundadas
 * no rodapé em ultrawide (vazio gigante sob a parede) e apertavam a distância
 * horizontal entre estações, fazendo o footprint de uma invadir a outra.
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

export interface WorldSize {
  width: number;
  height: number;
}

export type OfficeProfileId = "compact" | "desktop" | "large" | "ultrawide" | "ultrawideShort";

interface OfficeProfile {
  id: OfficeProfileId;
  /** Âncora (base da mesa) da fileira do fundo, em % da altura. */
  topAnchorPct: number;
  /** Âncora da fileira da frente, em % da altura. */
  bottomAnchorPct: number;
  /** Centros horizontais, em %, quando há 2 estações na fileira. */
  centersBack: [number, number];
  centersFront: [number, number];
  /** Largura base (px) da estação antes da escala. */
  baseWidth: number;
  /** Amplitude máxima do jitter horizontal (%). */
  jitterPct: number;
  /** Escala da fileira do fundo / da frente. */
  scaleBack: number;
  scaleFront: number;
}

/** Margem lateral de segurança (px) entre footprints de duas estações. */
const SAFE_GUTTER_PX = 28;
/** Largura mínima aceitável de estação antes de aproximar mesas. */
const MIN_BASE_WIDTH = 196;

/**
 * ZONA RESERVADA DA CAFETERIA (canto superior direito da sala).
 * `CoffeeCorner` tem ~214px de largura e é ancorado em `right-8` (32px) dentro
 * do mundo, no topo (24% da altura) — ou seja, ele ocupa a MESMA faixa vertical
 * da fileira do fundo. O anti-colisão entre mesas não enxergava isso, então a
 * estação superior direita entrava visualmente no balcão.
 */
export const COFFEE_WIDTH_PX = 214;
export const COFFEE_RIGHT_OFFSET_PX = 32;
/** Margem visual segura pedida (24–40px). */
export const COFFEE_SAFE_MARGIN_PX = 32;

/** Coordenada X (px) onde a zona útil da cafeteria começa. */
export function coffeeZoneLeftPx(worldWidth: number): number {
  return worldWidth - (COFFEE_RIGHT_OFFSET_PX + COFFEE_WIDTH_PX + COFFEE_SAFE_MARGIN_PX);
}

/**
 * Largura relativa do monitor dentro da estação. O monitor deixou de usar
 * `flex-1` (absorvia todo o tampo): agora tem teto explícito, sobrando faixa
 * estável para personagem/objetos à esquerda e fila/objetos à direita.
 */
export const MONITOR_MAX_PCT = 62;
export function deskMonitorWidthPct(size: WorldSize = DEFAULT_SIZE): number {
  const profile = resolveOfficeProfile(size);
  // Ultrawide pode crescer discretamente, sem voltar ao aspecto horizontal.
  return profile.id === "ultrawide" || profile.id === "ultrawideShort" ? 60 : 57;
}

const DEFAULT_SIZE: WorldSize = { width: 1440, height: 860 };


export function resolveOfficeProfile(size: WorldSize = DEFAULT_SIZE): OfficeProfile {
  const width = size.width || DEFAULT_SIZE.width;
  const height = size.height || DEFAULT_SIZE.height;
  const ratio = width / Math.max(height, 1);
  const ultrawide = width >= 1900 || ratio >= 2.1;

  if (ultrawide) {
    // Ultrawide baixo (ex.: 2560x1080) não pode subir tanto quanto o alto
    // (3440x1440), senão a fileira da frente encosta no rodapé.
    const short = height < 980;
    return short
      ? {
          id: "ultrawideShort",
          topAnchorPct: 48,
          bottomAnchorPct: 83,
          centersBack: [27, 73],
          centersFront: [26, 74],
          baseWidth: 400,
          jitterPct: 0,
          scaleBack: 0.96,
          scaleFront: 1.08,
        }
      : {
          id: "ultrawide",
          topAnchorPct: 45,
          bottomAnchorPct: 80,
          centersBack: [27, 73],
          centersFront: [26, 74],
          baseWidth: 424,
          jitterPct: 0,
          scaleBack: 0.98,
          scaleFront: 1.12,
        };
  }

  if (width >= 1600) {
    return {
      id: "large",
      topAnchorPct: 51,
      bottomAnchorPct: 88,
      centersBack: [28, 72],
      centersFront: [25.5, 74.5],
      baseWidth: 374,
      jitterPct: 0.5,
      scaleBack: 0.95,
      scaleFront: 1.06,
    };
  }

  if (width >= 1200) {
    return {
      id: "desktop",
      topAnchorPct: 52,
      bottomAnchorPct: 88,
      centersBack: [28, 72],
      centersFront: [26, 74],
      baseWidth: 344,
      jitterPct: 0.8,
      scaleBack: 0.94,
      scaleFront: 1.05,
    };
  }

  return {
    id: "compact",
    topAnchorPct: 54,
    bottomAnchorPct: 90,
    centersBack: [27, 73],
    centersFront: [26, 74],
    baseWidth: 300,
    jitterPct: 0.8,
    scaleBack: 0.93,
    scaleFront: 1.04,
  };
}

const jitter = (index: number, amplitude: number) => {
  if (amplitude <= 0) return 0;
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

/**
 * Largura base (px) da estação, já reduzida quando o footprint real
 * (largura * escala + margem) não caberia entre os centros da fileira.
 */
export function deskBaseWidth(count: number, size: WorldSize = DEFAULT_SIZE): number {
  const profile = resolveOfficeProfile(size);
  const width = size.width || DEFAULT_SIZE.width;
  const perRow = deskPerRow(count);
  let base = profile.baseWidth;

  // Mais de 2 por fileira: reduz proporcionalmente antes de qualquer clamp.
  if (perRow === 3) base *= 0.8;
  else if (perRow >= 4) base *= 0.66;
  if (count <= 2) base *= 1.06;

  // Anti-colisão: separação mínima entre centros vira largura máxima possível.
  const sepPct =
    perRow === 1
      ? 100
      : perRow === 2
        ? Math.min(
            profile.centersBack[1] - profile.centersBack[0],
            profile.centersFront[1] - profile.centersFront[0],
          ) - profile.jitterPct * 2
        : (100 - 2 * (8 + 6)) / perRow;
  const availablePx = (sepPct / 100) * width - SAFE_GUTTER_PX;
  const maxBase = availablePx / Math.max(profile.scaleFront, profile.scaleBack);

  return Math.round(Math.max(MIN_BASE_WIDTH, Math.min(base, maxBase)));
}

/** Faixa vertical útil para composições genéricas (5+ estações). */
const GENERIC_MIN_ROW_GAP_PCT = 22;

export function computeDeskSlots(count: number, size: WorldSize = DEFAULT_SIZE): DeskSlot[] {
  if (count <= 0) return [];
  const profile = resolveOfficeProfile(size);
  const perRow = deskPerRow(count);
  const rows = Math.ceil(count / perRow);

  // Âncoras verticais: 1 fileira usa a da frente; 2 fileiras usam as duas
  // âncoras do perfil (gap real de 34-38 pontos em desktop); 3+ distribuem
  // dentro da mesma faixa com gap mínimo.
  const anchors: number[] = [];
  if (rows === 1) {
    anchors.push((profile.topAnchorPct + profile.bottomAnchorPct) / 2 + 4);
  } else {
    const band = profile.bottomAnchorPct - profile.topAnchorPct;
    const step = Math.max(GENERIC_MIN_ROW_GAP_PCT, band / (rows - 1));
    const span = step * (rows - 1);
    const start =
      rows === 2
        ? profile.topAnchorPct
        : profile.bottomAnchorPct - Math.min(span, band + GENERIC_MIN_ROW_GAP_PCT);
    for (let r = 0; r < rows; r += 1) anchors.push(start + r * step);
  }

  const slots: DeskSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const posInRow = i % perRow;
    const isFront = row === rows - 1;

    const rowT = rows > 1 ? row / (rows - 1) : 1;
    const scale = profile.scaleBack + (profile.scaleFront - profile.scaleBack) * rowT;
    const topPct = Math.min(96, Math.max(28, anchors[row]));

    let leftPct: number;
    if (inRow === 1) {
      leftPct = 50;
    } else if (inRow === 2) {
      const centers = isFront ? profile.centersFront : profile.centersBack;
      leftPct = centers[posInRow] + jitter(i + row, profile.jitterPct);
    } else {
      // Fileiras do fundo recuam levemente para dentro (perspectiva).
      const inset = 8 + (1 - rowT) * 6;
      const stepX = (100 - inset * 2) / inRow;
      leftPct = inset + stepX * (posInRow + 0.5) + jitter(i + row, profile.jitterPct * 1.5);
    }

    slots.push({
      leftPct: Math.min(94, Math.max(6, leftPct)),
      topPct,
      scale,
      z: 10 + row * 10,
      row,
    });
  }

  return slots;
}


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
