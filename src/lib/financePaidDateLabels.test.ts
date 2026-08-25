/**
 * Datas nos status de pagamento + control deck compartilhado do Financeiro.
 *
 * Regras verificadas:
 * - quando existe data real de pagamento, o status a informa ("Pago em 24 ago");
 * - `charge_date` NUNCA vira data de pagamento;
 * - a barra de competência é um componente único usado em `full` e `tools`;
 * - os controles de agrupamento/expansão vivem no control deck, uma vez só.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";
import {
  RowStatusContext,
  paidAtDayMonth,
  paidLabelWithDate,
  resolveRowStatus,
} from "./financeRowStatus";
import { buildSafeStatementStatusMap } from "./financeSafeStatement";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const TODAY = "2026-08-25";
const AUG = "2026-08-01";
const CARD_ID = "card-itau-7587";

function card(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: CARD_ID,
    kind: "card",
    name: "Itaú ••••7587",
    bank_name: "Itaú",
    card_last4: "7587",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    statement_closing_day: 10,
    statement_due_day: 17,
    ...over,
  } as FinanceItem;
}

function occ(over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: "occ-1",
    item_id: "item-1",
    competence_month: AUG,
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

/** Despesa comum, paga direto (Adobe Creative Cloud pago em 24/08). */
function directRow(over: Partial<MonthRow> = {}): MonthRow {
  return {
    key: "row-adobe",
    item: {
      id: "item-1",
      kind: "tool",
      name: "Adobe Creative Cloud",
      cost_center: "midia",
      active: true,
      currency: "BRL",
      recurrence_type: "monthly",
    } as FinanceItem,
    occurrence: occ({ paid_at: "2026-08-24T14:00:00Z" }),
    projected: false,
    amountBrl: 300,
    amountOriginal: 300,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: null,
    dueDate: "2026-08-20",
    paid: true,
    paidAmountBrl: 300,
    cardItemId: null,
    paymentMethod: "pix",
    estimated: false,
    ...over,
  } as MonthRow;
}

/** Componente cobrado no cartão (AVISA-API / Supabase na fatura de agosto). */
function component(over: Partial<MonthRow> = {}): MonthRow {
  return {
    ...directRow(),
    key: "row-avisa",
    item: {
      id: "item-2",
      kind: "tool",
      name: "AVISA-API",
      cost_center: "midia",
      active: true,
      currency: "BRL",
      recurrence_type: "monthly",
      card_item_id: CARD_ID,
    } as FinanceItem,
    occurrence: occ({ id: "occ-2", item_id: "item-2" }),
    chargeDate: "2026-08-05",
    dueDate: null,
    paid: false,
    paidAmountBrl: null,
    cardItemId: CARD_ID,
    paymentMethod: "credit_card",
    ...over,
  } as MonthRow;
}

function ctx(over: Partial<RowStatusContext> = {}): RowStatusContext {
  return {
    rows: [],
    today: TODAY,
    cardsById: new Map([[CARD_ID, card()]]),
    competenceMonth: AUG,
    ...over,
  };
}

const safeMap = (paidAt: string | null = "2026-08-20T15:00:00Z") =>
  buildSafeStatementStatusMap([
    {
      card_id: CARD_ID,
      competence_month: AUG,
      due_date: "2026-08-17",
      paid: true,
      paid_at: paidAt,
    } as never,
  ]);

/* -------------------------------------------------------------------------- */
/*                          1. HELPERS PUROS DE DATA                          */
/* -------------------------------------------------------------------------- */

describe("helpers de data de pagamento", () => {
  it("timestamptz vira dia civil de São Paulo", () => {
    expect(paidAtDayMonth("2026-08-24T14:00:00Z")).toBe("24 ago");
  });

  it("dia civil puro é preservado", () => {
    expect(paidAtDayMonth("2026-08-20")).toBe("20 ago");
  });

  it("sem data, o rótulo base não é decorado", () => {
    expect(paidAtDayMonth(null)).toBeNull();
    expect(paidLabelWithDate("Pago", null)).toBe("Pago");
    expect(paidLabelWithDate("Pago", "2026-08-24T14:00:00Z")).toBe("Pago em 24 ago");
  });
});

