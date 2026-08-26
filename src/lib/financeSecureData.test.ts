import { describe, it, expect } from "vitest";
import {
  FINANCE_ITEM_METADATA_COLUMNS,
  FINANCE_OCCURRENCE_METADATA_COLUMNS,
  FinanceSecureReadError,
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

  it("pós-cutover: item ausente do mapa NÃO conserva valor vindo da metadata", () => {
    const items = [item({ id: "a", name: "Adobe", default_amount_brl: 189 })];
    const merged = mergeItemValues(items, new Map())[0];
    expect(merged.default_amount_brl).toBeNull();
    expect(merged.name).toBe("Adobe");
  });

  it("item fora do escopo (tools) tem limite zerado, nunca herdado", () => {
    const items = [item({ id: "card1", name: "Cartão", kind: "card", card_limit_brl: 5000 })];
    expect(mergeItemValues(items, new Map())[0].card_limit_brl).toBeNull();
  });

  it("ocorrência ausente do mapa não conserva valor monetário da metadata", () => {
    const occ = [
      { id: "o1", item_id: "a", competence_month: "2026-08-01", currency: "BRL", amount_brl: 99 } as FinanceOccurrence,
    ];
    expect(mergeOccurrenceValues(occ, new Map())[0].amount_brl).toBeNull();
  });

  it("constantes de metadata não expõem colunas cifradas nem plaintext monetário", () => {
    const all = `${FINANCE_ITEM_METADATA_COLUMNS},${FINANCE_OCCURRENCE_METADATA_COLUMNS}`.split(",");
    expect(all.filter((c) => c.endsWith("_enc"))).toEqual([]);
    for (const forbidden of [
      "default_amount_original",
      "default_exchange_rate",
      "default_amount_brl",
      "card_limit_brl",
      "amount_original",
      "exchange_rate",
      "amount_brl",
      "paid_amount_brl",
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("aplica os valores nas ocorrências", () => {
    const occ = [
      { id: "o1", item_id: "a", competence_month: "2026-08-01", currency: "BRL" } as FinanceOccurrence,
    ];
    const values = new Map<string, SecureOccurrenceValues>([
      ["o1", { amount_original: null, exchange_rate: null, amount_brl: 1728.02, paid_amount_brl: 1728.02, iof_amount_brl: null }],
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

describe("FinanceSecureReadError — fail-closed pós-cutover", () => {
  it("carrega código estável para a UI reagir sem inventar zeros", () => {
    const err = new FinanceSecureReadError("finance_read_item_values");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("FINANCE_SECURE_READ_FAILED");
    expect(err.source).toBe("finance_read_item_values");
  });
});
