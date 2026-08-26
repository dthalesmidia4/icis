/**
 * Datas do Financeiro digitadas à mão.
 *
 * O contrato EXTERNO é sempre ISO `YYYY-MM-DD` (o banco não aceita outra
 * coisa). O contrato INTERNO do campo é o texto `DD/MM/AAAA` que a pessoa
 * digita. Este módulo é a única tradução entre os dois — sem depender do
 * comportamento de `<input type="date">`, que em vários ambientes só aceita o
 * calendário nativo e ignora a digitação.
 *
 * Regras deliberadas:
 *  - edição PARCIAL é válida como texto (`05/0`), mas não produz ISO;
 *  - data impossível (31/02) NUNCA vira outra data silenciosamente: fica sem
 *    ISO e o campo acusa;
 *  - texto vazio significa "sem data" — nunca inventamos data automática.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-08-05` -> `05/08/2026`. Entrada inválida/vazia devolve "". */
export function isoToDateText(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = ISO_RE.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Mantém só dígitos e insere as barras conforme a pessoa digita/cola. */
export function maskDateText(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Dia/mês/ano existem de verdade? (rejeita 31/02, 00/01, mês 13...) */
export function isRealDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || year > 2999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * `05/08/2026` -> `2026-08-05`. Texto vazio, parcial ou data impossível
 * devolve `null` (o chamador decide se isso é erro ou "sem data").
 */
export function dateTextToIso(text: string | null | undefined): string | null {
  const value = (text ?? "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isRealDate(day, month, year)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Texto está no meio da digitação (não é vazio nem uma data completa válida)? */
export function isIncompleteDateText(text: string): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  return dateTextToIso(value) == null;
}

/** ISO -> `Date` em UTC, para alimentar o calendário sem pular de dia. */
export function isoToCalendarDate(iso: string | null | undefined): Date | undefined {
  const m = iso ? ISO_RE.exec(iso.trim()) : null;
  if (!m) return undefined;
  const day = Number(m[3]);
  const month = Number(m[2]);
  const year = Number(m[1]);
  if (!isRealDate(day, month, year)) return undefined;
  return new Date(year, month - 1, day);
}

/** `Date` do calendário -> ISO local (sem deslocamento por fuso). */
export function calendarDateToIso(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
