import { describe, it, expect } from "vitest";
import { canBulkRemoveAttachments, collectAttachmentStoragePaths } from "./bulkAttachments";

describe("canBulkRemoveAttachments", () => {
  it("é falso para lista vazia/nula", () => {
    expect(canBulkRemoveAttachments([])).toBe(false);
    expect(canBulkRemoveAttachments(null)).toBe(false);
    expect(canBulkRemoveAttachments(undefined)).toBe(false);
  });

  it("é falso com 1 anexo", () => {
    expect(canBulkRemoveAttachments([{ url: "a", storagePath: "p/a.png" }])).toBe(false);
  });

  it("é verdadeiro com 2 ou mais anexos", () => {
    expect(
      canBulkRemoveAttachments([
        { url: "a", storagePath: "p/a.png" },
        { url: "b", storagePath: "p/b.png" },
      ])
    ).toBe(true);
  });
});

describe("collectAttachmentStoragePaths", () => {
  it("coleta somente storagePath válidos", () => {
    expect(
      collectAttachmentStoragePaths([
        { url: "a", storagePath: "p/a.png" },
        { url: "b", storagePath: "" },
        { url: "c", storagePath: null },
        { url: "d" },
        { url: "e", storagePath: "  p/e.png  " },
      ])
    ).toEqual(["p/a.png", "p/e.png"]);
  });

  it("retorna vazio quando nenhum anexo tem storagePath (legado)", () => {
    expect(collectAttachmentStoragePaths([{ url: "a" }, { url: "b" }])).toEqual([]);
  });
});
