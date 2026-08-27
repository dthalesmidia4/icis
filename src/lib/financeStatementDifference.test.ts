import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildStatementConference } from "./financeIof";
import {
  interpretStatementCompositionDifference,
  interpretStatementPayment,
} from "./financeStatementDifference";

describe("interpretStatementCompositionDifference", () => {
  it("fatura Itaú ago/2026: lançamentos somam mais que o total => crédito/estorno", () => {
    const conf = buildStatementConference({
      statementBrl: 3809.25,
      componentsBrl: 3724.89,
      iofBrl: 103.11,
      paidBrl: 3809.25,
    });
    // FÓRMULA INALTERADA: total - compras - IOF
    expect(conf.classifiedBrl).toBe(3828);
    expect(conf.unclassifiedBrl).toBe(-18.75);

    const reading = interpretStatementCompositionDifference(conf.unclassifiedBrl);
    expect(reading.state).toBe("credit_or_adjustment");
    expect(reading.absoluteBrl).toBe(18.75);
    expect(reading.absoluteBrl).toBeGreaterThan(0);
    expect(reading.title).toContain("créditos, estornos ou abatimentos");
    expect(reading.title).not.toContain("-");
    expect(reading.description).toContain("Não significa que você esteja devendo");
    expect(reading.description).toContain("nem que tenha pago a mais");
    expect(reading.label).not.toBe("Diferença");
    expect(`${reading.title} ${reading.description} ${reading.label}`.toLowerCase()).not.toContain(
      "saldo para próxima fatura",
    );
  });

  it("diferença positiva => falta cobrança a registrar", () => {
    const reading = interpretStatementCompositionDifference(42.5);
    expect(reading.state).toBe("missing_charge");
    expect(reading.absoluteBrl).toBe(42.5);
    expect(reading.title).toContain("Faltam");
    expect(reading.description).toContain("tarifa");
  });

  it("zero => composição conciliada", () => {
    const reading = interpretStatementCompositionDifference(0);
    expect(reading.state).toBe("balanced");
    expect(reading.absoluteBrl).toBe(0);
    expect(reading.title).toBe("Composição conciliada");
    expect(reading.description).toContain("Tudo explicado pelos lançamentos");
  });

  it("nulo é tratado como conciliado (sem número cru)", () => {
    expect(interpretStatementCompositionDifference(null).state).toBe("balanced");
  });
});

describe("interpretStatementPayment", () => {
  it("pagamento igual ao total => conciliado com diferença zero", () => {
    const payment = interpretStatementPayment({
      paid: true,
      statementBrl: 3809.25,
      paidBrl: 3809.25,
    });
    expect(payment.state).toBe("reconciled");
    expect(payment.differenceBrl).toBe(0);
    expect(payment.situationLabel).toBe("Quitada");
    expect(payment.message).toContain("Pagamento conciliado");
    expect(payment.message).toContain("R$ 0,00");
  });

  it("pagamento divergente NÃO usa a diferença da composição", () => {
    const payment = interpretStatementPayment({ paid: true, statementBrl: 3809.25, paidBrl: 3800 });
    expect(payment.state).toBe("mismatch");
    expect(payment.differenceBrl).toBe(-9.25);
    expect(payment.message).not.toContain("18,75");
  });

  it("fatura não paga", () => {
    const payment = interpretStatementPayment({ paid: false, statementBrl: 100, paidBrl: null });
    expect(payment.state).toBe("not_paid");
    expect(payment.situationLabel).toBe("Em aberto");
  });
});

describe("telas de conferência", () => {
  const files = [
    "src/components/finance/StatementClosureModal.tsx",
    "src/components/finance/PayStatementModal.tsx",
    "src/components/finance/StatementPanel.tsx",
  ];

  it("não exibem rótulo genérico de diferença nem saldo para próxima fatura", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toContain("Diferença ainda a classificar");
      expect(src).not.toContain("Diferença a classificar");
      expect(src.toLowerCase()).not.toContain("saldo para próxima fatura");
      // nunca renderiza o valor com sinal cru da composição
      expect(src).not.toContain("formatBRL(conference.unclassifiedBrl)");
      expect(src).not.toContain("formatBRL(group.difference)");
    }
  });

  it("usam o helper central de interpretação", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).toContain("interpretStatementCompositionDifference");
    }
  });
});
