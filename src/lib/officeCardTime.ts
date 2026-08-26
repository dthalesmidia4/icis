/**
 * Apresentação temporal do card no MONITOR do escritório.
 *
 * Somente formatação: os dados vêm exatamente de `dueDate/dueTime` (INÍCIO
 * canônico) e `deliveryDate/deliveryTime` (TÉRMINO). Quando um dos lados não
 * existe, ele simplesmente não é exibido — nunca se inventa término.
 */
export interface OfficeCardSpanInput {
  dueDate?: string | null;
  dueTime?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
}

export interface OfficeCardSpan {
  /** Ex.: `24/08 17:30` (ou `null` quando não há data de início). */
  start: string | null;
  /** Ex.: `26/08 18:00` (ou `null` quando não há data de término). */
  end: string | null;
}

/** `2026-08-24` + `17:30:00` → `24/08 17:30`. Sem data, não há rótulo. */
export function officeTimeLabel(date?: string | null, time?: string | null): string | null {
  if (!date) return null;
  const [, m, d] = date.split("-");
  if (!m || !d) return null;
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
}

export function officeCardSpan(card: OfficeCardSpanInput): OfficeCardSpan {
  return {
    start: officeTimeLabel(card.dueDate, card.dueTime),
    end: officeTimeLabel(card.deliveryDate, card.deliveryTime),
  };
}

/** Há algo temporal para mostrar no monitor? */
export function hasOfficeCardSpan(span: OfficeCardSpan): boolean {
  return !!span.start || !!span.end;
}
