/**
 * Mês de um cadastro sub-mensal: MUITAS linhas para o mesmo cadastro, cada uma
 * com identidade própria (`item_id + scheduled_date`). Confirmar/ignorar uma
 * data nunca afeta as outras e nunca altera o padrão.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  computeTotals,
  isSkippedOccurrence,
  skippedEntriesInMonth,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";

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

function occurrence(partial: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return {
    competence_month: "2026-08-01",
    currency: "BRL",
    ...partial,
  } as FinanceOccurrence;
}

const weekly = item({
  id: "w",
  name: "Diarista",
  recurrence_type: "weekly",
  recurrence_interval: 1,
  recurrence_weekday: 3, // quarta
  recurrence_anchor_date: "2026-08-01",
  default_amount_brl: 150,
});

describe("financeModel — recorrência sub-mensal no mês", () => {
  it("gera uma linha por data prevista, todas projetadas", () => {
    const rows = buildMonthRows({ items: [weekly], occurrences: [], competence: COMPETENCE });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.scheduledDate)).toEqual([
      "2026-08-05",
      "2026-08-12",
      "2026-08-19",
      "2026-08-26",
    ]);
    expect(rows.every((r) => r.projected)).toBe(true);
    expect(rows.every((r) => r.dueDate === r.scheduledDate)).toBe(true);
    expect(computeTotals(rows).expected).toBe(600);
  });

  it("o fato de uma data não contamina as outras", () => {
    const rows = buildMonthRows({
      items: [weekly],
      occurrences: [
        occurrence({
          id: "o1",
          item_id: "w",
          scheduled_date: "2026-08-12",
          due_date: "2026-08-12",
          amount_brl: 200,
          paid_at: "2026-08-12T12:00:00Z",
          paid_amount_brl: 200,
        }),
      ],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(4);
    const real = rows.find((r) => r.scheduledDate === "2026-08-12")!;
    expect(real.projected).toBe(false);
    expect(real.amountBrl).toBe(200);
    expect(real.paid).toBe(true);
    // As outras seguem projetadas no valor padrão.
    expect(rows.filter((r) => r.projected)).toHaveLength(3);
    const totals = computeTotals(rows);
    expect(totals.expected).toBe(650); // 200 + 3 × 150
    expect(totals.paid).toBe(200);
    expect(totals.open).toBe(450);
  });

  it("mover a data efetiva não duplica a linha (identidade é a data agendada)", () => {
    const rows = buildMonthRows({
      items: [weekly],
      occurrences: [
        occurrence({
          id: "o2",
          item_id: "w",
          scheduled_date: "2026-08-19",
          due_date: "2026-08-21", // pagou depois: a data agendada segue sendo a identidade
          amount_brl: 150,
        }),
      ],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(4);
    const moved = rows.find((r) => r.scheduledDate === "2026-08-19")!;
    expect(moved.dueDate).toBe("2026-08-21");
    expect(moved.projected).toBe(false);
  });

  it("data ignorada sai do mês e de todos os totais, sem mexer no padrão", () => {
    const skip = occurrence({
      id: "o3",
      item_id: "w",
      scheduled_date: "2026-08-12",
      due_date: "2026-08-12",
      skipped_at: "2026-08-10T09:00:00Z",
      skip_reason: "Feriado",
    });
    const rows = buildMonthRows({ items: [weekly], occurrences: [skip], competence: COMPETENCE });
    expect(isSkippedOccurrence(skip)).toBe(true);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.scheduledDate)).not.toContain("2026-08-12");
    expect(computeTotals(rows).expected).toBe(450);

    const entries = skippedEntriesInMonth({ items: [weekly], occurrences: [skip], competence: COMPETENCE });
    expect(entries).toHaveLength(1);
    expect(entries[0].scheduledDate).toBe("2026-08-12");
    expect(entries[0].reason).toBe("Feriado");
  });

  it("cadastro inativo não projeta cronograma sub-mensal", () => {
    const rows = buildMonthRows({
      items: [{ ...weekly, active: false }],
      occurrences: [],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(0);
  });

  it("diário a cada 10 dias gera exatamente as datas do intervalo", () => {
    const daily = item({
      id: "d",
      name: "Combustível",
      recurrence_type: "daily",
      recurrence_interval: 10,
      recurrence_anchor_date: "2026-08-01",
      default_amount_brl: 100,
    });
    const rows = buildMonthRows({ items: [daily], occurrences: [], competence: COMPETENCE });
    expect(rows.map((r) => r.scheduledDate)).toEqual(["2026-08-01", "2026-08-11", "2026-08-21", "2026-08-31"]);
    expect(computeTotals(rows).expected).toBe(400);
  });

  it("mensal continua com uma única linha por mês", () => {
    const monthly = item({ id: "m", name: "Aluguel", due_day: 10, default_amount_brl: 3000 });
    const rows = buildMonthRows({ items: [monthly], occurrences: [], competence: COMPETENCE });
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe("2026-08-10");
  });
});
