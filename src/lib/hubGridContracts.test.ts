import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const paidMedia = readFileSync("src/components/client-hub/PaidMediaTab.tsx", "utf8");
const commercial = readFileSync(
  "src/components/systems-commercial/SystemsCommercialWorkspace.tsx",
  "utf8",
);

describe("Mídia paga · contrato de UI", () => {
  it("reutiliza exatamente o popover de início/término da Visão Geral", () => {
    expect(paidMedia).toContain('from "@/components/kanban/StartEndDatePopover"');
    expect(paidMedia).toContain("<StartEndDatePopover");
    expect(paidMedia).not.toContain("InlineDateRangeCell");
  });

  it("mapeia o popover para a janela de anúncios da cidade", () => {
    expect(paidMedia).toContain("dueDate={market.ads_start_date}");
    expect(paidMedia).toContain("deliveryDate={market.ads_end_date}");
    expect(paidMedia).toContain("ads_start_date: v.due_date");
    expect(paidMedia).toContain("ads_end_date: v.delivery_date");
  });

  it("linha clicável expande a cidade e os controles não propagam o clique", () => {
    expect(paidMedia).toContain("onClick={() => setExpanded(isOpen ? null : market.id)}");
    expect(paidMedia).toContain("onClick={(e) => e.stopPropagation()}");
  });

  it("usa a hierarquia visual compartilhada e não menciona a aba Expansão", () => {
    expect(paidMedia).toContain("marketRowClass(market)");
    expect(paidMedia).toContain("marketRowBadge(market)");
    expect(paidMedia).not.toMatch(/aba Expansão/);
  });
});

describe("Comercial · contrato de UI", () => {
  it("carrega prospects e clientes do MESMO cadastro", () => {
    expect(commercial).toContain("loadSystemsProspects(tenantId)");
    expect(commercial).toContain("loadSystemsClients(tenantId)");
  });

  it("mantém uma tabela única com cabeçalho universal e coluna de clientes", () => {
    const headers = commercial.match(/<th[^>]*>\s*Cidade\/carteira/g) || [];
    expect(headers.length).toBe(1);
    expect(commercial).toContain(">Clientes<");
  });

  it("linha da cidade é clicável e a base abre expandida por padrão", () => {
    expect(commercial).toContain("onClick={() => setExpandedMarket(isOpen ? null : market.id)}");
    expect(commercial).toContain("setExpandedMarket((prev) => prev ?? baseMarketId)");
  });

  it("subtabela traz situação, resultado editável e responsável", () => {
    expect(commercial).toContain("lifecycleSituationLabel(client.lifecycle)");
    expect(commercial).toContain("last_contact_result: v");
    expect(commercial).toContain("commercial_owner_id: v || null");
  });

  it("conversão inline passa por confirmação e markOpportunityWon", () => {
    expect(commercial).toContain("resolveStageInlineChange");
    expect(commercial).toContain("setInlineWonTarget(client)");
    expect(commercial).toContain("markOpportunityWon(inlineWonTarget.id");
  });

  it("edição de resumo não registra touchpoint", () => {
    expect(commercial).not.toContain("recordManualTouchpoint(client.id");
  });
});
