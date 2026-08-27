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

export type OfficeProfileId =
  | "compact"
  | "desktopShort"
  | "desktop"
  | "large"
  | "ultrawide"
  | "ultrawideShort";

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
  /**
   * RESPONSIVIDADE VISUAL POR PERFIL (desktop normal ≠ ultrawide).
   * Painel da parede: teto de largura (px) e altura na parede (%).
   */
  panelWidthPx: number;
  panelTopPct: number;
  /** Largura relativa do monitor dentro da estação (%). */
  monitorPct: number;
  /** Footprint (px) reservado às faixas laterais no modo rico. */
  leftZonePx: number;
  rightZonePx: number;
  /**
   * DENSIDADE DO CENÁRIO. O desktop normal nascia "grande" (só ficava correto
   * com 80% de zoom do navegador): este fator encolhe cenário/gaps SEM tocar
   * nos monitores (que compensam via `monitorPct`) e sem mexer no ultrawide.
   */
  sceneScale: number;
  /** Escala do respiro entre footprints (acompanha `sceneScale`). */
  gapScale: number;
  /**
   * Centros das mesas no modo rico. IMPORTANTE: iguais em `desktop` e
   * `desktopShort` (a altura muda âncoras verticais, nunca a matemática
   * horizontal), para o anti-colisão continuar determinístico.
   */
  richCentersBack: [number, number];
  richCentersFront: [number, number];
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
export const MONITOR_MAX_PCT = 76;
export function deskMonitorWidthPct(size: WorldSize = DEFAULT_SIZE): number {
  // Por PERFIL: desktop normal precisa de card claramente HORIZONTAL;
  // ultrawide já tem estação larga e cresce menos em proporção.
  return Math.min(MONITOR_MAX_PCT, resolveOfficeProfile(size).monitorPct);
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
export const WALL_PANEL_BAND_TOP_PCT = 13;
export const WALL_HEIGHT_PCT = 27;

/**
 * PAINEL DA AGÊNCIA: elemento principal da parede, com TETO POR PERFIL.
 * Desktop normal ~380–400px (não pode dominar a cena nem competir com os
 * monitores); ultrawide ~492–508px. Cresce com o palco lógico, nunca com a
 * largura bruta da viewport.
 */
export function agencyPanelWidthPx(stageWidth: number, size?: WorldSize): number {
  const profile = resolveOfficeProfile(size ?? { width: stageWidth, height: DEFAULT_SIZE.height });
  const stage = stageWidth || DEFAULT_SIZE.width;
  return Math.round(Math.min(profile.panelWidthPx, Math.max(320, stage * 0.34)));
}

/** Altura (%) do topo do painel na parede — por perfil. */
export function agencyPanelTopPct(size: WorldSize = DEFAULT_SIZE): number {
  return resolveOfficeProfile(size).panelTopPct;
}




const DEFAULT_SIZE: WorldSize = { width: 1440, height: 860 };


/** Faixas laterais e centros do modo rico no DESKTOP NORMAL (1366–1599). */
const DESKTOP_RICH = {
  leftZonePx: 208,
  rightZonePx: 214,
  richCentersBack: [32, 68] as [number, number],
  richCentersFront: [32, 68] as [number, number],
};
/** Faixas/centros do ULTRAWIDE: mais respiro, painel maior, monitor menor. */
const ULTRAWIDE_RICH = {
  richCentersBack: [34, 66] as [number, number],
  richCentersFront: [33, 67] as [number, number],
};

export function resolveOfficeProfile(size: WorldSize = DEFAULT_SIZE): OfficeProfile {
  const width = size.width || DEFAULT_SIZE.width;
  const height = size.height || DEFAULT_SIZE.height;
  const ratio = width / Math.max(height, 1);
  // ULTRAWIDE É FORMATO, NÃO SÓ LARGURA. 1920x1080 (ratio 1.78) é monitor
  // NORMAL e caía no perfil ultrawide, nascendo grande demais em 100% de zoom.
  const ultrawide = ratio >= 2.1 || (width >= 2200 && ratio >= 1.9);

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
          panelWidthPx: 492,
          panelTopPct: 13,
          monitorPct: 68,
          leftZonePx: 300,
          rightZonePx: 312,
          sceneScale: 1,
          gapScale: 1,
          ...ULTRAWIDE_RICH,
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
          panelWidthPx: 508,
          panelTopPct: 13,
          monitorPct: 68,
          leftZonePx: 312,
          rightZonePx: 330,
          sceneScale: 1,
          gapScale: 1,
          ...ULTRAWIDE_RICH,
        };
  }

  if (width >= 1600) {
    // 1920x1080 cai aqui: densidade de DESKTOP NORMAL (cenário mais compacto,
    // monitor mais largo) — não a densidade do ultrawide.
    return {
      id: "large",
      topAnchorPct: 50,
      bottomAnchorPct: 86,
      centersBack: [28, 72],
      centersFront: [25.5, 74.5],
      baseWidth: 358,
      jitterPct: 0.5,
      scaleBack: 0.95,
      scaleFront: 1.06,
      panelWidthPx: 356,
      panelTopPct: 10.5,
      monitorPct: 80,
      leftZonePx: 192,
      rightZonePx: 198,
      sceneScale: 0.86,
      gapScale: 0.88,
      richCentersBack: [33, 67],
      richCentersFront: [33, 67],
    };
  }

  if (width >= 1200) {
    // DESKTOP NORMAL: painel mais estreito e alto na parede, cenário compacto.
    // `desktopShort` (ex.: 1366x768) só muda âncoras/verticalidade.
    const short = height < 800;
    return {
      id: short ? "desktopShort" : "desktop",
      topAnchorPct: short ? 51 : 50,
      bottomAnchorPct: short ? 87 : 86,
      centersBack: [28, 72],
      centersFront: [26, 74],
      baseWidth: short ? 336 : 348,
      jitterPct: 0.8,
      scaleBack: 0.94,
      scaleFront: 1.05,
      panelWidthPx: short ? 336 : 348,
      panelTopPct: short ? 9 : 10,
      monitorPct: 80,
      sceneScale: short ? 0.82 : 0.84,
      gapScale: short ? 0.84 : 0.86,
      ...DESKTOP_RICH,
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
    panelWidthPx: 340,
    panelTopPct: 13,
    monitorPct: 72,
    leftZonePx: 200,
    rightZonePx: 206,
    sceneScale: 0.92,
    gapScale: 0.92,
    richCentersBack: [33, 67],
    richCentersFront: [33, 67],
  };
}

