import { describe, expect, it } from "vitest";
import {
  MAX_DESK_OBJECTS,
  canCustomizeDesk,
  sanitizeDeskObjects,
  selectDeskObject,
  assignDeskSlots,
} from "./officeDeskObjects";

describe("seleção única do objeto da mesa", () => {
  it("aceita no máximo 1 item", () => {
    expect(MAX_DESK_OBJECTS).toBe(1);
  });

  it("substitui a escolha anterior (radio)", () => {
    expect(selectDeskObject(["mug"], "plant")).toEqual(["plant"]);
  });

  it("preserva a seleção ao clicar no item já ativo", () => {
    expect(selectDeskObject(["mug"], "mug")).toEqual(["mug"]);
  });

  it("normaliza dados legados com múltiplos itens preservando o primeiro renderizado", () => {
    expect(sanitizeDeskObjects(["lamp", "mug", "plant"])).toEqual(["lamp"]);
    expect(assignDeskSlots(["lamp", "mug"])).toEqual([{ slot: "left", key: "lamp" }]);
  });

  it("descarta chaves inválidas", () => {
    expect(sanitizeDeskObjects(["nope", 3, null])).toEqual([]);
    expect(sanitizeDeskObjects("mug")).toEqual([]);
  });
});

describe("visibilidade de Personalizar mesa", () => {
  it("aparece na própria mesa", () => {
    expect(canCustomizeDesk({ viewerUserId: "u1", deskOwnerUserId: "u1", canSave: true })).toBe(true);
  });

  it("não aparece na mesa de outra pessoa", () => {
    expect(canCustomizeDesk({ viewerUserId: "u1", deskOwnerUserId: "u2", canSave: true })).toBe(false);
  });

  it("exige usuário autenticado e gravação disponível", () => {
    expect(canCustomizeDesk({ viewerUserId: null, deskOwnerUserId: "u1", canSave: true })).toBe(false);
    expect(canCustomizeDesk({ viewerUserId: "u1", deskOwnerUserId: "u1", canSave: false })).toBe(false);
  });

  it("não depende de estado operacional (demanda, fila, café)", () => {
    const base = { viewerUserId: "u1", deskOwnerUserId: "u1", canSave: true };
    expect(canCustomizeDesk({ ...base })).toBe(true);
    // qualquer estado extra é irrelevante para a decisão
    expect(canCustomizeDesk({ ...base, ...({ working: true, queueCount: 5 } as object) })).toBe(true);
  });
});
