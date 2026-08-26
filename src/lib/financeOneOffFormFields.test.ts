/**
 * O cadastro de um avulso JÁ EXISTENTE não pode ter campo de data que o submit
 * descarta: a data real é do FATO (`finance_occurrences`). Estes testes leem o
 * fonte porque a regra é de composição da tela, não de cálculo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/finance/FinanceItemFormModal.tsx", "utf8");
const modal = readFileSync("src/components/finance/FinanceOccurrenceModal.tsx", "utf8");

describe("avulso existente — cadastro", () => {
  it("só mostra o campo de data quando ele materializa o fato", () => {
    expect(form).toContain("{materializesOneOff ? (");
    expect(form).toContain("A data real pertence ao lançamento");
  });

  it("criação continua exigindo data válida antes de salvar", () => {
    expect(form).toContain("if (!oneOffDateValid) return;");
    expect(form).toContain("materializesOneOff && shouldMaterializeOneOff(payload)");
  });
});

describe("primeiro modal — data digitável e imutáveis", () => {
  it("usa FinanceDateInput para a data do fato", () => {
    expect(modal).toContain('id="occurrence-fact-date"');
    expect(modal).toContain("<FinanceDateInput");
  });

  it("nunca envia scheduled_date, competence_month ou item_id", () => {
    expect(modal).not.toContain("scheduled_date:");
    expect(modal).not.toContain("competence_month:");
  });

  it("reabre sempre em consulta e nunca inventa a data de cobrança", () => {
    expect(modal).toContain("setCorrecting(false)");
    expect(modal).toContain('setConvertDate("")');
  });
});
