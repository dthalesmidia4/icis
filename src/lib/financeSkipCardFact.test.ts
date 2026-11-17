/**
 * REGRESSÃO REAL — "Pular este mês" em cobrança REAL de cartão (Adplane).
 *
 * Adplane (USD, cobrança dia 24, Itaú 7587 fech. 13 / venc. 25): ativa em
 * SET/OUT (mensal), inativa desde NOV (variável). A cobrança de 24/10 já está
 * salva (sem `scheduled_date`), aberta e fora de fatura → pode ser pulada.
 * A de 24/09 está na fatura OUT paga → nunca.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  buildStatementGroups,
  effectiveOccurrences,
  type FinanceItem,
  type FinanceOccurrence,
  type MonthRow,
} from "./financeModel";
import { statementSkippedEntries } from "./financeComposition";
import { skipActionForRow, skipDateForRow } from "./financeRowStatus";

const SET = { year: 2026, month: 9 };
const OUT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };
const DEZ = { year: 2026, month: 12 };

const itau = {
  id: "itau", name: "Itaú ••••7587", kind: "card", cost_center: "compartilhado", active: true,
  currency: "BRL", recurrence_type: "monthly", statement_closing_day: 13, statement_due_day: 25,
} as FinanceItem;
const adplaneActive = {
  id: "adplane", name: "Adplane", kind: "tool", cost_center: "midia", active: true,
  currency: "USD", recurrence_type: "monthly", charge_day: 24, card_item_id: "itau", default_amount_original: 20,
} as unknown as FinanceItem;
const adplaneInactive = { ...adplaneActive, active: false, recurrence_type: "variable" } as FinanceItem;

const itemsByCompetence = new Map<string, FinanceItem[]>([
  ["2026-09-01", [itau, adplaneActive]],
  ["2026-10-01", [itau, adplaneActive]],
  ["2026-11-01", [itau, adplaneInactive]],
  ["2026-12-01", [itau, adplaneInactive]],
]);

const cyc = (comp: string, s: string, e: string, actual: boolean) =>
  [`itau|${comp}`, { cardId: "itau", competenceMonth: comp, cycleStart: s, cycleEnd: e, closingDateIsActual: actual }] as const;
const cycles = new Map([
  cyc("2026-10-01", "2026-09-14", "2026-10-14", true),
  cyc("2026-11-01", "2026-10-15", "2026-11-13", false),
  cyc("2026-12-01", "2026-11-14", "2026-12-13", false),
]) as never;

function occ(p: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { currency: "BRL", entry_role: "regular", ...p } as FinanceOccurrence;
}
const stmtOut = occ({ id: "0eb7", item_id: "itau", competence_month: "2026-10-01", due_date: "2026-10-25", statement_closing_date: "2026-10-14", paid_at: "2026-10-16T15:00:00Z", amount_brl: 110 });
const stmtNov = occ({ id: "stmt-nov", item_id: "itau", competence_month: "2026-11-01", due_date: "2026-11-25" });
/** d2d7: cobrança 24/09, congelada na fatura OUT (paga). */
const adplaneSep = occ({
  id: "d2d7", item_id: "adplane", competence_month: "2026-09-01", charge_date: "2026-09-24", currency: "USD",
  amount_original: 20, amount_brl: 110, statement_occurrence_id: "0eb7", card_item_id_snapshot: "itau",
  statement_competence_snapshot: "2026-10-01",
});
/** 81b9: cobrança 24/10 salva, aberta, sem vínculo de fatura. */
const adplaneOct = occ({ id: "81b9", item_id: "adplane", competence_month: "2026-10-01", charge_date: "2026-10-24", currency: "USD", amount_original: 20, amount_brl: 112 });
/** Marcador que `finance_skip_occurrence(adplane, 2026-10-24)` grava. */
const skipMarker = occ({ id: "mk", item_id: "adplane", competence_month: "2026-10-01", scheduled_date: "2026-10-24", currency: "USD", skipped_at: "2026-11-17T14:30:00Z" });

