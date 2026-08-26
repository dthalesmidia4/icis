/**
 * HARDENING OPERACIONAL DO FINANCEIRO
 *
 * 1) inativo sai da OPERAÇÃO do mês (mas o registro continua no banco);
 * 2) rótulos de cartão distinguem FATO x PROJEÇÃO e item x fatura;
 * 3) fatura é determinística pela `charge_date` real (sem duplicar item);
 * 4) itens ligados ao cartão fora da fatura aparecem com motivo;
 * 5) fato de cartão sem data de cobrança é sinalizado.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  operationalMonthRows,
  isOperationalRow,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";
import {
  cardChargeDateLabel,
  cardClosingDayLabel,
  cardDueDayLabel,
  CARD_CHARGE_DATE_MISSING,
} from "./financeCardLabels";
import {
  buildLinkedCardItems,
  needsChargeDateCorrection,
} from "./financeCardLinkedItems";
import { whenLabel } from "./financeRowStatus";

const AUG = { year: 2026, month: 8 };

function item(p: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "tool",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...p,
  } as FinanceItem;
}
function occ(p: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { competence_month: "2026-08-01", currency: "BRL", ...p } as FinanceOccurrence;
}

const card = item({
  id: "card",
  name: "Itaú ••••7587",
  kind: "card",
  cost_center: "compartilhado",
  statement_closing_day: 14,
  statement_due_day: 25,
});

/* -------------------------------------------------------------------------- */
/* 1) Inativo não opera                                                        */
/* -------------------------------------------------------------------------- */

