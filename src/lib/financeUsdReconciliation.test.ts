/**
 * AUDITORIA: status único, câmbio por compra e data de cobrança de cartão.
 *
 * Três invariantes contábeis provadas aqui:
 *  1. uma linha no recorte `Em aberto` NUNCA exibe semântica de pago;
 *  2. câmbio de referência é só estimativa — o fato é (BRL exato / USD), por
 *     compra, podendo diferir dentro da mesma fatura;
 *  3. compra no cartão grava `charge_date` e nunca `due_date`/`paid_at`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  computeTotals,
  computeUsdRate,
  effectivePaid,
  effectiveUsdRate,
  linkedStatementRowFor,
  usesReferenceRate,
} from "./financeModel";
import { buildMonthComposition, compositionStatusLabel, compositionDateLabel } from "./financeComposition";
import { buildSettlementContext } from "./financeSettlement";
import { resolveRowStatus, type RowStatusContext } from "./financeRowStatus";
import { buildOccurrencePatch } from "./financeOccurrencePatch";
import { buildReconciliation, usdComponentsOf, blockingUsdComponents } from "./financeReconciliation";

const TODAY = "2026-08-25";
const CARD_ID = "card-itau";

function item(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: "item-1",
    kind: "tool",
    name: "CapCut",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    card_item_id: CARD_ID,
    payment_method: "Cartão de crédito",
    ...over,
  } as FinanceItem;
}

function cardItem(over: Partial<FinanceItem> = {}): FinanceItem {
  return item({
    id: CARD_ID,
    kind: "card",
    name: "Itaú ••••7587",
    card_item_id: null,
    statement_closing_day: 10,
    statement_due_day: 17,
    ...over,
  });
}

function occ(over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: "occ-1",
    item_id: "item-1",
    competence_month: "2026-08-01",
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

function row(over: Partial<MonthRow> = {}): MonthRow {
  return {
    key: "row-1",
    item: item(),
    occurrence: null,
    projected: false,
    amountBrl: 100,
    amountOriginal: 100,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: "2026-08-05",
    dueDate: null,
    paid: false,
    paidAmountBrl: null,
    cardItemId: CARD_ID,
    paymentMethod: "Cartão de crédito",
    paymentOverridden: false,
    estimated: false,
    installmentNumber: null,
    installmentCount: null,
    ...over,
  } as MonthRow;
}

function statementRow(over: Partial<MonthRow> = {}): MonthRow {
  return row({
    key: "stmt",
    item: cardItem(),
    occurrence: occ({ id: "stmt-1", item_id: CARD_ID, competence_month: "2026-08-01", amount_brl: 1000 }),
    amountBrl: 1000,
    dueDate: "2026-08-17",
    cardItemId: null,
    paymentMethod: null,
    ...over,
  });
}

function ctx(rows: MonthRow[], over: Partial<RowStatusContext> = {}): RowStatusContext {
  return {
    rows,
    today: TODAY,
    cardsById: new Map([[CARD_ID, cardItem()]]),
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* 1. STATUS ÚNICO                                                     */
/* ------------------------------------------------------------------ */