const base = [stmtOut, stmtNov, adplaneSep, adplaneOct];
const items = [itau, adplaneActive];
const rowOf = (competence: typeof OUT, occurrences: FinanceOccurrence[], id: string): MonthRow => {
  const list = itemsByCompetence.get(`${competence.year}-${String(competence.month).padStart(2, "0")}-01`)!;
  const row = buildMonthRows({ items: list, occurrences, competence }).find((r) => r.occurrence?.id === id);
  if (!row) throw new Error(`linha ${id} ausente`);
  return row;
};
const adplaneIn = (competence: typeof OUT, occurrences: FinanceOccurrence[]) =>
  buildStatementGroups({ items, occurrences, competence, cycles, itemsByCompetence })[0].components.filter(
    (c) => c.item.id === "adplane",
  );

describe("Adplane — quando 'Pular este mês' é oferecido", () => {
  it("24/10 salva, aberta e fora de fatura: permitido, pela data da cobrança", () => {
    const row = rowOf(OUT, base, "81b9");
    expect(row.projected).toBe(false);
    expect(row.scheduledDate).toBeNull();
    expect(skipActionForRow(row, false)).toBe("card_fact");
    expect(skipDateForRow(row)).toBe("2026-10-24");
  });

  it("24/09 na fatura OUT paga: proibido", () => {
    const row = rowOf(SET, base, "d2d7");
    expect(skipActionForRow(row, false)).toBeNull();
    expect(skipActionForRow(row, true)).toBeNull();
  });

  it("fato pago, fechado, recarga ou fatura do cartão: proibido", () => {
    const row = rowOf(OUT, base, "81b9");
    expect(skipActionForRow({ ...row, paid: true }, false)).toBeNull();
    expect(skipActionForRow(row, true)).toBeNull();
    expect(skipActionForRow({ ...row, supplemental: true, entryRole: "recharge" }, false)).toBeNull();
    expect(skipActionForRow({ ...row, occurrence: { ...row.occurrence!, statement_competence_snapshot: "2026-11-01" } }, false)).toBeNull();
    expect(skipActionForRow({ ...row, item: itau }, false)).toBeNull();
  });

  it("projeção no cartão mantém 'Não foi cobrado neste ciclo'; cronograma mantém o pulo", () => {
    const row = rowOf(OUT, base, "81b9");
    expect(skipActionForRow({ ...row, projected: true, occurrence: null }, false)).toBe("projected_card");
    expect(skipActionForRow({ ...row, scheduledDate: "2026-10-24" }, false)).toBe("scheduled");
  });
});

describe("Adplane — depois do pulo de 24/10", () => {
  it("antes do pulo a fatura NOV cobra a 24/10 uma vez", () => {
    expect(adplaneIn(NOV, base).map((c) => c.occurrence?.id)).toEqual(["81b9"]);
  });

  it("o fato aberto da mesma cobrança sai do status efetivo e da fatura NOV", () => {
    const occurrences = [...base, skipMarker];
    expect(effectiveOccurrences(occurrences).some((o) => o.id === "81b9")).toBe(false);
    expect(adplaneIn(NOV, occurrences)).toHaveLength(0);
  });

  it("detalhes da fatura NOV mostram o pulo; a fatura OUT paga continua com 24/09", () => {
    const occurrences = [...base, skipMarker];
    const entries = statementSkippedEntries({ occurrences, itemsByCompetence, fallbackItems: items, competence: NOV, cycles });
    expect(entries.map((e) => e.occurrence.id)).toEqual(["mk"]);
    expect(statementSkippedEntries({ occurrences, itemsByCompetence, fallbackItems: items, competence: OUT, cycles })).toHaveLength(0);
    expect(adplaneIn(OUT, occurrences).map((c) => c.occurrence?.id)).toEqual(["d2d7"]);
  });

  it("Restaurar devolve a 24/10 exatamente uma vez", () => {
    const restored = { ...skipMarker, skipped_at: null, restored_at: "2026-11-17T15:00:00Z" } as FinanceOccurrence;
    const occurrences = [...base, restored];
    expect(adplaneIn(NOV, occurrences).map((c) => c.occurrence?.id)).toEqual(["81b9"]);
    const outRows = buildMonthRows({ items, occurrences, competence: OUT }).filter((r) => r.item.id === "adplane");
    expect(outRows.map((r) => r.occurrence?.id)).toEqual(["81b9"]);
  });

  it("mês futuro com cadastro inativo não projeta Adplane", () => {
    const occurrences = [...base, skipMarker];
    expect(adplaneIn(DEZ, occurrences)).toHaveLength(0);
    expect(buildMonthRows({ items: [itau, adplaneInactive], occurrences, competence: DEZ }).filter((r) => r.item.id === "adplane")).toHaveLength(0);
  });
});
