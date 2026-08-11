/**
 * Núcleo PURO da busca de slot livre.
 *
 * Separado de `scheduleOccupancy` para poder ser testado sem banco:
 * dado o expediente do dia (janelas em minutos), os blocos ocupados e a
 * duração necessária, devolve o primeiro início possível.
 */

export interface Span {
  s: number;
  e: number;
}

export const toMin = (hm: string): number => {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10) || 0);
  return (h || 0) * 60 + (m || 0);
};

export const fromMin = (m: number): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
};

/** Une spans sobrepostos/adjacentes, já ordenados na saída. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].filter((x) => x.e > x.s).sort((a, b) => a.s - b.s);
  const out: Span[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.s <= last.e) {
      last.e = Math.max(last.e, cur.e);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Primeiro início dentro de `windows` (expediente) que caiba `duration`
 * sem tocar nenhum `busy`, começando em `earliest` ou depois.
 * Retorna null quando o dia não tem espaço.
 */
export function firstFreeStart(params: {
  windows: Span[];
  busy: Span[];
  duration: number;
  earliest?: number;
  /** Ignora estes minutos de início (já testados e reprovados). */
  rejected?: number[];
}): number | null {
  const duration = Math.max(5, params.duration);
  const windows = mergeSpans(params.windows);
  const busy = mergeSpans(params.busy);
  const earliest = params.earliest ?? 0;
  const rejected = new Set(params.rejected ?? []);

  for (const w of windows) {
    let candidate = Math.max(w.s, earliest);
    let guard = 0;
    while (candidate + duration <= w.e && guard++ < 400) {
      const clash = busy.find((b) => candidate < b.e && b.s < candidate + duration);
      if (clash) {
        candidate = clash.e;
        continue;
      }
      if (rejected.has(candidate)) {
        candidate += 15;
        continue;
      }
      return candidate;
    }
  }
  return null;
}

export const DEFAULT_WORK_WINDOWS: Span[] = [
  { s: toMin("09:00"), e: toMin("12:00") },
  { s: toMin("13:30"), e: toMin("18:00") },
];

/**
 * Monta as janelas de expediente do dia a partir de `user_area_schedules`.
 * - Sem NENHUMA faixa configurada no dia → expediente padrão (neutro).
 * - Com faixas de outras áreas apenas → dia indisponível (`[]`).
 */
export function buildDayWindows(
  rows: Array<{ work_area: string; start_time: string; end_time: string }>,
  area: string,
): Span[] {
  if (rows.length === 0) return DEFAULT_WORK_WINDOWS;
  const mine = rows
    .filter((r) => r.work_area === area)
    .map((r) => ({ s: toMin(r.start_time), e: toMin(r.end_time) }));
  return mergeSpans(mine);
}