describe("status único: recorte e badge nunca divergem", () => {
  it("nenhuma linha em `Em aberto` exibe semântica de pago", () => {
    const stmt = statementRow({ paid: false });
    const component = row({ key: "c1", occurrence: occ({ statement_occurrence_id: "stmt-1" }) });
    const rows = [stmt, component];
    const settlement = buildSettlementContext(rows);
    const open = buildMonthComposition({ rows, status: "open", settlement });

    expect(open.length).toBeGreaterThan(0);
    for (const entry of open) {
      const status = compositionStatusLabel(entry.row, ctx(rows, { settlement }), entry);
      expect(status.tone).not.toBe("positive");
      expect(status.label).not.toMatch(/pag/i);
    }
  });

  it("snapshot de competência + fatura paga é pago para TODAS as camadas", () => {
    const stmt = statementRow({ paid: true, occurrence: occ({ id: "stmt-1", item_id: CARD_ID, competence_month: "2026-08-01", amount_brl: 1000, paid_at: "2026-08-17T12:00:00Z" }) });
    const component = row({
      key: "c1",
      occurrence: occ({ statement_competence_snapshot: "2026-08-01", card_item_id_snapshot: CARD_ID }),
    });
    const rows = [stmt, component];

    // Mesma prova nas duas camadas: modelo e apresentação.
    expect(linkedStatementRowFor(component, [stmt])).toBe(stmt);
    expect(effectivePaid(component, rows, null)).toBe(true);
    const status = resolveRowStatus(component, ctx(rows, { statementRows: [stmt] } as Partial<RowStatusContext>));
    expect(status.tone).toBe("positive");

    // E o componente não pode aparecer no recorte aberto.
    const open = buildMonthComposition({ rows, status: "open", settlement: null });
    expect(open.some((e) => e.row.key === "c1")).toBe(false);
  });

  it("paid + open === expected", () => {
    const stmt = statementRow({ paid: true });
    const a = row({ key: "a", amountBrl: 300, occurrence: occ({ statement_occurrence_id: "stmt-1" }) });
    const b = row({ key: "b", amountBrl: 200, cardItemId: null, paymentMethod: "Pix", item: item({ card_item_id: null, payment_method: "Pix" }) });
    const rows = [stmt, a, b];
    const totals = computeTotals(rows, buildSettlementContext(rows));
    expect(totals.paid + totals.open).toBeCloseTo(totals.expected, 2);
    expect(totals.paid).toBeCloseTo(300, 2);
  });
});

/* ------------------------------------------------------------------ */
/* 2. CÂMBIO: REFERÊNCIA vs EFETIVO                                    */
/* ------------------------------------------------------------------ */

