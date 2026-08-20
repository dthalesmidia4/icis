import { describe, expect, it } from "vitest";
import {
  buildSubclientOptions,
  clearActiveSelection,
  legacyContextBadge,
  toggleSubclient,
  selectedLabelNames,
} from "./subclientSelection";
import type { SystemsClient } from "./systemsClients";

function client(p: Partial<SystemsClient> & { id: string; name: string }): SystemsClient {
  return {
    tenant_id: "t",
    parent_company_id: "p",
    contact_name: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    plan: null,
    notes: null,
    contact_cadence_days: 30,
    status: "ativo",
    onboarded_at: null,
    created_at: "",
    updated_at: "",
    lifecycle: "customer",
    commercial_stage: null,
    segment: null,
    current_system: null,
    address: null,
    commercial_owner_id: null,
    next_action: null,
    next_action_at: null,
    last_contact_result: null,
    loss_reason: null,
    lead_source: null,
    ...p,
  } as SystemsClient;
}

const ativo = client({ id: "a", name: "Bellotti" });
const ativo2 = client({ id: "b", name: "LEAL" });
const prospect = client({ id: "p1", name: "Pontes Gestal", lifecycle: "prospect", commercial_stage: "avaliacao" });
const pausado = client({ id: "c1", name: "VivaPet", status: "pausado" });
const cancelado = client({ id: "c2", name: "Antigo", status: "cancelado" });

describe("buildSubclientOptions", () => {
  it("clientes ativos são selecionáveis", () => {
    const opts = buildSubclientOptions([ativo, ativo2], [], []);
    expect(opts.map((o) => o.id)).toEqual(["a", "b"]);
    expect(opts.every((o) => o.selectable && !o.legacy)).toBe(true);
  });

  it("prospect vinculado aparece como histórico não selecionável", () => {
    const opts = buildSubclientOptions([ativo], [prospect], ["p1"]);
    const legacy = opts.find((o) => o.id === "p1")!;
    expect(legacy.selectable).toBe(false);
    expect(legacy.legacy).toBe(true);
    expect(legacy.contextBadge).toBe("Oportunidade");
  });

  it("customer pausado/cancelado vinculado aparece como histórico", () => {
    const opts = buildSubclientOptions([ativo], [pausado, cancelado], ["c1", "c2"]);
    expect(opts.find((o) => o.id === "c1")!.contextBadge).toBe("Pausado");
    expect(opts.find((o) => o.id === "c2")!.contextBadge).toBe("Cancelado");
  });

  it("não duplica um ativo que também vem em linkedRecords", () => {
    const opts = buildSubclientOptions([ativo], [ativo], ["a"]);
    expect(opts.filter((o) => o.id === "a")).toHaveLength(1);
  });
});

describe("toggleSubclient / clearActiveSelection", () => {
  const opts = buildSubclientOptions([ativo, ativo2], [prospect], ["p1", "a"]);

  it("histórico permanece ao alterar seleção ativa", () => {
    const next = toggleSubclient(opts, ["p1", "a"], "b");
    expect(next).toContain("p1");
    expect(next).toContain("b");
    const off = toggleSubclient(opts, ["p1", "a"], "a");
    expect(off).toEqual(["p1"]);
  });

  it("histórico não pode ser alternado", () => {
    expect(toggleSubclient(opts, ["p1", "a"], "p1")).toEqual(["p1", "a"]);
  });

  it("limpar seleção preserva histórico", () => {
    expect(clearActiveSelection(opts, ["p1", "a", "b"])).toEqual(["p1"]);
  });

  it("label usa ativos e históricos", () => {
    expect(selectedLabelNames(opts, ["p1", "a"])).toEqual(["Pontes Gestal", "Bellotti"]);
  });
});

describe("legacyContextBadge", () => {
  it("cobre lifecycle e status", () => {
    expect(legacyContextBadge(prospect)).toBe("Oportunidade");
    expect(legacyContextBadge(pausado)).toBe("Pausado");
    expect(legacyContextBadge(cancelado)).toBe("Cancelado");
  });
});