/* -------------------------------------------------------------------------- */
/*                       2. STATUS COM DATA REAL DO FATO                      */
/* -------------------------------------------------------------------------- */

describe("status informa a data quando ela existe", () => {
  it("pagamento direto => Pago em 24 ago", () => {
    expect(resolveRowStatus(directRow(), ctx()).label).toBe("Pago em 24 ago");
  });

  it("pagamento direto sem paid_at => Pago, sem data inventada", () => {
    const row = directRow({ occurrence: occ({ paid_at: null }) });
    expect(resolveRowStatus(row, ctx()).label).toBe("Pago");
  });

  /** Liquidação derivada da fatura — é o que o cockpit/tela realmente passa. */
  const settled = (row: MonthRow) => ({
    paidComponentKeys: new Set([row.key]),
    statementByComponentKey: new Map(),
  });

  it("componente de fatura paga => Pago pela fatura em 20 ago", () => {
    const row = component();
    const status = resolveRowStatus(
      row,
      ctx({ safeStatementStatuses: safeMap(), settlement: settled(row) }),
    );
    expect(status.kind).toBe("card_statement_paid");
    expect(status.label).toBe("Pago pela fatura em 20 ago");
  });

  it("fatura paga sem paid_at => Pago pela fatura, sem data", () => {
    const row = component();
    const status = resolveRowStatus(
      row,
      ctx({ safeStatementStatuses: safeMap(null), settlement: settled(row) }),
    );
    expect(status.label).toBe("Pago pela fatura");
  });

  it("charge_date NUNCA é usada como data de pagamento", () => {
    const row = component();
    const status = resolveRowStatus(
      row,
      ctx({ safeStatementStatuses: safeMap(null), settlement: settled(row) }),
    );
    // a data de cobrança (05/08) não pode virar "pago em 05 ago".
    expect(status.label).not.toMatch(/05 ago/);
  });

  it("linha aberta não ganha data nenhuma", () => {
    const row = directRow({ paid: false, occurrence: occ({ paid_at: null }) });
    expect(resolveRowStatus(row, ctx()).label).not.toMatch(/ em \d/);
  });
});

/* -------------------------------------------------------------------------- */
/*                    3. BARRA DE COMPETÊNCIA COMPARTILHADA                   */
/* -------------------------------------------------------------------------- */

describe("FinancePeriodBar é o único seletor de competência", () => {
  const bar = read("src/components/finance/FinancePeriodBar.tsx");
  const page = read("src/pages/Financial.tsx");
  const cockpit = read("src/components/finance/FinanceToolsCockpit.tsx");

  it("o componente concentra navegação e volta ao mês atual", () => {
    expect(bar).toContain("Mês anterior");
    expect(bar).toContain("Mês seguinte");
    expect(bar).toContain("Voltar ao mês atual");
  });

  it("full e tools consomem o mesmo componente", () => {
    for (const src of [page, cockpit]) {
      expect(src).toContain("FinancePeriodBar");
      // Nenhuma tela reimplementa o switcher de mês.
      expect(src).not.toContain('aria-label="Mês anterior"');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*                     4. CONTROL DECK DA COMPOSIÇÃO DO MÊS                   */
/* -------------------------------------------------------------------------- */

describe("control deck compacto da Composição do mês", () => {
  const page = read("src/pages/Financial.tsx");
  const list = read("src/components/finance/MonthCompositionList.tsx");

  it("agrupamento e expansão são controlados pela tela", () => {
    expect(page).toContain("Agrupar por");
    expect(page).toContain("Expandir tudo");
    expect(page).toContain("Recolher tudo");
    expect(list).not.toContain("Expandir tudo");
    expect(list).not.toContain("useState");
  });

  it("a lista recebe estado de expansão por props", () => {
    expect(list).toContain("expanded");
    expect(list).toContain("onToggleGroup");
  });
});
