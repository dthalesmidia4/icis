import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  countAssignedCards,
  isAssignedToUser,
  resolveInitialOverviewFocus,
  shouldExitEmptyOwnFocus,
} from "./overviewFocus";
import { filterMainMenuItems } from "@/components/AppSidebar";

const U = "user-1";

describe("resolveInitialOverviewFocus", () => {
  it("E. colaborador com 0 cards atribuídos → visão completa", () => {
    expect(
      resolveInitialOverviewFocus({ canManageQueue: false, userId: U, cards: [{ assigned_to: "other" }] })
    ).toBeNull();
  });

  it("F. colaborador com 1 card atribuído → foca a própria coluna", () => {
    expect(
      resolveInitialOverviewFocus({ canManageQueue: false, userId: U, cards: [{ assigned_to: U }] })
    ).toBe(U);
  });

  it("G. additional_assignees conta como atribuído", () => {
    expect(isAssignedToUser({ assigned_to: "x", additional_assignees: [U] }, U)).toBe(true);
    expect(
      resolveInitialOverviewFocus({
        canManageQueue: false,
        userId: U,
        cards: [{ assigned_to: "x", additional_assignees: [U] }],
      })
    ).toBe(U);
    expect(countAssignedCards([{ additional_assignees: [U] }, { assigned_to: U }], U)).toBe(2);
  });

  it("H. gestor/admin → visão completa independente dos cards", () => {
    expect(
      resolveInitialOverviewFocus({ canManageQueue: true, userId: U, cards: [{ assigned_to: U }] })
    ).toBeNull();
  });

  it("sem usuário → visão completa", () => {
    expect(resolveInitialOverviewFocus({ canManageQueue: false, userId: null, cards: [] })).toBeNull();
  });
});

describe("shouldExitEmptyOwnFocus", () => {
  const base = { focusedColumnId: U, canManageQueue: false, userId: U, isSearching: false, visibleCards: [] as any[] };

  it("I. foco próprio que ficou vazio → sai do foco", () => {
    expect(shouldExitEmptyOwnFocus(base)).toBe(true);
  });

  it("mantém foco quando ainda há cards", () => {
    expect(shouldExitEmptyOwnFocus({ ...base, visibleCards: [{ assigned_to: U }] })).toBe(false);
  });

  it("J. busca ativa não altera o foco", () => {
    expect(shouldExitEmptyOwnFocus({ ...base, isSearching: true })).toBe(false);
  });

  it("não desfaz foco manual de gestor em coluna alheia", () => {
    expect(shouldExitEmptyOwnFocus({ ...base, canManageQueue: true, focusedColumnId: "other" })).toBe(false);
    expect(shouldExitEmptyOwnFocus({ ...base, focusedColumnId: "other" })).toBe(false);
  });
});

describe("sidebar finance item", () => {
  const items = [
    { title: "Minha Empresa", requiresAgency: true },
    { title: "Financeiro", requiresFinanceAccess: true },
    { title: "Configurações" },
  ];

  it("A. sem acesso ao financeiro → não lista Financeiro", () => {
    const out = filterMainMenuItems(items, { agencyId: "t1", financeCanAccess: false, financeLoading: false });
    expect(out.map((i) => i.title)).toEqual(["Minha Empresa", "Configurações"]);
  });

  it("B. com acesso → lista Financeiro", () => {
    const out = filterMainMenuItems(items, { agencyId: "t1", financeCanAccess: true, financeLoading: false });
    expect(out.map((i) => i.title)).toContain("Financeiro");
  });

  it("fail closed enquanto carrega", () => {
    const out = filterMainMenuItems(items, { agencyId: "t1", financeCanAccess: true, financeLoading: true });
    expect(out.map((i) => i.title)).not.toContain("Financeiro");
  });

  it("Minha Empresa segue dependendo da agência", () => {
    const out = filterMainMenuItems(items, { agencyId: null, financeCanAccess: true, financeLoading: false });
    expect(out.map((i) => i.title)).toEqual(["Financeiro", "Configurações"]);
  });
});

describe("wiring", () => {
  it("C/D. rota /financeiro passa pelo guard de acesso financeiro", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("RequireFinanceAccess");
    const idx = app.indexOf('path="/financeiro"');
    expect(app.slice(idx, idx + 400)).toContain("<RequireFinanceAccess>");
  });

  it("guard usa a RPC has_finance_access via useFinanceAccess", () => {
    const guard = readFileSync("src/components/RequireFinanceAccess.tsx", "utf8");
    expect(guard).toContain("useFinanceAccess");
    expect(guard).toContain('Navigate to="/home"');
    const hook = readFileSync("src/hooks/useFinanceAccess.tsx", "utf8");
    expect(hook).toContain("has_finance_access");
  });

  it("sidebar desktop e mobile usam o filtro de acesso", () => {
    const sidebar = readFileSync("src/components/AppSidebar.tsx", "utf8");
    expect(sidebar.match(/filterMainMenuItems\(mainMenuItems/g)?.length).toBe(2);
    expect(sidebar.match(/useFinanceAccess\(\)/g)?.length).toBe(2);
  });

  it("Visão Geral usa o helper puro de foco inicial", () => {
    const page = readFileSync("src/pages/KanbanCentralPage.tsx", "utf8");
    expect(page).toContain("resolveInitialOverviewFocus({");
    expect(page).toContain("shouldExitEmptyOwnFocus({");
    expect(page).not.toContain("setFocusedColumnId(canManageQueue ? null : authUser.id)");
  });
});
