import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildMonthRows,
  buildStatementGroups,
  installmentNumberForCompetence,
  isProjectableInMonth,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";
import { visibleStatementGroups } from "./financeCardVisibility";
import {
  NO_CATEGORY_KEY,
  buildCategoryGroups,
  categoryFilterOptions,
  categoryKeyOf,
  filterEntriesByCategory,
  normalizeCategory,
  tenantCategoryOptions,
} from "./financeCategories";
import { MASKED_MONEY, maskMoney } from "./financePrivacy";

const COMPETENCE = { year: 2026, month: 8 };

function item(partial: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "tool",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...partial,
  } as FinanceItem;
}

function occurrence(partial: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { competence_month: "2026-08-01", currency: "BRL", ...partial } as FinanceOccurrence;
}

/* -------------------------------------------------------------------------- */
/*                        1. CARTÃO INATIVO SEM FATO REAL                     */
/* -------------------------------------------------------------------------- */

describe("cartões inativos em Cartões e faturas", () => {
  const activeCard = item({ id: "card1", name: "Itaú ••••7587", kind: "card", statement_closing_day: 10, statement_due_day: 17 });
  const inactiveCard = item({ id: "card2", name: "Cartão ••••9584", kind: "card", active: false, statement_closing_day: 5, statement_due_day: 12 });

  it("cartão inativo sem nenhuma ocorrência desaparece da tela", () => {
    const groups = buildStatementGroups({ items: [activeCard, inactiveCard], occurrences: [], competence: COMPETENCE });
    const visible = visibleStatementGroups(groups);
    expect(visible.map((g) => g.card.id)).toEqual(["card1"]);
  });

  it("cartão ativo aparece mesmo sem fato real", () => {
    const groups = buildStatementGroups({ items: [activeCard], occurrences: [], competence: COMPETENCE });
    expect(visibleStatementGroups(groups)).toHaveLength(1);
  });

  it("cartão inativo com fatura real na competência continua auditável", () => {
    const groups = buildStatementGroups({
      items: [inactiveCard],
      occurrences: [occurrence({ id: "s1", item_id: "card2", amount_brl: 120, due_date: "2026-08-12" })],
      competence: COMPETENCE,
    });
    expect(visibleStatementGroups(groups).map((g) => g.card.id)).toEqual(["card2"]);
  });

  it("cartão inativo com cobrança persistida na competência continua auditável", () => {
    const charge = item({ id: "t1", name: "CapCut", charge_day: 2, card_item_id: "card2" });
    const groups = buildStatementGroups({
      items: [inactiveCard, charge],
      occurrences: [occurrence({ id: "c1", item_id: "t1", amount_brl: 32.9, charge_date: "2026-08-02" })],
      competence: COMPETENCE,
    });
    expect(visibleStatementGroups(groups).map((g) => g.card.id)).toEqual(["card2"]);
  });
});

/* -------------------------------------------------------------------------- */
/*                     2. VOYAGE — ENCERRAMENTO EM MAIO/2026                  */
/* -------------------------------------------------------------------------- */

