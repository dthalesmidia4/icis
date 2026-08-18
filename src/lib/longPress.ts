/**
 * LONG-PRESS (pressionar e segurar) — núcleo puro, sem DOM.
 *
 * Usado no chip de etapa da Visão Geral: um clique normal continua abrindo o
 * card; segurar ~0,5s abre o seletor de etapa. Regras:
 *  - só dispara depois de `delayMs` com o dedo/mouse parado;
 *  - movimento acima de `moveTolerance` px CANCELA (é rolagem/arraste);
 *  - soltar antes do prazo CANCELA (é clique);
 *  - depois de disparar, o clique seguinte é consumido (`shouldSuppressClick`).
 */
export interface LongPressCoreOptions {
  delayMs?: number;
  moveTolerance?: number;
  onLongPress: () => void;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
}

export interface LongPressCore {
  start(x: number, y: number): void;
  move(x: number, y: number): void;
  /** `true` quando o gesto terminou COMO long-press (não é clique). */
  end(): boolean;
  cancel(): void;
  /** O próximo clique deve ser ignorado? Consome a marca. */
  shouldSuppressClick(): boolean;
  readonly pending: boolean;
}

export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE = 8;

export function createLongPressCore(opts: LongPressCoreOptions): LongPressCore {
  const delay = opts.delayMs ?? LONG_PRESS_DELAY_MS;
  const tolerance = opts.moveTolerance ?? LONG_PRESS_MOVE_TOLERANCE;
  const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>));

  let handle: number | null = null;
  let origin: { x: number; y: number } | null = null;
  let fired = false;
  let suppressClick = false;

  const clear = () => {
    if (handle != null) clearT(handle);
    handle = null;
    origin = null;
  };

  return {
    start(x, y) {
      clear();
      fired = false;
      origin = { x, y };
      handle = setT(() => {
        handle = null;
        fired = true;
        suppressClick = true;
        opts.onLongPress();
      }, delay);
    },
    move(x, y) {
      if (!origin || handle == null) return;
      if (Math.abs(x - origin.x) > tolerance || Math.abs(y - origin.y) > tolerance) clear();
    },
    end() {
      clear();
      const was = fired;
      fired = false;
      return was;
    },
    cancel() {
      clear();
      fired = false;
    },
    shouldSuppressClick() {
      const s = suppressClick;
      suppressClick = false;
      return s;
    },
    get pending() {
      return handle != null;
    },
  };
}
