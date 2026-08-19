import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

import {
  computeTypeStageGroups,
  findTypeStageOption,
  humanizeTypeKey,
  typeStageChoiceError,
  type AreaDemandType,
} from "./typeStageOptions";

const types: AreaDemandType[] = [
  {
    demandTypeKey: "video_captado",
    demandTypeLabel: "Vídeo captado",
    sequence: [
      { functionKey: "captar", name: "Captar" },
      { functionKey: "editar", name: "Editar" },
      { functionKey: "revisar_arte", name: "Revisar arte" },
      { functionKey: "enviar_cliente", name: "Enviar cliente" },
    ],
  },
  {
    demandTypeKey: "estatico",
    demandTypeLabel: "Estático",
    sequence: [
      { functionKey: "criar_arte", name: "Criar arte" },
      { functionKey: "revisar_arte", name: "Revisar arte" },
    ],
  },
  { demandTypeKey: "sem_etapas", demandTypeLabel: "Sem etapas", sequence: [] },
];

const allowed = ["captar", "editar", "revisar_arte", "criar_arte", "enviar_cliente"];

describe("computeTypeStageGroups", () => {
  it("coloca o tipo atual primeiro e descarta tipos sem etapas", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "estatico",
      currentFunctionKey: "criar_arte",
      allowedKeys: allowed,
    });
    expect(groups.map((g) => g.demandTypeKey)).toEqual(["estatico", "video_captado"]);
    expect(groups[0].isCurrentType).toBe(true);
  });

  it("marca a etapa atual apenas no tipo atual", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "estatico",
      currentFunctionKey: "revisar_arte",
      allowedKeys: allowed,
    });
    const estatico = groups.find((g) => g.demandTypeKey === "estatico")!;
    const video = groups.find((g) => g.demandTypeKey === "video_captado")!;
    expect(estatico.stages.find((s) => s.functionKey === "revisar_arte")!.isCurrentStage).toBe(true);
    expect(video.stages.find((s) => s.functionKey === "revisar_arte")!.isCurrentStage).toBe(false);
  });

  it("etapa sem função habilitada fica inválida com o nome do responsável", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "video_captado",
      currentFunctionKey: "editar",
      allowedKeys: ["editar"],
      assigneeName: "Paulo",
    });
    const captar = findTypeStageOption(groups, "video_captado", "captar")!;
    expect(captar.valid).toBe(false);
    expect(captar.reasonLabel).toBe("Paulo não possui esta etapa habilitada");
  });

  it("etapa de cliente é bloqueada em decisão administrativa", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "video_captado",
      currentFunctionKey: "editar",
      allowedKeys: allowed,
    });
    const enviar = findTypeStageOption(groups, "video_captado", "enviar_cliente")!;
    expect(enviar.valid).toBe(false);
    expect(enviar.reason).toBe("client_facing");
  });

  it("etapa de cliente é liberada em transição real de processo", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "video_captado",
      currentFunctionKey: "editar",
      allowedKeys: allowed,
      administrative: false,
    });
    expect(findTypeStageOption(groups, "video_captado", "enviar_cliente")!.valid).toBe(true);
  });

  it("etapa já concluída pelo colaborador continua visível e bloqueada em outro tipo", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "video_captado",
      currentFunctionKey: "editar",
      allowedKeys: allowed,
      completedByUser: ["criar_arte"],
    });
    const criar = findTypeStageOption(groups, "estatico", "criar_arte")!;
    expect(criar.valid).toBe(false);
    expect(criar.reason).toBe("already_completed");
  });

  it("hasValidStage indica tipos alcançáveis", () => {
    const groups = computeTypeStageGroups({
      types,
      currentTypeKey: "video_captado",
      currentFunctionKey: "editar",
      allowedKeys: ["editar"],
    });
    expect(groups.find((g) => g.demandTypeKey === "estatico")!.hasValidStage).toBe(false);
    expect(groups.find((g) => g.demandTypeKey === "video_captado")!.hasValidStage).toBe(true);
  });
});

describe("validação pontual", () => {
  const groups = computeTypeStageGroups({
    types,
    currentTypeKey: "video_captado",
    currentFunctionKey: "editar",
    allowedKeys: allowed,
  });

  it("aceita etapa válida de outro tipo", () => {
    expect(typeStageChoiceError(groups, "estatico", "criar_arte")).toBeNull();
  });

  it("rejeita etapa fora dos fluxos", () => {
    expect(typeStageChoiceError(groups, "estatico", "captar")).toBe(
      "Etapa fora dos fluxos configurados para esta área",
    );
    expect(typeStageChoiceError(groups, "inexistente", "editar")).toBe(
      "Etapa fora dos fluxos configurados para esta área",
    );
  });

  it("rejeita etapa inválida com motivo", () => {
    expect(typeStageChoiceError(groups, "video_captado", "enviar_cliente")).toBe(
      "Etapa de cliente: exige evento real do processo",
    );
  });
});

describe("humanizeTypeKey", () => {
  it("converte chave em rótulo legível", () => {
    expect(humanizeTypeKey("video_captado")).toBe("video captado");
    expect(humanizeTypeKey("post-estatico")).toBe("post estatico");
  });
});

describe("escolha manual de etapa (long-press)", () => {
  const sequence = [
    { functionKey: "gravar", name: "Gravar" },
    { functionKey: "editar_video", name: "Editar vídeo" },
  ];

  it("administrativo bloqueia etapa já concluída pelo responsável", () => {
    const opts = computeStageOptions({
      sequence,
      allowedKeys: ["gravar", "editar_video"],
      completedByUser: ["editar_video"],
      currentKey: "gravar",
    });
    const editar = opts.find((o) => o.functionKey === "editar_video")!;
    expect(editar.valid).toBe(false);
    expect(editar.reason).toBe("already_completed");
  });

  it("escolha manual libera a mesma etapa (histórico não bloqueia)", () => {
    const opts = computeStageOptions({
      sequence,
      allowedKeys: ["gravar", "editar_video"],
      completedByUser: ["editar_video"],
      currentKey: "gravar",
      mode: "manual_stage_change",
    });
    const editar = opts.find((o) => o.functionKey === "editar_video")!;
    expect(editar.valid).toBe(true);
    expect(editar.reason).toBeNull();
  });

  it("escolha manual continua exigindo a função habilitada", () => {
    const opts = computeStageOptions({
      sequence,
      allowedKeys: ["gravar"],
      completedByUser: [],
      currentKey: "gravar",
      mode: "manual_stage_change",
    });
    expect(opts.find((o) => o.functionKey === "editar_video")!.reason).toBe("not_allowed");
  });
});
