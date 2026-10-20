/**
 * REGRESSÃO REAL — AVISA-API (Itaú 7587, fech. 14 / venc. 25).
 *
 * `competence_month` é a competência CONTÁBIL do fato; `charge_date` é a DATA
 * REAL da cobrança no cartão. Uma cobrança de 20/JUL, com fechamento dia 14,
 * fecha em 14/AGO e vence em 25/AGO: pertence à FATURA DE AGOSTO — mesmo que a
 * ocorrência esteja arquivada na competência de agosto.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  effectivePaid,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";
import { buildStatementSettlementIndex, buildSafeSettlementIndex } from "./financeSettlement";
import { resolveRowStatus, resolveStatementCompetenceForRow } from "./financeRowStatus";
import { brlComponentsOf } from "@/components/finance/PayStatementModal";
import { usdComponentsOf } from "./financeReconciliation";
import type { StatementCycleMap } from "./financeStatementCycles";

const AUG = { year: 2026, month: 8 };

describe("projeções abertas atualizadas sem reescrever fatos ou ciclos", () => {
  const SET = { year: 2026, month: 9 };
  const OUT = { year: 2026, month: 10 };
  const NOV = { year: 2026, month: 11 };
  const itau = item({ id: "itau7587", name: "Itaú 7587", kind: "card", statement_closing_day: 13, statement_due_day: 25 });
  const adplaneSet = item({ id: "adplane", name: "Adplane", card_item_id: itau.id, charge_day: 24, currency: "BRL", default_amount_brl: 40.3 });
  const adplaneOut = { ...adplaneSet, currency: "USD" as const, default_amount_original: 7.34, default_amount_brl: 40.3, default_exchange_rate: 5.490463 };
  const cycles: StatementCycleMap = new Map([
    [`${itau.id}|2026-09-01`, { cardId: itau.id, competenceMonth: "2026-09-01", cycleStart: "2026-08-14", cycleEnd: "2026-09-14", closingDateIsActual: true }],
    [`${itau.id}|2026-10-01`, { cardId: itau.id, competenceMonth: "2026-10-01", cycleStart: "2026-09-15", cycleEnd: "2026-10-13", closingDateIsActual: false }],
    [`${itau.id}|2026-11-01`, { cardId: itau.id, competenceMonth: "2026-11-01", cycleStart: "2026-10-14", cycleEnd: "2026-11-13", closingDateIsActual: false }],
  ]);
  const realOct = occ({ id: "adplane-real-oct", item_id: adplaneSet.id, competence_month: "2026-10-01", charge_date: "2026-10-24", currency: "USD", amount_original: 7.34, amount_brl: 40.3 });
  const catalogs = new Map([["2026-09-01", [itau, adplaneSet]], ["2026-10-01", [itau, adplaneOut]]]);

  it("Adplane 24/09 projetado em OUT aberta é USD uma única vez; fato 24/10 só em NOV", () => {
    const params = { items: [itau, adplaneOut], occurrences: [realOct], cycles, itemsByCompetence: catalogs };
    const out = buildStatementGroups({ ...params, competence: OUT })[0];
    expect(out.components).toHaveLength(1);
    expect(out.components[0]).toMatchObject({ projected: true, occurrence: null, chargeDate: "2026-09-24", currency: "USD", amountOriginal: 7.34, amountBrl: 40.3 });
    expect(brlComponentsOf(out)).toHaveLength(0);
    expect(usdComponentsOf(out).map((c) => c.row.key)).toEqual([out.components[0].key]);
    const nov = buildStatementGroups({ ...params, competence: NOV })[0];
    expect(nov.components.filter((r) => r.occurrence?.id === realOct.id)).toHaveLength(1);
    expect(nov.components.find((r) => r.occurrence?.id === realOct.id)?.currency).toBe("USD");
  });

  it("fato BRL permanece BRL mesmo em OUT aberta com cadastro atual USD", () => {
    const real = occ({ id: "brl-sep", item_id: adplaneSet.id, competence_month: "2026-09-01", charge_date: "2026-09-24", amount_brl: 39.9, currency: "BRL" });
    const out = buildStatementGroups({ items: [itau, adplaneOut], occurrences: [real], competence: OUT, cycles, itemsByCompetence: catalogs })[0];
    expect(out.components).toHaveLength(1);
    expect(out.components[0]).toMatchObject({ projected: false, currency: "BRL", amountBrl: 39.9 });
  });

  it.each([false, true])("SET fechada (paga=%s) preserva fato BRL vinculado", (paid) => {
    const statement = occ({ id: "set-frozen", item_id: itau.id, competence_month: "2026-09-01", statement_closing_date: "2026-09-14", ...(paid ? { paid_at: "2026-09-25T12:00:00Z" } : {}) });
    const real = occ({ id: "brl-aug", item_id: adplaneSet.id, competence_month: "2026-09-01", charge_date: "2026-08-24", amount_brl: 39.9, currency: "BRL", statement_occurrence_id: statement.id });
    const set = buildStatementGroups({ items: [itau, adplaneOut], occurrences: [statement, real], competence: SET, cycles, itemsByCompetence: catalogs })[0];
    expect(set.components).toHaveLength(1);
    expect(set.components[0]).toMatchObject({ projected: false, currency: "BRL", amountBrl: 39.9, chargeDate: "2026-08-24" });
  });

  it("fechamento real preserva projeção histórica BRL no legado sem vínculos", () => {
    const closedCycles = new Map(cycles);
    const oct = closedCycles.get(`${itau.id}|2026-10-01`);
    if (!oct) throw new Error("Ciclo OUT ausente");
    closedCycles.set(`${itau.id}|2026-10-01`, { ...oct, closingDateIsActual: true });
    const out = buildStatementGroups({ items: [itau, adplaneOut], occurrences: [], competence: OUT, cycles: closedCycles, itemsByCompetence: catalogs })[0];
    expect(out.components[0]).toMatchObject({ projected: true, currency: "BRL", chargeDate: "2026-09-24" });
  });

  it("troca de cartão não atualiza projeção antiga com defaults de outro cartão", () => {
    const moved = { ...adplaneOut, card_item_id: "outro-cartao" };
    const out = buildStatementGroups({ items: [itau, moved], occurrences: [], competence: OUT, cycles, itemsByCompetence: catalogs })[0];
    expect(out.components[0]).toMatchObject({ projected: true, currency: "BRL", chargeDate: "2026-09-24" });
  });

  it("SEDANCE real 23/10 pertence só a NOV; data real 23/09 pertence a OUT", () => {
    const sedance = item({ id: "sedance", name: "SEDANCE", statement_label: "DREAMINA", card_item_id: itau.id, charge_day: 23, currency: "USD" });
    for (const [date, expectedMonth] of [["2026-10-23", NOV], ["2026-09-23", OUT]] as const) {
      const real = occ({ id: `sedance-${date}`, item_id: sedance.id, competence_month: "2026-10-01", charge_date: date, currency: "USD", amount_original: 78.14, amount_brl: 425.08 });
      const params = { items: [itau, sedance], occurrences: [real], cycles };
      const expected = buildStatementGroups({ ...params, competence: expectedMonth })[0];
      const other = buildStatementGroups({ ...params, competence: expectedMonth.month === 10 ? NOV : OUT })[0];
      expect(expected.components.filter((r) => r.occurrence?.id === real.id)).toHaveLength(1);
      expect(other.components.some((r) => r.occurrence?.id === real.id)).toBe(false);
      expect(real.charge_date).toBe(date);
    }
  });
});

function item(p: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "tool",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...p,
  } as FinanceItem;
}
function occ(p: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { competence_month: "2026-08-01", currency: "BRL", ...p } as FinanceOccurrence;
}

const card = item({
  id: "card-itau",
  name: "Itaú ••••7587",
  kind: "card",
  cost_center: "compartilhado",
  statement_closing_day: 14,
  statement_due_day: 25,
});
const avisa = item({
  id: "avisa",
  name: "AVISA-API",
  default_amount_brl: 69,
  charge_day: 20,
  card_item_id: "card-itau",
});

/** Ocorrência REAL: competência agosto, cobrança 20/JUL, sem paid_at nem vínculo. */
const avisaReal = occ({ id: "occ-avisa", item_id: "avisa", amount_brl: 69, charge_date: "2026-07-20" });

