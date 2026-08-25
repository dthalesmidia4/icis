import { describe, expect, it } from "vitest";
import { FinanceItem, FinanceOccurrence, MonthRow, buildMonthRows } from "@/lib/financeModel";
import {
  UNDEFINED_GROUP_TITLE,
  buildSubscriptionCatalog,
  buildSubscriptionMonthView,
  isSubscriptionRelevantForCompetence,
  packageChildren,
  safeCardLabel,
} from "@/lib/financeSubscriptionMonth";

const competence = { year: 2026, month: 8 };

function item(over: Partial<FinanceItem>): FinanceItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    tenant_id: "t",
    kind: "tool",
    name: "Item",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    recurrence_interval_months: 1,
    amount_mode: "fixed",
    default_amount_brl: 100,
    charge_day: 10,
    ...over,
  } as FinanceItem;
}

function occurrence(itemId: string, over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: `occ-${itemId}`,
    tenant_id: "t",
    item_id: itemId,
    competence_month: "2026-08-01",
    currency: "BRL",
    amount_brl: 100,
    is_estimated: false,
    ...over,
  } as FinanceOccurrence;
}

function rowsFor(items: FinanceItem[], occurrences: FinanceOccurrence[] = []): MonthRow[] {
  return buildMonthRows({ items, occurrences, competence, fallbackRate: null });
}

const safeItau = {
  id: "c1",
  bank_name: "Itaú",
  card_last4: "7587",
  statement_closing_day: 5,
  statement_due_day: 12,
};

describe("safeCardLabel", () => {
  it("mostra rótulo humano sem expor UUID", () => {
    expect(safeCardLabel(safeItau)).toBe("Itaú ••••7587");
  });
});

describe("isSubscriptionRelevantForCompetence", () => {
  it("F. inativo sem occurrence no mês não aparece", () => {
    const inactive = item({ id: "a", kind: "package", active: false });
    const rows = rowsFor([inactive]);
    expect(isSubscriptionRelevantForCompetence(inactive, rows, competence)).toBe(false);
  });

  it("G. inativo com occurrence real no mês aparece", () => {
    const inactive = item({ id: "a", kind: "package", active: false });
    const rows = rowsFor([inactive], [occurrence("a")]);
    expect(isSubscriptionRelevantForCompetence(inactive, rows, competence)).toBe(true);
  });

  it("H. ativo fora da periodicidade não aparece", () => {
    const annual = item({
      id: "a",
      recurrence_type: "annual",
      subscription_date: "2026-03-15",
    });
    const rows = rowsFor([annual]);
    expect(isSubscriptionRelevantForCompetence(annual, rows, competence)).toBe(false);
  });

  it("ativo e projetável no mês aparece", () => {
    const monthly = item({ id: "a" });
    expect(isSubscriptionRelevantForCompetence(monthly, rowsFor([monthly]), competence)).toBe(true);
  });

  it("recurso incluído nunca é linha principal do mês", () => {
    const child = item({ id: "x", kind: "included_resource", parent_item_id: "p" });
    expect(isSubscriptionRelevantForCompetence(child, rowsFor([child]), competence)).toBe(false);
  });
});

