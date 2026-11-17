/**
 * REGRESSÃO REAL — "Pulado neste mês" (Itaú 7587, fech. 13 / venc. 25).
 *
 * Um pulo vale para a COBRANÇA (cadastro + data), não só para a linha que o
 * recebeu. Caso SEDANCE: o pulo da cobrança de 23/10 (marcador na competência
 * de OUT) convivia com outro lançamento aberto de 23/10 arquivado em NOV — a
 * fatura de NOV continuava cobrando. A cobrança de 23/09 (fatura OUT paga) é
 * legítima e não pode ser tocada.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  effectiveOccurrences,
  skippedChargeFor,
  skippedEntriesInMonth,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";
import { skippedEntriesByCard, statementSkippedEntries } from "./financeComposition";

const OUT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };
const DEZ = { year: 2026, month: 12 };

function item(p: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return { kind: "tool", cost_center: "midia", active: true, currency: "BRL", recurrence_type: "monthly", ...p } as FinanceItem;
}
function occ(p: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { competence_month: "2026-10-01", currency: "BRL", entry_role: "regular", ...p } as FinanceOccurrence;
}

const itau = item({ id: "itau", name: "Itaú ••••7587", kind: "card", cost_center: "compartilhado", statement_closing_day: 13, statement_due_day: 25 });
const sedance = item({ id: "sedance", name: "SEDANCE", charge_day: 23, card_item_id: "itau", default_amount_brl: 100 });
const stablia = item({ id: "stablia", name: "Supabase Stablia", charge_day: 12, card_item_id: "itau", default_amount_brl: 50 });
const twilio = item({ id: "twilio", name: "Twilio", recurrence_type: "variable", amount_mode: "variable", charge_day: 3, card_item_id: "itau" } as never);

const cyc = (comp: string, s: string, e: string, actual: boolean) =>
  [`itau|${comp}`, { cardId: "itau", competenceMonth: comp, cycleStart: s, cycleEnd: e, closingDateIsActual: actual }] as const;
const cycles = new Map([
  cyc("2026-10-01", "2026-09-14", "2026-10-14", true),
  cyc("2026-11-01", "2026-10-15", "2026-11-13", false),
  cyc("2026-12-01", "2026-11-14", "2026-12-13", false),
]) as never;

const stmtOut = occ({ id: "stmt-out", item_id: "itau", competence_month: "2026-10-01", due_date: "2026-10-25", statement_closing_date: "2026-10-14", paid_at: "2026-10-16T15:00:00Z", amount_brl: 100 });
const stmtNov = occ({ id: "stmt-nov", item_id: "itau", competence_month: "2026-11-01", due_date: "2026-11-25" });
/** c39f: cobrança 23/09 legítima, vinculada à fatura OUT (paga). */
const sedanceSep = occ({ id: "c39f", item_id: "sedance", competence_month: "2026-10-01", charge_date: "2026-09-23", amount_brl: 100, statement_occurrence_id: "stmt-out", card_item_id_snapshot: "itau" });
/** 5d4b: pulo da cobrança de 23/10. */
const sedanceSkip = occ({ id: "5d4b", item_id: "sedance", competence_month: "2026-10-01", scheduled_date: "2026-10-23", skipped_at: "2026-11-17T12:35:32Z" });
/** 28c4: lançamento aberto paralelo da MESMA cobrança 23/10, arquivado em NOV. */
const sedanceShadow = occ({ id: "28c4", item_id: "sedance", competence_month: "2026-11-01", charge_date: "2026-10-23", amount_brl: 100 });

const items = [itau, sedance, stablia, twilio];
const base = [stmtOut, stmtNov, sedanceSep, sedanceSkip, sedanceShadow];
const group = (competence: typeof NOV, occurrences: FinanceOccurrence[]) =>
  buildStatementGroups({ items, occurrences, competence, cycles })[0];
const sedanceIn = (g: ReturnType<typeof group>) => g.components.filter((c) => c.item.id === "sedance");

