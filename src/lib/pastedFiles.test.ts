import { describe, it, expect } from "vitest";
import {
  extensionForMime,
  hasUsableFileName,
  normalizePastedFiles,
  extractClipboardFiles,
} from "./pastedFiles";

describe("extensionForMime", () => {
  it("mapeia mimes conhecidos", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });
  it("deriva subtipo seguro e cai em bin", () => {
    expect(extensionForMime("image/heic")).toBe("heic");
    expect(extensionForMime("application/vnd.ms-excel")).toBe("bin");
    expect(extensionForMime(undefined)).toBe("bin");
  });
});

describe("hasUsableFileName", () => {
  it("detecta nomes válidos e inválidos", () => {
    expect(hasUsableFileName("foto.png")).toBe(true);
    expect(hasUsableFileName("")).toBe(false);
    expect(hasUsableFileName("image")).toBe(false);
    expect(hasUsableFileName(".png")).toBe(false);
  });
});

describe("normalizePastedFiles", () => {
  it("renomeia só arquivos sem extensão útil", () => {
    const ok = new File([new Uint8Array([1])], "foto.png", { type: "image/png" });
    const bad = new File([new Uint8Array([1])], "", { type: "image/png" });
    const out = normalizePastedFiles([ok, bad], 123);
    expect(out[0].name).toBe("foto.png");
    expect(out[1].name).toBe("arquivo-colado-123-2.png");
    expect(out[1].type).toBe("image/png");
  });
});

describe("extractClipboardFiles", () => {
  it("retorna vazio para clipboard só com texto", () => {
    const data = { files: [], items: [{ kind: "string", getAsFile: () => null }] } as unknown as DataTransfer;
    expect(extractClipboardFiles(data)).toHaveLength(0);
  });
  it("usa items quando files está vazio e deduplica", () => {
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const data = {
      files: [],
      items: [
        { kind: "file", getAsFile: () => file },
        { kind: "file", getAsFile: () => file },
      ],
    } as unknown as DataTransfer;
    expect(extractClipboardFiles(data)).toHaveLength(1);
  });
});