describe("buildSubscriptionMonthView", () => {
  it("I. grupo vazio não é criado (inativos sem fato desaparecem)", () => {
    const items = [
      item({ id: "flix", kind: "package", name: "ConteúdosFlix", active: false, payment_method: undefined }),
      item({ id: "design", kind: "package", name: "Designer Flix", active: false }),
      item({ id: "child", kind: "included_resource", name: "Canva Pro", parent_item_id: "flix" }),
    ];
    const view = buildSubscriptionMonthView({
      items,
      rows: rowsFor(items),
      cards: [safeItau],
      competence,
    });
    expect(view.groups).toHaveLength(0);
    expect(view.groups.map((g) => g.title)).not.toContain(UNDEFINED_GROUP_TITLE);
    expect(view.total).toBe(0);
  });

  it("J/K. filhos ficam dentro do pacote e não entram no total", () => {
    const items = [
      item({ id: "pkg", kind: "package", name: "ConteúdosFlix", default_amount_brl: 54.9, card_item_id: "c1" }),
      item({ id: "c-a", kind: "included_resource", name: "Canva Pro", parent_item_id: "pkg", default_amount_brl: 999 }),
      item({ id: "c-b", kind: "included_resource", name: "CapCut Pro", parent_item_id: "pkg", default_amount_brl: 999 }),
    ];
    const view = buildSubscriptionMonthView({
      items,
      rows: rowsFor(items),
      cards: [safeItau],
      competence,
    });
    expect(view.groups).toHaveLength(1);
    const entry = view.groups[0].entries[0];
    expect(entry.item.id).toBe("pkg");
    expect(entry.children.map((c) => c.name)).toEqual(["Canva Pro", "CapCut Pro"]);
    expect(view.total).toBeCloseTo(54.9);
    // nenhum filho virou linha de cobrança
    expect(view.groups.flatMap((g) => g.entries).map((e) => e.item.id)).toEqual(["pkg"]);
  });

  it("L. mesmo recurso em dois pacotes aparece nos dois sem duplicar custo", () => {
    const items = [
      item({ id: "p1", kind: "package", name: "Pacote A", default_amount_brl: 50, payment_method: "Pix" }),
      item({ id: "p2", kind: "package", name: "Pacote B", default_amount_brl: 30, payment_method: "Pix" }),
      item({ id: "e1", kind: "included_resource", name: "Envato", parent_item_id: "p1" }),
      item({ id: "e2", kind: "included_resource", name: "Envato", parent_item_id: "p2" }),
    ];
    const view = buildSubscriptionMonthView({
      items,
      rows: rowsFor(items),
      cards: [],
      competence,
    });
    const entries = view.groups.flatMap((g) => g.entries);
    expect(entries.map((e) => e.children.map((c) => c.name))).toEqual([["Envato"], ["Envato"]]);
    expect(view.total).toBe(80);
  });

  it("M. usa os cartões seguros para nomear o grupo", () => {
    const items = [item({ id: "a", card_item_id: "c1" })];
    const view = buildSubscriptionMonthView({
      items,
      rows: rowsFor(items),
      cards: [safeItau],
      competence,
    });
    expect(view.groups[0].title).toBe("Itaú ••••7587");
    expect(view.groups[0].kind).toBe("card");
  });

  it("agrupa formas diretas e sem definição depois do filtro mensal", () => {
    const items = [
      item({ id: "a", card_item_id: "c1" }),
      item({ id: "b", payment_method: "Pix" }),
      item({ id: "c" }),
    ];
    const view = buildSubscriptionMonthView({
      items,
      rows: rowsFor(items),
      cards: [safeItau],
      competence,
    });
    expect(view.groups.map((g) => g.title)).toEqual([
      "Itaú ••••7587",
      "Pix",
      UNDEFINED_GROUP_TITLE,
    ]);
  });

  it("busca encontra o pacote pelo nome de um recurso incluído", () => {
    const items = [
      item({ id: "pkg", kind: "package", name: "ConteúdosFlix", payment_method: "Pix" }),
      item({ id: "child", kind: "included_resource", name: "Freepik", parent_item_id: "pkg" }),
      item({ id: "other", name: "Adobe", payment_method: "Pix" }),
    ];
    const rows = rowsFor(items);
    const found = buildSubscriptionMonthView({ items, rows, cards: [], competence, search: "freepik" });
    expect(found.groups.flatMap((g) => g.entries).map((e) => e.item.id)).toEqual(["pkg"]);
  });

  it("valor da linha do mês vence o valor do cadastro", () => {
    const items = [item({ id: "a", default_amount_brl: 100, payment_method: "Pix" })];
    const rows = rowsFor(items, [occurrence("a", { amount_brl: 137.5 })]);
    const view = buildSubscriptionMonthView({ items, rows, cards: [], competence });
    expect(view.total).toBeCloseTo(137.5);
  });
});

describe("packageChildren", () => {
  it("só devolve recursos incluídos do pacote pedido", () => {
    const items = [
      item({ id: "x", kind: "included_resource", parent_item_id: "p1", name: "B" }),
      item({ id: "y", kind: "included_resource", parent_item_id: "p2", name: "A" }),
    ];
    expect(packageChildren(items, "p1").map((i) => i.id)).toEqual(["x"]);
  });
});

describe("buildSubscriptionCatalog", () => {
  const items = [
    item({ id: "p", kind: "package", name: "ConteúdosFlix", active: false }),
    item({ id: "t", name: "Adobe", active: true }),
    item({ id: "c", kind: "included_resource", name: "Canva Pro", parent_item_id: "p" }),
    item({ id: "e", kind: "expense", name: "Aluguel" }),
  ];

  it("mostra inativos quando pedido — catálogo não é fechamento mensal", () => {
    expect(buildSubscriptionCatalog({ items, filter: "inactive" }).map((e) => e.item.id)).toEqual(["p"]);
    expect(buildSubscriptionCatalog({ items, filter: "active" }).map((e) => e.item.id)).toEqual(["t", "c"]);
    expect(buildSubscriptionCatalog({ items, filter: "all" }).map((e) => e.item.id)).toEqual(["t", "c", "p"]);
  });

  it("nunca lista despesa administrativa/cartão", () => {
    expect(buildSubscriptionCatalog({ items, filter: "all" }).map((e) => e.item.id)).not.toContain("e");
  });

  it("indica o pacote de origem do recurso incluído", () => {
    const entry = buildSubscriptionCatalog({ items, filter: "all" }).find((e) => e.item.id === "c");
    expect(entry?.parentName).toBe("ConteúdosFlix");
  });
});
