import { describe, it, expect } from "vitest";
import {
  mergeItemValues,
  mergeOccurrenceValues,
  type SecureItemValues,
  type SecureOccurrenceValues,
} from "./financeSecureData";
import { buildMonthRows, computeTotals, type FinanceItem, type FinanceOccurrence } from "./financeModel";

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

describe("financeSecureData — merge dos valores da camada segura", () => {
  it("aplica os valores da RPC sobre a metadata do item", () => {
    const items = [item({ id: "a", name: "Google Cloud", default_amount_brl: null })];
    const values = new Map<string, SecureItemValues>([
      [
        "a",
        {
          default_amount_original: null,
          default_exchange_rate: null,
          default_amount_brl: 439.77,
          card_limit_brl: null,
        },
      ],
    ]);
    expect(mergeItemValues(items, values)[0].default_amount_brl).toBe(439.77);
  });

  it("sem mapa (RPC indisponível) devolve os itens intactos — fallback de transição", () => {
    const items = [item({ id: "a", name: "Adobe", default_amount_brl: 189 })];
    expect(mergeItemValues(items, null)[0].default_amount_brl).toBe(189);
  });

  it("item ausente do mapa (escopo tools) não é alterado", () => {
    const items = [item({ id: "card1", name: "Cartão", kind: "card", card_limit_brl: 5000 })];
    expect(mergeItemValues(items, new Map())[0].card_limit_brl).toBe(5000);
  });

  it("aplica os valores nas ocorrências", () => {
    const occ = [
      { id: "o1", item_id: "a", competence_month: "2026-08-01", currency: "BRL" } as FinanceOccurrence,
    ];
    const values = new Map<string, SecureOccurrenceValues>([
      ["o1", { amount_original: null, exchange_rate: null, amount_brl: 1728.02, paid_amount_brl: 1728.02 }],
    ]);
    const merged = mergeOccurrenceValues(occ, values);
    expect(merged[0].amount_brl).toBe(1728.02);
    expect(merged[0].paid_amount_brl).toBe(1728.02);
  });

  it("totais reconciliam depois do merge (Google Cloud, Voyage, Adobe)", () => {
    const items = mergeItemValues(
      [
        item({ id: "gc", name: "Google Cloud", kind: "expense", due_day: 10 }),
        item({ id: "vw", name: "Financiamento Voyage", kind: "expense", due_day: 11 }),
        item({ id: "ad", name: "Adobe", due_day: 12 }),
      ],
      new Map<string, SecureItemValues>([
        ["gc", { default_amount_original: null, default_exchange_rate: null, default_amount_brl: 439.77, card_limit_brl: null }],
        ["vw", { default_amount_original: null, default_exchange_rate: null, default_amount_brl: 1728.02, card_limit_brl: null }],
        ["ad", { default_amount_original: null, default_exchange_rate: null, default_amount_brl: 189, card_limit_brl: null }],
      ]),
    );
    const rows = buildMonthRows({ items, occurrences: [], competence: COMPETENCE });
    expect(computeTotals(rows).expected).toBe(2356.79);
  });
});