describe("cadastro inativo sai da operação do mês", () => {
  const inativo = item({
    id: "inativo",
    name: "Ferramenta encerrada",
    active: false,
    default_amount_brl: 100,
    charge_day: 5,
  });
  const ativo = item({ id: "ativo", name: "Ferramenta ativa", default_amount_brl: 50, charge_day: 5 });

  it("projeção de item inativo não entra nas linhas operacionais nem nos totais", () => {
    const rows = buildMonthRows({ items: [ativo, inativo], occurrences: [], competence: AUG });
    expect(rows.some((r) => r.item.id === "inativo")).toBe(true);

    const operational = operationalMonthRows(rows);
    expect(operational.map((r) => r.item.id)).toEqual(["ativo"]);
    expect(computeTotals(operational).expected).toBe(50);
  });

  it("fato REAL de mês de cartão inativo continua visível (histórico da fatura)", () => {
    const inactiveCard = item({ ...card, id: "old-card", active: false } as never);
    const rows = buildMonthRows({
      items: [inactiveCard],
      occurrences: [occ({ id: "s", item_id: "old-card", amount_brl: 300, due_date: "2026-08-25" })],
      competence: AUG,
    });
    const statementRow = rows.find((r) => r.item.id === "old-card")!;
    expect(isOperationalRow(statementRow)).toBe(true);
  });

  it("cadastro inativo sem fato não compõe fatura de cartão", () => {
    const linked = item({ ...inativo, card_item_id: "card", charge_day: 5 } as never);
    const [group] = buildStatementGroups({
      items: [card, linked],
      occurrences: [],
      competence: AUG,
    });
    expect(group.components).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2) Vocabulário de datas                                                     */
/* -------------------------------------------------------------------------- */

describe("rótulos de cartão separam fato, projeção e fatura", () => {
  it("fato real usa `Cobrado no cartão em`", () => {
    expect(cardChargeDateLabel({ chargeDate: "2026-08-05", projected: false })).toBe(
      "Cobrado no cartão em 05 ago",
    );
  });
  it("projeção usa `Cobrança prevista no cartão em`", () => {
    expect(cardChargeDateLabel({ chargeDate: "2026-08-05", projected: true })).toBe(
      "Cobrança prevista no cartão em 05 ago",
    );
  });
  it("sem data avisa em vez de inventar", () => {
    expect(cardChargeDateLabel({ chargeDate: null, projected: false })).toBe(
      CARD_CHARGE_DATE_MISSING,
    );
  });
  it("fechamento e vencimento são explicitamente da FATURA", () => {
    expect(cardClosingDayLabel(14)).toBe("Fechamento da fatura: dia 14");
    expect(cardDueDayLabel(25)).toBe("Vencimento da fatura: dia 25");
    expect(cardClosingDayLabel(null)).toBe("Fechamento da fatura não informado");
  });
  it("whenLabel do componente segue o mesmo vocabulário", () => {
    const linked = item({ id: "gpt", name: "GPT", card_item_id: "card", charge_day: 6, default_amount_brl: 120 });
    const rows = buildMonthRows({ items: [card, linked], occurrences: [], competence: AUG });
    const row = rows.find((r) => r.item.id === "gpt")!;
    expect(whenLabel(row, "2026-08-01")).toBe("Cobrança prevista no cartão em 06 ago");
  });
});

/* -------------------------------------------------------------------------- */
/* 3) Determinismo da fatura                                                   */
/* -------------------------------------------------------------------------- */

describe("charge_date real manda sobre charge_day do cadastro", () => {
  const gpt = item({
    id: "gpt",
    name: "ChatGPT",
    card_item_id: "card",
    charge_day: 6,
    default_amount_brl: 120,
  });

  it("item com fato real não aparece também como projeção na mesma fatura", () => {
    const [group] = buildStatementGroups({
      items: [card, gpt],
      occurrences: [occ({ id: "o", item_id: "gpt", amount_brl: 120, charge_date: "2026-08-04" })],
      competence: AUG,
    });
    const gptRows = group.components.filter((c) => c.item.id === "gpt");
    expect(gptRows).toHaveLength(1);
    expect(gptRows[0].projected).toBe(false);
    expect(group.projectedTotal).toBe(120);
  });
});

/* -------------------------------------------------------------------------- */
/* 4) e 5) Outros vinculados + qualidade de dado                               */
/* -------------------------------------------------------------------------- */

describe("itens vinculados ao cartão fora da fatura", () => {
  const items = [
    card,
    item({ id: "gpt", name: "ChatGPT", card_item_id: "card", charge_day: 6, default_amount_brl: 120 }),
    // cobrança dia 20 > fechamento 14 => fatura de setembro
    item({ id: "avisa", name: "AVISA", card_item_id: "card", charge_day: 20, default_amount_brl: 69 }),
    // sem dia de cobrança => não classificável por data
    item({ id: "canva", name: "Canva", card_item_id: "card", default_amount_brl: 55 }),
  ];

  function build(occurrences: FinanceOccurrence[] = []) {
    const rows = operationalMonthRows(
      buildMonthRows({ items, occurrences, competence: AUG }),
    );
    const [group] = buildStatementGroups({ items, occurrences, competence: AUG });
    return { rows, group };
  }

  it("separa quem compõe a fatura de quem só está vinculado, com motivo", () => {
    const { rows, group } = build();
    expect(group.components.map((c) => c.item.id)).toEqual(["gpt"]);

    const linked = buildLinkedCardItems({ group, items, rows, competence: AUG });
    const byId = new Map(linked.map((l) => [l.item.id, l]));
    expect(byId.get("avisa")!.reason).toBe("next_statement");
    expect(byId.get("avisa")!.label).toContain("setembro");
    expect(byId.get("canva")!.reason).toBe("missing_charge_date");
    expect(byId.has("gpt")).toBe(false);
    expect(byId.has("card")).toBe(false);
  });

  it("fato real de cartão sem charge_date é sinalizado para correção", () => {
    const migrated = occ({
      id: "occ-canva",
      item_id: "canva",
      amount_brl: 55,
      due_date: "2026-08-10",
    });
    const { rows, group } = build([migrated]);
    const row = rows.find((r) => r.item.id === "canva")!;
    expect(needsChargeDateCorrection(row)).toBe(true);

    const linked = buildLinkedCardItems({ group, items, rows, competence: AUG });
    const canva = linked.find((l) => l.item.id === "canva")!;
    expect(canva.reason).toBe("unclassifiable");
    expect(canva.needsChargeDateCorrection).toBe(true);
    expect(canva.fix).toBe("fix_charge_date");
  });

  it("item inativo ligado ao cartão nunca aparece como vinculado", () => {
    const withInactive = [...items, item({ id: "old", name: "Antigo", card_item_id: "card", active: false, charge_day: 20 })];
    const rows = operationalMonthRows(
      buildMonthRows({ items: withInactive, occurrences: [], competence: AUG }),
    );
    const [group] = buildStatementGroups({ items: withInactive, occurrences: [], competence: AUG });
    const linked = buildLinkedCardItems({ group, items: withInactive, rows, competence: AUG });
    expect(linked.some((l) => l.item.id === "old")).toBe(false);
  });
});
