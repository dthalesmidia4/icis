/**
 * REGRESSÃO REAL — alocação excepcional por `statement_competence_snapshot`.
 *
 * FACEBOOK IMPULCIONAMENTO, compra real de 13/10 (R$ 16,68), competence NOV,
 * aberta. Itaú 7587: OUT real 14/09–14/10 (fechada e paga), NOV 15/10–13/11.
 * O banco lançou a compra na fatura NOV após a virada de 13/10.
 */
import { describe, it, expect } from "vitest";
import { buildStatementGroups, type FinanceItem, type FinanceOccurrence } from "./financeModel";

const OUT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };

const itau = {
  id: "itau", name: "Itaú ••••7587", kind: "card", cost_center: "compartilhado", active: true,
  currency: "BRL", recurrence_type: "monthly", statement_closing_day: 13, statement_due_day: 25,
} as FinanceItem;
const facebook = {
  id: "fb", name: "FACEBOOK IMPULCIONAMENTO", kind: "tool", cost_center: "midia", active: true,
  currency: "BRL", recurrence_type: "variable", card_item_id: "itau",
} as unknown as FinanceItem;
const items = [itau, facebook];

const cyc = (comp: string, s: string, e: string, actual: boolean) =>
  [`itau|${comp}`, { cardId: "itau", competenceMonth: comp, cycleStart: s, cycleEnd: e, closingDateIsActual: actual }] as const;
const cycles = new Map([
  cyc("2026-10-01", "2026-09-14", "2026-10-14", true),
  cyc("2026-11-01", "2026-10-15", "2026-11-13", false),
]) as never;

const occ = (p: Partial<FinanceOccurrence> & { id: string; item_id: string }) =>
  ({ currency: "BRL", entry_role: "regular", ...p }) as FinanceOccurrence;
const stmtOut = occ({ id: "stmt-out", item_id: "itau", competence_month: "2026-10-01", statement_closing_date: "2026-10-14", paid_at: "2026-10-20T12:00:00Z", amount_brl: 100 });
const stmtNov = occ({ id: "stmt-nov", item_id: "itau", competence_month: "2026-11-01" });
/** Fato do dia 13 histórico, já congelado na fatura OUT paga. */
const histOut = occ({ id: "hist-13-09", item_id: "fb", competence_month: "2026-10-01", charge_date: "2026-09-13", amount_brl: 100, paid_at: "2026-10-20T12:00:00Z", statement_occurrence_id: "stmt-out", statement_competence_snapshot: "2026-10-01", card_item_id_snapshot: "itau" });
const fb = (snapshot: string | null) =>
  occ({ id: "9bf9", item_id: "fb", competence_month: "2026-11-01", charge_date: "2026-10-13", amount_brl: 16.68, statement_competence_snapshot: snapshot });

const fbIn = (competence: typeof NOV, occurrences: FinanceOccurrence[]) =>
  buildStatementGroups({ items, occurrences, competence, cycles })[0].components.filter((c) => c.item.id === "fb");

describe("Fatura aberta — snapshot explícito da compra", () => {
  it("snapshot NOV: Facebook 13/10 entra na fatura NOV uma vez, com a data da compra", () => {
    const rows = fbIn(NOV, [stmtOut, stmtNov, histOut, fb("2026-11-01")]);
    expect(rows.map((r) => r.occurrence?.id)).toEqual(["9bf9"]);
    expect(rows[0].projected).toBe(false);
    expect(rows[0].chargeDate).toBe("2026-10-13");
    expect(rows[0].amountBrl).toBe(16.68);
  });

  it("OUT fechada e paga continua só com o vínculo histórico", () => {
    const rows = fbIn(OUT, [stmtOut, stmtNov, histOut, fb("2026-11-01")]);
    expect(rows.map((r) => r.occurrence?.id)).toEqual(["hist-13-09"]);
  });

  it("snapshot de outro mês não entra na fatura NOV", () => {
    expect(fbIn(NOV, [stmtOut, stmtNov, fb("2026-10-01")])).toHaveLength(0);
  });

  it("sem snapshot: a janela inclusiva continua decidindo (13/10 fora de NOV)", () => {
    expect(fbIn(NOV, [stmtOut, stmtNov, fb(null)])).toHaveLength(0);
  });

  it("sem snapshot: limite inclusivo do fim da janela NOV (13/11) continua dentro", () => {
    const edge = occ({ id: "edge", item_id: "fb", competence_month: "2026-11-01", charge_date: "2026-11-13", amount_brl: 5 });
    expect(fbIn(NOV, [stmtOut, stmtNov, edge]).map((r) => r.occurrence?.id)).toEqual(["edge"]);
  });

  it("fato com snapshot NOV pulado não compõe a fatura", () => {
    const skipped = { ...fb("2026-11-01"), skipped_at: "2026-11-17T12:00:00Z" } as FinanceOccurrence;
    expect(fbIn(NOV, [stmtOut, stmtNov, skipped])).toHaveLength(0);
  });

  it("cadastro mensal: a previsão de 13/11 não duplica o fato real com snapshot NOV", () => {
    const monthly = { ...facebook, recurrence_type: "monthly", charge_day: 13, default_amount_brl: 16.68 } as unknown as FinanceItem;
    const rows = buildStatementGroups({ items: [itau, monthly], occurrences: [stmtOut, stmtNov, fb("2026-11-01")], competence: NOV, cycles })[0]
      .components.filter((c) => c.item.id === "fb");
    expect(rows.map((r) => [r.occurrence?.id ?? null, r.projected])).toEqual([["9bf9", false]]);
  });
});