describe("SEDANCE — cobrança 23/10 pulada", () => {
  it("fatura NOV não cobra SEDANCE (nem o lançamento paralelo de 23/10)", () => {
    expect(sedanceIn(group(NOV, base))).toHaveLength(0);
  });

  it("fatura OUT paga preserva a cobrança legítima de 23/09", () => {
    const out = group(OUT, base);
    expect(sedanceIn(out).map((c) => c.occurrence?.id)).toEqual(["c39f"]);
    expect(out.paid).toBe(true);
  });

  it("fatura DEZ mantém a cobrança prevista de 23/11 uma única vez", () => {
    const dez = sedanceIn(group(DEZ, base));
    expect(dez).toHaveLength(1);
    expect(dez[0]).toMatchObject({ projected: true, chargeDate: "2026-11-23" });
  });

  it("lista e totais de NOV não somam a cobrança pulada", () => {
    const rows = buildMonthRows({ items, occurrences: base, competence: NOV });
    expect(rows.some((r) => r.occurrence?.id === "28c4")).toBe(false);
    const sedanceRows = rows.filter((r) => r.item.id === "sedance");
    expect(sedanceRows.every((r) => r.chargeDate !== "2026-10-23")).toBe(true);
  });

  it("detalhes do cartão de NOV mostram o pulo em seção própria do Itaú", () => {
    const entries = statementSkippedEntries({ occurrences: base, fallbackItems: items, competence: NOV, cycles });
    expect(entries.map((e) => e.occurrence.id)).toEqual(["5d4b"]);
    expect(skippedEntriesByCard(entries).itau.map((e) => e.occurrence.id)).toEqual(["5d4b"]);
  });

  it("Restaurar volta a cobrança 23/10 exatamente uma vez na fatura NOV", () => {
    const restored = { ...sedanceSkip, skipped_at: null, restored_at: "2026-11-17T13:00:00Z" } as FinanceOccurrence;
    const occurrences = [stmtOut, stmtNov, sedanceSep, restored, sedanceShadow];
    const nov = sedanceIn(group(NOV, occurrences));
    expect(nov).toHaveLength(1);
    expect(nov[0].occurrence?.id).toBe("28c4");
    // O marcador restaurado vazio não vira uma segunda linha em OUT.
    const outRows = buildMonthRows({ items, occurrences, competence: OUT }).filter((r) => r.item.id === "sedance");
    expect(outRows.map((r) => r.occurrence?.id)).toEqual(["c39f"]);
  });

  it("Restaurar um pulo sem lançamento paralelo devolve uma única linha", () => {
    const restored = { ...sedanceSkip, skipped_at: null, restored_at: "2026-11-17T13:00:00Z" } as FinanceOccurrence;
    const kept = effectiveOccurrences([restored]);
    expect(kept.map((o) => o.id)).toEqual(["5d4b"]);
  });

  it("salvar previsão não recria a cobrança pulada (mesmo cadastro + data)", () => {
    expect(skippedChargeFor(base, "sedance", "2026-10-23")?.id).toBe("5d4b");
    expect(skippedChargeFor(base, "sedance", "2026-11-23")).toBeNull();
    expect(skippedChargeFor(base, "stablia", "2026-10-23")).toBeNull();
  });
});

describe("status efetivo preserva fatos fechados e outras cobranças", () => {
  it("fato pago ou congelado na mesma data do pulo nunca é suprimido", () => {
    const paid = occ({ id: "paid", item_id: "sedance", competence_month: "2026-11-01", charge_date: "2026-10-23", paid_at: "2026-11-01T12:00:00Z" });
    const linked = occ({ id: "linked", item_id: "sedance", competence_month: "2026-11-01", charge_date: "2026-10-23", statement_occurrence_id: "stmt-x" });
    const ids = effectiveOccurrences([sedanceSkip, paid, linked]).map((o) => o.id);
    expect(ids).toEqual(["5d4b", "paid", "linked"]);
  });

  it("recarga do mesmo cadastro na data do pulo continua cobrando", () => {
    const recharge = occ({ id: "rc", item_id: "sedance", competence_month: "2026-11-01", charge_date: "2026-10-23", entry_role: "recharge", amount_brl: 30 });
    expect(effectiveOccurrences([sedanceSkip, recharge]).map((o) => o.id)).toEqual(["5d4b", "rc"]);
  });
});

