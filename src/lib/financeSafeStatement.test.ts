/**
 * Status seguro da fatura no escopo `Assinaturas e ferramentas`.
 *
 * Garante que o tools-only enxerga o FATO da fatura (existe/venceu/paga) sem
 * receber nenhum valor monetário, e que `full` e `tools` produzem a mesma
 * semântica de status para a mesma competência.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";
import { RowStatusContext, resolveRowStatus } from "./financeRowStatus";
import {
  PROJECTION_WARNING,
  buildSafeStatementStatusMap,
  competenceMonthISO,
  findSafeStatementStatus,
  groupStatementNotice,
  safeStatementKey,
  safeStatementStatusesFromRows,
} from "./financeSafeStatement";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const allSql = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`supabase/migrations/${f}`))
  .join("\n");

const RPC = "list_finance_safe_card_statement_status";
const TODAY = "2026-08-25";
const AUG = "2026-08-01";
/** Itaú 7587: fechamento NÃO configurado — não pode ser alterado. */
const CARD_ID = "card-itau-7587";

function card(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: CARD_ID,
    kind: "card",
    name: "Itaú ••••7587",
    bank_name: "Itaú",
    card_last4: "7587",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    statement_closing_day: null,
    statement_due_day: 17,
    ...over,
  } as FinanceItem;
}

