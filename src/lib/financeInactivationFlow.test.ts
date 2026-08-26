/**
 * Teste ESTRUTURAL do fluxo de inativação (não há testing-library no projeto).
 *
 * Garante que o formulário de cadastro não pode ressuscitar um item inativado:
 * fecha determinísticamente e o `Salvar` fica morto após a decisão do banco.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8");

const form = read("src/components/finance/FinanceItemFormModal.tsx");
const periodBar = read("src/components/finance/FinancePeriodBar.tsx");
const occurrenceModal = read("src/components/finance/FinanceOccurrenceModal.tsx");

describe("inativação de cadastro — fechamento determinístico", () => {
  it("o formulário guarda o estado destruído e bloqueia o salvar stale", () => {
    expect(form).toContain("const [destroyed, setDestroyed] = useState(false)");
    expect(form).toContain("if (destroyed) return;");
    // O botão pode estar formatado em múltiplas linhas: o que importa é que
    // `saving` e `destroyed` continuem desabilitando o salvar.
    expect(form).toMatch(/disabled=\{\s*saving \|\|\s*destroyed \|\|/);
  });

  it("concluir a exclusão/inativação fecha a consulta e o formulário", () => {
    const onDone = form.slice(form.indexOf("onDone={() => {"));
    expect(onDone).toContain("setDestroyed(true)");
    expect(onDone).toContain("setDeleteOpen(false)");
    expect(onDone).toContain("onOpenChange(false)");
    expect(onDone).toContain("onAfterDelete?.()");
  });

  it("reabrir o formulário limpa o estado destruído e a consulta", () => {
    expect(form).toContain("setDestroyed(false)");
    expect(form).toContain("setDeleteOpen(false)");
  });

  it("ocorrência de cadastro inativo é sinalizada no modal", () => {
    expect(occurrenceModal).toContain("Cadastro inativo");
  });
});

describe("corte operacional — navegação", () => {
  it("a barra de período trava o mês anterior no início do novo Financeiro", () => {
    expect(periodBar).toContain("FINANCE_TRACKING_START");
    expect(periodBar).toContain("disabled={!canGoBack}");
  });
});

describe("correção em fatura fechada — modal", () => {
  it("valor/câmbio usam a trava monetária e o rótulo de correção", () => {
    expect(occurrenceModal).toContain("readOnly={readOnlyMoney}");
    expect(occurrenceModal).toContain("CLOSED_CORRECTION_SAVE_LABEL");
    expect(occurrenceModal).toContain("buildClosedCorrectionPatch");
  });
});
