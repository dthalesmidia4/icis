import { describe, it, expect } from "vitest";
import {
  addMonths,
  candidateChargeCompetences,
  chargeBelongsToStatement,
  competenceFromISO,
  competenceToISO,
  dateInMonth,
  daysInMonth,
  resolveStatementForCharge,
  sameCompetence,
} from "./financeCardCycle";

describe("financeCardCycle — utilitários de competência", () => {
  it("limita o dia ao último dia do mês", () => {
    expect(dateInMonth({ year: 2026, month: 2 }, 31)).toBe("2026-02-28");
    expect(dateInMonth({ year: 2028, month: 2 }, 31)).toBe("2028-02-29");
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("transborda o ano ao somar meses", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("converte competência de/para ISO", () => {
    expect(competenceToISO({ year: 2026, month: 8 })).toBe("2026-08-01");
    expect(competenceFromISO("2026-08-01")).toEqual({ year: 2026, month: 8 });
    expect(sameCompetence({ year: 2026, month: 8 }, competenceFromISO("2026-08-01"))).toBe(true);
  });
});

describe("financeCardCycle — resolução da fatura", () => {
  const card = { closingDay: 10, dueDay: 17 }; // vencimento no mesmo mês do fechamento

  it("cobrança antes do fechamento entra na fatura do próprio mês", () => {
    const r = resolveStatementForCharge({ chargeDay: 6, competence: { year: 2026, month: 8 }, card });
    expect(r.incomplete).toBe(false);
    if (r.incomplete) return;
    expect(r.chargeDate).toBe("2026-08-06");
    expect(r.closingDate).toBe("2026-08-10");
    expect(r.dueDate).toBe("2026-08-17");
    expect(r.statementCompetence).toEqual({ year: 2026, month: 8 });
  });

  it("cobrança depois do fechamento vai para a próxima fatura", () => {
    const r = resolveStatementForCharge({ chargeDay: 24, competence: { year: 2026, month: 8 }, card });
    if (r.incomplete) throw new Error("deveria projetar");
    expect(r.closingDate).toBe("2026-09-10");
    expect(r.dueDate).toBe("2026-09-17");
    expect(r.statementCompetence).toEqual({ year: 2026, month: 9 });
  });

  it("vencimento antes do fechamento cai no mês seguinte ao fechamento", () => {
    const r = resolveStatementForCharge({
      chargeDay: 5,
      competence: { year: 2026, month: 8 },
      card: { closingDay: 25, dueDay: 5 },
    });
    if (r.incomplete) throw new Error("deveria projetar");
    expect(r.closingDate).toBe("2026-08-25");
    expect(r.dueDate).toBe("2026-09-05");
    expect(r.statementCompetence).toEqual({ year: 2026, month: 9 });
  });

  it("vira o ano corretamente", () => {
    const r = resolveStatementForCharge({
      chargeDay: 28,
      competence: { year: 2026, month: 12 },
      card: { closingDay: 20, dueDay: 5 },
    });
    if (r.incomplete) throw new Error("deveria projetar");
    expect(r.closingDate).toBe("2027-01-20");
    expect(r.dueDate).toBe("2027-02-05");
    expect(r.statementCompetence).toEqual({ year: 2027, month: 2 });
  });

  it("respeita meses curtos ao projetar fechamento/vencimento", () => {
    // fechamento == vencimento: a fatura vence no mês seguinte ao fechamento
    const r = resolveStatementForCharge({
      chargeDay: 31,
      competence: { year: 2026, month: 1 },
      card: { closingDay: 31, dueDay: 31 },
    });
    if (r.incomplete) throw new Error("deveria projetar");
    expect(r.chargeDate).toBe("2026-01-31");
    expect(r.closingDate).toBe("2026-01-31");
    expect(r.dueDate).toBe("2026-02-28");
  });

  it("não inventa datas quando o cartão está incompleto", () => {
    expect(
      resolveStatementForCharge({ chargeDay: 6, competence: { year: 2026, month: 8 }, card: { closingDay: null, dueDay: 17 } }).incomplete,
    ).toBe(true);
    expect(
      resolveStatementForCharge({ chargeDay: 6, competence: { year: 2026, month: 8 }, card: { closingDay: 10, dueDay: null } }).incomplete,
    ).toBe(true);
  });

  it("não projeta sem dia de cobrança", () => {
    const r = resolveStatementForCharge({ chargeDay: null, competence: { year: 2026, month: 8 }, card });
    expect(r.incomplete).toBe(true);
  });
});

describe("financeCardCycle — composição da fatura", () => {
  const card = { closingDay: 10, dueDay: 17 };

  it("considera apenas o mês corrente e o anterior como candidatos", () => {
    expect(candidateChargeCompetences({ year: 2026, month: 1 })).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });

  it("associa a cobrança pós-fechamento à fatura do mês seguinte", () => {
    const statement = { year: 2026, month: 9 };
    expect(
      chargeBelongsToStatement({ chargeDay: 24, chargeCompetence: { year: 2026, month: 8 }, statement, card }),
    ).toBe(true);
    expect(
      chargeBelongsToStatement({ chargeDay: 6, chargeCompetence: { year: 2026, month: 8 }, statement, card }),
    ).toBe(false);
    expect(
      chargeBelongsToStatement({ chargeDay: 6, chargeCompetence: { year: 2026, month: 9 }, statement, card }),
    ).toBe(true);
  });

  it("cartão incompleto nunca vincula automaticamente", () => {
    expect(
      chargeBelongsToStatement({
        chargeDay: 6,
        chargeCompetence: { year: 2026, month: 8 },
        statement: { year: 2026, month: 8 },
        card: { closingDay: null, dueDay: null },
      }),
    ).toBe(false);
  });
});