describe("outros pulos reais de novembro", () => {
  it("Supabase Stablia 12/11 e Twilio 03/11 pulados não compõem a fatura NOV", () => {
    const occurrences = [
      stmtOut, stmtNov,
      occ({ id: "stablia-oct", item_id: "stablia", charge_date: "2026-10-12", amount_brl: 50, statement_occurrence_id: "stmt-out" }),
      occ({ id: "e4f7", item_id: "stablia", competence_month: "2026-11-01", scheduled_date: "2026-11-12", skipped_at: "2026-11-17T13:08:12Z" }),
      occ({ id: "355a", item_id: "twilio", competence_month: "2026-11-01", scheduled_date: "2026-11-03", skipped_at: "2026-11-13T13:12:44Z" }),
    ];
    const nov = group(NOV, occurrences);
    expect(nov.components.filter((c) => c.item.id === "stablia" || c.item.id === "twilio")).toHaveLength(0);
    const entries = statementSkippedEntries({ occurrences, fallbackItems: items, competence: NOV, cycles });
    expect(entries.map((e) => e.occurrence.id).sort()).toEqual(["355a", "e4f7"]);
    // Dezembro segue a recorrência normalmente (12/12 prevista).
    const dez = group(DEZ, occurrences).components.filter((c) => c.item.id === "stablia");
    expect(dez.map((c) => c.chargeDate)).toEqual(["2026-12-12"]);
  });

  it("FAXINA semanal com as 4 datas puladas não soma; restaurar uma devolve só ela", () => {
    const faxina = item({
      id: "faxina", name: "FAXINA", kind: "expense", cost_center: "administrativo",
      recurrence_type: "weekly", recurrence_interval: 1, recurrence_weekday: 5,
      recurrence_anchor_date: "2026-08-07", default_amount_brl: 150,
    } as never);
    const dates = ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"];
    const skips = dates.map((d) => occ({ id: `fx-${d}`, item_id: "faxina", competence_month: "2026-11-01", scheduled_date: d, skipped_at: "2026-11-13T12:35:00Z" }));
    const rows = buildMonthRows({ items: [faxina], occurrences: skips, competence: NOV });
    expect(rows).toHaveLength(0);
    expect(computeTotals(rows).expected).toBe(0);
    expect(skippedEntriesInMonth({ items: [faxina], occurrences: skips, competence: NOV })).toHaveLength(4);

    const restoredSkips = skips.map((o, i) => (i === 1 ? ({ ...o, skipped_at: null, restored_at: "2026-11-17T10:00:00Z" } as FinanceOccurrence) : o));
    const after = buildMonthRows({ items: [faxina], occurrences: restoredSkips, competence: NOV });
    expect(after.map((r) => r.scheduledDate)).toEqual(["2026-11-13"]);
    expect(computeTotals(after).expected).toBe(150);
  });
});

describe("RECARGA (7954) — pago E pulado em outubro", () => {
  const recarga = item({ id: "recarga", name: "RECARGA (7954)", kind: "expense", cost_center: "administrativo", default_amount_brl: 20 });
  const voided = occ({ id: "09dd", item_id: "recarga", due_date: "2026-10-16", paid_at: "2026-10-20T15:00:00Z", skipped_at: "2026-10-21T12:14:47Z", amount_brl: 20 });

  it("não entra nos totais nem vira cobrança em aberto/atrasada", () => {
    const rows = buildMonthRows({ items: [recarga], occurrences: [voided], competence: OUT });
    expect(rows).toHaveLength(0);
    const totals = computeTotals(rows);
    expect(totals.expected).toBe(0);
    expect(totals.open).toBe(0);
  });

  it("histórico preservado: pagamento continua registrado na exceção do mês", () => {
    const entries = skippedEntriesInMonth({ items: [recarga], occurrences: [voided], competence: OUT });
    expect(entries).toHaveLength(1);
    expect(entries[0].occurrence.paid_at).toBe("2026-10-20T15:00:00Z");
  });
});
