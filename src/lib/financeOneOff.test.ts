/**
 * GASTO AVULSO, PAGAMENTO PARCIAL E PRIVACIDADE DOS KPIs.
 *
 * Regras cobertas aqui:
 * - avulso (`one_off`) nasce como FATO do mês, senão desapareceria da tela;
 * - a FORMA DE PAGAMENTO decide o domínio operacional (fatura x pagamento direto);
 * - ocorrência que falha não deixa cadastro órfão;
 * - fatura com valor real não aceita pagamento parcial;
 * - os 3 KPIs da abertura do Financeiro começam ocultos e têm um único olho.
 */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { FinanceItem } from "./financeModel";
import {
  OneOffFact,
  buildOneOffOccurrenceInsert,
  createItemWithOneOff,
  oneOffOnCard,
  shouldMaterializeOneOff,
} from "./financeOneOff";
import {
  resolveStatementPaymentAmount,
  statementPaymentAmountMessage,
} from "./financeStatementPaymentForm";

const TENANT = "tenant-1";

function fact(over: Partial<OneOffFact> = {}): OneOffFact {
  return {
    competenceMonth: "2026-08-01",
    date: "2026-08-14",
    currency: "BRL",
    amountOriginal: 250,
    amountBrl: 250,
    exchangeRate: null,
    paymentMethod: "Pix",
    cardItemId: null,
    ...over,
  };
}

describe("gasto avulso vira fato do mês", () => {
  it("despesa avulsa nova precisa materializar ocorrência", () => {
    expect(
      shouldMaterializeOneOff({ kind: "expense", recurrence_type: "one_off" } as Partial<FinanceItem>),
    ).toBe(true);
  });

  it("ferramenta comprada uma vez também é fato do mês (tool + one_off é válido)", () => {
    expect(
      shouldMaterializeOneOff({ kind: "tool", recurrence_type: "one_off" } as Partial<FinanceItem>),
    ).toBe(true);
  });

  it("recorrente/parcelado/consumo NÃO materializa (são projetáveis)", () => {
    for (const recurrence of ["monthly", "annual", "installments", "variable"] as const) {
      expect(
        shouldMaterializeOneOff({ kind: "expense", recurrence_type: recurrence } as Partial<FinanceItem>),
      ).toBe(false);
    }
  });

  it("edição nunca cria fato novo, e cartão/recurso incluído estão fora", () => {
    expect(
      shouldMaterializeOneOff({ kind: "expense", recurrence_type: "one_off" } as Partial<FinanceItem>, "id-1"),
    ).toBe(false);
    expect(
      shouldMaterializeOneOff({ kind: "card", recurrence_type: "one_off" } as Partial<FinanceItem>),
    ).toBe(false);
    expect(
      shouldMaterializeOneOff({
        kind: "included_resource",
        recurrence_type: "one_off",
      } as Partial<FinanceItem>),
    ).toBe(false);
  });

  it("avulso direto (Pix) entra como vencimento em Pagamentos diretos, sem cartão", () => {
    const insert = buildOneOffOccurrenceInsert({ tenantId: TENANT, itemId: "item-1", fact: fact() });
    expect(insert.due_date).toBe("2026-08-14");
    expect(insert.charge_date).toBeNull();
    expect(insert.card_item_id_snapshot).toBeNull();
    expect(insert.payment_method_snapshot).toBe("Pix");
    expect(insert.competence_month).toBe("2026-08-01");
    expect(insert.amount_brl).toBe(250);
  });

  it("avulso no cartão entra como COBRANÇA da fatura (quem vence é a fatura)", () => {
    const onCard = fact({ paymentMethod: "Cartão de Crédito", cardItemId: "card-1" });
    expect(oneOffOnCard(onCard)).toBe(true);
    const insert = buildOneOffOccurrenceInsert({ tenantId: TENANT, itemId: "item-1", fact: onCard });
    expect(insert.charge_date).toBe("2026-08-14");
    expect(insert.due_date).toBeNull();
    expect(insert.card_item_id_snapshot).toBe("card-1");
  });

  it("nunca nasce pago", () => {
    const insert = buildOneOffOccurrenceInsert({ tenantId: TENANT, itemId: "item-1", fact: fact() });
    expect(insert.paid_at).toBeNull();
    expect(insert.paid_amount_brl).toBeNull();
  });

  it("cria item + ocorrência na mesma operação", async () => {
    const calls: string[] = [];
    const result = await createItemWithOneOff({
      insertItem: async () => {
        calls.push("item");
        return { id: "item-9", error: null };
      },
      insertOccurrence: async (id) => {
        calls.push(`occ:${id}`);
        return { error: null };
      },
      deleteItem: async () => {
        calls.push("delete");
      },

    });
    expect(result).toEqual({ ok: true, rolledBack: false });
    expect(calls).toEqual(["item", "occ:item-9"]);
  });

  it("ocorrência falha => cadastro é desfeito (nunca item órfão)", async () => {
    const deleted: string[] = [];
    const result = await createItemWithOneOff({
      insertItem: async () => ({ id: "item-9", error: null }),
      insertOccurrence: async () => ({ error: new Error("boom") }),
      deleteItem: async (id) => {
        deleted.push(id);
      },
    });
    expect(result).toEqual({ ok: false, rolledBack: true });
    expect(deleted).toEqual(["item-9"]);
  });

  it("falha no cadastro não tenta criar ocorrência", async () => {
    let occCalled = false;
    const result = await createItemWithOneOff({
      insertItem: async () => ({ id: null, error: new Error("boom") }),
      insertOccurrence: async () => {
        occCalled = true;
        return { error: null };
      },
      deleteItem: async () => {},
    });
    expect(result).toEqual({ ok: false, rolledBack: false });
    expect(occCalled).toBe(false);
  });
});

