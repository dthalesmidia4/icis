/**
 * Guarda o hardening de acesso ao Financeiro (sincronizado com a migration
 * `harden_finance_access_after_role_distribution`):
 * - senha do Financeiro é exclusiva do escopo FULL;
 * - escopo `tools` nunca consulta status/verificação de senha;
 * - cartões seguros continuam disponíveis para tools/full autenticados;
 * - nenhuma RPC financeira depende de acesso anônimo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`supabase/migrations/${f}`));

const hardening = migrations.filter((sql) =>
  /REVOKE EXECUTE ON FUNCTION public\.verify_finance_password\(uuid, text\) FROM anon/i.test(sql),
);

describe("hardening de acesso ao Financeiro", () => {
  it("existe migration que revoga anon nas RPCs financeiras e concede authenticated", () => {
    expect(hardening.length).toBeGreaterThan(0);
    const sql = hardening.join("\n");
    for (const fn of [
      "finance_access_scope(uuid)",
      "has_finance_tools_access(uuid)",
      "finance_tools_item_allowed(uuid, uuid)",
      "list_finance_safe_cards(uuid)",
      "finance_password_status(uuid)",
      "verify_finance_password(uuid, text)",
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM anon`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`);
    }
  });

  it("senha do Financeiro exige FULL no banco (status levanta erro, verify retorna false)", () => {
    const sql = hardening.join("\n");
    const blocks = sql.split(/CREATE OR REPLACE FUNCTION /);
    const status = blocks.find((b) => b.startsWith("public.finance_password_status")) ?? "";
    expect(status).toMatch(/if not public\.has_finance_access\(_tenant_id\) then\s*\n\s*raise exception/i);
    const verify = blocks.find((b) => b.startsWith("public.verify_finance_password")) ?? "";
    expect(verify).toMatch(/if not public\.has_finance_access\(_tenant_id\) then\s*\n\s*return false/i);
  });

  it("finance_tools_item_allowed confere a permissão internamente", () => {
    const sql = hardening.join("\n");
    const fn =
      sql.split(/CREATE OR REPLACE FUNCTION /).find((b) => b.startsWith("public.finance_tools_item_allowed")) ?? "";
    expect(fn).toMatch(/select public\.has_finance_tools_access\(_tenant_id\)\s*\n\s*and exists/i);
  });

  it("apenas o escopo FULL monta o gate de senha", () => {
    const page = read("src/pages/Financial.tsx");
    expect(page).toMatch(/if \(canAccessFullFinance\)[\s\S]{0,200}<FinanceAccessGate>/);
    // tools-only sai pelo cockpit de ferramentas, depois do bloco do gate
    expect(page.indexOf("<FinanceToolsCockpit />")).toBeGreaterThan(page.indexOf("</FinanceAccessGate>"));
  });

  it("tools-only não chama status/verificação de senha", () => {
    for (const file of [
      "src/components/finance/FinanceToolsCockpit.tsx",
      "src/hooks/useFinanceTools.tsx",
    ]) {
      const src = read(file);
      expect(src).not.toMatch(/finance_password_status|verify_finance_password|set_finance_password/);
    }
  });

  it("cartões seguros continuam sendo lidos pela RPC segura no fluxo de ferramentas", () => {
    expect(read("src/hooks/useFinanceTools.tsx")).toMatch(/list_finance_safe_cards/);
  });

  it("nenhuma RPC financeira é chamada fora do cliente autenticado do Supabase", () => {
    const files = [
      "src/hooks/useFinanceAccessScope.tsx",
      "src/hooks/useFinanceTools.tsx",
      "src/components/finance/FinanceAccessGate.tsx",
      "src/components/finance/FinancePasswordSettingsCard.tsx",
      "src/lib/financeSecureData.ts",
    ];
    for (const file of files) {
      const src = read(file);
      expect(src).not.toMatch(/createClient\(/);
      expect(src).not.toMatch(/apikey|Authorization:/i);
    }
  });
});
