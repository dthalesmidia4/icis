import { describe, it, expect } from "vitest";
import {
  addDaysISO,
  describeSchedule,
  effectiveRuleFor,
  isSubMonthlyItem,
  matchesRule,
  monthDates,
  recurrenceInterval,
  scheduleIdentity,
  scheduledDatesInMonth,
  weekdayISO,
  type FinanceRecurrenceRule,
} from "./financeRecurrenceSchedule";
import type { FinanceItem } from "./financeModel";

const COMPETENCE = { year: 2026, month: 8 };

function item(partial: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "expense",
    cost_center: "administrativo",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...partial,
  } as FinanceItem;
}

describe("financeRecurrenceSchedule — datas civis", () => {
  it("soma dias e resolve dia da semana em ISO", () => {
    expect(addDaysISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(weekdayISO("2026-08-24")).toBe(1); // segunda
    expect(weekdayISO("2026-08-30")).toBe(7); // domingo
  });

  it("gera exatamente os dias do mês", () => {
    const dates = monthDates(COMPETENCE);
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-08-01");
    expect(dates[30]).toBe("2026-08-31");
    expect(monthDates({ year: 2026, month: 2 })).toHaveLength(28);
  });
});

describe("financeRecurrenceSchedule — cronograma diário e semanal", () => {
  it("diário todo dia gera um lançamento por dia", () => {
    const daily = item({ id: "d", name: "Diária", recurrence_type: "daily", recurrence_interval: 1 });
    expect(isSubMonthlyItem(daily)).toBe(true);
    expect(scheduledDatesInMonth({ item: daily, competence: COMPETENCE })).toHaveLength(31);
  });

  it("diário a cada 3 dias conta a partir da âncora", () => {
    const daily = item({
      id: "d3",
      name: "A cada 3 dias",
      recurrence_type: "daily",
      recurrence_interval: 3,
      recurrence_anchor_date: "2026-08-02",
    });
    const dates = scheduledDatesInMonth({ item: daily, competence: COMPETENCE });
    expect(dates.slice(0, 4)).toEqual(["2026-08-02", "2026-08-05", "2026-08-08", "2026-08-11"]);
    expect(dates).not.toContain("2026-08-01");
  });

  it("semanal cai sempre no dia da semana escolhido", () => {
    const weekly = item({
      id: "w",
      name: "Semanal",
      recurrence_type: "weekly",
      recurrence_interval: 1,
      recurrence_weekday: 3, // quarta
      recurrence_anchor_date: "2026-08-01",
    });
    const dates = scheduledDatesInMonth({ item: weekly, competence: COMPETENCE });
    expect(dates.every((d) => weekdayISO(d) === 3)).toBe(true);
    expect(dates).toEqual(["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"]);
  });

  it("quinzenal (a cada 2 semanas) pula uma semana", () => {
    const biweekly = item({
      id: "w2",
      name: "Quinzenal",
      recurrence_type: "weekly",
      recurrence_interval: 2,
      recurrence_weekday: 3,
      recurrence_anchor_date: "2026-08-01",
    });
    expect(scheduledDatesInMonth({ item: biweekly, competence: COMPETENCE })).toEqual([
      "2026-08-05",
      "2026-08-19",
    ]);
  });

  it("semanal sem dia definido não inventa data", () => {
    const rule: FinanceRecurrenceRule = {
      item_id: "w",
      effective_from: "0001-01-01",
      frequency: "weekly",
      interval_count: 1,
      weekday: null,
      anchor_date: null,
    };
    expect(matchesRule(rule, "2026-08-05")).toBe(false);
  });

  it("mensal não é sub-mensal e não gera datas civis", () => {
    const monthly = item({ id: "m", name: "Mensal", recurrence_type: "monthly", due_day: 10 });
    expect(isSubMonthlyItem(monthly)).toBe(false);
    expect(scheduledDatesInMonth({ item: monthly, competence: COMPETENCE })).toEqual([]);
  });

  it("nada antes da âncora entra no cronograma", () => {
    const daily = item({
      id: "late",
      name: "Começa no meio do mês",
      recurrence_type: "daily",
      recurrence_interval: 1,
      recurrence_anchor_date: "2026-08-20",
    });
    const dates = scheduledDatesInMonth({ item: daily, competence: COMPETENCE });
    expect(dates[0]).toBe("2026-08-20");
    expect(dates).toHaveLength(12);
  });
});

describe("financeRecurrenceSchedule — versões de regra (o passado não é reescrito)", () => {
  const base = item({
    id: "v",
    name: "Versionado",
    recurrence_type: "weekly",
    recurrence_interval: 1,
    recurrence_weekday: 3,
    recurrence_anchor_date: "2026-08-01",
  });

  const rules: FinanceRecurrenceRule[] = [
    {
      item_id: "v",
      effective_from: "2026-08-01",
      frequency: "weekly",
      interval_count: 1,
      weekday: 3,
      anchor_date: "2026-08-01",
    },
    {
      item_id: "v",
      effective_from: "2026-08-15",
      frequency: "weekly",
      interval_count: 1,
      weekday: 5, // muda para sexta a partir do dia 15
      anchor_date: "2026-08-15",
    },
  ];

  it("usa a versão vigente na data, não a mais recente sempre", () => {
    expect(effectiveRuleFor(base, rules, "2026-08-10")?.weekday).toBe(3);
    expect(effectiveRuleFor(base, rules, "2026-08-20")?.weekday).toBe(5);
  });

  it("cai no cadastro mestre quando nenhuma versão se aplica", () => {
    expect(effectiveRuleFor(base, rules, "2026-07-01")?.weekday).toBe(3);
  });

  it("o mês combina as duas versões: quartas antes, sextas depois", () => {
    const dates = scheduledDatesInMonth({ item: base, rules, competence: COMPETENCE });
    expect(dates).toEqual(["2026-08-05", "2026-08-12", "2026-08-21", "2026-08-28"]);
  });

  it("versão mensal devolve o item ao caminho mensal (sem datas civis)", () => {
    const backToMonthly: FinanceRecurrenceRule[] = [
      ...rules,
      {
        item_id: "v",
        effective_from: "2026-08-01",
        frequency: "monthly",
        interval_count: 1,
        day_of_month: 10,
        anchor_date: "2026-08-01",
      },
    ];
    // A versão mensal empata em effective_from; a última cadastrada vence.
    const dates = scheduledDatesInMonth({ item: base, rules: backToMonthly, competence: COMPETENCE });
    expect(dates.some((d) => d < "2026-08-15")).toBe(false);
  });
});

describe("financeRecurrenceSchedule — identidade e descrição", () => {
  it("identidade é item + data agendada", () => {
    expect(scheduleIdentity("abc", "2026-08-05T00:00:00Z")).toBe("abc|2026-08-05");
  });

  it("intervalo inválido nunca zera o cronograma", () => {
    expect(recurrenceInterval(item({ id: "z", name: "Z", recurrence_type: "daily", recurrence_interval: 0 }))).toBe(1);
  });

  it("descreve o cronograma em linguagem humana", () => {
    expect(describeSchedule(item({ id: "1", name: "A", recurrence_type: "daily", recurrence_interval: 1 }))).toBe(
      "Todos os dias",
    );
    expect(describeSchedule(item({ id: "2", name: "B", recurrence_type: "daily", recurrence_interval: 3 }))).toBe(
      "A cada 3 dias",
    );
    expect(
      describeSchedule(
        item({ id: "3", name: "C", recurrence_type: "weekly", recurrence_interval: 2, recurrence_weekday: 3 }),
      ),
    ).toBe("A cada 2 semanas na quarta-feira");
    expect(describeSchedule(item({ id: "4", name: "D", recurrence_type: "one_off" }))).toBeNull();
  });
});
