/**
 * Presença derivada do colaborador na tela `/escritorio`.
 *
 * Regra estrutural: estar FORA de uma janela de trabalho válida vence o fato de
 * um card estar iniciado/atrasado. Card atrasado continua atrasado e na fila,
 * mas almoço/fim de expediente nunca vira "trabalhando".
 *
 * As janelas chegam prontas de `officeSchedule.resolveUserWindows` (fonte:
 * `user_area_schedules`, com fallback em `tenants.settings.work_hours`), e o
 * relógio usa a timezone canônica do expediente via `zonedClockParts`.
 */
import type { Span } from "@/lib/freeSlot";
import { DEFAULT_WORK_HOURS, zonedClockParts } from "@/lib/reorderSequence";

export type PresenceState =
  | "working_now"
  | "micro_break"
  | "official_break"
  | "off_shift"
  | "available";

export interface PresenceCardWindow {
  id: string;
  /** Início canônico (due_date + due_time) em ms, ou null quando indefinido. */
  startTs: number | null;
  /** Fim canônico (delivery_date + delivery_time) em ms, ou null. */
  endTs: number | null;
}

export interface PresenceInput {
  now: number;
  /** Fila operacional do colaborador (ordem irrelevante). */
  queue: PresenceCardWindow[];
  /** Janelas de expediente do colaborador HOJE (minutos do dia, já mescladas). */
  windows: Span[];
  /** Timezone canônica do expediente (default: America/Sao_Paulo). */
  tz?: string;
}

export interface PresenceResult {
  state: PresenceState;
  /** Próximo início confiável (ms) quando o estado é `micro_break`. */
  nextStartTs: number | null;
  /** Minutos até o próximo início (arredondado), quando confiável. */
  minutesToNext: number | null;
  /** Retorno do expediente (`HH:MM`) quando em intervalo oficial. */
  returnsAt: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fromMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

const idle = (state: PresenceState, returnsAt: string | null = null): PresenceResult => ({
  state,
  nextStartTs: null,
  minutesToNext: null,
  returnsAt,
});

/**
 * - `working_now`: dentro de janela válida E com demanda já iniciada;
 * - `micro_break`: dentro de janela válida, sem card ativo, com próximo início confiável;
 * - `official_break`: hoje há expediente, mas AGORA está num GAP entre blocos;
 * - `off_shift`: antes do início, depois do fim, dia sem expediente/fim de semana;
 * - `available`: dentro da janela sem evidência de tarefa corrente/próxima.
 */
export function resolvePresence({ now, queue, windows, tz }: PresenceInput): PresenceResult {
  const parts = zonedClockParts(new Date(now), tz || DEFAULT_WORK_HOURS.tz);
  const cur = parts.minutes;

  if (!windows || windows.length === 0) return idle("off_shift");

  const inWindow = windows.some((w) => cur >= w.s && cur < w.e);
  if (!inWindow) {
    const firstStart = windows[0].s;
    const lastEnd = windows[windows.length - 1].e;
    if (cur < firstStart || cur >= lastEnd) return idle("off_shift");
    const nextBlock = windows.find((w) => w.s > cur);
    return idle("official_break", nextBlock ? fromMin(nextBlock.s) : null);
  }

  const started = queue.some((c) => c.startTs !== null && (c.startTs as number) <= now);
  if (started) return idle("working_now");

  const upcoming = queue
    .filter((c) => c.startTs !== null && (c.startTs as number) > now)
    .sort((a, b) => (a.startTs as number) - (b.startTs as number))[0];

  if (upcoming) {
    const nextStartTs = upcoming.startTs as number;
    return {
      state: "micro_break",
      nextStartTs,
      minutesToNext: Math.max(0, Math.round((nextStartTs - now) / 60_000)),
      returnsAt: null,
    };
  }

  return idle("available");
}

/**
 * Elegibilidade da CAFETERIA: quem está no contexto do expediente mas NÃO está
 * trabalhando agora. Inclui `available` (dentro da janela, fila vazia),
 * `micro_break` (gap curto entre demandas) e `official_break` (intervalo).
 * Nunca `working_now` nem `off_shift`.
 */
export function isCoffeeEligible(state: PresenceState): boolean {
  return state === "available" || state === "micro_break" || state === "official_break";
}

/** Rótulo curto e confiável do próximo início (`próxima em 4 min` / `próxima 10:35`). */
export function nextStartLabel(result: PresenceResult): string | null {
  if (result.state !== "micro_break" || result.nextStartTs === null) return null;
  if (result.minutesToNext !== null && result.minutesToNext <= 90) {
    return `próxima em ${result.minutesToNext} min`;
  }
  const d = new Date(result.nextStartTs);
  return `próxima ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default resolvePresence;