/**
 * ESCALA DE CENÁRIO por perfil, para os componentes decorativos/ambientais
 * (Missões, Planejamento, Café, Reunião, Espera) nascerem já compactos no
 * desktop normal — sem `scale()` global e sem depender do zoom do navegador.
 */
export function officeSceneScale(size: WorldSize = DEFAULT_SIZE): number {
  return resolveOfficeProfile(size).sceneScale;
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
  return Math.round(Math.min(COMFORT_GAP_MAX_PX, Math.max(COMFORT_GAP_MIN_PX, width * 0.044)));
}

/**
 * Downscale progressivo do 2x2 em desktop comum/large: quanto mais apertada a
 * largura útil, menor a estação — sem breakpoint brusco e sem aproximar os
 * centros. Ultrawide não entra aqui (fica com o tamanho maior).
 */
const TIGHT_WIDTH_PX = 1300;
const ROOMY_WIDTH_PX = 1700;
/** Redução máxima admitida por aperto (mantém legibilidade do card atual). */
export const MAX_DOWNSCALE = 0.08;

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
    const band = centerBandPx(size);
    const back = profile.richCentersBack;
    const front = profile.richCentersFront;
    const leftCenter = (Math.min(back[0], front[0]) / 100) * width;
    const rightCenter = (Math.max(back[1], front[1]) / 100) * width;
    const leftLimit = (2 * (leftCenter - band.left)) / profile.scaleFront;
    const rightLimit = (2 * (band.right - rightCenter)) / profile.scaleFront;
    richBase = Math.min(leftLimit, rightLimit);
    if (perRow >= 2) {
      const sep = Math.min(back[1] - back[0], front[1] - front[0]) / 100;
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
export const RICH_LEFT_ZONE_PX = 208;
export const RICH_RIGHT_ZONE_PX = 214;
/** Tetos das faixas: em palco largo elas crescem, mas não indefinidamente. */
export const RICH_LEFT_ZONE_MAX_PX = 312;
export const RICH_RIGHT_ZONE_MAX_PX = 336;

/** Aceita largura do palco (número) ou o `WorldSize` completo. */
function asStageSize(stage: number | WorldSize): WorldSize {
  return typeof stage === "number" ? { width: stage, height: DEFAULT_SIZE.height } : stage;
}

/**
 * Faixas físicas laterais em px do PALCO LÓGICO. POR PERFIL: no desktop normal
 * elas ficam enxutas (~208/214px) para não comprimir o núcleo central das 4
 * mesas; em ultrawide crescem (~300/330px) mantendo o respiro atual.
 */
export function richLeftZonePx(stage: number | WorldSize): number {
  const size = asStageSize(stage);
  const w = size.width || 1440;
  const profile = resolveOfficeProfile(size);
  return Math.round(
    Math.min(RICH_LEFT_ZONE_MAX_PX, Math.max(RICH_LEFT_ZONE_PX, Math.min(profile.leftZonePx, w * 0.18))),
  );
}
export function richRightZonePx(stage: number | WorldSize): number {
  const size = asStageSize(stage);
  const w = size.width || 1440;
  const profile = resolveOfficeProfile(size);
  return Math.round(
    Math.min(RICH_RIGHT_ZONE_MAX_PX, Math.max(RICH_RIGHT_ZONE_PX, Math.min(profile.rightZonePx, w * 0.19))),
  );
}
/** Faixa superior do Painel da agência (parede): a fileira do fundo fica abaixo. */
export const RICH_PANEL_BAND_PCT = WALL_HEIGHT_PCT;
/** Centros horizontais (%) das mesas no modo rico (fallback do perfil). */
export const RICH_CENTERS_BACK: [number, number] = [34, 66];
export const RICH_CENTERS_FRONT: [number, number] = [33, 67];
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
export function centerBandPx(stage: number | WorldSize): { left: number; right: number } {
  const size = asStageSize(stage);
  const width = size.width || DEFAULT_SIZE.width;
  const left = richLeftZonePx(size);
  return { left, right: Math.max(left + 200, width - richRightZonePx(size)) };
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
          ? profile.richCentersFront
          : profile.richCentersBack
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
