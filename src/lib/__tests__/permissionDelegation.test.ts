import { describe, expect, it } from "vitest";
import {
  HOME_PERMISSION_IDS,
  HOME_PERMISSION_ITEMS,
  buildFinanceUpdate,
  buildHomePermissionUpserts,
  canEditPermissions,
  financeGrantableCapabilities,
  resolveHomePermissionState,
} from "@/lib/permissionDelegation";

describe("Início — lista moderna de permissões", () => {
  it("expõe exatamente os 4 cards atuais da Home", () => {
    expect(HOME_PERMISSION_ITEMS.map((i) => i.id)).toEqual([
      "clientes",
      "clientes-sistemas",
      "comercial-sistemas",
      "kanban",
    ]);
  });

  it("não inclui `financeiro` nem ids legados", () => {
    const ids = HOME_PERMISSION_IDS as readonly string[];
    ["financeiro", "schedule", "completed", "dev-hub", "minha-empresa"].forEach((legacy) => {
      expect(ids).not.toContain(legacy);
    });
  });

  it("labels vêm da navegação real (nunca vazios)", () => {
    HOME_PERMISSION_ITEMS.forEach((item) => expect(item.label.length).toBeGreaterThan(0));
  });

  it("estado inicial é permitido por padrão e respeita rows salvas", () => {
    const state = resolveHomePermissionState([{ hub_section: "kanban", can_access: false }]);
    expect(state.kanban).toBe(false);
    expect(state.clientes).toBe(true);
  });

  it("upsert grava somente os ids atuais", () => {
    const rows = buildHomePermissionUpserts("u1", "t1", { kanban: false }, "2026-01-01T00:00:00Z");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.hub_section)).not.toContain("financeiro");
    expect(rows.find((r) => r.hub_section === "kanban")?.can_access).toBe(false);
    expect(rows.find((r) => r.hub_section === "clientes")?.can_access).toBe(true);
  });
});

describe("quem pode editar permissões", () => {
  it("super_admin e agency_admin podem", () => {
    expect(canEditPermissions("super_admin")).toBe(true);
    expect(canEditPermissions("agency_admin")).toBe(true);
  });

  it("gestor e colaborador não podem", () => {
    expect(canEditPermissions("agency_manager")).toBe(false);
    expect(canEditPermissions("agency_user")).toBe(false);
    expect(canEditPermissions(null)).toBe(false);
  });
});

describe("teto de delegação financeira", () => {
  it("super_admin delega full + tools", () => {
    expect(financeGrantableCapabilities("super_admin", "none")).toEqual({
      full: true,
      tools: true,
      any: true,
    });
  });

  it("agency_admin sem acesso não vê nada financeiro", () => {
    expect(financeGrantableCapabilities("agency_admin", "none")).toEqual({
      full: false,
      tools: false,
      any: false,
    });
  });

  it("agency_admin com escopo tools delega só tools", () => {
    expect(financeGrantableCapabilities("agency_admin", "tools")).toEqual({
      full: false,
      tools: true,
      any: true,
    });
  });

  it("agency_admin com escopo full delega ambos", () => {
    expect(financeGrantableCapabilities("agency_admin", "full")).toEqual({
      full: true,
      tools: true,
      any: true,
    });
  });

  it("colaborador não delega nada", () => {
    expect(financeGrantableCapabilities("agency_user", "full").any).toBe(false);
  });
});

describe("payload financeiro preserva campo não delegável", () => {
  const current = { finance_access: true, finance_tools_access: false };

  it("editor tools não sobrescreve full do alvo", () => {
    const payload = buildFinanceUpdate(
      { full: false, tools: true, any: true },
      { finance_access: false, finance_tools_access: true },
      current,
    );
    expect(payload).toEqual({ finance_tools_access: true });
  });

  it("editor full grava ambos quando mudam", () => {
    expect(
      buildFinanceUpdate(
        { full: true, tools: true, any: true },
        { finance_access: false, finance_tools_access: true },
        current,
      ),
    ).toEqual({ finance_access: false, finance_tools_access: true });
  });

  it("sem mudança efetiva não gera update", () => {
    expect(
      buildFinanceUpdate({ full: true, tools: true, any: true }, current, current),
    ).toBeNull();
  });

  it("editor sem escopo nunca gera update financeiro", () => {
    expect(
      buildFinanceUpdate(
        { full: false, tools: false, any: false },
        { finance_access: true, finance_tools_access: true },
        current,
      ),
    ).toBeNull();
  });
});

describe("teto de delegação depende do EDITOR, nunca do alvo", () => {
  it("G: agency_admin sem acesso financeiro não vê/concede Financeiro mesmo se o alvo tem finance_access", () => {
    const grantable = financeGrantableCapabilities("agency_admin", "none");
    expect(grantable).toEqual({ full: false, tools: false, any: false });
    // Visibilidade da seção = grantable.any do editor.
    expect(grantable.any).toBe(false);
    // E nada é gravado, ainda que o alvo já tenha permissões.
    expect(
      buildFinanceUpdate(
        grantable,
        { finance_access: false, finance_tools_access: false },
        { finance_access: true, finance_tools_access: true },
      ),
    ).toBeNull();
  });

  it("o mesmo alvo continua editável por um editor com escopo completo", () => {
    const grantable = financeGrantableCapabilities("agency_admin", "full");
    expect(grantable.any).toBe(true);
  });
});
