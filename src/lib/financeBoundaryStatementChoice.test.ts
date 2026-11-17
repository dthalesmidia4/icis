/**
 * COMPRA NA VIRADA DO CARTÃO — escolha excepcional da fatura.
 *
 * Itaú 7587: fechamento REAL de OUT/2026 em 14/10 (fatura OUT paga), NOV
 * aberta (15/10–13/11). 15/10 sempre vai para NOV sozinho; 13/10 (1 dia antes
 * do fechamento) pode ter aparecido em NOV — caso Facebook R$ 16,68.
 */
import { describe, it, expect } from "vitest";
import {
  boundaryStatementChoice,
  boundaryStatementPatch,
  findCycleForChargeDate,
  type BoundaryStatementParams,
  type StatementCycle,
  type StatementCycleMap,
} from "./financeStatementCycles";
import { isCardCharge } from "./financeRowStatus";
import type { MonthRow } from "./financeModel";

const cyc = (comp: string, s: string, e: string, actual: boolean): [string, StatementCycle] => [
  `itau|${comp}`,
  { cardId: "itau", competenceMonth: comp, cycleStart: s, cycleEnd: e, closingDateIsActual: actual },
];
const cycles: StatementCycleMap = new Map([
  cyc("2026-10-01", "2026-09-14", "2026-10-14", true),
  cyc("2026-11-01", "2026-10-15", "2026-11-13", false),
  cyc("2026-12-01", "2026-11-14", "2026-12-13", false),
]);
/** OUT paga; NOV/DEZ abertas. */
const locked = (_card: string, comp: string) => comp === "2026-10-01";

const params = (p: Partial<BoundaryStatementParams> = {}): BoundaryStatementParams => ({
  cycles,
  cardId: "itau",
  chargeDate: "2026-10-13",
  cardCharge: true,
  externalCard: false,
  statementRow: false,
  entryRole: "regular",
  supplemental: false,
  closed: false,
  occurrence: { statement_occurrence_id: null, statement_competence_snapshot: null, paid_at: null, skipped_at: null },
  isStatementLocked: locked,
  ...p,
});

describe("compra na virada do cartão", () => {
  it("15/10 vai automaticamente para NOV, sem pergunta", () => {
    expect(findCycleForChargeDate(cycles, "itau", "2026-10-15")?.competenceMonth).toBe("2026-11-01");
    expect(boundaryStatementChoice(params({ chargeDate: "2026-10-15" }))).toBeNull();
  });

  it("13/10 oferece OUT (pela data, fechada) e NOV; escolher NOV salva snapshot NOV", () => {
    const choice = boundaryStatementChoice(params())!;
    expect(choice).not.toBeNull();
    expect(choice.automatic.competenceMonth).toBe("2026-10-01");
    expect(choice.options.map((o) => [o.competenceMonth, o.selectable])).toEqual([
      ["2026-10-01", false],
      ["2026-11-01", true],
    ]);
    expect(choice.selected).toBe("2026-10-01");
    expect(boundaryStatementPatch(choice, "2026-11-01")).toEqual({ statement_competence_snapshot: "2026-11-01" });
  });

  it("dia do fechamento (14/10) também oferece a escolha", () => {
    expect(boundaryStatementChoice(params({ chargeDate: "2026-10-14" }))).not.toBeNull();
  });

  it("13/10 sem escolha não grava nem apaga snapshot", () => {
    const choice = boundaryStatementChoice(params());
    expect(boundaryStatementPatch(choice, null)).toEqual({});
    expect(boundaryStatementPatch(choice, "2026-10-01")).toEqual({});
  });

  it("snapshot NOV preexistente (Facebook) fica pré-selecionado e não é regravado", () => {
    const choice = boundaryStatementChoice(params({
      occurrence: { statement_competence_snapshot: "2026-11-01" },
    }))!;
    expect(choice.selected).toBe("2026-11-01");
    expect(boundaryStatementPatch(choice, null)).toEqual({});
    expect(boundaryStatementPatch(choice, "2026-11-01")).toEqual({});
    // OUT paga nunca vira destino.
    expect(boundaryStatementPatch(choice, "2026-10-01")).toEqual({});
  });

  it("compra paga, fechada ou vinculada a fatura não permite mudança", () => {
    expect(boundaryStatementChoice(params({ closed: true }))).toBeNull();
    expect(boundaryStatementChoice(params({ occurrence: { paid_at: "2026-10-20T10:00:00Z" } }))).toBeNull();
    expect(boundaryStatementChoice(params({ occurrence: { statement_occurrence_id: "0eb7" } }))).toBeNull();
    expect(boundaryStatementChoice(params({ occurrence: { skipped_at: "2026-11-17T10:00:00Z" } }))).toBeNull();
  });

  it("fatura seguinte fechada/paga: sem alternativa, sem pergunta", () => {
    expect(boundaryStatementChoice(params({ isStatementLocked: () => true }))).toBeNull();
  });

  it("Pix e cartão externo nunca mostram", () => {
    const pix = { paymentMethod: "pix", cardItemId: null, item: { kind: "tool" }, occurrence: null } as unknown as MonthRow;
    expect(isCardCharge(pix)).toBe(false);
    expect(boundaryStatementChoice(params({ cardCharge: isCardCharge(pix), cardId: null }))).toBeNull();
    expect(boundaryStatementChoice(params({ externalCard: true, cardId: null }))).toBeNull();
    expect(boundaryStatementChoice(params({ externalCard: true }))).toBeNull();
  });

  it("fatura pai, recarga e extras nunca mostram", () => {
    expect(boundaryStatementChoice(params({ statementRow: true }))).toBeNull();
    expect(boundaryStatementChoice(params({ entryRole: "recharge", supplemental: true }))).toBeNull();
    expect(boundaryStatementChoice(params({ entryRole: "extra" }))).toBeNull();
  });

  it("compra em dia normal não tem opção", () => {
    expect(boundaryStatementChoice(params({ chargeDate: "2026-10-05" }))).toBeNull();
    expect(boundaryStatementChoice(params({ chargeDate: "2026-10-28" }))).toBeNull();
  });

  it("sem janelas conhecidas não adivinha", () => {
    expect(boundaryStatementChoice(params({ cycles: new Map() }))).toBeNull();
    expect(boundaryStatementChoice(params({ cycles: null }))).toBeNull();
    // Sem a janela seguinte também não.
    const onlyOut: StatementCycleMap = new Map([cyc("2026-10-01", "2026-09-14", "2026-10-14", true)]);
    expect(boundaryStatementChoice(params({ cycles: onlyOut }))).toBeNull();
  });

  it("virada de NOV (12/11) com NOV e DEZ abertas: escolher DEZ grava DEZ", () => {
    const choice = boundaryStatementChoice(params({ chargeDate: "2026-11-12" }))!;
    expect(choice.options.every((o) => o.selectable)).toBe(true);
    expect(boundaryStatementPatch(choice, "2026-12-01")).toEqual({ statement_competence_snapshot: "2026-12-01" });
  });
});
