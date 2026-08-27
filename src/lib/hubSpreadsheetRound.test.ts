import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { budgetFromAvailable } from "@/lib/paidMediaPlanning";
import { nextExpansionSequenceOrder } from "@/lib/expansionMarkets";
import {
  SITUATION_OPTIONS,
  resolveSituationInlineChange,
} from "@/lib/commercialInlineStage";

const read = (p: string) => readFileSync(p, "utf8");
const paidMedia = read("src/components/client-hub/PaidMediaTab.tsx");
const commercial = read("src/components/systems-commercial/SystemsCommercialWorkspace.tsx");
const clientHub = read("src/pages/ClientHub.tsx");

describe("Mídia paga — saldo editável", () => {
  it("editar Disponível=500 com alocado=200 grava verba 700", () => {
    expect(budgetFromAvailable(500, 200)).toBe(700);
  });

  it("saldo indefinido não vira zero", () => {
    expect(budgetFromAvailable(null, 200)).toBeNull();
  });

  it("tabela principal não tem colunas de verba/alocado nem botão Editar verba", () => {
    expect(paidMedia).not.toContain("Editar verba");
    expect(paidMedia).not.toContain("PlaceFormModal");
    expect(paidMedia).toContain("budgetFromAvailable");
  });

  it("nova cidade nasce como linha com status de mídia pending", () => {
    expect(paidMedia).toContain("Adicionar cidade");
    expect(paidMedia).toContain('marketType: "expansion"');
    expect(paidMedia).toContain("nextExpansionSequenceOrder");
    expect(paidMedia).toContain("paidMediaStatusOverride");
    expect(paidMedia).not.toContain("Automático");
  });

  it("próxima sequência ignora a base", () => {
    const markets = [
      { market_type: "base", sequence_order: 99 },
      { market_type: "expansion", sequence_order: 3 },
    ] as any;
    expect(nextExpansionSequenceOrder(markets)).toBe(4);
  });
});

describe("Comercial — situação e criação inline", () => {
  it("prospect → cliente usa conversão canônica", () => {
    expect(resolveSituationInlineChange({ lifecycle: "prospect" }, "customer")).toEqual({
      kind: "convert-won",
    });
  });

  it("cliente → oportunidade usa reabertura canônica", () => {
    expect(resolveSituationInlineChange({ lifecycle: "customer" }, "prospect")).toEqual({
      kind: "reopen",
    });
  });

  it("mesmo valor não faz nada", () => {
    expect(resolveSituationInlineChange({ lifecycle: "customer" }, "customer")).toEqual({
      kind: "noop",
    });
    expect(SITUATION_OPTIONS.map((o) => o.value)).toEqual(["prospect", "customer"]);
  });

  it("situação é célula inline e usa os helpers canônicos", () => {
    expect(commercial).toContain("resolveSituationInlineChange");
    expect(commercial).toContain("reopenOpportunity");
    expect(commercial).toContain("markOpportunityWon");
  });

  it("novo lead herda carteira/cidade mas nunca a origem de aquisição", () => {
    expect(commercial).toContain("Adicionar lead");
    expect(commercial).toContain("marketId: leadDraft.marketId");
    expect(commercial).not.toContain("acquisitionMarketId: leadDraft");
  });

  it("criação inline não recarrega o workspace inteiro", () => {
    const block = commercial.slice(
      commercial.indexOf("const saveLeadDraft"),
      commercial.indexOf("const saveLeadDraft") + 1600,
    );
    expect(block).toContain("setRows");
    expect(block).not.toContain("await load()");
  });
});

describe("Client Hub — shell imediato", () => {
  it("histórico e mascotes só carregam sob demanda", () => {
    expect(clientHub).toContain("ensureHistoricoLoaded");
    expect(clientHub).toContain("ensureMascotsLoaded");
    expect(clientHub).not.toContain("await migrateLocalHistoricoToDB();\n      await loadDemandaHistorico();\n    })();");
  });

  it("não existe espera artificial por tenantId", () => {
    expect(clientHub).not.toContain("setTimeout(r, 200)");
  });

  it("abas pesadas são lazy com Suspense local", () => {
    expect(clientHub).toContain('lazy(() => import("@/components/client-hub/PaidMediaTab"))');
    expect(clientHub).toContain("<Suspense fallback={<TabFallback />}>");
  });

  it("instrumentação de perf é só console", () => {
    expect(clientHub).toContain("measureClientHubShell");
    expect(read("src/pages/ClientList.tsx")).toContain("markClientSelected");
  });
});