describe("câmbio de referência é apenas estimativa", () => {
  it("USD projetado usa referência e continua estimativa", () => {
    const projected = row({
      key: "usd-proj",
      currency: "USD",
      projected: true,
      estimated: true,
      amountOriginal: 20,
      amountBrl: 110,
      occurrence: null,
    });
    expect(usesReferenceRate(projected)).toBe(true);
    expect(effectiveUsdRate(projected)).toBeNull();
    expect(projected.estimated).toBe(true);
  });

  it("ocorrência real usa o câmbio do próprio par, sem fallback mensal", () => {
    const real = row({
      key: "usd-real",
      currency: "USD",
      amountOriginal: 20,
      amountBrl: 108,
      exchangeRate: 5.4,
      occurrence: occ({ currency: "USD", amount_original: 20, amount_brl: 108, is_estimated: false }),
    });
    expect(effectiveUsdRate(real)).toBeCloseTo(5.4, 6);
    expect(usesReferenceRate(real)).toBe(false);
  });

  it("duas compras USD da mesma fatura podem ter câmbios diferentes", () => {
    const a = row({ key: "u1", currency: "USD", occurrence: occ({ currency: "USD", amount_original: 10, amount_brl: 54 }) });
    const b = row({ key: "u2", currency: "USD", occurrence: occ({ id: "occ-2", currency: "USD", amount_original: 10, amount_brl: 57 }) });
    expect(effectiveUsdRate(a)).toBeCloseTo(5.4, 6);
    expect(effectiveUsdRate(b)).toBeCloseTo(5.7, 6);
    expect(effectiveUsdRate(a)).not.toBe(effectiveUsdRate(b));
  });

  it("câmbio é derivado do par com 6 casas, e recusa par inválido", () => {
    expect(computeUsdRate(108, 20)).toBeCloseTo(5.4, 6);
    expect(computeUsdRate(100, 0)).toBeNull();
    expect(computeUsdRate(null, 20)).toBeNull();
    expect(computeUsdRate(0, 20)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 3. RECONCILIAÇÃO DO PAGAMENTO                                       */
/* ------------------------------------------------------------------ */

describe("reconciliação USD antes de liquidar a fatura", () => {
  const usdA = row({ key: "u1", item: item({ id: "i1", name: "CapCut", currency: "USD" }), currency: "USD", amountOriginal: 10, amountBrl: 55, chargeDate: "2026-08-03", occurrence: occ({ id: "o1", item_id: "i1", currency: "USD", amount_original: 10 }) });
  const usdB = row({ key: "u2", item: item({ id: "i2", name: "Midjourney", currency: "USD" }), currency: "USD", amountOriginal: 20, amountBrl: 110, chargeDate: "2026-08-06", projected: true, occurrence: null });
  const group = {
    card: cardItem(),
    statementRow: statementRow(),
    components: [usdA, usdB, row({ key: "brl", amountBrl: 40 })],
    projectedTotal: 205,
    actualTotal: 1000,
    difference: null,
    configIncomplete: false,
    incompleteReason: null,
    dueDate: "2026-08-17",
    closingDate: "2026-08-10",
    paid: false,
  } as any;

  it("lista só os componentes USD, em ordem de cobrança", () => {
    const comps = usdComponentsOf(group);
    expect(comps.map((c) => c.name)).toEqual(["CapCut", "Midjourney"]);
    expect(comps[1].occurrenceId).toBeNull(); // projetado será materializado
  });

  it("exige valor real de cada USD antes de permitir o pagamento", () => {
    const state = buildReconciliation(usdComponentsOf(group), { u1: "54,00" });
    expect(state.state).toBe("incomplete");
    if (state.state === "incomplete") expect(state.missing).toEqual(["Midjourney"]);
  });

  it("bloqueia USD sem valor original válido em vez de inventar câmbio", () => {
    const broken = usdComponentsOf({ ...group, components: [row({ key: "x", currency: "USD", amountOriginal: null, occurrence: occ({ currency: "USD" }) })] } as any);
    expect(blockingUsdComponents(broken)).toHaveLength(1);
    const state = buildReconciliation(broken, { x: "50" });
    expect(state.state).toBe("blocked");
  });

  it("monta entradas com câmbio individual e ajuste cambial informativo", () => {
    const state = buildReconciliation(usdComponentsOf(group), { u1: "54,00", u2: "114,00" });
    expect(state.state).toBe("ok");
    if (state.state !== "ok") return;
    expect(state.entries[0].exchangeRate).toBeCloseTo(5.4, 6);
    expect(state.entries[1].exchangeRate).toBeCloseTo(5.7, 6);
    expect(state.totalBrl).toBeCloseTo(168, 2);
    expect(state.estimatedBrl).toBeCloseTo(165, 2);
    expect(state.drift).toBeCloseTo(3, 2);
  });
});

/* ------------------------------------------------------------------ */
/* 4. CONTRATO DA RPC RECONCILIADA                                     */
/* ------------------------------------------------------------------ */

function reconciledDefinition(): string {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const SIG = "CREATE OR REPLACE FUNCTION public.pay_finance_statement_reconciled(";
  let last = "";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    if (sql.includes(SIG)) last = sql.slice(sql.indexOf(SIG));
  }
  return last;
}

describe("pay_finance_statement_reconciled — contrato", () => {
  const sql = reconciledDefinition();
  const flat = sql.replace(/\s+/g, " ");

  it("existe no repositório", () => {
    expect(sql).not.toBe("");
  });

  it("recalcula o câmbio no servidor, por componente", () => {
    expect(flat).toContain("v_rate := round(v_brl / v_original, 6)");
  });

  it("valida escopo full, cartão, tenant e moeda USD", () => {
    expect(flat).toContain("public.has_finance_access(v_occ.tenant_id)");
    expect(flat).toMatch(/finance_access_scope\(v_occ\.tenant_id\) <> 'full'/);
    expect(flat).toMatch(/v_kind <> 'card'/);
    expect(flat).toMatch(/não é em dólar/);
  });

  it("recusa componente fora do cartão ou fora do ciclo da fatura", () => {
    expect(flat).toMatch(/não pertence a este cartão/);
    expect(flat).toMatch(/não pertence ao ciclo desta fatura/);
  });

  it("materializa projeção como ocorrência real, sem paid_at no filho", () => {
    expect(flat).toContain("INSERT INTO public.finance_occurrences");
    const insertBlock = flat.slice(flat.indexOf("INSERT INTO public.finance_occurrences"));
    expect(insertBlock.slice(0, insertBlock.indexOf(");"))).not.toContain("paid_at");
    expect(flat).not.toMatch(/UPDATE public\.finance_occurrences SET paid_at[^;]*WHERE id = v_child_id/);
  });

  it("nunca escreve colunas _enc (triggers cifram)", () => {
    expect(flat).not.toMatch(/(amount_brl|amount_original|exchange_rate|paid_amount_brl)_enc\s*=/);
  });

  it("marca a fatura como paga só depois da reconciliação e sem tocar due_date", () => {
    expect(flat.indexOf("D. PAGA A FATURA")).toBeGreaterThan(flat.indexOf("C. RECONCILIAÇÃO DOS USD"));
    expect(flat).toMatch(/WHERE id = _occurrence_id/);
    expect(flat).not.toMatch(/due_date\s*=\s*[^N]/);
  });

  it("mantém o bloqueio de pagamento parcial da fatura", () => {
    expect(flat).toContain("abs(_paid_amount_brl - v_invoice_amount) > 0.011");
    expect(flat).toContain("private.finance_decrypt_numeric(v_occ.amount_brl_enc)");
  });

  it("é SECURITY DEFINER com search_path vazio e grants restritos", () => {
    expect(flat).toContain("SECURITY DEFINER");
    expect(flat).toMatch(/SET search_path TO ''/);
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.pay_finance_statement_reconciled[^;]*FROM PUBLIC/);
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.pay_finance_statement_reconciled[^;]*FROM anon/);
    expect(flat).toMatch(/GRANT EXECUTE ON FUNCTION public\.pay_finance_statement_reconciled[^;]*TO authenticated/);
  });
});

/* ------------------------------------------------------------------ */
/* 5. MODAL DE OCORRÊNCIA: CARTÃO NÃO TEM VENCIMENTO NEM PAGO          */
/* ------------------------------------------------------------------ */

const patchBase = {
  amountOriginal: 100,
  amountBrl: 100,
  exchangeRate: null,
  observations: "",
  attachmentUrl: null,
  attachmentName: null,
  originPatch: {},
  nowISO: "2026-08-25T12:00:00Z",
};

describe("modal de ocorrência: data do fato conforme a natureza", () => {
  it("compra no cartão de 13/08 para 18/08 grava charge_date, nunca due_date", () => {
    const cardCharge = row({ chargeDate: "2026-08-13", dueDate: null });
    const patch = buildOccurrencePatch({
      ...patchBase,
      row: cardCharge,
      cardRow: true,
      factDate: "2026-08-18",
      paid: false,
    });
    expect(patch.charge_date).toBe("2026-08-18");
    expect(patch.due_date).toBeNull();

    // A lista passa a exibir a nova data de cobrança.
    const updated = row({ chargeDate: patch.charge_date as string });
    expect(compositionDateLabel(updated)).toEqual({ label: "Cobrança", date: "2026-08-18" });
  });

  it("compra no cartão não envia paid_at nem paid_amount_brl", () => {
    const patch = buildOccurrencePatch({
      ...patchBase,
      row: row(),
      cardRow: true,
      factDate: "2026-08-18",
      paid: true,
    });
    expect(patch).not.toHaveProperty("paid_at");
    expect(patch).not.toHaveProperty("paid_amount_brl");
  });

  it("obrigação direta mantém due_date e o switch Pago", () => {
    const direct = row({
      cardItemId: null,
      paymentMethod: "Pix",
      item: item({ card_item_id: null, payment_method: "Pix" }),
      chargeDate: "2026-08-05",
      dueDate: "2026-08-10",
    });
    const patch = buildOccurrencePatch({
      ...patchBase,
      row: direct,
      cardRow: false,
      factDate: "2026-08-12",
      paid: true,
    });
    expect(patch.due_date).toBe("2026-08-12");
    expect(patch.charge_date).toBe("2026-08-05");
    expect(patch.paid_at).toBe("2026-08-25T12:00:00Z");
    expect(patch.paid_amount_brl).toBe(100);
  });

  it("desmarcar Pago em obrigação direta limpa o fato de pagamento", () => {
    const patch = buildOccurrencePatch({
      ...patchBase,
      row: row({ cardItemId: null, paymentMethod: "Pix", item: item({ card_item_id: null, payment_method: "Pix" }) }),
      cardRow: false,
      factDate: "2026-08-12",
      paid: false,
    });
    expect(patch.paid_at).toBeNull();
    expect(patch.paid_amount_brl).toBeNull();
  });
});
