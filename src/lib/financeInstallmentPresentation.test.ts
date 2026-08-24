import { describe, it, expect } from "vitest";
import {
  installmentHeaderLine,
  installmentProjectedNote,
  installmentSchedulePreview,
  isInstallmentRow,
  occurrenceAmountLabel,
  occurrencePaidHelp,
} from "./financeInstallmentPresentation";
import { buildMonthRows, type FinanceItem } from "./financeModel";

const COMPETENCE = { year: 2026, month: 8 };

const voyage = {
  id: "voyage",
  name: "FINANCIAMENTO VOYAGE QXP-8A24",
  kind: "expense",
  cost_center: "administrativo",
  active: true,
  currency: "BRL",
  recurrence_type: "installments",
  installment_start_date: "2026-03-11",
  installment_count: 12,
  default_amount_brl: 1728.02,
} as FinanceItem;

function voyageRow() {
  const rows = buildMonthRows({ items: [voyage], occurrences: [], competence: COMPETENCE });
  return rows[0];
}

describe("apresentação de parcelamentos", () => {
  it("header traz parcela, início e término previsto", () => {
    const row = voyageRow();
    expect(isInstallmentRow(row)).toBe(true);
    expect(installmentHeaderLine(row)).toBe(
      "Parcela 6 de 12 · Parcelamento iniciado em 11/03/2026 · término previsto em 11/02/2027",
    );
    expect(row.dueDate).toBe("2026-08-11");
  });

  it("parcela projetada usa copy de pagamento não confirmado", () => {
    const row = voyageRow();
    expect(row.projected).toBe(true);
    expect(installmentProjectedNote(row)).toBe(
      "Parcela prevista para este mês — pagamento ainda não confirmado",
    );
  });

  it("copy do lançamento mensal muda para parcelas", () => {
    const row = voyageRow();
    expect(occurrenceAmountLabel(row)).toBe("Valor desta parcela (BRL)");
    expect(occurrencePaidHelp(row)).toBe("Marque quando esta parcela for realmente paga.");
  });

  it("mensal comum mantém a copy original e não é parcelamento", () => {
    const rows = buildMonthRows({
      items: [{ ...voyage, id: "m", recurrence_type: "monthly", charge_day: 10 } as FinanceItem],
      occurrences: [],
      competence: COMPETENCE,
    });
    const row = rows[0];
    expect(isInstallmentRow(row)).toBe(false);
    expect(installmentHeaderLine(row)).toBeNull();
    expect(installmentProjectedNote(row)).toBeNull();
    expect(occurrenceAmountLabel(row)).toBe("Valor real (BRL)");
    expect(occurrencePaidHelp(row)).toBe("Marque quando a saída de caixa acontecer.");
  });

  it("preview do formulário descreve o cronograma completo", () => {
    expect(installmentSchedulePreview("2026-03-11", 12)).toBe(
      "12 parcelas mensais · última prevista em 11/02/2027",
    );
    expect(installmentSchedulePreview("2026-03-11", 1)).toBe(
      "1 parcela mensal · última prevista em 11/03/2026",
    );
    expect(installmentSchedulePreview(null, 12)).toBeNull();
    expect(installmentSchedulePreview("2026-03-11", null)).toBeNull();
  });
});
