import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({}) }), auth: { getUser: async () => ({ data: {} }) } },
}));

import {
  classifyNextAction,
  countQuickFilters,
  sortOpportunities,
  type OpportunityRow,
} from "./systemsCommercial";
import {
  hasMigrationAvailable,
  isFinalStage,
  normalizeCurrentSystem,
  stageLabel,
  type SystemsClient,
} from "./systemsClients";

const NOW = new Date("2026-08-20T15:00:00.000Z");

function client(partial: Partial<SystemsClient> & { name: string }): SystemsClient {
  return {
    id: partial.name,
    tenant_id: "t",
    parent_company_id: "p",
    name: partial.name,
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
    lifecycle: "prospect",
    commercial_stage: "contato",
    segment: null,
    current_system: null,
    address: null,
    commercial_owner_id: null,
    next_action: null,
    next_action_at: null,
    last_contact_result: null,
    loss_reason: null,
    lead_source: null,
    acquisition_campaign_id: null,
    ...partial,
  };
}

describe("normalizeCurrentSystem / hasMigrationAvailable", () => {
  it("normaliza acentos, caixa e separadores", () => {
    expect(normalizeCurrentSystem(" Simples Vet ")).toBe("simplesvet");
    expect(normalizeCurrentSystem("SIMPLES-VET")).toBe("simplesvet");
    expect(normalizeCurrentSystem("Símplesvét")).toBe("simplesvet");
    expect(normalizeCurrentSystem(null)).toBe("");
  });

  it("badge de migração somente para SimplesVet", () => {
    expect(hasMigrationAvailable("SimplesVet")).toBe(true);
    expect(hasMigrationAvailable("simples vet")).toBe(true);
    expect(hasMigrationAvailable("VetSoft")).toBe(false);
    expect(hasMigrationAvailable(null)).toBe(false);
    expect(hasMigrationAvailable("")).toBe(false);
  });
});

describe("classifyNextAction", () => {
  it("etapa final nunca entra na fila operacional", () => {
    expect(classifyNextAction(client({ name: "a", commercial_stage: "ganho" }), NOW)).toBe("final");
    expect(classifyNextAction(client({ name: "a", commercial_stage: "perdido" }), NOW)).toBe("final");
    expect(classifyNextAction(client({ name: "a", commercial_stage: "pausado" }), NOW)).toBe("final");
  });

  it("sem data => sem próxima ação", () => {
    expect(classifyNextAction(client({ name: "a", next_action_at: null }), NOW)).toBe("sem_acao");
  });

  it("data passada => atrasado; ainda hoje => hoje; futuro => futuro", () => {
    expect(
      classifyNextAction(client({ name: "a", next_action_at: "2026-08-19T10:00:00Z" }), NOW),
    ).toBe("atrasado");
    expect(
      classifyNextAction(client({ name: "a", next_action_at: "2026-08-20T14:00:00Z" }), NOW),
    ).toBe("atrasado");
    expect(
      classifyNextAction(client({ name: "a", next_action_at: "2026-08-20T18:00:00Z" }), NOW),
    ).toBe("hoje");
    expect(
      classifyNextAction(client({ name: "a", next_action_at: "2026-08-25T09:00:00Z" }), NOW),
    ).toBe("futuro");
  });

  it("data inválida cai em sem_acao", () => {
    expect(classifyNextAction(client({ name: "a", next_action_at: "xx" }), NOW)).toBe("sem_acao");
  });
});

describe("sortOpportunities", () => {
  it("atrasados antigos primeiro, então hoje pela hora, futuros, sem ação e finais", () => {
    const rows: OpportunityRow[] = [
      { client: client({ name: "Sem" }), lastTouch: null, bucket: "sem_acao" },
      {
        client: client({ name: "Final", commercial_stage: "pausado" }),
        lastTouch: null,
        bucket: "final",
      },
      {
        client: client({ name: "HojeTarde", next_action_at: "2026-08-20T20:00:00Z" }),
        lastTouch: null,
        bucket: "hoje",
      },
      {
        client: client({ name: "AtrasoNovo", next_action_at: "2026-08-19T10:00:00Z" }),
        lastTouch: null,
        bucket: "atrasado",
      },
      {
        client: client({ name: "Futuro", next_action_at: "2026-09-01T10:00:00Z" }),
        lastTouch: null,
        bucket: "futuro",
      },
      {
        client: client({ name: "AtrasoAntigo", next_action_at: "2026-07-01T10:00:00Z" }),
        lastTouch: null,
        bucket: "atrasado",
      },
      {
        client: client({ name: "HojeCedo", next_action_at: "2026-08-20T17:00:00Z" }),
        lastTouch: null,
        bucket: "hoje",
      },
    ];
    expect(sortOpportunities(rows).map((r) => r.client.name)).toEqual([
      "AtrasoAntigo",
      "AtrasoNovo",
      "HojeCedo",
      "HojeTarde",
      "Futuro",
      "Sem",
      "Final",
    ]);
  });
});

describe("countQuickFilters", () => {
  it("conta buckets e etapas", () => {
    const rows: OpportunityRow[] = [
      { client: client({ name: "a" }), lastTouch: null, bucket: "atrasado" },
      { client: client({ name: "b" }), lastTouch: null, bucket: "hoje" },
      { client: client({ name: "c" }), lastTouch: null, bucket: "sem_acao" },
      {
        client: client({ name: "d", commercial_stage: "avaliacao" }),
        lastTouch: null,
        bucket: "sem_acao",
      },
      {
        client: client({ name: "e", commercial_stage: "negociacao" }),
        lastTouch: null,
        bucket: "futuro",
      },
    ];
    const c = countQuickFilters(rows);
    expect(c.atrasados).toBe(1);
    expect(c.hoje).toBe(1);
    expect(c.semAcao).toBe(2);
    expect(c.avaliacao).toBe(1);
    expect(c.negociacao).toBe(1);
  });
});

describe("labels e etapas finais", () => {
  it("labels em português", () => {
    expect(stageLabel("demonstracao")).toBe("Demonstração");
    expect(stageLabel("avaliacao")).toBe("Avaliação");
    expect(stageLabel(null)).toBe("—");
  });

  it("etapas finais", () => {
    expect(isFinalStage("ganho")).toBe(true);
    expect(isFinalStage("contato")).toBe(false);
    expect(isFinalStage(null)).toBe(false);
  });
});
