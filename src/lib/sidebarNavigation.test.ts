import { describe, expect, it } from "vitest";
import { isSidebarNavigationLoading, resolveSidebarNavigation } from "./sidebarNavigation";

const items = [
  { title: "Minha Empresa", requiresAgency: true },
  { title: "Financeiro", requiresFinanceAccess: true },
  { title: "Configurações" },
];

describe("resolveSidebarNavigation", () => {
  it("não renderiza nenhum item real enquanto o financeiro carrega", () => {
    const r = resolveSidebarNavigation(items, {
      agencyId: "t1",
      financeCanAccess: true,
      financeLoading: true,
      roleLoading: false,
      canAccessAdmin: true,
    });
    expect(r.loading).toBe(true);
    expect(r.mainItems).toEqual([]);
    expect(r.showDeveloper).toBe(false);
    expect(r.placeholderCount).toBeGreaterThan(0);
  });

  it("não renderiza nenhum item real enquanto o papel carrega", () => {
    const r = resolveSidebarNavigation(items, {
      agencyId: "t1",
      financeCanAccess: false,
      financeLoading: false,
      roleLoading: true,
      canAccessAdmin: true,
    });
    expect(r.loading).toBe(true);
    expect(r.mainItems).toEqual([]);
    expect(r.showDeveloper).toBe(false);
  });

  it("com tudo resolvido e acesso, entrega o conjunto completo de uma vez", () => {
    const r = resolveSidebarNavigation(items, {
      agencyId: "t1",
      financeCanAccess: true,
      financeLoading: false,
      roleLoading: false,
      canAccessAdmin: true,
    });
    expect(r.loading).toBe(false);
    expect(r.mainItems.map((i) => i.title)).toEqual([
      "Minha Empresa",
      "Financeiro",
      "Configurações",
    ]);
    expect(r.showDeveloper).toBe(true);
  });

  it("sem acesso financeiro, conjunto final sai sem Financeiro", () => {
    const r = resolveSidebarNavigation(items, {
      agencyId: null,
      financeCanAccess: false,
      financeLoading: false,
      roleLoading: false,
      canAccessAdmin: false,
    });
    expect(r.mainItems.map((i) => i.title)).toEqual(["Configurações"]);
    expect(r.showDeveloper).toBe(false);
  });

  it("isSidebarNavigationLoading combina os dois carregamentos", () => {
    expect(isSidebarNavigationLoading({ financeLoading: false, roleLoading: false })).toBe(false);
    expect(isSidebarNavigationLoading({ financeLoading: true, roleLoading: false })).toBe(true);
    expect(isSidebarNavigationLoading({ financeLoading: false, roleLoading: true })).toBe(true);
  });
});
