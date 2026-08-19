import { describe, expect, it } from "vitest";
import { normalizeAdditionalAssignees } from "@/lib/reassignRules";

describe("normalizeAdditionalAssignees", () => {
  it("limpa extras ao sair de captar", () => {
    expect(
      normalizeAdditionalAssignees({
        extras: ["u1", "u2"],
        currentFunctionKey: "captar",
        nextFunctionKey: "editar",
        newAssignedTo: "u3",
      }),
    ).toEqual({ value: [] });
  });

  it("mantém extras dentro de captar, sem duplicar o novo principal", () => {
    expect(
      normalizeAdditionalAssignees({
        extras: ["u1", "u2"],
        currentFunctionKey: "captar",
        nextFunctionKey: "captar",
        newAssignedTo: "u2",
      }),
    ).toEqual({ value: ["u1"] });
  });

  it("nada a gravar quando não há mudança", () => {
    expect(
      normalizeAdditionalAssignees({
        extras: ["u1"],
        currentFunctionKey: "captar",
        nextFunctionKey: "captar",
        newAssignedTo: "u9",
      }),
    ).toBeNull();
    expect(
      normalizeAdditionalAssignees({
        extras: [],
        currentFunctionKey: "criar_arte",
        nextFunctionKey: "revisar",
        newAssignedTo: "u1",
      }),
    ).toBeNull();
  });

  it("card fora de captar com extras órfãos apenas remove o novo principal", () => {
    expect(
      normalizeAdditionalAssignees({
        extras: ["u1", "u2"],
        currentFunctionKey: "revisar",
        nextFunctionKey: "revisar",
        newAssignedTo: "u1",
      }),
    ).toEqual({ value: ["u2"] });
  });
});
