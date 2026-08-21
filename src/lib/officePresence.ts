/**
 * Presença derivada do colaborador na tela `/escritorio`.
 *
 * Semântica canônica reaproveitada do resto do ICIS:
 * - `due_date` + `due_time`  = INÍCIO da janela de trabalho da demanda;
 * - `delivery_date` + `delivery_time` = FIM previsto dessa janela;
 * - `tenants.settings.work_hours` (via `useWorkHoursConfig`) = expediente e
 *   almoço oficiais do tenant.
 *
 * Nada aqui inventa horário: quando não há dado confiável o estado cai para
 * `available`, que não move o personagem para a cafeteria.
 */
import type { WorkHoursConfig } from "@/lib/reorderSequence";

export type PresenceState = "working_now" | "micro_break" | "official_break" | "available";

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
  /** Expediente oficial do tenant, quando disponível. */
  workHours?: WorkHoursConfig | null;
}

export interface PresenceResult {
  state: PresenceState;
  /** Próximo início confiável (ms) quando o estado é `micro_break`. */
  nextStartTs: number | null;
  /** Minutos até o próximo início (arredondado), quando confiável. */
  minutesToNext: number | null;
}

const hmToMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const minutesOfDay = (now: number): number => {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
};

/** true quando `now` está dentro do intervalo de almoço oficial do tenant. */
export function isOfficialBreak(now: number, workHours?: WorkHoursConfig | null): boolean {
  const start = hmToMinutes(workHours?.lunchStart);
  const end = hmToMinutes(workHours?.lunchEnd);
  if (start === null || end === null || end <= start) return false;
  const cur = minutesOfDay(now);
  return cur >= start && cur < end;
}

/** true quando `now` está dentro do expediente oficial do tenant. */
export function isWithinWorkHours(now: number, workHours?: WorkHoursConfig | null): boolean {
  const start = hmToMinutes(workHours?.start);
  const end = hmToMinutes(workHours?.end);
  if (start === null || end === null || end <= start) return false;
  const day = new Date(now).getDay();
  if (day === 0 || day === 6) return false;
  const cur = minutesOfDay(now);
  return cur >= start && cur < end;
}

/**
 * Estado de presença:
 * - `working_now`: existe demanda cuja janela já começou e ainda está pendente
 *   (inclui atraso — o card continua na fila, logo o trabalho continua);
 * - `official_break`: almoço oficial configurado no tenant;
 * - `micro_break`: dentro do expediente, sem janela ativa, mas com próxima
 *   demanda com início confiável no futuro (o gap real entre demandas);
 * - `available`: sem evidência suficiente.
 */
export function resolvePresence({ now, queue, workHours }: PresenceInput): PresenceResult {
  const started = queue.filter((c) => c.startTs !== null && (c.startTs as number) <= now);
  if (started.length > 0) {
    return { state: "working_now", nextStartTs: null, minutesToNext: null };
  }

  if (isOfficialBreak(now, workHours)) {
    return { state: "official_break", nextStartTs: null, minutesToNext: null };
  }

  const upcoming = queue
    .filter((c) => c.startTs !== null && (c.startTs as number) > now)
    .sort((a, b) => (a.startTs as number) - (b.startTs as number))[0];

  if (upcoming && isWithinWorkHours(now, workHours)) {
    const nextStartTs = upcoming.startTs as number;
    return {
      state: "micro_break",
      nextStartTs,
      minutesToNext: Math.max(0, Math.round((nextStartTs - now) / 60_000)),
    };
  }

  return { state: "available", nextStartTs: null, minutesToNext: null };
}

/** Rótulo curto e confiável do próximo início (`próxima em 4 min` / `próxima 10:35`). */
export function nextStartLabel(result: PresenceResult): string | null {
  if (result.state !== "micro_break" || result.nextStartTs === null) return null;
  if (result.minutesToNext !== null && result.minutesToNext <= 90) {
    return `próxima em ${result.minutesToNext} min`;
  }
  const d = new Date(result.nextStartTs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `próxima ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default resolvePresence;
