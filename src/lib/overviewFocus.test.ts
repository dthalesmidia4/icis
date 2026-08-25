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

  it("C. guard bloqueia scope none usando a RPC finance_access_scope", () => {
    const guard = readFileSync("src/components/RequireFinanceAccess.tsx", "utf8");
    expect(guard).toContain("useFinanceAccessScope");
    expect(guard).toContain("canAccessFinance");
    expect(guard).toContain('Navigate to="/home"');
    const hook = readFileSync("src/hooks/useFinanceAccessScope.tsx", "utf8");
    expect(hook).toContain("finance_access_scope");
  });

  it("D. sidebar desktop e mobile mostram Financeiro para full/tools e ocultam none/loading", () => {
    const sidebar = readFileSync("src/components/AppSidebar.tsx", "utf8");
    expect(sidebar.match(/filterMainMenuItems\(mainMenuItems/g)?.length).toBe(2);
    expect(sidebar.match(/useFinanceAccessScope\(\)/g)?.length).toBe(2);
    expect(sidebar).toContain("canAccessFinance: financeCanAccess");
    // fail closed: enquanto carrega, o item não aparece
    expect(sidebar).toContain("opts.financeLoading || !opts.financeCanAccess");
  });

  it("B/O. escopo tools entra no cockpit restrito e a senha continua exigida", () => {
    const page = readFileSync("src/pages/Financial.tsx", "utf8");
    // senha SÓ para o escopo full; tools abre o cockpit restrito sem gate.
    expect(page).toContain("<FinanceAccessGate>");
    expect(page).toContain("if (canAccessFullFinance)");
    expect(page).toContain("return <FinanceToolsCockpit />");
    expect(page).not.toContain("finance_password_status");
    const tools = readFileSync("src/components/finance/FinanceToolsCockpit.tsx", "utf8");
    // nada de orçamento, fatura ou despesa administrativa no escopo restrito
    expect(tools).not.toContain("monthly_budget");
    expect(tools).not.toContain("StatementPanel");
    expect(tools).toContain('scope="tools"');
    const hook = readFileSync("src/hooks/useFinanceTools.tsx", "utf8");
    expect(hook).toContain("list_finance_safe_cards");
    expect(hook).not.toContain('from("tenants")');
    expect(hook).not.toContain("card_limit_brl");
  });

  it("Visão Geral usa o helper puro de foco inicial", () => {
    const page = readFileSync("src/pages/KanbanCentralPage.tsx", "utf8");
    expect(page).toContain("resolveInitialOverviewFocus({");
    expect(page).toContain("shouldExitEmptyOwnFocus({");
    expect(page).not.toContain("setFocusedColumnId(canManageQueue ? null : authUser.id)");
  });
});