describe("Voyage encerrado em maio/2026", () => {
  const voyage = item({
    id: "voyage",
    name: "FINANCIAMENTO VOYAGE QXP-8A24",
    kind: "expense",
    active: false,
    recurrence_type: "installments",
    installment_start_date: "2026-03-11",
    installment_count: 3,
    default_amount_brl: 1728.02,
  });

  it("numera 1/3, 2/3 e 3/3 entre março e maio e nada depois", () => {
    expect(installmentNumberForCompetence(voyage, { year: 2026, month: 3 })).toBe(1);
    expect(installmentNumberForCompetence(voyage, { year: 2026, month: 4 })).toBe(2);
    expect(installmentNumberForCompetence(voyage, { year: 2026, month: 5 })).toBe(3);
    expect(installmentNumberForCompetence(voyage, { year: 2026, month: 6 })).toBeNull();
    expect(installmentNumberForCompetence(voyage, { year: 2026, month: 9 })).toBeNull();
  });

  it("inativo não projeta em nenhum mês, nem dentro do cronograma", () => {
    expect(isProjectableInMonth(voyage, { year: 2026, month: 5 })).toBe(false);
    expect(isProjectableInMonth(voyage, { year: 2026, month: 6 })).toBe(false);
    expect(buildMonthRows({ items: [voyage], occurrences: [], competence: { year: 2026, month: 6 } })).toHaveLength(0);
  });

  it("fato pago histórico permanece visível na sua competência", () => {
    const rows = buildMonthRows({
      items: [voyage],
      occurrences: [
        occurrence({
          id: "may",
          item_id: "voyage",
          competence_month: "2026-05-01",
          amount_brl: 1728.02,
          due_date: "2026-05-11",
          paid_at: "2026-05-11T12:48:58Z",
        }),
      ],
      competence: { year: 2026, month: 5 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe(true);
    expect(rows[0].installmentNumber).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/*                          3. PRIVACIDADE DE VALORES                        */
/* -------------------------------------------------------------------------- */

describe("privacidade monetária", () => {
  it("máscara única esconde montante e expõe quando visível", () => {
    expect(maskMoney(1234.5, false)).toBe(MASKED_MONEY);
    expect(maskMoney(1234.5, true)).toContain("1.234,50");
  });

  it("o contexto é a única fonte do estado e começa oculto", () => {
    const src = readFileSync("src/contexts/FinanceVisibilityContext.tsx", "utf8");
    expect(src).toContain("useState(false)");
    // Nada de persistência: refresh volta ao default seguro.
    expect(src).not.toContain("localStorage");
  });

  it("o olho vive só no resumo: detalhamento de linhas nunca é mascarado", () => {
    const page = readFileSync("src/pages/Financial.tsx", "utf8");
    expect(page).toContain("useFinanceVisibility()");
    expect(page).toContain("<FinanceVisibilityProvider>");
    expect(page).not.toContain("setShowKpis");
    // Listas e faturas são auditoria: valor sempre legível.
    for (const file of [
      "src/components/finance/MonthCompositionList.tsx",
      "src/components/finance/StatementPanel.tsx",
      "src/components/finance/MonthAccountsList.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("useFinanceVisibility");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*                     4. CATEGORIAS E AGRUPAMENTO DA COMPOSIÇÃO             */
/* -------------------------------------------------------------------------- */

describe("categorias de despesa", () => {
  const folha = ["Eric", "Henrique", "Lúcia", "Leticia"].map((who, i) =>
    item({
      id: `folha${i}`,
      name: `FOLHA DE PAGAMENTO (${who})`,
      kind: "expense",
      category: "Folha de pagamento",
      due_day: 5,
      default_amount_brl: 1000 + i,
    }),
  );
  const inss = item({ id: "inss", name: "INSS", kind: "expense", category: "Encargos trabalhistas", due_day: 20, default_amount_brl: 500 });
  const fgts = item({ id: "fgts", name: "FGTS", kind: "expense", category: "Encargos trabalhistas", due_day: 20, default_amount_brl: 300 });
  const semCategoria = item({ id: "sem", name: "Claro", kind: "expense", due_day: 10, default_amount_brl: 200 });

  const rows = buildMonthRows({ items: [...folha, inss, fgts, semCategoria], occurrences: [], competence: COMPETENCE });
  const entries = rows.map((row) => ({ row, value: row.amountBrl ?? 0, paid: false }));

  it("normaliza texto livre e cai em Sem categoria quando vazio", () => {
    expect(normalizeCategory("  Assinaturas  ")).toBe("Assinaturas");
    expect(normalizeCategory("   ")).toBeNull();
    expect(categoryKeyOf(semCategoria)).toBe(NO_CATEGORY_KEY);
  });

  it("agrupa folha de pagamento em uma linha e coloca Sem categoria por último", () => {
    const groups = buildCategoryGroups(entries);
    expect(groups.map((g) => g.label)).toEqual([
      "Encargos trabalhistas",
      "Folha de pagamento",
      "Sem categoria",
    ]);
    const payroll = groups.find((g) => g.label === "Folha de pagamento")!;
    expect(payroll.count).toBe(4);
    expect(payroll.total).toBe(1000 + 1001 + 1002 + 1003);
    expect(groups.find((g) => g.label === "Encargos trabalhistas")!.total).toBe(800);
  });

  it("soma dos grupos = total da lista (grupo é apresentação, não lançamento)", () => {
    const groups = buildCategoryGroups(entries);
    const listTotal = Number(entries.reduce((s, e) => s + e.value, 0).toFixed(2));
    const groupsTotal = Number(groups.reduce((s, g) => s + g.total, 0).toFixed(2));
    expect(groupsTotal).toBe(listTotal);
  });

  it("grupos vazios não aparecem", () => {
    expect(buildCategoryGroups([]).length).toBe(0);
  });

  it("filtro de categoria lista o que existe no recorte, com Sem categoria no fim", () => {
    expect(categoryFilterOptions(entries).map((o) => o.value)).toEqual([
      "Encargos trabalhistas",
      "Folha de pagamento",
      NO_CATEGORY_KEY,
    ]);
    expect(filterEntriesByCategory(entries, "Folha de pagamento")).toHaveLength(4);
    expect(filterEntriesByCategory(entries, NO_CATEGORY_KEY)).toHaveLength(1);
    expect(filterEntriesByCategory(entries, "all")).toHaveLength(entries.length);
  });

  it("sugestões de categoria vêm dos cadastros do tenant", () => {
    expect(tenantCategoryOptions([...folha, inss, semCategoria])).toEqual([
      "Encargos trabalhistas",
      "Folha de pagamento",
    ]);
  });

  it("categoria é editada no CADASTRO, nunca na ocorrência", () => {
    const modal = readFileSync("src/components/finance/FinanceOccurrenceModal.tsx", "utf8");
    expect(modal).toContain("Editar cadastro / categoria");
    expect(modal).not.toContain("category:");
    const patch = readFileSync("src/lib/financeOccurrencePatch.ts", "utf8");
    expect(patch).not.toContain("category");
    const form = readFileSync("src/components/finance/FinanceItemFormModal.tsx", "utf8");
    expect(form).toContain("finance-category-options");
    expect(form).toContain("category: category.trim() || null");
  });

  it("a lista da composição renderiza grupos colapsados por padrão", () => {
    const list = readFileSync("src/components/finance/MonthCompositionList.tsx", "utf8");
    expect(list).toContain("buildCompositionGroups");
    // Nenhum grupo começa aberto: o mapa de expandidos nasce vazio.
    expect(list).toContain("useState<Record<string, boolean>>({})");
    // Atalho de leitura em massa, restrito ao recorte atual.
    expect(list).toContain("Expandir tudo");
    expect(list).toContain("Recolher tudo");
  });
});

/* -------------------------------------------------------------------------- */
/*                        5. ADEUS PENDRIVE COMO ASSINATURA                   */
/* -------------------------------------------------------------------------- */

describe("ADEUS PENDRIVE como assinatura", () => {
  const pendrive = item({
    id: "pendrive",
    name: "ADEUS PENDRIVE",
    kind: "tool",
    category: "Assinaturas",
    recurrence_type: "monthly",
    payment_method: "Boleto",
    default_amount_brl: 40,
  });

  it("é ferramenta mensal de R$ 40 no boleto, contada uma única vez", () => {
    const rows = buildMonthRows({ items: [pendrive], occurrences: [], competence: COMPETENCE });
    expect(rows).toHaveLength(1);
    expect(rows[0].amountBrl).toBe(40);
    expect(rows[0].paymentMethod).toBe("Boleto");
    expect(rows[0].item.kind).toBe("tool");
  });
});
