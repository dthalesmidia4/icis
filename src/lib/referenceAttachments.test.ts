import { describe, it, expect } from "vitest";
import {
  resolveUploadCollection,
  buildAttachmentStoragePath,
  isReferencePath,
  extensionFromFileName,
} from "./referenceAttachments";

describe("resolveUploadCollection", () => {
  it("envia para referências apenas na seção referencias", () => {
    expect(resolveUploadCollection("referencias")).toBe("reference");
  });

  it("mantém anexos finais em qualquer outra seção", () => {
    for (const s of ["anexos", "briefing", "description", null, undefined]) {
      expect(resolveUploadCollection(s as any)).toBe("final");
    }
  });
});

describe("buildAttachmentStoragePath", () => {
  const base = {
    tenantId: "t1",
    clientId: "c1",
    periodPlanId: "p1",
    cardId: "card1",
    fileName: "foto.PNG",
    timestamp: 1000,
    uniqueId: "abc123",
  };

  it("preserva o path histórico dos arquivos finais", () => {
    expect(buildAttachmentStoragePath({ ...base, collection: "final" })).toBe(
      "t1/c1/p1/card1/1000-abc123.png"
    );
  });

  it("adiciona o segmento references para referências", () => {
    const path = buildAttachmentStoragePath({ ...base, collection: "reference" });
    expect(path).toBe("t1/c1/p1/card1/references/1000-abc123.png");
    expect(isReferencePath(path)).toBe(true);
  });

  it("usa sem-periodo quando não há período vinculado", () => {
    expect(
      buildAttachmentStoragePath({ ...base, periodPlanId: null, collection: "reference" })
    ).toBe("t1/c1/sem-periodo/card1/references/1000-abc123.png");
  });
});

describe("extensionFromFileName", () => {
  it("cai para bin em nomes sem extensão válida", () => {
    expect(extensionFromFileName("arquivo")).toBe("bin");
    expect(extensionFromFileName(null)).toBe("bin");
    expect(extensionFromFileName("a.jpeg")).toBe("jpeg");
  });
});
