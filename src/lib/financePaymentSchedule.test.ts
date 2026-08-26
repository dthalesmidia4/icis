import { describe, it, expect } from "vitest";
import {
  FinancePaymentRule,
  batchEntryIdentity,
  buildBatchSettlementIndex,
  describePaymentRule,
  effectivePaymentRuleFor,
  groupRowsForPayment,
  paymentDatesInMonth,
} from "./financePaymentSchedule";
import type { FinanceItem, MonthRow } from "./financeModel";

const item = (id: string): FinanceItem =>
  ({
    id,
    name: id,
    kind: "expense",
    recurrence_type: "weekly",
    active: true,
  }) as unknown as FinanceItem;

const row = (id: string, date: string, amount: number | null = 100): MonthRow =>
  ({
    key: `${id}|${date}`,
    item: item(id),
    scheduledDate: date,
    dueDate: null,
    chargeDate: null,
    amountBrl: amount,
    paid: false,
  }) as unknown as MonthRow;

const rule = (patch: Partial<FinancePaymentRule>): FinancePaymentRule => ({
  item_id: "faxina",
  effective_from: "0001-01-01",
  mode: "per_occurrence",
  interval_count: 1,
  weekday: null,
  day_of_month: null,
  ...patch,
});

describe("paymentDatesInMonth", () => {
  it("mensal com dia definido gera uma única data", () => {
    expect(paymentDatesInMonth(rule({ mode: "monthly", day_of_month: 5 }), { year: 2026, month: 8 })).toEqual([
      "2026-08-05",
    ]);
  });

  it("mensal sem dia não inventa data", () => {
    expect(paymentDatesInMonth(rule({ mode: "monthly" }), { year: 2026, month: 8 })).toEqual([]);
  });

  it("semanal na sexta lista todas as sextas do mês", () => {
    const dates = paymentDatesInMonth(rule({ mode: "weekly", weekday: 5 }), { year: 2026, month: 8 });
    expect(dates).toEqual(["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28"]);
  });

  it("por ocorrência e manual não têm agenda própria", () => {
    expect(paymentDatesInMonth(rule({ mode: "per_occurrence" }), { year: 2026, month: 8 })).toEqual([]);
    expect(paymentDatesInMonth(rule({ mode: "manual" }), { year: 2026, month: 8 })).toEqual([]);
  });
});

describe("groupRowsForPayment", () => {
  const competence = { year: 2026, month: 8 };

  it("por ocorrência: uma saída de caixa por despesa (não agrupa)", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-05"), row("faxina", "2026-08-12")],
      rule: rule({ mode: "per_occurrence" }),
      competence,
    });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it("semanal na sexta agrupa as visitas da semana e soma o valor", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-05"), row("faxina", "2026-08-06")],
      rule: rule({ mode: "weekly", weekday: 5 }),
      competence,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].paymentDate).toBe("2026-08-07");
    expect(groups[0].totalBrl).toBe(200);
    expect(groups[0].grouped).toBe(true);
  });

  it("fato depois da última data do mês vai para o primeiro pagamento do mês seguinte", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-31")],
      rule: rule({ mode: "weekly", weekday: 5 }),
      competence,
    });
    expect(groups[0].paymentDate).toBe("2026-09-04");
  });

  it("mensal dia 5 junta o mês inteiro numa saída de caixa", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-03"), row("faxina", "2026-08-04")],
      rule: rule({ mode: "monthly", day_of_month: 5 }),
      competence,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].paymentDate).toBe("2026-08-05");
  });

  it("manual não inventa data e mantém todas as ocorrências", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-03"), row("faxina", "2026-08-10")],
      rule: rule({ mode: "manual" }),
      competence,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].paymentDate).toBeNull();
    expect(groups[0].rows).toHaveLength(2);
  });

  it("valor desconhecido não vira zero no total", () => {
    const groups = groupRowsForPayment({
      rows: [row("faxina", "2026-08-05", null)],
      rule: rule({ mode: "monthly", day_of_month: 5 }),
      competence,
    });
    expect(groups[0].totalBrl).toBeNull();
  });
});

describe("effectivePaymentRuleFor", () => {
  it("usa a versão mais recente vigente e nunca uma futura", () => {
    const rules = [
      rule({ effective_from: "2026-01-01", mode: "per_occurrence" }),
      rule({ effective_from: "2026-08-01", mode: "monthly", day_of_month: 5 }),
      rule({ effective_from: "2026-12-01", mode: "weekly", weekday: 5 }),
    ];
    expect(effectivePaymentRuleFor(item("faxina"), rules, "2026-08-20").mode).toBe("monthly");
    expect(effectivePaymentRuleFor(item("faxina"), rules, "2026-03-01").mode).toBe("per_occurrence");
  });

  it("sem regra gravada cai em 'a cada ocorrência'", () => {
    expect(effectivePaymentRuleFor(item("faxina"), [], "2026-08-20").mode).toBe("per_occurrence");
  });
});

describe("buildBatchSettlementIndex", () => {
  it("só lote PAGO liquida a ocorrência", () => {
    const rows = [row("faxina", "2026-08-05"), row("faxina", "2026-08-12")];
    const index = buildBatchSettlementIndex({
      rows,
      batches: [
        { id: "b1", paid_at: "2026-08-07" } as any,
        { id: "b2", paid_at: null } as any,
      ],
      entries: [
        { batch_id: "b1", item_id: "faxina", scheduled_date: "2026-08-05" } as any,
        { batch_id: "b2", item_id: "faxina", scheduled_date: "2026-08-12" } as any,
      ],
    });
    expect(index.paidComponentKeys.has(rows[0].key)).toBe(true);
    expect(index.paidComponentKeys.has(rows[1].key)).toBe(false);
  });
});

describe("describePaymentRule", () => {
  it("descreve a agenda em linguagem de negócio", () => {
    expect(describePaymentRule(rule({ mode: "monthly", day_of_month: 5 }))).toBe("Pago dia 5 de cada mês");
    expect(describePaymentRule(rule({ mode: "weekly", interval_count: 2 }))).toBe("Pago a cada 2 semanas");
  });
});

describe("batchEntryIdentity", () => {
  it("é item + data agendada", () => {
    expect(batchEntryIdentity("faxina", "2026-08-05T00:00:00Z")).toBe("faxina|2026-08-05");
  });
});
