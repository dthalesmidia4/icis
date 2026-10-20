/**
 * TRANSPARÊNCIA DA FATURA — as compras em reais precisam aparecer.
 *
 * Caso real: FACEBOOK IMPULCIONAMENTO, R$ 212,83, cobrado 17/09/2026 no Itaú
 * 7587, dentro da fatura OUT/2026 (ciclo 15/09–13/10). O modal "Pagar fatura"
 * mostrava só as compras em dólar; as linhas BRL ficavam invisíveis.
 *
 * Estes testes travam a leitura: BRL listado (sem edição), USD continua a única
 * parte editável, e nenhum valor da fatura é alterado pela exibição.
 */
import { describe, expect, it } from "vitest";
import { brlComponentsOf, statementTotalEstimate, usdEstimatedComponents } from "./PayStatementModal";
import { usdComponentsOf } from "@/lib/financeReconciliation";
import type { FinanceItem, MonthRow, StatementGroup } from "@/lib/financeModel";

function item(id: string, name: string): FinanceItem {
  return { id, name, kind: "tool", cost_center: "midia", active: true } as FinanceItem;
}

function row(p: Partial<MonthRow> & { key: string; name: string; currency: "BRL" | "USD" }): MonthRow {
  return {
    key: p.key,
    item: item(p.key, p.name),
    occurrence: p.occurrence ?? null,
    projected: p.projected ?? false,
    amountBrl: p.amountBrl ?? null,
    amountOriginal: p.amountOriginal ?? null,
    currency: p.currency,
    exchangeRate: p.exchangeRate ?? null,
    chargeDate: p.chargeDate ?? null,
    dueDate: p.dueDate ?? null,
    paid: p.paid ?? false,
    paidAmountBrl: p.paidAmountBrl ?? null,
    cardItemId: p.cardItemId ?? "card-1",
    paymentMethod: "card",
    paymentOverridden: false,
    estimated: p.estimated ?? false,
    installmentNumber: null,
    installmentCount: null,
    scheduledDate: p.scheduledDate ?? null,
    entryRole: p.entryRole ?? "regular",
  } as MonthRow;
}

/** Fatura OUT/2026 do Itaú 7587: um fato BRL + uma compra USD a confirmar. */
function group(): StatementGroup {
  const facebook = row({
    key: "occ-facebook",
    name: "FACEBOOK IMPULCIONAMENTO",
    currency: "BRL",
    amountBrl: 212.83,
    chargeDate: "2026-09-17",
    occurrence: { id: "78f06abb-afbe-4158-bf44-5991124cf8a5" } as never,
  });
  const heygen = row({
    key: "occ-heygen",
    name: "HEYGEN",
    currency: "USD",
    amountOriginal: 50.68,
    amountBrl: 277.73,
    chargeDate: "2026-09-01",
    occurrence: { id: "2e9506a1-0b91-4b85-a853-034758c2e006" } as never,
  });
  return {
    card: item("card-1", "Itaú 7587"),
    components: [heygen, facebook],
    statementRow: null,
    projectedTotal: 490.56,
    actualTotal: 512.9,
    difference: null,
    configIncomplete: false,
    incompleteReason: null,
    dueDate: "2026-10-25",
    closingDate: "2026-09-13",
    closingIsActual: false,
    cycleStart: "2026-09-15",
    paid: false,
  } as unknown as StatementGroup;
}

