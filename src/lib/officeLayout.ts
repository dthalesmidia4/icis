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
export const COFFEE_WIDTH_PX = 240;
export const COFFEE_RIGHT_OFFSET_PX = 32;
/** Margem visual segura pedida (24–40px). */
export const COFFEE_SAFE_MARGIN_PX = 32;

/** Coordenada X (px) onde a zona útil da cafeteria começa. */
export function coffeeZoneLeftPx(worldWidth: number): number {
  return worldWidth - (COFFEE_RIGHT_OFFSET_PX + COFFEE_WIDTH_PX + COFFEE_SAFE_MARGIN_PX);
}

/**
 * PALCO LÓGICO. A cena NÃO se espalha pela largura bruta da viewport: em
 * ultrawide o escritório precisa continuar coeso (margens externas calmas são
 * aceitáveis; vazio gigante ENTRE os elementos, não). Em 1366–1920 o palco usa
 * quase toda a largura útil.
 */
export const STAGE_MIN_PX = 980;
export const STAGE_MAX_PX = 2040;
export function stageWidthPx(worldWidth: number): number {
  const width = worldWidth || DEFAULT_SIZE.width;
  if (width <= STAGE_MIN_PX) return width;
  return Math.round(Math.min(STAGE_MAX_PX, Math.max(STAGE_MIN_PX, width * 0.96)));
}
/** Tamanho do palco lógico usado por TODA a matemática de composição. */
export function stageSize(world: WorldSize): WorldSize {
  return { width: stageWidthPx(world.width), height: world.height };
}

/**
 * Largura relativa do monitor dentro da estação. O monitor deixou de usar
 * `flex-1` (absorvia todo o tampo): agora tem teto explícito, sobrando faixa
 * estável para personagem/objetos à esquerda e fila/objetos à direita.
 * A rodada anterior estreitou demais (aspecto "totem"): a largura útil volta
 * ~20% para o card ficar HORIZONTAL, sem retomar o monitor gigante original —
 * mesa/cadeira/pilha continuam com faixas laterais reservadas.
 */
export const MONITOR_MAX_PCT = 66;
export function deskMonitorWidthPct(size: WorldSize = DEFAULT_SIZE): number {
  const profile = resolveOfficeProfile(size);
  // Ultrawide pode crescer discretamente, sem voltar ao aspecto horizontal.
  return profile.id === "ultrawide" || profile.id === "ultrawideShort" ? 65 : 62;
}

/** Altura mínima (px) do "vidro" do monitor: mais horizontal, menos pôster. */
export const MONITOR_MIN_HEIGHT_PX = 46;


/**
 * ESCALA DO PERSONAGEM sobre a largura MEDIDA do anchor. Pessoas ganham
 * protagonismo (~15–20%) sem sair da cadeira nem cobrir monitor/labels.
 */
export const CHARACTER_SCALE: Record<"seated" | "standing" | "walking", number> = {
  seated: 1.16,
  standing: 1.22,
  walking: 1.22,
};
export function characterSizePx(anchorWidth: number, posture: keyof typeof CHARACTER_SCALE): number {
  return Math.max(26, Math.round(anchorWidth * CHARACTER_SCALE[posture]));
}

/**
 * PAREDE EM DUAS FAIXAS.
 * - faixa DECORATIVA (0 → `WALL_DECOR_BAND_PCT`): janelas, quadro, prateleira,
 *   luminária pendente;
 * - faixa FUNCIONAL (`WALL_PANEL_BAND_TOP_PCT` → `WALL_HEIGHT_PCT`): só o
 *   Painel da Agência, centralizado no PALCO LÓGICO.
 * A parede ficou mais alta de propósito: o painel deixou de sobrepor
 * janela/luminária sem precisar invadir a primeira fileira de mesas.
 */
export const WALL_DECOR_BAND_PCT = 16;
export const WALL_PANEL_BAND_TOP_PCT = 16.5;
export const WALL_HEIGHT_PCT = 27;

/**
 * PAINEL DA AGÊNCIA: elemento principal da parede. Cresce com o palco lógico
 * (não com a largura bruta), na faixa pedida de ~420–520px.
 */
