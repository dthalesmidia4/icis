import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => ({}) },
}));

import {
  findTypeStageOption,
  humanizeTypeKey,
  mapTypeStageOptions,
  typeStageChoiceError,
  type RawTypeStageOptions,
} from "./typeStageOptions";

const RAW: RawTypeStageOptions = {
  types: [
    {
      demand_type_key: "video_captado",
      demand_type_label: "Vídeo captado",
      stages: [
        { function_key: "editar", name: "Editar", position: 2 },
        { function_key: "captar", name: "Captar", position: 1 },
        { function_key: "enviar_cliente", name: "Enviar cliente", position: 3, client_facing: true },
      ],
    },
    {
      demand_type_key: "estatico",
      demand_type_label: "Estático",
      stages: [
        { function_key: "criar_arte", name: "Criar arte", position: 1 },
        { function_key: "revisar_arte", name: "Revisar arte", position: 2, review: true },
      ],
    },
    { demand_type_key: "sem_etapas", demand_type_label: "Sem etapas", stages: [] },
  ],
};

describe("mapTypeStageOptions", () => {
  it("coloca o tipo atual primeiro, ordena etapas e descarta tipos sem etapas", () => {
    const groups = mapTypeStageOptions(RAW, {
      demand_type_key: "estatico",
      current_function_key: "criar_arte",
    });
    expect(groups.map((g) => g.demandTypeKey)).toEqual(["estatico", "video_captado"]);
    expect(groups[0].isCurrentType).toBe(true);
    expect(groups[1].stages.map((s) => s.functionKey)).toEqual([
      "captar",
      "editar",
      "enviar_cliente",
    ]);
  });

  it("marca a etapa atual apenas no tipo atual", () => {
    const groups = mapTypeStageOptions(RAW, {
      demand_type_key: "estatico",
      current_function_key: "revisar_arte",
    });
    expect(findTypeStageOption(groups, "estatico", "revisar_arte")!.isCurrentStage).toBe(true);
  });

  it("nenhuma etapa do fluxo é bloqueada localmente (o banco resolve o responsável)", () => {
    const groups = mapTypeStageOptions(RAW, {
      demand_type_key: "video_captado",
      current_function_key: "editar",
    });
    expect(groups.every((g) => g.hasValidStage)).toBe(true);
    expect(groups.flatMap((g) => g.stages).every((s) => s.valid)).toBe(true);
    expect(findTypeStageOption(groups, "video_captado", "enviar_cliente")!.clientFacing).toBe(true);
  });

  it("card sem responsável e sem tipo atual continua com todos os tipos", () => {
    const groups = mapTypeStageOptions(RAW, {
      demand_type_key: null,
      current_function_key: null,
    });
    expect(groups.map((g) => g.demandTypeKey)).toEqual(["estatico", "video_captado"]);
    expect(groups.some((g) => g.isCurrentType)).toBe(false);
  });

  it("resposta vazia não quebra", () => {
    expect(mapTypeStageOptions(null, { demand_type_key: "x", current_function_key: "y" })).toEqual(
      [],
    );
  });
});

describe("typeStageChoiceError", () => {
  const groups = mapTypeStageOptions(RAW, {
    demand_type_key: "video_captado",
    current_function_key: "editar",
  });

  it("aceita qualquer etapa do fluxo, inclusive de outro tipo", () => {
    expect(typeStageChoiceError(groups, "estatico", "criar_arte")).toBeNull();
    expect(typeStageChoiceError(groups, "video_captado", "enviar_cliente")).toBeNull();
  });

  it("rejeita etapa fora dos fluxos configurados", () => {
    expect(typeStageChoiceError(groups, "estatico", "captar")).toBe(
      "Etapa fora dos fluxos configurados para esta área",
    );
    expect(typeStageChoiceError(groups, "inexistente", "editar")).toBe(
      "Etapa fora dos fluxos configurados para esta área",
    );
  });
});

describe("humanizeTypeKey", () => {
  it("converte chave em rótulo legível", () => {
    expect(humanizeTypeKey("video_captado")).toBe("video captado");
    expect(humanizeTypeKey("post-estatico")).toBe("post estatico");
  });
});