function occ(over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: "occ-1",
    item_id: "item-1",
    competence_month: AUG,
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

/** Componente de assinatura cobrado no cartão 7587. */
function component(over: Partial<MonthRow> = {}): MonthRow {
  return {
    key: "row-tool",
    item: {
      id: "item-1",
      kind: "tool",
      name: "Google Cloud",
      cost_center: "midia",
      active: true,
      currency: "BRL",
      recurrence_type: "monthly",
      card_item_id: CARD_ID,
    } as FinanceItem,
    occurrence: occ(),
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
    paymentMethod: "credit_card",
    estimated: false,
    ...over,
  } as MonthRow;
}

function ctx(over: Partial<RowStatusContext> = {}): RowStatusContext {
  return {
    rows: [],
    today: TODAY,
    cardsById: new Map([[CARD_ID, card()]]),
    competenceMonth: AUG,
    ...over,
  };
}

function safeMap(over: Partial<{ due_date: string | null; paid: boolean; paid_at: string | null }> = {}) {
  return buildSafeStatementStatusMap([
    {
      card_id: CARD_ID,
      competence_month: AUG,
      due_date: "2026-08-17",
      paid: true,
      paid_at: "2026-08-20T15:00:00Z",
      ...over,
    },
  ]);
}

describe("RPC segura de status de fatura", () => {
  it("existe, é SECURITY DEFINER com search_path seguro e exige acesso a ferramentas", () => {
    const fn =
      allSql.split(/CREATE OR REPLACE FUNCTION /).find((b) => b.startsWith(`public.${RPC}`)) ?? "";
    expect(fn).not.toBe("");
    expect(fn).toMatch(/SECURITY DEFINER/i);
    expect(fn).toMatch(/SET search_path TO 'public'/i);
    expect(fn).toMatch(/IF NOT public\.has_finance_tools_access\(_tenant_id\) THEN[\s\S]{0,80}RAISE EXCEPTION/i);
    // tenant isolation estrita
    expect(fn).toMatch(/fo\.tenant_id = _tenant_id/);
    expect(fn).toMatch(/fi\.kind = 'card'/);
    // paid derivado do fato real
    expect(fn).toMatch(/\(fo\.paid_at IS NOT NULL\)\s+AS paid/);
  });

  it("não devolve nenhum campo monetário, de limite ou de orçamento", () => {
    const fn =
      allSql.split(/CREATE OR REPLACE FUNCTION /).find((b) => b.startsWith(`public.${RPC}`)) ?? "";
    const returns = fn.slice(fn.indexOf("RETURNS TABLE"), fn.indexOf("LANGUAGE"));
    for (const forbidden of [
      "amount",
      "paid_amount",
      "limit_brl",
      "budget",
      "exchange_rate",
      "notes",
      "attachment",
    ]) {
      expect(returns.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("bloqueia PUBLIC/anon e concede apenas authenticated e service_role", () => {
    expect(allSql).toContain(`REVOKE EXECUTE ON FUNCTION public.${RPC}(uuid, date) FROM PUBLIC`);
    expect(allSql).toContain(`REVOKE EXECUTE ON FUNCTION public.${RPC}(uuid, date) FROM anon`);
    expect(allSql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${RPC}(uuid, date) TO authenticated, service_role`,
    );
  });

  it("tools-only consome o status por RPC e nunca lê faturas direto da tabela", () => {
    const hook = read("src/hooks/useFinanceTools.tsx");
    expect(hook).toContain(RPC);
    // nada de kind=card / limite / orçamento no escopo tools
    expect(hook).not.toMatch(/"kind",\s*"card"|kind.*=.*'card'/);
    expect(hook).not.toMatch(/card_limit_brl|finance_monthly_budget_brl/);
  });

  it("o payload seguro não carrega valores monetários", () => {
    const status = findSafeStatementStatus(safeMap(), CARD_ID, AUG)!;
    expect(Object.keys(status).sort()).toEqual(
      ["cardId", "competenceMonth", "dueDate", "paid", "paidAt"].sort(),
    );
    expect(JSON.stringify(status)).not.toMatch(/amount|limit|budget|rate/i);
  });
});

describe("status do componente com fatura real segura", () => {
  it("cartão 7587 em ago/2026 com fatura paga => Fatura paga, nunca Aguardando", () => {
    const status = resolveRowStatus(component(), ctx({ safeStatementStatuses: safeMap() }));
    expect(status.kind).toBe("card_statement_paid");
    expect(status.label).toBe("Fatura paga");
    expect(status.label).not.toMatch(/[Aa]guardando/);
  });

  it("fatura real aberta vencendo hoje => Fatura vence hoje", () => {
    const status = resolveRowStatus(
      component(),
      ctx({ safeStatementStatuses: safeMap({ paid: false, paid_at: null, due_date: TODAY }) }),
    );
    expect(status.label).toBe("Fatura vence hoje");
    expect(status.label).not.toMatch(/[Aa]guardando/);
  });

  it("fatura real vencida e não paga => Fatura atrasada", () => {
    const status = resolveRowStatus(
      component(),
      ctx({ safeStatementStatuses: safeMap({ paid: false, paid_at: null, due_date: "2026-08-17" }) }),
    );
    expect(status.kind).toBe("card_statement_overdue");
    expect(status.label).toBe("Fatura atrasada");
  });

  it("sem fatura real e ciclo incompleto => continua Aguardando dados da fatura", () => {
    const status = resolveRowStatus(component(), ctx({ safeStatementStatuses: new Map() }));
    expect(status.kind).toBe("card_awaiting_statement");
    expect(status.label).toBe("Aguardando dados da fatura");
  });

  it("status seguro de OUTRA competência não vale para o mês exibido", () => {
    const other = buildSafeStatementStatusMap([
      { card_id: CARD_ID, competence_month: "2026-07-01", due_date: "2026-07-17", paid: true },
    ]);
    expect(findSafeStatementStatus(other, CARD_ID, AUG)).toBeNull();
    expect(resolveRowStatus(component(), ctx({ safeStatementStatuses: other })).kind).toBe(
      "card_awaiting_statement",
    );
  });

  it("pagamento real da própria linha continua tendo prioridade", () => {
    const status = resolveRowStatus(
      component({ paid: true, occurrence: occ({ paid_at: "2026-08-20T13:00:00Z" }) }),
      ctx({ safeStatementStatuses: safeMap({ paid: false, paid_at: null }) }),
    );
    expect(status.label).toBe("Pago");
  });

  it("o fallback seguro nunca cria vínculo contábil (statement_occurrence_id intocado)", () => {
    const row = component();
    resolveRowStatus(row, ctx({ safeStatementStatuses: safeMap() }));
    expect(row.occurrence?.statement_occurrence_id ?? null).toBeNull();
    expect(read("src/lib/financeSafeStatement.ts")).not.toMatch(
      /update|insert|upsert|statement_occurrence_id\s*=/i,
    );
  });
});

describe("full e tools compartilham a mesma semântica", () => {
  it("mapa derivado das faturas reais do full equivale ao mapa da RPC segura", () => {
    const statementRow = {
      key: "stmt",
      item: card(),
      occurrence: occ({ id: "stmt-1", item_id: CARD_ID, competence_month: AUG, paid_at: "2026-08-20T15:00:00Z" }),
      dueDate: "2026-08-17",
      paid: true,
    } as unknown as MonthRow;

    const fromFull = safeStatementStatusesFromRows([statementRow]);
    const key = safeStatementKey(CARD_ID, AUG);
    expect(fromFull.get(key)).toEqual(safeMap().get(key));

    const fullStatus = resolveRowStatus(component(), ctx({ safeStatementStatuses: fromFull }));
    const toolsStatus = resolveRowStatus(component(), ctx({ safeStatementStatuses: safeMap() }));
    expect(fullStatus).toEqual(toolsStatus);
  });

  it("statement sem ocorrência real não gera status seguro", () => {
    const projected = { key: "stmt", item: card(), occurrence: null, dueDate: "2026-08-17", paid: false } as unknown as MonthRow;
    expect(safeStatementStatusesFromRows([projected]).size).toBe(0);
  });

  it("os dois cockpits passam o mapa seguro e a competência exibida", () => {
    for (const file of ["src/components/finance/FinanceToolsCockpit.tsx", "src/pages/Financial.tsx"]) {
      const src = read(file);
      expect(src).toMatch(/safeStatementStatuses/);
      expect(src).toMatch(/competenceMonth: competenceMonthISO\(competence\)/);
    }
  });

  it("competenceMonthISO devolve o primeiro dia do mês", () => {
    expect(competenceMonthISO({ year: 2026, month: 8 })).toBe(AUG);
  });
});

describe("cabeçalho do grupo não contradiz a fatura real", () => {
  const cycleWarning = "Fechamento não informado";

  it("fatura real paga esconde o aviso de dados incompletos", () => {
    const notice = groupStatementNotice({
      safe: findSafeStatementStatus(safeMap(), CARD_ID, AUG),
      cycleWarning,
      today: TODAY,
    });
    expect(notice.statementText).toBe("Fatura paga");
    expect(notice.projectionWarning).toBe(PROJECTION_WARNING);
    expect(notice.projectionWarning).not.toMatch(/Dados da fatura incompletos/);
  });

  it("fatura real aberta mostra o estado da fatura, não a ausência de ciclo", () => {
    const notice = groupStatementNotice({
      safe: findSafeStatementStatus(safeMap({ paid: false, paid_at: null }), CARD_ID, AUG),
      cycleWarning,
      today: TODAY,
    });
    expect(notice.statementText).toBe("Fatura atrasada");
  });

  it("sem fatura real o aviso de cadastro incompleto continua", () => {
    const notice = groupStatementNotice({ safe: null, cycleWarning, today: TODAY });
    expect(notice.statementText).toBeNull();
    expect(notice.projectionWarning).toBe(`Dados da fatura incompletos · ${cycleWarning}`);
  });

  it("sem fatura real e sem lacuna de ciclo não há aviso", () => {
    expect(groupStatementNotice({ safe: null, cycleWarning: null, today: TODAY })).toEqual({
      statementText: null,
      statementTone: null,
      projectionWarning: null,
    });
  });
});

describe("nenhum dado do cartão é alterado", () => {
  it("a migration não escreve em cartões, faturas ou vínculos", () => {
    const migration =
      allSql.split(/-- Status SEGURO da fatura/)[1] ?? "";
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
    expect(migration).not.toMatch(/statement_closing_day\s*=|statement_due_day\s*=/);
  });
});
