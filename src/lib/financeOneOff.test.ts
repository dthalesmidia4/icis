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
import { readFileSync, readdirSync } from "fs";
import { describe, expect, it } from "vitest";
import { FinanceItem } from "./financeModel";
import {
  OneOffFact,
  buildOneOffRpcArgs,
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

  const args = (f: OneOffFact) =>
    buildOneOffRpcArgs({ tenantId: TENANT, payload: { kind: "expense", name: "Cartório" }, fact: f });

  it("avulso direto (Pix) entra como vencimento em Pagamentos diretos, sem cartão", () => {
    const a = args(fact());
    expect(a._date).toBe("2026-08-14");
    expect(a._card_item_id).toBeNull();
    expect(a._payment_method).toBe("Pix");
    expect(a._competence_month).toBe("2026-08-01");
    expect(a._amount_brl).toBe(250);
  });

  it("avulso no cartão manda o cartão (a RPC grava COBRANÇA, não vencimento)", () => {
    const onCard = fact({ paymentMethod: "Cartão de Crédito", cardItemId: "card-1" });
    expect(oneOffOnCard(onCard)).toBe(true);
    expect(args(onCard)._card_item_id).toBe("card-1");
  });

  it("o cliente nunca envia valores cifrados nem estado de pagamento", () => {
    const keys = Object.keys(args(fact()));
    expect(keys.some((k) => k.includes("_enc"))).toBe(false);
    expect(keys).not.toContain("_paid_at");
    expect(keys).not.toContain("_paid_amount_brl");
  });
});

describe("RPC transacional create_finance_one_off", () => {
  const dir = "supabase/migrations";
  /** Última definição da função no repositório (a que espelha produção). */
  const sql = (() => {
    let last = "";
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const content = readFileSync(`${dir}/${f}`, "utf8");
      const marker = "CREATE OR REPLACE FUNCTION public.create_finance_one_off";
      if (content.includes(marker)) last = content.slice(content.indexOf(marker));
    }
    return last;
  })();
  const body = sql.slice(0, sql.search(/REVOKE|GRANT/) === -1 ? sql.length : sql.search(/REVOKE|GRANT/));

  it("existe no repositório", () => {
    expect(sql).not.toBe("");
  });

  it("faz os DOIS inserts na mesma função e não tem DELETE compensatório", () => {
    expect(body).toMatch(/INSERT INTO public\.finance_items/);
    expect(body).toMatch(/INSERT INTO public\.finance_occurrences/);
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(body).not.toMatch(/\bUPDATE\b/i);
    // Qualquer validação que falha aborta a transação inteira.
    expect((body.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("valida autenticação, tenant e escopo (bloqueia none)", () => {
    expect(body).toMatch(/auth\.uid\(\) IS NULL/);
    expect(body).toContain("public.user_has_tenant_access(auth.uid(), _tenant_id)");
    expect(body).toContain("public.finance_access_scope(_tenant_id)");
    expect(body.replace(/\s+/g, " ")).toMatch(/v_scope IS NULL OR v_scope = 'none'/);
  });

  it("tools só cria tool/package e nunca administrativo", () => {
    const scoped = body.slice(body.indexOf("IF v_scope = 'tools'"));
    expect(scoped).toMatch(/_kind NOT IN \('tool', 'package'\)/);
    expect(scoped).toMatch(/_cost_center = 'administrativo'/);
  });

  it("full permite expense/tool/package e nunca card/included_resource", () => {
    expect(body).toMatch(/_kind NOT IN \('expense', 'tool', 'package'\)/);
    expect(body).not.toMatch(/'included_resource'/);
    expect(body).not.toMatch(/_kind = 'card'/);
  });

  it("cartão de destino precisa ser do mesmo tenant e kind card", () => {
    expect(body.replace(/\s+/g, " ")).toContain(
      "v_card_tenant <> _tenant_id OR v_card_kind <> 'card'",
    );
  });

  it("grava o fato sem pagamento e com snapshot da forma de pagamento", () => {
    expect(body).toMatch(/payment_method_snapshot, card_item_id_snapshot/);
    expect(body).toMatch(/paid_at, paid_amount_brl/);
    expect(body).toMatch(/recurrence_type/);
    expect(body).toMatch(/'one_off'/);
  });

  it("é SECURITY DEFINER com search_path vazio e não escreve colunas _enc", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toMatch(/SET search_path TO ''/);
    expect(body).not.toMatch(/_enc\b/);
  });

  it("não devolve valores financeiros, apenas item_id", () => {
    expect(body.replace(/\s+/g, " ")).toContain("jsonb_build_object('ok', true, 'item_id', v_item_id)");
    expect(body).not.toMatch(/RETURN.*amount/i);
  });

  it("revoga PUBLIC/anon e concede EXECUTE apenas a authenticated", () => {
    const grants = sql.slice(body.length);
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.create_finance_one_off[^;]*FROM PUBLIC/);
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.create_finance_one_off[^;]*FROM anon/);
    expect(grants).toMatch(/TO authenticated/);
    expect(grants).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|PUBLIC)/);
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

  it("hooks criam o avulso APENAS pela RPC transacional, sem rollback no cliente", () => {
    for (const file of ["src/hooks/useFinance.tsx", "src/hooks/useFinanceTools.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/supabase\.rpc\(\s*"create_finance_one_off"/);
      expect(src).toMatch(/buildOneOffRpcArgs/);
      // Nenhum DELETE compensatório: a atomicidade é do Postgres.
      expect(src).not.toMatch(/createItemWithOneOff/);
      expect(src).not.toMatch(/from\("finance_items"\)\.delete\(\)/);
    }
  });

  it("o fluxo client-side de insert+delete foi removido do código", () => {
    const lib = readFileSync("src/lib/financeOneOff.ts", "utf8");
    expect(lib).not.toMatch(/createItemWithOneOff/);
    expect(lib).not.toMatch(/deleteItem/);
    expect(lib).not.toMatch(/buildOneOffOccurrenceInsert/);
  });

  it("pagar fatura não promete mais liquidar componentes no banco", () => {
    const src = readFileSync("src/hooks/useFinance.tsx", "utf8");
    expect(src).not.toMatch(/componentes liquidados/);
    expect(src).toMatch(/regra DERIVADA/);
  });
});
