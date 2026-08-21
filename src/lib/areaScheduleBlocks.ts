/**
 * Utilitários PUROS de blocos de expediente (`user_area_schedules`).
 *
 * O intervalo/almoço NÃO é uma entidade paralela: cada bloco é uma linha real
 * de `user_area_schedules` e o intervalo é simplesmente o GAP entre dois blocos
 * do mesmo dia/área — exatamente o que `officeSchedule`/`freeSlot` já leem.
 */

export interface ScheduleBlock {
  id: string;
  user_id: string;
  work_area: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

const toMin = (t: string): number => {
  const [h, m] = (t || "").slice(0, 5).split(":");
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
};

export const isValidTime = (t: string): boolean => /^\d{2}:\d{2}$/.test((t || "").slice(0, 5));

/** Blocos de uma célula dia × área, ordenados por início. */
export function blocksForCell(
  rows: ScheduleBlock[],
  userId: string,
  weekday: number,
  area: string,
): ScheduleBlock[] {
  return rows
    .filter((r) => r.user_id === userId && r.weekday === weekday && r.work_area === area)
    .sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
}

export type BlockValidation = { ok: true } | { ok: false; error: string };

/**
 * Valida um bloco candidato contra os blocos já existentes da MESMA área/dia.
 * Blocos adjacentes (08–12 e 12–18) são permitidos; sobreposição não.
 */
export function validateBlock(
  existing: ScheduleBlock[],
  candidate: { start: string; end: string },
  ignoreId?: string,
): BlockValidation {
  const { start, end } = candidate;
  if (!isValidTime(start) || !isValidTime(end)) return { ok: false, error: "Horário inválido" };
  const s = toMin(start);
  const e = toMin(end);
  if (e <= s) return { ok: false, error: "Hora final deve ser maior que a inicial" };

  for (const r of existing) {
    if (ignoreId && r.id === ignoreId) continue;
    const rs = toMin(r.start_time);
    const re = toMin(r.end_time);
    if (rs === s && re === e) return { ok: false, error: "Período duplicado" };
    if (s < re && e > rs) return { ok: false, error: "Períodos não podem se sobrepor" };
  }
  return { ok: true };
}

/** Gap (intervalo) entre blocos consecutivos, em texto curto. */
export function describeGaps(blocks: ScheduleBlock[]): string[] {
  const sorted = [...blocks].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const out: string[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = sorted[i - 1].end_time.slice(0, 5);
    const start = sorted[i].start_time.slice(0, 5);
    if (toMin(start) > toMin(prevEnd)) out.push(`${prevEnd}–${start}`);
  }
  return out;
}

export interface ApplyWeekPlan {
  /** ids a apagar (blocos atuais dos dias destino, na mesma área). */
  toDelete: string[];
  /** blocos a inserir em cada dia destino. */
  toInsert: { weekday: number; start_time: string; end_time: string }[];
}

/**
 * Copia TODOS os blocos de um dia de origem (segunda) para os dias destino,
 * substituindo o conteúdo daqueles dias sem duplicar linhas.
 */
export function planApplyDayToWeek(params: {
  rows: ScheduleBlock[];
  userId: string;
  area: string;
  sourceWeekday: number;
  targetWeekdays: number[];
}): ApplyWeekPlan {
  const { rows, userId, area, sourceWeekday, targetWeekdays } = params;
  const source = blocksForCell(rows, userId, sourceWeekday, area);
  const toDelete: string[] = [];
  const toInsert: ApplyWeekPlan["toInsert"] = [];
  targetWeekdays
    .filter((wd) => wd !== sourceWeekday)
    .forEach((wd) => {
      blocksForCell(rows, userId, wd, area).forEach((r) => toDelete.push(r.id));
      source.forEach((b) => {
        toInsert.push({ weekday: wd, start_time: b.start_time, end_time: b.end_time });
      });
    });
  return { toDelete, toInsert };
}

/**
 * Comita um período pendente (draft ainda não salvo) e SÓ DEPOIS monta o plano
 * a partir de uma leitura fresca das linhas persistidas.
 *
 * Isso elimina o race do `aplicar seg → ter-sex`: o clique podia acontecer antes
 * do `onBlur` do draft, e o plano era montado sem o período recém-digitado.
 */
export async function commitAndPlanApplyWeek(params: {
  /** Commit do draft válido da célula de origem (retorna false se falhar). */
  pendingCommit?: (() => Promise<boolean>) | null;
  /** Leitura fresca das linhas persistidas do usuário/área. */
  fetchRows: () => Promise<ScheduleBlock[]>;
  userId: string;
  area: string;
  sourceWeekday: number;
  targetWeekdays: number[];
}): Promise<{ plan: ApplyWeekPlan; rows: ScheduleBlock[]; sourceCount: number }> {
  const { pendingCommit, fetchRows, userId, area, sourceWeekday, targetWeekdays } = params;
  if (pendingCommit) {
    const ok = await pendingCommit();
    if (!ok) throw new Error("Não foi possível salvar o período pendente");
  }
  const rows = await fetchRows();
  const plan = planApplyDayToWeek({ rows, userId, area, sourceWeekday, targetWeekdays });
  return { plan, rows, sourceCount: blocksForCell(rows, userId, sourceWeekday, area).length };
}
