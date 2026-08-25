import { describe, expect, it } from "vitest";
import { buildOperationalCollaborators } from "@/lib/operationalCollaborators";

const EMPTY = new Set<string>();

const base = {
  activeDispatchIds: EMPTY,
  today: "2026-01-10",
};

describe("buildOperationalCollaborators", () => {
  it("A: super_admin com função operacional aparece em display e assignable", () => {
    const res = buildOperationalCollaborators({
      ...base,
      roleRows: [{ user_id: "u-super", role: "super_admin" }],
      functionRows: [{ user_id: "u-super", function_key: "revisar", work_area: "midia", allowed: true }],
      profiles: [{ id: "u-super", full_name: "Henrique" }],
      demandRows: [],
    });
    expect(res.collaborators.map((c) => c.userId)).toEqual(["u-super"]);
    expect(res.assignable.map((c) => c.userId)).toEqual(["u-super"]);
    expect(res.members.map((c) => c.userId)).toEqual(["u-super"]);
  });

  it("B: agency_user sem função operacional não é assignable nem coluna", () => {
    const res = buildOperationalCollaborators({
      ...base,
      roleRows: [{ user_id: "u-empty", role: "agency_user" }],
      functionRows: [],
      profiles: [{ id: "u-empty", full_name: "D'Thales Mídia" }],
      demandRows: [],
    });
    expect(res.collaborators).toHaveLength(0);
    expect(res.assignable).toHaveLength(0);
    // continua visível nas telas de configuração (para receber a 1ª função)
    expect(res.members.map((c) => c.userId)).toEqual(["u-empty"]);
  });

  it("C: sem função mas com cards ativos fica visível como legado, nunca assignable", () => {
    const res = buildOperationalCollaborators({
      ...base,
      roleRows: [{ user_id: "u-legacy", role: "agency_user" }],
      functionRows: [],
      profiles: [{ id: "u-legacy", full_name: "Legado" }],
      demandRows: [{ id: "d1", assigned_to: "u-legacy", archived_at: null, is_draft: false }],
    });
    expect(res.collaborators.map((c) => c.userId)).toEqual(["u-legacy"]);
    expect(res.collaborators[0].legacyOnly).toBe(true);
    expect(res.collaborators[0].hasOperationalFunction).toBe(false);
    expect(res.assignable).toHaveLength(0);
    expect(res.collaborators[0].operationalDemandCount).toBe(1);
  });

  it("D: cenário Henrique x D'Thales resolvido pelas funções, não pelo papel", () => {
    const res = buildOperationalCollaborators({
      ...base,
      roleRows: [
        { user_id: "henrique", role: "super_admin" },
        { user_id: "dthales", role: "agency_user" },
      ],
      functionRows: [
        { user_id: "henrique", function_key: "criar_arte", work_area: "midia", allowed: true },
        { user_id: "henrique", function_key: "testar", work_area: "sistemas", allowed: true },
      ],
      profiles: [
        { id: "henrique", full_name: "Henrique" },
        { id: "dthales", full_name: "D'Thales Mídia" },
      ],
      demandRows: [{ id: "d1", assigned_to: "henrique", archived_at: null, is_draft: false }],
    });
    expect(res.assignable.map((c) => c.userId)).toEqual(["henrique"]);
    expect(res.collaborators.map((c) => c.userId)).toEqual(["henrique"]);
    expect(res.collaborators[0].workAreas).toEqual(["midia", "sistemas"]);
    expect(res.members.map((c) => c.userId).sort()).toEqual(["dthales", "henrique"]);
  });

  it("ignora funções com allowed = false", () => {
    const res = buildOperationalCollaborators({
      ...base,
      roleRows: [{ user_id: "u1", role: "agency_user" }],
      functionRows: [{ user_id: "u1", function_key: "revisar", work_area: "midia", allowed: false }],
      profiles: [{ id: "u1", full_name: "Sem função" }],
      demandRows: [],
    });
    expect(res.assignable).toHaveLength(0);
  });
});
