import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { mapWorkspacePayload } from "@/lib/systemsCommercialWorkspaceData";
import { mapFlowUiContext } from "@/lib/flowUiContext";

const read = (p: string) => readFileSync(p, "utf8");
const taskCard = read("src/components/TaskCard.tsx");
const stageRouting = read("src/lib/stageRouting.ts");
const popover = read("src/components/kanban/StageQuickChangePopover.tsx");
const typeStageChange = read("src/lib/typeStageChange.ts");

describe("workspace comercial · payload único", () => {
  it("mapeia o payload do RPC em uma estrutura pronta para a tela", () => {
    const data = mapWorkspacePayload({
      companies: [{ id: "c1", name: "SmartVety" }],
      prospects: [{ id: "p1", name: "VivaPet" }],
      customers: [{ id: "u1", name: "LEAL" }],
      campaigns: [{ id: "k1", channels: null }],
      markets: [{ id: "m1", market_type: "base", channels: null }],
      last_touches: [
        { subclient_id: "p1", touchpoint_type: "ligacao", occurred_at: "2026-08-01T10:00:00Z" },
      ],
      touchpoints: [
        { subclient_id: "p1", touchpoint_type: "ligacao", occurred_at: "2026-08-01T10:00:00Z" },
      ],
    });
    expect(data.companies).toHaveLength(1);
    expect(data.prospects[0].id).toBe("p1");
    expect(data.customers[0].id).toBe("u1");
    expect(data.campaigns[0].channels).toEqual([]);
    expect(data.markets[0].status).toBe("planning");
    expect(data.lastTouches.get("p1")?.type).toBe("ligacao");
    expect(data.touchpoints).toHaveLength(1);
  });

  it("payload vazio não quebra a tela", () => {
    const empty = mapWorkspacePayload(null);
    expect(empty.prospects).toEqual([]);
    expect(empty.lastTouches.size).toBe(0);
  });
});

describe("contexto de fluxo do card", () => {
  it("deriva nomes de etapa em uma única leitura", () => {
    const ctx = mapFlowUiContext({
      demand: { id: "d1" },
      flow_functions: [{ function_key: "criar_arte", name: "Criar arte", position: 1 }],
      rules: [],
      assignments: [{ user_id: "u1", function_key: "criar_arte", allowed: true }],
      profiles: [{ id: "u1", full_name: "Ana" }],
      history: [],
    });
    expect(ctx.functionNames.criar_arte).toBe("Criar arte");
    expect(ctx.assignments).toHaveLength(1);
    expect(ctx.profiles[0].full_name).toBe("Ana");
  });
});

describe("round-trips cortados", () => {
  it("Prosseguir nunca é bloqueado pela prévia de roteamento", () => {
    expect(taskCard).not.toContain("disabled={proceeding || previewPending");
    expect(taskCard).toContain("disabled={proceeding || !card.demand_type_key}");
  });

  it("elegibilidade é carregada UMA vez e o nome da etapa é derivado localmente", () => {
    expect(taskCard.match(/await listEligibleAssignees\(/g) || []).toHaveLength(1);
    expect(taskCard).toContain("const draftAssigneeResolution = useMemo(");
    expect(taskCard).toContain("const eligibleAssignees = useMemo(");
  });

  it("sequência do pipeline resolve também a última etapa", () => {
    expect(taskCard).not.toContain("isAtLastFlowFunction(card.tenant_id");
    expect(taskCard).toContain("getPipelineSequence(card.tenant_id");
  });

  it("nomes das etapas vêm do contexto único com invalidação após transição", () => {
    expect(taskCard).toContain("loadFlowUiContext({");
    expect(taskCard).toContain("invalidateFlowUiContext(");
  });

  it("candidatos de etapa vêm de UMA RPC", () => {
    expect(stageRouting).toContain('rpc("get_stage_routing_candidates_v1"');
    expect(stageRouting).not.toContain('from("collaborator_function_assignments")');
  });

  it("troca manual de etapa reaproveita os grupos já validados", () => {
    expect(popover).toContain("validatedGroups: groups");
    expect(typeStageChange).toContain("params.validatedGroups ??");
  });
});
