/**
 * MICRO-HARDENING DA IMPLEMENTAÇÃO USD.
 *
 * Duas regressões reais encontradas em revisão independente:
 *
 * 1. A RPC materializava o snapshot da forma de pagamento como
 *    'Cartão de crédito', divergente do valor canônico do sistema
 *    ('Cartão de Crédito' = CARD_PAYMENT_METHOD). Snapshot divergente quebra
 *    agrupamento por cartão e comparações de origem.
 *
 * 2. A prévia do câmbio no modal usava `replace(/\./g, "")`, que transforma
 *    "341.15" em 34115 — o bug já corrigido no resto do Financeiro por
 *    `parseLocalizedNumber`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CARD_PAYMENT_METHOD } from "./financeModel";
import { parseLocalizedNumber } from "./financeNumber";

const FN = "public.pay_finance_statement_reconciled";

/** Última definição da RPC entre todas as migrations, em ordem cronológica. */
function finalDefinition(): string {
  const dir = resolve(process.cwd(), "supabase/migrations");
  let last = "";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${FN}`);
    if (at === -1) continue;
    last = sql.slice(at);
  }
  return last;
}

const rpc = finalDefinition();
const modal = readFileSync(
  resolve(process.cwd(), "src/components/finance/PayStatementModal.tsx"),
  "utf8",
);

describe("RPC reconciliada — snapshot canônico da forma de pagamento", () => {
  it("existe uma definição final da RPC no repositório", () => {
    expect(rpc).not.toBe("");
  });

  it("materializa componentes USD com exatamente 'Cartão de Crédito'", () => {
    expect(rpc).toContain(`'${CARD_PAYMENT_METHOD}'`);
    expect(CARD_PAYMENT_METHOD).toBe("Cartão de Crédito");
  });

  it("não deixou nenhum literal minúsculo divergente", () => {
    expect(rpc).not.toContain("'Cartão de crédito'");
  });

  it("o resto do contrato segue intacto", () => {
    const flat = rpc.replace(/\s+/g, " ");
    // Câmbio recalculado no servidor, por componente.
    expect(flat).toContain("v_rate := round(v_brl / v_original, 6)");
    // Componentes nunca recebem paid_at nesta rota.
    expect(rpc).not.toMatch(/paid_at\s*,[^)]*card_item_id_snapshot/);
    expect(rpc).toContain("SECURITY DEFINER");
    expect(rpc).toMatch(/SET search_path TO ''/);
    expect(flat).toContain("abs(_paid_amount_brl - v_invoice_amount) > 0.011");
    expect(flat).not.toContain("v_invoice_amount + v_iof");
    expect(rpc).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pay_finance_statement_reconciled[^;]*TO authenticated/,
    );
  });
});

describe("PayStatementModal — prévia do câmbio usa o parser seguro", () => {
  it("não usa mais o parser que remove pontos", () => {
    expect(modal).not.toContain('replace(/\\./g, "")');
    expect(modal).not.toMatch(/replace\(\/\\\.\/g/);
  });

  it("usa parseLocalizedNumber", () => {
    expect(modal).toContain('from "@/lib/financeNumber"');
    expect(modal).toContain("parseLocalizedNumber(typed)");
  });

  it("'341.15' e '341,15' produzem o mesmo valor e o mesmo câmbio visual", () => {
    const usd = 66.5;
    const withDot = parseLocalizedNumber("341.15");
    const withComma = parseLocalizedNumber("341,15");
    expect(withDot).toBe(341.15);
    expect(withComma).toBe(341.15);
    expect((withDot! / usd).toFixed(6)).toBe((withComma! / usd).toFixed(6));
    expect((withDot! / usd).toFixed(6)).toBe("5.130075");
    // O bug antigo produzia um câmbio absurdo.
    expect(Number("341.15".replace(/\./g, "").replace(",", "."))).toBe(34115);
  });

  it("valor não numérico não gera câmbio", () => {
    expect(parseLocalizedNumber("")).toBeNull();
    expect(parseLocalizedNumber("abc")).toBeNull();
  });
});
