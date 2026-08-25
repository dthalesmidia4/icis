import { describe, expect, it } from "vitest";
import {
  FINANCE_VIEWS,
  allowedCostCentersForScope,
  allowedKindsForScope,
  financeScopeFlags,
  isFinanceViewAllowed,
  isKindAllowedForScope,
  parseFinanceScope,
  resolveFinanceView,
} from "@/lib/financeScope";

describe("parseFinanceScope", () => {
  it("aceita apenas full e tools", () => {
    expect(parseFinanceScope("full")).toBe("full");
    expect(parseFinanceScope("tools")).toBe("tools");
  });

  it("fail closed em payload inesperado", () => {
    for (const value of [null, undefined, "", "admin", 1, {}]) {
      expect(parseFinanceScope(value)).toBe("none");
    }
  });
});

describe("financeScopeFlags", () => {
  it("full pode tudo", () => {
    const f = financeScopeFlags("full");
    expect(f).toMatchObject({
      canAccessFinance: true,
      canAccessFullFinance: true,
      canAccessTools: true,
    });
  });

  it("tools entra no módulo mas não no financeiro completo", () => {
    const f = financeScopeFlags("tools");
    expect(f).toMatchObject({
      canAccessFinance: true,
      canAccessFullFinance: false,
      canAccessTools: true,
    });
  });

  it("none bloqueia o Financeiro", () => {
    const f = financeScopeFlags("none");
    expect(f).toMatchObject({
      canAccessFinance: false,
      canAccessFullFinance: false,
      canAccessTools: false,
    });
  });
});

describe("isFinanceViewAllowed", () => {
  it("A. full pode todas as views", () => {
    for (const view of FINANCE_VIEWS) expect(isFinanceViewAllowed("full", view)).toBe(true);
  });

  it("B/E. tools só pode assinaturas — nunca overview/cards/settings", () => {
    expect(isFinanceViewAllowed("tools", "subscriptions")).toBe(true);
    for (const view of FINANCE_VIEWS.filter((v) => v !== "subscriptions")) {
      expect(isFinanceViewAllowed("tools", view)).toBe(false);
    }
  });

  it("C. none não pode nada", () => {
    for (const view of FINANCE_VIEWS) expect(isFinanceViewAllowed("none", view)).toBe(false);
  });
});

describe("resolveFinanceView", () => {
  it("B. tools cai sempre em subscriptions, mesmo forçando a URL", () => {
    for (const requested of ["overview", "composition", "accounts", "cards", "settings", "lixo", null]) {
      expect(resolveFinanceView("tools", requested)).toBe("subscriptions");
    }
  });

  it("full respeita a URL e cai em overview quando inválida", () => {
    expect(resolveFinanceView("full", "cards")).toBe("cards");
    expect(resolveFinanceView("full", "lixo")).toBe("overview");
    expect(resolveFinanceView("full", null)).toBe("overview");
  });
});

describe("N. cadastro no escopo tools", () => {
  it("não permite despesa administrativa", () => {
    expect(allowedCostCentersForScope("tools")).not.toContain("administrativo");
    expect(allowedCostCentersForScope("full")).toContain("administrativo");
  });

  it("não permite kind expense nem card", () => {
    expect(isKindAllowedForScope("tools", "expense")).toBe(false);
    expect(isKindAllowedForScope("tools", "card")).toBe(false);
    expect(allowedKindsForScope("tools")).toEqual(["tool", "package", "included_resource"]);
    expect(isKindAllowedForScope("full", "card")).toBe(true);
  });
});