describe("compras em reais dentro do modal de pagamento", () => {
  it("lista o fato BRL da fatura com nome, data e valor reais", () => {
    const [only] = brlComponentsOf(group());
    expect(only.item.name).toBe("FACEBOOK IMPULCIONAMENTO");
    expect(only.chargeDate).toBe("2026-09-17");
    expect(only.amountBrl).toBe(212.83);
    expect(only.projected).toBe(false);
  });

  it("não duplica a compra em dólar: USD fica só na seção editável", () => {
    const g = group();
    expect(brlComponentsOf(g).map((r) => r.key)).toEqual(["occ-facebook"]);
    expect(usdComponentsOf(g).map((c) => c.row.key)).toEqual(["occ-heygen"]);
  });

  it("toda linha da fatura aparece em exatamente uma das duas seções", () => {
    const g = group();
    const listed = [...brlComponentsOf(g).map((r) => r.key), ...usdComponentsOf(g).map((c) => c.row.key)];
    expect([...listed].sort()).toEqual([...g.components.map((r) => r.key)].sort());
  });

  it("ordena por data de cobrança e mantém a projeção marcada como prevista", () => {
    const g = group();
    g.components.push(
      row({
        key: "proj-canva",
        name: "CANVA",
        currency: "BRL",
        amountBrl: 139.9,
        chargeDate: "2026-09-20",
        projected: true,
      }),
      row({
        key: "occ-adobe",
        name: "ADOBE CREATIVE CLOUD",
        currency: "BRL",
        amountBrl: 121.4,
        chargeDate: "2026-09-17",
      }),
    );
    expect(brlComponentsOf(g).map((r) => `${r.item.name}${r.projected ? " (previsto)" : ""}`)).toEqual([
      "ADOBE CREATIVE CLOUD",
      "FACEBOOK IMPULCIONAMENTO",
      "CANVA (previsto)",
    ]);
  });

  it("é só leitura: exibir não altera total, IOF nem valores da fatura", () => {
    const g = group();
    const before = JSON.parse(JSON.stringify(g));
    brlComponentsOf(g);
    usdComponentsOf(g);
    expect(g).toEqual(before);
    expect(g.projectedTotal).toBe(490.56);
    expect(g.actualTotal).toBe(512.9);
  });

  it("fatura sem linha BRL não exibe a seção", () => {
    const g = group();
    g.components = g.components.filter((r) => r.currency !== "BRL");
    expect(brlComponentsOf(g)).toEqual([]);
  });
});

describe("sugestão de total da fatura (sem valor real salvo)", () => {
  it("BRL 189 + USD estimado 425,08: soma IOF de 3,5% => R$ 628,96", () => {
    const g = group();
    g.actualTotal = null;
    g.components = [
      row({ key: "brl-1", name: "ASSINATURA BRL", currency: "BRL", amountBrl: 189 }),
      row({ key: "usd-1", name: "HEYGEN", currency: "USD", amountBrl: 425.08, projected: true }),
    ];
    g.projectedTotal = 614.08;
    // 425,08 * 3,5% = 14,8778 -> 14,88; 614,08 + 14,88 = 628,96
    expect(statementTotalEstimate(g)).toBe(628.96);
  });

  it("USD com valor real confirmado NÃO recebe IOF de novo (já está no valor)", () => {
    const g = group();
    g.actualTotal = null;
    g.components = [
      row({ key: "brl-1", name: "ASSINATURA BRL", currency: "BRL", amountBrl: 189 }),
      row({
        key: "usd-1",
        name: "HEYGEN",
        currency: "USD",
        amountBrl: 425.08,
        occurrence: { id: "o1" } as never,
      }),
    ];
    g.projectedTotal = 614.08;
    expect(usdEstimatedComponents(g)).toEqual([]);
    expect(statementTotalEstimate(g)).toBe(614.08);
  });

  it("ocorrência USD marcada como estimada também entra no cálculo do IOF", () => {
    const g = group();
    g.actualTotal = null;
    g.components = [
      row({
        key: "usd-1",
        name: "HEYGEN",
        currency: "USD",
        amountBrl: 100,
        estimated: true,
        occurrence: { id: "o1" } as never,
      }),
    ];
    g.projectedTotal = 100;
    expect(statementTotalEstimate(g)).toBe(103.5);
  });

  it("fatura sem composição não gera sugestão", () => {
    const g = group();
    g.actualTotal = null;
    g.components = [];
    g.projectedTotal = 0;
    expect(statementTotalEstimate(g)).toBeNull();
  });
});
