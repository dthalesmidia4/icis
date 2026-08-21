import { describe, expect, it } from "vitest";
import { checkIntervalMs, decideFreshness, isPreviewHost } from "./buildFreshness";

const LOCAL_TIME = "2026-08-21T10:00:00.000Z";
const LOCAL_ID = `2026-08-21-3+${LOCAL_TIME}`;

const base = { localBuiltAt: LOCAL_TIME, localId: LOCAL_ID };

describe("decideFreshness", () => {
  it("não recarrega quando o build remoto é o mesmo", () => {
    const d = decideFreshness({
      ...base,
      remote: { version: "2026-08-21-3", builtAt: LOCAL_TIME, id: LOCAL_ID },
    });
    expect(d.action).toBe("none");
  });

  it("recarrega quando o build remoto é mais novo", () => {
    const builtAt = "2026-08-21T10:05:00.000Z";
    const d = decideFreshness({
      ...base,
      remote: { version: "2026-08-21-4", builtAt, id: `2026-08-21-4+${builtAt}` },
    });
    expect(d).toEqual({
      action: "reload",
      remoteId: `2026-08-21-4+${builtAt}`,
      remoteBuiltAt: builtAt,
    });
  });

  it("nunca recarrega para um build remoto mais antigo", () => {
    const builtAt = "2026-08-21T09:00:00.000Z";
    const d = decideFreshness({ ...base, remote: { builtAt, id: `old+${builtAt}` } });
    expect(d).toEqual({ action: "none", reason: "remote_not_newer" });
  });

  it("ignora builtAt inválido", () => {
    expect(decideFreshness({ ...base, remote: { builtAt: "nope", id: "x" } }).action).toBe("none");
    expect(decideFreshness({ ...base, remote: { id: "x" } }).action).toBe("none");
  });

  it("ignora payload inválido (fetch falhou / 404 → null)", () => {
    expect(decideFreshness({ ...base, remote: null }).action).toBe("none");
    expect(decideFreshness({ ...base, remote: "<html>" }).action).toBe("none");
  });

  it("não recarrega em loop quando a sessão já marcou aquele remote id", () => {
    const builtAt = "2026-08-21T10:05:00.000Z";
    const remoteId = `2026-08-21-4+${builtAt}`;
    const d = decideFreshness({
      ...base,
      remote: { builtAt, id: remoteId },
      alreadyReloaded: (id) => id === remoteId,
    });
    expect(d).toEqual({ action: "none", reason: "already_reloaded" });
  });

  it("não recarrega quando o build local não tem timestamp válido (dev)", () => {
    const d = decideFreshness({
      localBuiltAt: "dev",
      localId: "2026-08-21-3+dev",
      remote: { builtAt: "2026-08-21T10:05:00.000Z", id: "novo" },
    });
    expect(d.action).toBe("none");
  });
});

describe("cadência", () => {
  it("detecta hosts de preview", () => {
    expect(isPreviewHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isPreviewHost("preview--abc.lovable.app")).toBe(true);
    expect(isPreviewHost("icis.lovable.app")).toBe(false);
  });

  it("usa 15s no preview e 60s em produção", () => {
    expect(checkIntervalMs("id-preview--abc.lovable.app")).toBe(15_000);
    expect(checkIntervalMs("icis.lovable.app")).toBe(60_000);
  });
});
