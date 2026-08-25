/**
 * CONTRATO DA RPC `pay_finance_statement` (estado final das migrations).
 *
 * A auditoria pós-cutover encontrou `COALESCE(_paid_amount_brl, paid_amount_brl)`:
 * incorreto, porque `finance_occurrences.paid_amount_brl` plaintext fica NULL em
 * repouso — o fallback gravaria NULL em vez do valor real da fatura.
 *
 * Estas guardas leem a ÚLTIMA definição da função no repositório (a que espelha
 * produção) e provam o contrato exigido.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const FN = "public.pay_finance_statement";

/** Última definição da função entre todas as migrations, em ordem cronológica. */
function finalDefinition(): string {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let last: string | null = null;
  for (const file of files) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    if (!sql.includes(`CREATE OR REPLACE FUNCTION ${FN}`)) continue;
    // Corpo da função + grants que a acompanham no mesmo arquivo.
    last = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION ${FN}`));
  }
  return last ?? "";
}

const sql = finalDefinition();
const body = sql.slice(0, sql.search(/REVOKE|GRANT/) === -1 ? sql.length : sql.search(/REVOKE|GRANT/));

describe("pay_finance_statement — valor pago pós-criptografia", () => {
  it("existe uma definição final da função no repositório", () => {
    expect(sql).not.toBe("");
  });

  it("sem _paid_amount_brl, usa o valor real decifrado da fatura", () => {
    expect(body.replace(/\s+/g, " ")).toContain(
      "v_statement_amount := COALESCE( _paid_amount_brl, private.finance_decrypt_numeric(v_occ.amount_brl_enc) )",
    );
    expect(body).toMatch(/paid_amount_brl\s*=\s*v_statement_amount/);
  });

  it("NUNCA faz fallback para o plaintext em repouso", () => {
    expect(body.replace(/\s+/g, " ")).not.toContain(
      "COALESCE(_paid_amount_brl, paid_amount_brl)",
    );
    expect(body.replace(/\s+/g, " ")).not.toMatch(
      /COALESCE\(\s*_paid_amount_brl\s*,\s*paid_amount_brl\s*\)/,
    );
  });
});

describe("pay_finance_statement — a fatura é a única unidade de liquidação", () => {
  it("há exatamente um UPDATE, restrito à própria ocorrência da fatura", () => {
    const updates = body.match(/UPDATE\s+public\.finance_occurrences/gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(body).toMatch(/WHERE\s+id\s*=\s*_occurrence_id/);
  });

  it("não escreve em componentes nem em vínculos de fatura", () => {
    expect(body).not.toMatch(/statement_occurrence_id\s*=/);
    expect(body).not.toMatch(/WHERE\s+statement_occurrence_id/i);
    expect(body).not.toMatch(/card_item_id_snapshot\s*=/);
    expect(body).not.toMatch(/\bINSERT\b|\bDELETE\b/i);
  });

  it("mantém components_settled = 0 no retorno", () => {
    expect(body.replace(/\s+/g, " ")).toContain("'components_settled', 0");
  });

  it("não altera o vencimento da fatura", () => {
    expect(body).not.toMatch(/due_date\s*=/);
  });
});

describe("pay_finance_statement — validações e permissões", () => {
  it("valida existência, acesso, escopo full e item de cartão", () => {
    expect(body).toMatch(/v_occ\.id IS NULL/);
    expect(body).toContain("public.has_finance_access(v_occ.tenant_id)");
    expect(body).toMatch(/finance_access_scope\(v_occ\.tenant_id\)\s*<>\s*'full'/);
    expect(body).toMatch(/v_kind\s*<>\s*'card'/);
  });

  it("é SECURITY DEFINER com search_path vazio e referências schema-qualified", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toMatch(/SET search_path TO ''/);
    expect(body).toContain("public.finance_occurrences");
    expect(body).toContain("public.finance_items");
    expect(body).toContain("private.finance_decrypt_numeric");
  });

  it("revoga PUBLIC/anon e concede EXECUTE apenas a authenticated", () => {
    const grants = sql.slice(body.length);
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.pay_finance_statement[^;]*FROM PUBLIC/);
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.pay_finance_statement[^;]*FROM anon/);
    expect(grants).toMatch(/GRANT EXECUTE ON FUNCTION public\.pay_finance_statement[^;]*TO authenticated/);
  });
});
