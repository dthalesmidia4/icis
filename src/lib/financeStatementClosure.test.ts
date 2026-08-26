/**
 * FECHAMENTO DA FATURA — total e IOF são um único conceito.
 *
 * Estes testes travam a consolidação: um único caminho na UI, IOF sempre junto
 * do total, e nenhuma escrita de liquidação (`paid_at`/`paid_amount_brl`) vinda
 * do ajuste de fechamento.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { StatementGroup } from "./financeModel";
import {
  resolveStatementClosure,
  seedStatementClosure,
  statementClosureButtonLabel,
  statementClosureMessage,
  statementClosurePayload,
  statementClosureUnchanged,
} from "./financeStatementClosure";

function group(input: {
  actualTotal?: number | null;
  iof?: number | null;
  paid?: boolean;
  occurrenceId?: string | null;
}): StatementGroup {
  const occurrence =
    input.occurrenceId === null
      ? null
      : ({ id: input.occurrenceId ?? "occ-1", iof_amount_brl: input.iof ?? null, paid_at: input.paid ? "2026-08-20T12:00:00-03:00" : null } as any);
  return {
    card: { id: "card-1", name: "Itaú" } as any,
    components: [],
    statementRow: { occurrence, paidAmountBrl: input.paid ? input.actualTotal ?? null : null } as any,
    projectedTotal: 900,
    actualTotal: input.actualTotal ?? null,
    paid: !!input.paid,
    dueDate: "2026-08-20",
    difference: null,
    configIncomplete: false,
  } as unknown as StatementGroup;
}

describe("rótulo único do fechamento", () => {
  it("fatura sem valor real usa `Informar fechamento`", () => {
    expect(statementClosureButtonLabel(group({}))).toBe("Informar fechamento");
  });

  it("fatura com valor real ou paga usa `Ver/ajustar fechamento`", () => {
    expect(statementClosureButtonLabel(group({ actualTotal: 1000 }))).toBe("Ver/ajustar fechamento");
    expect(statementClosureButtonLabel(group({ actualTotal: 1000, paid: true }))).toBe(
      "Ver/ajustar fechamento",
    );
  });
});

describe("seed do fechamento", () => {
  it("fatura paga abre com total e IOF juntos, predefinidos", () => {
    expect(seedStatementClosure(group({ actualTotal: 1000, iof: 12.5, paid: true }))).toEqual({
      total: "1000",
      iof: "12.5",
    });
  });

  it("fatura sem valor real e sem IOF abre total vazio e IOF 0", () => {
    expect(seedStatementClosure(group({}))).toEqual({ total: "", iof: "0" });
  });
});

describe("validação conjunta de total + IOF", () => {
  it("alterar só o total preserva o IOF e não pede novo valor pago", () => {
    const result = resolveStatementClosure({ total: "1100", iof: "12.5", knownTotalBrl: 1000 });
    expect(result).toEqual({ state: "ok", totalBrl: 1100, iofBrl: 12.5 });
  });

  it("alterar só o IOF preserva o total (campo vazio = mantém total)", () => {
    const result = resolveStatementClosure({ total: "", iof: "30", knownTotalBrl: 1000 });
    expect(result).toEqual({ state: "ok", totalBrl: null, iofBrl: 30 });
  });

  it("alterar ambos persiste ambos na mesma intenção", () => {
    const result = resolveStatementClosure({ total: "1.234,56", iof: "10", knownTotalBrl: 1000 });
    expect(result).toEqual({ state: "ok", totalBrl: 1234.56, iofBrl: 10 });
    const payload = statementClosurePayload(group({ actualTotal: 1000 }), result);
    expect(payload).toEqual({ occurrenceId: "occ-1", amountBrl: 1234.56, iofBrl: 10 });
  });

  it("IOF 0 remove a classificação", () => {
    expect(resolveStatementClosure({ total: "", iof: "0", knownTotalBrl: 1000 })).toEqual({
      state: "ok",
      totalBrl: null,
      iofBrl: 0,
    });
    expect(resolveStatementClosure({ total: "", iof: "", knownTotalBrl: 1000 })).toEqual({
      state: "ok",
      totalBrl: null,
      iofBrl: 0,
    });
  });

  it("IOF maior que o total bloqueia (contra o total digitado e contra o conhecido)", () => {
    const blockedTyped = resolveStatementClosure({ total: "100", iof: "150", knownTotalBrl: 1000 });
    expect(blockedTyped.state).toBe("invalid");
    expect(statementClosureMessage(blockedTyped)).toBe("O IOF não pode ser maior que o total da fatura");
    expect(resolveStatementClosure({ total: "", iof: "1500", knownTotalBrl: 1000 }).state).toBe("invalid");
  });

  it("total inválido ou zerado bloqueia", () => {
    expect(resolveStatementClosure({ total: "abc", iof: "0", knownTotalBrl: null }).state).toBe("invalid");
    expect(resolveStatementClosure({ total: "0", iof: "0", knownTotalBrl: null }).state).toBe("invalid");
  });

  it("fechamento idêntico não vira gravação", () => {
    const same = resolveStatementClosure({ total: "1000", iof: "12.5", knownTotalBrl: 1000 });
    expect(statementClosureUnchanged(same, { totalBrl: 1000, iofBrl: 12.5 })).toBe(true);
    const changed = resolveStatementClosure({ total: "1000", iof: "13", knownTotalBrl: 1000 });
    expect(statementClosureUnchanged(changed, { totalBrl: 1000, iofBrl: 12.5 })).toBe(false);
  });

  it("sem ocorrência real não há payload (fatura não materializada)", () => {
    const result = resolveStatementClosure({ total: "1000", iof: "0", knownTotalBrl: null });
    expect(statementClosurePayload(group({ occurrenceId: null }), result)).toBeNull();
  });
});

describe("UI consolidada — um único caminho", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/finance/StatementPanel.tsx"), "utf8");
  const pay = readFileSync(resolve(process.cwd(), "src/components/finance/PayStatementModal.tsx"), "utf8");
  const closure = readFileSync(
    resolve(process.cwd(), "src/components/finance/StatementClosureModal.tsx"),
    "utf8",
  );
  const page = readFileSync(resolve(process.cwd(), "src/pages/Financial.tsx"), "utf8");

  it("não existe mais botão separado de IOF no StatementPanel", () => {
    expect(panel).not.toContain("Ajustar IOF");
    expect(panel).not.toContain("Informar IOF");
    expect(panel).not.toContain("onAdjustIof");
    expect(panel).toContain("statementClosureButtonLabel(group)");
  });

  it("o modal antigo de IOF não existe mais", () => {
    expect(page).not.toContain("AdjustStatementIofModal");
    expect(page).toContain("StatementClosureModal");
  });

  it("pagamento captura total e IOF juntos e deriva o valor pago do total", () => {
    expect(pay).toContain("CLOSURE_TOTAL_LABEL");
    expect(pay).toContain("CLOSURE_IOF_LABEL");
    expect(pay).toContain("const amount = total.trim()");
    expect(pay).not.toContain("setAmount(");
    expect(pay).toContain("statementAmountBrl: closureTotalBrl");
  });

  it("ajuste de fechamento nunca escreve liquidação", () => {
    expect(closure).not.toContain("paid_at:");
    expect(closure).not.toContain("paidAmountBrl:");
    expect(closure).not.toContain("payStatement");
  });
});

describe("RPCs do fechamento no banco", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  function finalDefinition(signature: string): string {
    let last = "";
    for (const file of files) {
      const sql = readFileSync(resolve(dir, file), "utf8");
      const at = sql.indexOf(signature);
      if (at === -1) continue;
      const rest = sql.slice(at);
      // Corta no fim da própria função: o arquivo pode conter outras RPCs.
      const end = rest.indexOf("$function$;");
      last = end === -1 ? rest : rest.slice(0, end + "$function$;".length);
    }
    return last;
  }

  const closureFn = finalDefinition("CREATE OR REPLACE FUNCTION public.finance_update_statement_closure");
  const payFn = finalDefinition("CREATE OR REPLACE FUNCTION public.pay_finance_statement_reconciled");

  it("a RPC de fechamento grava total e IOF sem tocar em pagamento", () => {
    expect(closureFn).not.toBe("");
    const flat = closureFn.replace(/\s+/g, " ");
    expect(flat).toContain("iof_amount_brl = CASE WHEN v_iof > 0 THEN v_iof ELSE NULL END");
    expect(closureFn).not.toMatch(/paid_at\s*=/);
    expect(closureFn).not.toMatch(/paid_amount_brl\s*=/);
    expect(closureFn).toContain("SECURITY DEFINER");
    expect(closureFn).toMatch(/SET search_path TO ''/);
    expect(closureFn).toContain("Repasse de IOF não pode ser maior que o total da fatura");
    const grants = readFileSync(
      resolve(dir, files.filter((f) => readFileSync(resolve(dir, f), "utf8").includes("public.finance_update_statement_closure")).pop()!),
      "utf8",
    );
    expect(grants).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.finance_update_statement_closure[^;]*TO authenticated/,
    );
  });

  it("o pagamento aceita o total do fechamento e mantém o bloqueio de parcial", () => {
    const flat = payFn.replace(/\s+/g, " ");
    expect(flat).toContain("_statement_amount_brl numeric DEFAULT NULL");
    expect(flat).toContain("abs(_paid_amount_brl - v_invoice_amount) > 0.011");
    expect(flat).toContain("v_rate := round(v_brl / v_original, 6)");
  });
});