export function agencyPanelWidthPx(stageWidth: number): number {
  return Math.round(Math.min(520, Math.max(420, (stageWidth || DEFAULT_SIZE.width) * 0.3)));
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
 * RESPIRO HORIZONTAL. `SAFE_GUTTER_PX` é o mínimo ABSOLUTO (anti-colisão);
 * `comfortGapPx` é o respiro DESEJADO entre footprints — proporcional à sala,
 * porque 56px de folga em 1366 lê diferente de 56px em 2560.
 */
const COMFORT_GAP_MIN_PX = 56;
const COMFORT_GAP_MAX_PX = 120;
export function comfortGapPx(size: WorldSize = DEFAULT_SIZE): number {
  const width = size.width || DEFAULT_SIZE.width;
  return Math.round(Math.min(COMFORT_GAP_MAX_PX, Math.max(COMFORT_GAP_MIN_PX, width * 0.05)));
}

/**
 * Downscale progressivo do 2x2 em desktop comum/large: quanto mais apertada a
 * largura útil, menor a estação — sem breakpoint brusco e sem aproximar os
 * centros. Ultrawide não entra aqui (fica com o tamanho maior).
 */
const TIGHT_WIDTH_PX = 1300;
const ROOMY_WIDTH_PX = 1700;
/** Redução máxima admitida por aperto (mantém legibilidade do card atual). */
export const MAX_DOWNSCALE = 0.14;

function tightnessFactor(size: WorldSize): number {
  const width = size.width || DEFAULT_SIZE.width;
  if (width >= ROOMY_WIDTH_PX) return 1;
  const t = Math.max(0, Math.min(1, (width - TIGHT_WIDTH_PX) / (ROOMY_WIDTH_PX - TIGHT_WIDTH_PX)));
  // t=0 (apertado) → 1 - MAX_DOWNSCALE ; t=1 (folgado) → 1
  return 1 - MAX_DOWNSCALE * (1 - t);
}

/**
 * Largura base (px) da estação. Ordem de decisão: (1) largura do perfil,
 * (2) downscale progressivo por aperto no 2x2, (3) clamp pelo respiro
 * desejado entre footprints, (4) clamp pela zona da cafeteria na fileira do
 * fundo, (5) piso absoluto anti-colisão. Reduzir a estação SEMPRE vem antes de
 * aproximar os centros.
 */
export function deskBaseWidth(
  count: number,
  size: WorldSize = DEFAULT_SIZE,
  options: DeskSlotOptions = {},
): number {
  const profile = resolveOfficeProfile(size);
  const width = size.width || DEFAULT_SIZE.width;
  const perRow = deskPerRow(count);
  const ultrawide = profile.id === "ultrawide" || profile.id === "ultrawideShort";
  let base = profile.baseWidth;

  // Mais de 2 por fileira: reduz proporcionalmente antes de qualquer clamp.
  if (perRow === 3) base *= 0.8;
  else if (perRow >= 4) base *= 0.66;
  if (count <= 2) base *= 1.06;

  const desired = base;
  // (2) Aperto real: só no 2x2 de desktop/large, nunca no ultrawide.
  if (!ultrawide && perRow === 2 && count > 2) base *= tightnessFactor(size);

  const scaleMax = Math.max(profile.scaleFront, profile.scaleBack);
  const gap = comfortGapPx(size);

  // Separação entre centros da fileira (a menor das duas fileiras).
  const sepPct =
    perRow === 1
      ? 100
      : perRow === 2
        ? Math.min(
            profile.centersBack[1] - profile.centersBack[0],
            profile.centersFront[1] - profile.centersFront[0],
          ) - profile.jitterPct * 2
        : (100 - 2 * (8 + 6)) / perRow;
  const sepPx = (sepPct / 100) * width;

  // (3) Respiro desejado e (5) piso absoluto viram tetos de largura.
  const comfortBase = (sepPx - gap) / scaleMax;
  const hardBase = (sepPx - SAFE_GUTTER_PX) / scaleMax;

  // (4) Cafeteria: entre o centro da mesa esquerda do fundo e o início da zona
  // do café precisam caber 1,5 footprints + respiro.
  let coffeeBase = Number.POSITIVE_INFINITY;
  if (options.coffeeCorner && perRow >= 2 && !richZonesActive(count, options)) {
    const centerLeftPx = (profile.centersBack[0] / 100) * width;
    coffeeBase = (coffeeZoneLeftPx(width) - centerLeftPx - gap) / (1.5 * profile.scaleBack);
  }

  // (4b) MODO RICO: as faixas laterais são ambiente reservado. A mesa mais à
  // esquerda não pode invadir Planejamento/Revisão e a mais à direita não pode
  // invadir Café/Reunião/Espera; os centros são fixos, então a largura cede.
  let richBase = Number.POSITIVE_INFINITY;
  let richSepBase = Number.POSITIVE_INFINITY;
  if (richZonesActive(count, options)) {
    const band = centerBandPx(width);
    const leftCenter = (Math.min(RICH_CENTERS_BACK[0], RICH_CENTERS_FRONT[0]) / 100) * width;
    const rightCenter = (Math.max(RICH_CENTERS_BACK[1], RICH_CENTERS_FRONT[1]) / 100) * width;
    const leftLimit = (2 * (leftCenter - band.left)) / profile.scaleFront;
    const rightLimit = (2 * (band.right - rightCenter)) / profile.scaleFront;
    richBase = Math.min(leftLimit, rightLimit);
    if (perRow >= 2) {
      const sep =
        Math.min(
          RICH_CENTERS_BACK[1] - RICH_CENTERS_BACK[0],
          RICH_CENTERS_FRONT[1] - RICH_CENTERS_FRONT[0],
        ) / 100;
      richSepBase = (sep * width - gap) / scaleMax;
    }
  }

  // Nunca encolher além do necessário: o piso de conforto é o downscale máximo.
  const floor = Math.max(MIN_BASE_WIDTH, desired * (1 - MAX_DOWNSCALE));
  const target = Math.min(base, comfortBase, coffeeBase, richBase, richSepBase);
  const withFloor = Math.max(target, Math.min(floor, base));

  return Math.round(
    Math.max(
      MIN_BASE_WIDTH,
      Math.min(withFloor, hardBase, richBase, richSepBase === Number.POSITIVE_INFINITY ? Infinity : richSepBase),
    ),
  );
}



/** Faixa vertical útil para composições genéricas (5+ estações). */
const GENERIC_MIN_ROW_GAP_PCT = 22;

/**
 * MODO RICO DE ZONAS (até 4 estações, desktop/tablet largo).
 * As faixas laterais são AMBIENTE FÍSICO (Planejamento/Revisão à esquerda,
 * Café/Reunião/Espera à direita) e por isso são reservadas em px: as mesas
 * ficam concentradas na faixa central, nunca invadindo as zonas.
 */
export const RICH_LEFT_ZONE_PX = 252;
export const RICH_RIGHT_ZONE_PX = 276;
/** Tetos das faixas: em palco largo elas crescem, mas não indefinidamente. */
export const RICH_LEFT_ZONE_MAX_PX = 312;
export const RICH_RIGHT_ZONE_MAX_PX = 336;

/**
 * Faixas físicas laterais em px do PALCO LÓGICO (~17–19% cada). Não são
 * percentuais puros: as zonas têm móveis com largura real, então há piso e teto.
 */
export function richLeftZonePx(stageWidth: number): number {
  const w = stageWidth || 1440;
  return Math.round(Math.min(RICH_LEFT_ZONE_MAX_PX, Math.max(RICH_LEFT_ZONE_PX, w * 0.18)));
}
export function richRightZonePx(stageWidth: number): number {
  const w = stageWidth || 1440;
  return Math.round(Math.min(RICH_RIGHT_ZONE_MAX_PX, Math.max(RICH_RIGHT_ZONE_PX, w * 0.19)));
}
/** Faixa superior do Painel da agência (parede): a fileira do fundo fica abaixo. */
export const RICH_PANEL_BAND_PCT = WALL_HEIGHT_PCT;
/** Centros horizontais (%) das mesas no modo rico — faixas 36–40% e 62–66%. */
export const RICH_CENTERS_BACK: [number, number] = [36, 65];
export const RICH_CENTERS_FRONT: [number, number] = [35, 66];
/** Altura visual acima do tampo (monitor + personagem + pilha), como fração da base. */
export const DESK_ABOVE_TABLE_RATIO = 0.52;

export interface DeskSlotOptions {
  /** A cafeteria está visível (desktop) e reserva o canto superior direito. */
  coffeeCorner?: boolean;
  /** Modo rico: reservar faixas laterais para as zonas do escritório. */
  sideZones?: boolean;
}

/** O modo rico só vale para até 4 estações: 5+ prioriza a operação. */
export function richZonesActive(count: number, options: DeskSlotOptions = {}): boolean {
  return !!options.sideZones && count > 0 && count <= 4;
}

/** Faixa central útil (px) entre as zonas laterais reservadas. */
export function centerBandPx(worldWidth: number): { left: number; right: number } {
  const left = richLeftZonePx(worldWidth);
  return { left, right: Math.max(left + 200, worldWidth - richRightZonePx(worldWidth)) };
}


/** Footprint real de uma estação, em px do mundo (usado por layout e testes). */
export function deskFootprint(
  slot: DeskSlot,
  base: number,
  size: WorldSize,
): { left: number; right: number; top: number; bottom: number } {
  const w = base * slot.scale;
  const centerX = (slot.leftPct / 100) * (size.width || DEFAULT_SIZE.width);
  const bottom = (slot.topPct / 100) * (size.height || DEFAULT_SIZE.height);
  return {
    left: centerX - w / 2,
    right: centerX + w / 2,
    bottom,
    top: bottom - w * DESK_ABOVE_TABLE_RATIO,
  };
}

export function computeDeskSlots(
  count: number,
  size: WorldSize = DEFAULT_SIZE,
  options: DeskSlotOptions = {},
): DeskSlot[] {
  if (count <= 0) return [];
  const profile = resolveOfficeProfile(size);
  const perRow = deskPerRow(count);
  const rows = Math.ceil(count / perRow);
  const width = size.width || DEFAULT_SIZE.width;
  const base = deskBaseWidth(count, size, options);
  const rich = richZonesActive(count, options);
  // Centro máximo permitido na FILEIRA DO FUNDO (a única na faixa do café).
  // Assimetria proposital: a fileira da frente continua livre.
  const backRightMaxPct = options.coffeeCorner && !rich
    ? ((coffeeZoneLeftPx(width) - (base * profile.scaleBack) / 2) / width) * 100
    : 100;



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
    // No modo rico a fileira do fundo precisa começar ABAIXO da faixa do painel
    // (parede) considerando monitor + personagem + pilha acima do tampo, e a
    // fileira da frente não pode encostar no rodapé.
    const height = size.height || DEFAULT_SIZE.height;
    const aboveTablePct = ((base * scale * DESK_ABOVE_TABLE_RATIO) / height) * 100;
    const minTopPct = rich ? Math.max(28, RICH_PANEL_BAND_PCT + aboveTablePct + 1) : 28;
    const maxTopPct = rich ? Math.min(96, 100 - (24 / height) * 100) : 96;
    const topPct = Math.min(maxTopPct, Math.max(minTopPct, anchors[row]));

    let leftPct: number;
    if (inRow === 1) {
      leftPct = 50;
    } else if (inRow === 2) {
      const centers = rich
        ? isFront
          ? RICH_CENTERS_FRONT
          : RICH_CENTERS_BACK
        : isFront
          ? profile.centersFront
          : profile.centersBack;
      leftPct = centers[posInRow] + (rich ? 0 : jitter(i + row, profile.jitterPct));
    } else {
      // Fileiras do fundo recuam levemente para dentro (perspectiva).
      const inset = 8 + (1 - rowT) * 6;
      const stepX = (100 - inset * 2) / inRow;
      leftPct = inset + stepX * (posInRow + 0.5) + jitter(i + row, profile.jitterPct * 1.5);
    }

    // Zona reservada: só a fileira do fundo (row 0) e só a estação mais à
    // direita dela precisam terminar antes do balcão do café.
    const isBackRow = row === 0 && rows > 1;
    const isRightmost = posInRow === inRow - 1;
    const clamped =
      isBackRow && isRightmost && inRow > 1 ? Math.min(leftPct, backRightMaxPct) : leftPct;


    slots.push({
      leftPct: Math.min(94, Math.max(6, clamped)),
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
