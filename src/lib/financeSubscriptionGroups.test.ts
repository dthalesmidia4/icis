import { describe, expect, it } from "vitest";
import { FinanceItem } from "@/lib/financeModel";
import { buildSubscriptionGroups, UNDEFINED_GROUP_TITLE } from "@/lib/financeSubscriptionGroups";

const base = {
  tenant_id: "t",
  currency: "BRL" as const,
  recurrence_type: "monthly" as const,
  cost_center: "operacao" as any,
  active: true,
};

function item(over: Partial<FinanceItem>): FinanceItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    kind: "tool",
    name: "Item",
    default_amount_brl: 100,
    ...base,
    ...over,
  } as FinanceItem;
}

const itau = item({
  id: "c1",
  kind: "card",
  name: "Itaú",
  card_last4: "7587",
  statement_closing_day: 5,
  statement_due_day: 12,
});
const other = item({ id: "c2", kind: "card", name: "Cartão", card_last4: "9584" });

describe("buildSubscriptionGroups", () => {
  it("agrupa por cartão, forma direta e sem definição", () => {
    const groups = buildSubscriptionGroups({
      items: [
        item({ id: "a", card_item_id: "c1" }),
        item({ id: "b", card_item_id: "c2" }),
        item({ id: "c", payment_method: "Pix" }),
        item({ id: "d" }),
      ],
      cards: [itau, other],
    });
    expect(groups.map((g) => g.title)).toEqual([
      "Cartão ••••9584",
      "Itaú ••••7587",
      "Pix",
      UNDEFINED_GROUP_TITLE,
    ]);
  });

  it("soma total do grupo ignorando recursos incluídos", () => {
    const groups = buildSubscriptionGroups({
      items: [
        item({ id: "a", card_item_id: "c1", default_amount_brl: 50 }),
        item({ id: "b", card_item_id: "c1", kind: "included_resource", default_amount_brl: 999 }),
      ],
      cards: [itau],
    });
    expect(groups[0].total).toBe(50);
  });

  it("expõe aviso de ciclo incompleto no grupo do cartão", () => {
    const groups = buildSubscriptionGroups({
      items: [item({ card_item_id: "c2" })],
      cards: [other],
    });
    expect(groups[0].warning).toBe("Faltam fechamento e vencimento");
  });

  it("cai no grupo sem forma definida quando o cartão não existe", () => {
    const groups = buildSubscriptionGroups({
      items: [item({ card_item_id: "inexistente" })],
      cards: [itau],
    });
    expect(groups[0].title).toBe(UNDEFINED_GROUP_TITLE);
  });

  it("trata 'Cartão de Crédito' sem cartão vinculado como sem definição", () => {
    const groups = buildSubscriptionGroups({
      items: [item({ payment_method: "Cartão de Crédito" })],
      cards: [],
    });
    expect(groups[0].kind).toBe("undefined");
  });

  it("não retorna grupos vazios", () => {
    expect(buildSubscriptionGroups({ items: [], cards: [itau] })).toEqual([]);
  });
});