describe("pagamento parcial de fatura não é suportado", () => {
  it("valor menor que o total real é bloqueado", () => {
    const result = resolveStatementPaymentAmount("500", 1200, { exactRequired: true });
    expect(result.state).toBe("invalid");
    expect(statementPaymentAmountMessage(result)).toMatch(/parcial/i);
  });

  it("valor igual ao total real (tolerância de centavos) é aceito", () => {
    expect(resolveStatementPaymentAmount("1200", 1200, { exactRequired: true })).toEqual({
      state: "ok",
      amountBrl: 1200,
    });
    expect(resolveStatementPaymentAmount("1200,01", 1200, { exactRequired: true }).state).toBe("ok");
  });

  it("campo vazio herda o total sugerido", () => {
    expect(resolveStatementPaymentAmount("", 1200, { exactRequired: true })).toEqual({
      state: "ok",
      amountBrl: 1200,
    });
  });

  it("fatura só projetada (sem valor real) continua aceitando ajuste do valor", () => {
    expect(resolveStatementPaymentAmount("980", 1200).state).toBe("ok");
  });

  it("modal exige valor exato quando a fatura tem valor real", () => {
    const src = readFileSync("src/components/finance/PayStatementModal.tsx", "utf8");
    expect(src).toMatch(/exactRequired = group\?\.actualTotal != null/);
    expect(src).toMatch(/resolveStatementPaymentAmount\(amount, suggested, \{ exactRequired \}\)/);
  });
});

describe("privacidade dos 3 KPIs da abertura", () => {
  const src = readFileSync("src/pages/Financial.tsx", "utf8");

  it("começa oculto e não persiste preferência", () => {
    expect(src).toMatch(/useState\(false\);\s*\n\s*\/\*\* Máscara única/);
    expect(src).not.toMatch(/localStorage[^\n]*showKpis/);
  });

  it("um único olho controla os três valores", () => {
    expect(src.match(/setShowKpis\(\(v\) => !v\)/g)?.length).toBe(1);
    expect(src).toMatch(/Ocultar valores do resumo/);
    expect(src).toMatch(/Exibir valores do resumo/);
    expect(src.match(/kpiText\(totals\.(expected|paid|open)\)/g)?.length).toBe(3);
  });
});

describe("fluxo de criação nas telas", () => {
  it("overview tem ação Novo lançamento sem intenção pré-definida", () => {
    const src = readFileSync("src/pages/Financial.tsx", "utf8");
    expect(src).toMatch(/label: "Novo lançamento"/);
    expect(src).toMatch(/openItemModal\(null, null\)/);
    expect(src).toMatch(/label: "Nova conta ou despesa"/);
    expect(src).not.toMatch(/Nova despesa direta/);
    expect(src).toMatch(/competence=\{competence\}/);
  });

  it("hooks materializam o avulso junto do cadastro", () => {
    for (const file of ["src/hooks/useFinance.tsx", "src/hooks/useFinanceTools.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/createItemWithOneOff/);
      expect(src).toMatch(/buildOneOffOccurrenceInsert/);
    }
  });

  it("pagar fatura não promete mais liquidar componentes no banco", () => {
    const src = readFileSync("src/hooks/useFinance.tsx", "utf8");
    expect(src).not.toMatch(/componentes liquidados/);
    expect(src).toMatch(/regra DERIVADA/);
  });
});