function statementOcc(paid: boolean, dueDate = "2026-08-25") {
  return occ({
    id: "stmt-aug",
    item_id: "card-itau",
    amount_brl: 69,
    due_date: dueDate,
    ...(paid ? { paid_at: "2026-08-20T12:00:00Z", paid_amount_brl: 69 } : {}),
  });
}

function scenario(paid: boolean, dueDate = "2026-08-25") {
  const occurrences = [avisaReal, statementOcc(paid, dueDate)];
  const items = [card, avisa];
  const rows = buildMonthRows({ items, occurrences, competence: AUG });
  const statements = buildStatementGroups({ items, occurrences, competence: AUG });
  const settlement = buildStatementSettlementIndex(statements);
  return { rows, statements, settlement, items, occurrences };
}

describe("competência da cobrança = charge_date (não competence_month)", () => {
  it("row REAL de agosto com cobrança 20/JUL pertence à fatura de AGOSTO", () => {
    const { rows, statements } = scenario(true);
    const row = rows.find((r) => r.item.id === "avisa")!;
    const competence = resolveStatementCompetenceForRow(row, {
      today: "2026-08-25",
      rows,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never)!;
    expect(competence).toEqual(AUG);
  });

  it("projeção com cobrança 20/AGO pertence à fatura de SETEMBRO", () => {
    const rows = buildMonthRows({ items: [card, avisa], occurrences: [], competence: AUG });
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(row.projected).toBe(true);
    expect(row.chargeDate).toBe("2026-08-20");
    const competence = resolveStatementCompetenceForRow(row, {
      today: "2026-08-25",
      rows,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
    } as never)!;
    expect(competence).toEqual({ year: 2026, month: 9 });
  });

  it("grupo da fatura de agosto contém o AVISA real, uma única vez", () => {
    const { statements } = scenario(true);
    const group = statements[0];
    const avisaComponents = group.components.filter((c) => c.item.id === "avisa");
    expect(avisaComponents).toHaveLength(1);
    expect(avisaComponents[0].occurrence?.id).toBe("occ-avisa");
    expect(avisaComponents[0].projected).toBe(false);
    expect(group.projectedTotal).toBe(69);
  });

  it("fatura paga liquida o AVISA: pago, não em aberto, badge positivo", () => {
    const { rows, statements, settlement } = scenario(true);
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(effectivePaid(row, rows, settlement)).toBe(true);

    const totals = computeTotals(rows, settlement);
    expect(totals.paid).toBe(69);
    expect(totals.open).toBe(0);
    expect(Number((totals.paid + totals.open).toFixed(2))).toBe(totals.expected);

    const status = resolveRowStatus(row, {
      today: "2026-08-26",
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never);
    expect(status.tone).toBe("positive");
    expect(["Pago pela fatura", "Fatura paga"]).toContain(status.label);
  });

  it("fatura de agosto em aberto e vencida => AVISA atrasado pela fatura", () => {
    const { rows, statements, settlement } = scenario(false, "2026-08-25");
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(effectivePaid(row, rows, settlement)).toBe(false);
    const status = resolveRowStatus(row, {
      today: "2026-08-26",
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never);
    expect(status.label).toBe("Fatura atrasada");
  });

  it("fatura de agosto em aberto e a vencer => Fatura a pagar / vence hoje", () => {
    const { rows, statements, settlement } = scenario(false, "2026-08-25");
    const row = rows.find((r) => r.item.id === "avisa")!;
    const ctx = (today: string) => ({
      today,
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    });
    expect(["Fatura a pagar", "Fatura vence hoje"]).toContain(
      resolveRowStatus(row, ctx("2026-08-20") as never).label,
    );
    expect(["Fatura vence hoje", "Fatura a pagar"]).toContain(
      resolveRowStatus(row, ctx("2026-08-25") as never).label,
    );
  });

  it("cobrança realmente em 20/AGO não entra na fatura de agosto", () => {
    const occurrences = [
      occ({ id: "occ-late", item_id: "avisa", amount_brl: 69, charge_date: "2026-08-20" }),
      statementOcc(true),
    ];
    const statements = buildStatementGroups({ items: [card, avisa], occurrences, competence: AUG });
    // O fato de agosto (cobrança 20/AGO) pertence à fatura de SETEMBRO.
    expect(statements[0].components.some((c) => c.occurrence?.id === "occ-late")).toBe(false);
    const rows = buildMonthRows({ items: [card, avisa], occurrences, competence: AUG });
    const settlement = buildStatementSettlementIndex(statements);
    expect(effectivePaid(rows.find((r) => r.item.id === "avisa")!, rows, settlement)).toBe(false);
  });
});

describe("tools-only (buildSafeSettlementIndex) segue a mesma regra", () => {
  const cardsById = new Map([[card.id, card]]);

  it("cobrança 20/JUL em competência agosto é liquidada pela fatura segura de agosto", () => {
    const rows = buildMonthRows({ items: [avisa], occurrences: [avisaReal], competence: AUG });
    const index = buildSafeSettlementIndex({
      rows,
      isPaidCard: () => true,
      competence: AUG,
      cardsById,
    });
    expect(index.paidComponentKeys.size).toBe(1);
  });

  it("cobrança 20/AGO não é liquidada pela fatura segura de agosto", () => {
    const rows = buildMonthRows({
      items: [avisa],
      occurrences: [occ({ id: "o", item_id: "avisa", amount_brl: 69, charge_date: "2026-08-20" })],
      competence: AUG,
    });
    const index = buildSafeSettlementIndex({
      rows,
      isPaidCard: () => true,
      competence: AUG,
      cardsById,
    });
    expect(index.paidComponentKeys.size).toBe(0);
  });
});

/**
 * REGRESSÃO REAL — Itaú 7587, setembro/2026 (ciclo previsto 14/08–13/09, venc.
 * 25/09, fatura ABERTA e sem fechamento informado). O fato do `Supabase
 * SmartVety` (charge_date 15/09, arquivado na competência de outubro) compõe
 * PROVISORIAMENTE a fatura de setembro; a projeção sem fato (Adobe 14/09)
 * continua pertencendo a outubro.
 */
describe("reivindicação provisória da fatura aberta (sem fechamento informado)", () => {
  const SEP = { year: 2026, month: 9 };
  const OCT = { year: 2026, month: 10 };

  const itau = item({
    id: "itau",
    name: "Itaú ••••7587",
    kind: "card",
    cost_center: "compartilhado",
    statement_closing_day: 13,
    statement_due_day: 25,
  });
  const smartvety = item({
    id: "smartvety",
    name: "Supabase SmartVety",
    default_amount_brl: 135,
    charge_day: 15,
    card_item_id: "itau",
  });
  const adobe = item({
    id: "adobe",
    name: "Adobe",
    default_amount_brl: 120,
    charge_day: 14,
    card_item_id: "itau",
  });

  /** Fato real de 15/09 arquivado na competência de OUTUBRO. */
  const smartvetyFact = occ({
    id: "occ-smartvety",
    item_id: "smartvety",
    competence_month: "2026-10-01",
    amount_brl: 135,
    charge_date: "2026-09-15",
  });

  function cycles(sepEnd: string, sepActual: boolean) {
    const nextStart = `2026-09-${String(Number(sepEnd.slice(8)) + 1).padStart(2, "0")}`;
    return new Map([
      [
        `itau|2026-09-01`,
        {
          cardId: "itau",
          competenceMonth: "2026-09-01",
          cycleStart: "2026-08-14",
          cycleEnd: sepEnd,
          closingDateIsActual: sepActual,
        },
      ],
      [
        `itau|2026-10-01`,
        {
          cardId: "itau",
          competenceMonth: "2026-10-01",
          cycleStart: nextStart,
          cycleEnd: "2026-10-13",
          closingDateIsActual: false,
        },
      ],
    ]) as never;
  }

  const items = [itau, smartvety, adobe];
  const occurrences = [smartvetyFact];

  function group(competence: { year: number; month: number }, sepEnd = "2026-09-13", sepActual = false) {
    return buildStatementGroups({ items, occurrences, competence, cycles: cycles(sepEnd, sepActual) })[0];
  }

  it("ciclo estrito: fatura de setembro ABERTA não recebe o fato de 15/09", () => {
    expect(group(SEP).components.some((c) => c.occurrence?.id === "occ-smartvety")).toBe(false);
  });

  it("outubro recebe o fato de 15/09 uma única vez", () => {
    const found = group(OCT).components.filter((c) => c.item.id === "smartvety");
    expect(found).toHaveLength(1);
    expect(found[0].occurrence?.id).toBe("occ-smartvety");
  });

  it("projeção sem fato (Adobe 14/09) fica fora de setembro e pertence a outubro", () => {
    expect(group(SEP).components.some((c) => c.item.id === "adobe" && c.chargeDate === "2026-09-14")).toBe(false);
    expect(group(OCT).components.some((c) => c.item.id === "adobe" && c.chargeDate === "2026-09-14")).toBe(true);
  });

  it("fechamento REAL em 13/09 devolve o fato de 15/09 para outubro", () => {
    expect(group(SEP, "2026-09-13", true).components.some((c) => c.chargeDate === "2026-09-15")).toBe(false);
    expect(group(OCT, "2026-09-13", true).components.some((c) => c.occurrence?.id === "occ-smartvety")).toBe(true);
  });

  it("fechamento REAL em 15/09 mantém o fato em setembro e fora de outubro", () => {
    const sep = group(SEP, "2026-09-15", true);
    expect(sep.components.filter((c) => c.occurrence?.id === "occ-smartvety")).toHaveLength(1);
    expect(group(OCT, "2026-09-15", true).components.some((c) => c.item.id === "smartvety")).toBe(false);
  });
});


/**
 * REGRESSÃO REAL — Itaú 7587, setembro/2026 (ciclo 14/08–13/09).
 *
 * Assinaturas que JÁ EXISTIAM em agosto projetam a cobrança do ciclo mesmo
 * tendo um fato antigo arquivado em agosto (cobrança do ciclo anterior). Um
 * cadastro criado só em setembro NÃO retroage para 25/08. Fato real dentro da
 * janela continua prevalecendo sobre a projeção.
 */
describe("cadastro vigente por competência no ciclo da fatura", () => {
  const SEP = { year: 2026, month: 9 };

  const itau = item({
    id: "itau",
    name: "Itaú ••••7587",
    kind: "card",
    cost_center: "compartilhado",
    statement_closing_day: 13,
    statement_due_day: 25,
  });
  const sub = (id: string, name: string, chargeDay: number) =>
    item({ id, name, default_amount_brl: 100, charge_day: chargeDay, card_item_id: "itau" });

  const adobe = sub("adobe", "Adobe", 14);
  const canva = sub("canva", "Canva", 20);
  const chatgpt = sub("chatgpt", "ChatGPT", 25);
  const suno = sub("suno", "SUNO", 25);
  const lovable = sub("lovable", "Lovable", 20);

  /** Fatos ANTIGOS arquivados em agosto (cobranças do ciclo de julho). */
  const oldFacts = [
    occ({ id: "old-adobe", item_id: "adobe", competence_month: "2026-08-01", amount_brl: 100, charge_date: "2026-07-14" }),
    occ({ id: "old-canva", item_id: "canva", competence_month: "2026-08-01", amount_brl: 100, charge_date: "2026-07-20" }),
  ];
  /** Fato REAL dentro da janela: prevalece sobre a projeção. */
  const lovableFact = occ({
    id: "occ-lovable",
    item_id: "lovable",
    competence_month: "2026-08-01",
    amount_brl: 137,
    charge_date: "2026-08-20",
  });

  const augCatalog = [itau, adobe, canva, chatgpt, lovable];
  const sepCatalog = [...augCatalog, suno];

  const cycles = new Map([
    [
      "itau|2026-09-01",
      {
        cardId: "itau",
        competenceMonth: "2026-09-01",
        cycleStart: "2026-08-14",
        cycleEnd: "2026-09-13",
        closingDateIsActual: true,
      },
    ],
  ]) as never;

  const sep = buildStatementGroups({
    items: sepCatalog,
    occurrences: [...oldFacts, lovableFact],
    competence: SEP,
    cycles,
    itemsByCompetence: new Map([
      ["2026-08-01", augCatalog],
      ["2026-09-01", sepCatalog],
    ]),
  })[0];

  it("Adobe 14/08, Canva 20/08 e ChatGPT 25/08 compõem a fatura de setembro", () => {
    const dates = new Map(sep.components.map((c) => [c.item.id, c.chargeDate]));
    expect(dates.get("adobe")).toBe("2026-08-14");
    expect(dates.get("canva")).toBe("2026-08-20");
    expect(dates.get("chatgpt")).toBe("2026-08-25");
  });

  it("cada assinatura entra uma única vez", () => {
    for (const id of ["adobe", "canva", "chatgpt", "lovable"]) {
      expect(sep.components.filter((c) => c.item.id === id)).toHaveLength(1);
    }
  });

  it("SUNO, criada em setembro, não gera cobrança retroativa em 25/08", () => {
    expect(sep.components.some((c) => c.item.id === "suno")).toBe(false);
  });

  it("fato real de 20/08 prevalece sobre a projeção do Lovable", () => {
    const row = sep.components.find((c) => c.item.id === "lovable")!;
    expect(row.projected).toBe(false);
    expect(row.occurrence?.id).toBe("occ-lovable");
    expect(row.amountBrl).toBe(137);
  });

  it("fatos antigos de julho não entram na fatura", () => {
    expect(sep.components.some((c) => c.occurrence?.id === "old-adobe")).toBe(false);
    expect(sep.components.some((c) => c.occurrence?.id === "old-canva")).toBe(false);
  });
});

describe("duas ocorrências regulares do mesmo item na mesma competência", () => {
  const SET = { year: 2026, month: 9 };
  const OUT = { year: 2026, month: 10 };
  const adobe = item({
    id: "adobe",
    name: "Adobe Creative Cloud",
    default_amount_brl: 280,
    charge_day: 14,
    card_item_id: "card-itau",
  });
  // Fatura SET/26 fechada de verdade em 14/09 e paga: composição congelada.
  const stmtSet = occ({
    id: "stmt-set",
    item_id: "card-itau",
    competence_month: "2026-09-01",
    amount_brl: 560,
    due_date: "2026-09-25",
    statement_closing_date: "2026-09-14",
    paid_at: "2026-09-20T12:00:00Z",
    paid_amount_brl: 560,
  });
  const stmtOut = occ({
    id: "stmt-out",
    item_id: "card-itau",
    competence_month: "2026-10-01",
    due_date: "2026-10-25",
  });
  // Cobrança 14/08 (legada, sem scheduled_date) + cobrança 14/09 confirmada,
  // ambas na competência SET e vinculadas à fatura SET.
  const adobe1 = occ({
    id: "occ-adobe-1",
    item_id: "adobe",
    competence_month: "2026-09-01",
    amount_brl: 280,
    charge_date: "2026-08-14",
    statement_occurrence_id: "stmt-set",
  });
  const adobe2 = occ({
    id: "occ-adobe-2",
    item_id: "adobe",
    competence_month: "2026-09-01",
    amount_brl: 280,
    charge_date: "2026-09-14",
    scheduled_date: "2026-09-14",
    statement_occurrence_id: "stmt-set",
  });
  const items = [card, adobe];
  const occurrences = [stmtSet, stmtOut, adobe1, adobe2];

  it("buildMonthRows produz as duas linhas reais de Adobe em SET", () => {
    const rows = buildMonthRows({ items, occurrences, competence: SET });
    const adobeRows = rows.filter((r) => r.item.id === "adobe");
    expect(adobeRows).toHaveLength(2);
    expect(adobeRows.every((r) => !r.projected)).toBe(true);
    expect(adobeRows.map((r) => r.chargeDate).sort()).toEqual(["2026-08-14", "2026-09-14"]);
  });

  it("fatura SET paga/fechada mostra as duas cobranças vinculadas", () => {
    const groups = buildStatementGroups({ items, occurrences, competence: SET });
    const set = groups.find((g) => g.dueDate === "2026-09-25")!;
    const adobeComponents = set.components.filter((c) => c.item.id === "adobe");
    expect(adobeComponents).toHaveLength(2);
  });

  it("fatura OUT não ganha artificialmente a cobrança Adobe de 14/09", () => {
    const groups = buildStatementGroups({ items, occurrences, competence: OUT });
    const out = groups.find((g) => g.dueDate === "2026-10-25");
    const adobeComponents = (out?.components ?? []).filter((c) => c.item.id === "adobe");
    // Nenhum FATO real de 14/09 nem a ocorrência vinculada à fatura SET;
    // uma projeção legítima de 14/10 pode existir e não é o bug.
    expect(adobeComponents.filter((c) => !c.projected)).toHaveLength(0);
    expect(adobeComponents.some((c) => c.chargeDate === "2026-09-14")).toBe(false);
    expect(adobeComponents.some((c) => c.occurrence?.id === "occ-adobe-2")).toBe(false);
  });
});

describe("AVISA-API — cobrança 20/09 não cobrada (skipped) não reaparece em OUT", () => {
  const SET = { year: 2026, month: 9 };
  const OUT = { year: 2026, month: 10 };
  const stmtSet = occ({
    id: "stmt-set", item_id: "card-itau", competence_month: "2026-09-01",
    amount_brl: 69, due_date: "2026-09-25", statement_closing_date: "2026-09-14",
    paid_at: "2026-09-20T12:00:00Z", paid_amount_brl: 69,
  });
  const stmtOut = occ({ id: "stmt-out", item_id: "card-itau", competence_month: "2026-10-01", due_date: "2026-10-25" });
  const real = occ({
    id: "occ-avisa-0820", item_id: "avisa", competence_month: "2026-09-01",
    amount_brl: 69, charge_date: "2026-08-20", statement_occurrence_id: "stmt-set",
  });
  const skipped = occ({
    id: "occ-avisa-0920", item_id: "avisa", competence_month: "2026-09-01",
    scheduled_date: "2026-09-20", skipped_at: "2026-10-01T12:00:00Z",
  });
  const items = [card, avisa];
  const occurrences = [stmtSet, stmtOut, real, skipped];

  it("fatura OUT não inclui AVISA", () => {
    const out = buildStatementGroups({ items, occurrences, competence: OUT }).find((g) => g.dueDate === "2026-10-25");
    expect((out?.components ?? []).filter((c) => c.item.id === "avisa")).toHaveLength(0);
  });

  it("fatura SET paga preserva a cobrança real de 20/08", () => {
    const set = buildStatementGroups({ items, occurrences, competence: SET }).find((g) => g.dueDate === "2026-09-25")!;
    const av = set.components.filter((c) => c.item.id === "avisa");
    expect(av.map((c) => c.occurrence?.id)).toEqual(["occ-avisa-0820"]);
    expect(set.paid).toBe(true);
  });
});

describe("ciclo estrito OUT/26 (15/09–13/10) x NOV/26 (14/10–13/11), fatura OUT aberta", () => {
  const OUT = { year: 2026, month: 10 };
  const NOV = { year: 2026, month: 11 };
  const itau = item({
    id: "itau", name: "Itaú ••••7587", kind: "card", cost_center: "compartilhado",
    statement_closing_day: 13, statement_due_day: 25,
  });
  const sub = (id: string, day: number, currency = "BRL") =>
    item({ id, name: id, default_amount_brl: 100, charge_day: day, card_item_id: "itau", currency } as never);
  const items = [
    itau, sub("in-1509", 15), sub("in-0110", 1, "USD"), sub("in-1310", 13), sub("adobe", 14),
    sub("openai", 15, "USD"), sub("adplane", 24), sub("late-2510", 25), sub("lovable", 1),
  ];
  const f = (id: string, itemId: string, date: string, extra: Record<string, unknown> = {}) =>
    occ({ id, item_id: itemId, competence_month: "2026-10-01", amount_brl: 100, charge_date: date, ...extra } as never);
  const occurrences = [
    occ({ id: "stmt-out", item_id: "itau", competence_month: "2026-10-01", due_date: "2026-10-25" }),
    f("o-1509", "in-1509", "2026-09-15"),
    f("o-0110", "in-0110", "2026-10-01", { currency: "USD" }),
    f("o-1310", "in-1310", "2026-10-13"),
    f("o-adobe", "adobe", "2026-10-14"),
    f("o-openai", "openai", "2026-10-15", { currency: "USD" }),
    f("o-adplane", "adplane", "2026-10-24"),
    f("o-2510", "late-2510", "2026-10-25"),
    f("o-lov-reg", "lovable", "2026-10-01"),
    f("o-lov-r1", "lovable", "2026-10-05", { entry_role: "recharge", amount_brl: 50 }),
    f("o-lov-r2", "lovable", "2026-10-20", { entry_role: "recharge", amount_brl: 60 }),
  ];
  const cyc = (comp: string, s: string, e: string, actual: boolean) =>
    [`itau|${comp}`, { cardId: "itau", competenceMonth: comp, cycleStart: s, cycleEnd: e, closingDateIsActual: actual }] as const;
  const cycles = new Map([
    cyc("2026-09-01", "2026-08-14", "2026-09-14", true),
    cyc("2026-10-01", "2026-09-15", "2026-10-13", false),
    cyc("2026-11-01", "2026-10-14", "2026-11-13", false),
  ]) as never;
  const g = (c: { year: number; month: number }) =>
    buildStatementGroups({ items, occurrences, competence: c, cycles })[0];
  const ids = (c: { year: number; month: number }) =>
    g(c).components.filter((x) => !x.projected).map((x) => x.occurrence?.id);

  it("OUT contém só fatos de 15/09, 01/10, 13/10 e recarga dentro do ciclo", () => {
    const out = ids(OUT);
    for (const id of ["o-1509", "o-0110", "o-1310", "o-lov-reg", "o-lov-r1"]) expect(out).toContain(id);
    for (const id of ["o-adobe", "o-openai", "o-adplane", "o-2510", "o-lov-r2"]) expect(out).not.toContain(id);
    expect(g(OUT).components.every((c) => !c.chargeDate || (c.chargeDate >= "2026-09-15" && c.chargeDate <= "2026-10-13"))).toBe(true);
  });

  it("NOV recebe fatos pós-fechamento 14/10, 15/10, 24/10, 25/10 e recarga 20/10", () => {
    const nov = ids(NOV);
    for (const id of ["o-adobe", "o-openai", "o-adplane", "o-2510", "o-lov-r2"]) expect(nov).toContain(id);
  });

  it("nenhum fato/recarga duplica dentro ou entre as faturas", () => {
    const out = ids(OUT), nov = ids(NOV);
    expect(new Set(out).size).toBe(out.length);
    expect(new Set(nov).size).toBe(nov.length);
    expect(out.filter((id) => nov.includes(id))).toHaveLength(0);
  });
});
