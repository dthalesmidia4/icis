import { describe, expect, it } from "vitest";
import { computeStageOptions, type StageOption } from "@/lib/stageOptions";

const seq = (...keys: string[]) => keys.map((functionKey) => ({ functionKey, name: functionKey }));

const optionFor = (key: string, options: StageOption[]) =>
  options.find((o) => o.functionKey === key);

describe("computeStageOptions — etapa de Testar", () => {
  it("quem desenvolveu e tem Testar habilitada pode escolher Testar", () => {
    const options = computeStageOptions({
      sequence: seq("desenvolver", "testar", "publicar"),
      allowedKeys: new Set(["desenvolver", "testar"]),
      completedByUser: new Set(["desenvolver"]),
      currentKey: "desenvolver",
    });
    const testar = optionFor("testar", options);
    expect(testar?.valid).toBe(true);
    expect(testar?.reason).toBeNull();
  });

  it("escolha manual também libera Testar para quem desenvolveu", () => {
    const options = computeStageOptions({
      sequence: seq("desenvolver", "testar", "publicar"),
      allowedKeys: new Set(["desenvolver", "testar"]),
      completedByUser: new Set(["desenvolver"]),
      currentKey: "desenvolver",
      mode: "manual_stage_change",
    });
    expect(optionFor("testar", options)?.valid).toBe(true);
  });

  it("sem a função Testar habilitada, a etapa fica inválida", () => {
    const options = computeStageOptions({
      sequence: seq("desenvolver", "testar", "publicar"),
      allowedKeys: new Set(["desenvolver"]),
      completedByUser: new Set(["desenvolver"]),
      currentKey: "desenvolver",
    });
    expect(optionFor("testar", options)?.reason).toBe("not_allowed");
  });
});

describe("computeStageOptions — revisão independente intacta", () => {
  it("quem desenvolveu não pode revisar o próprio desenvolvimento", () => {
    const options = computeStageOptions({
      sequence: seq("desenvolver", "revisar", "publicar"),
      allowedKeys: new Set(["desenvolver", "revisar"]),
      completedByUser: new Set(["desenvolver"]),
      currentKey: "desenvolver",
    });
    expect(optionFor("revisar", options)?.reason).toBe("self_review");
  });

  it("revisor que não desenvolveu continua podendo revisar", () => {
    const options = computeStageOptions({
      sequence: seq("desenvolver", "revisar", "publicar"),
      allowedKeys: new Set(["revisar"]),
      completedByUser: new Set<string>(),
      currentKey: "desenvolver",
    });
    expect(optionFor("revisar", options)?.valid).toBe(true);
  });
});
