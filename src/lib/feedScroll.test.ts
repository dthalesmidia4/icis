import { describe, expect, it } from "vitest";
import {
  edgeScrollAction,
  hasVerticalOverflow,
  isEditableTarget,
  resolveScrollContainer,
  scrollKeyIntent,
  shouldHandleScrollKey,
} from "./feedScroll";

/** Nó mínimo compatível com a subida de árvore feita pelo resolver. */
const node = (overflowY: string, scrollHeight: number, clientHeight: number, parent: any = null) => ({
  overflowY,
  scrollHeight,
  clientHeight,
  parentElement: parent,
});

describe("resolveScrollContainer", () => {
  const styleOf = (n: any) => ({ overflowY: n.overflowY });

  it("encontra o primeiro ancestral que realmente rola", () => {
    const main = node("auto", 4000, 800);
    const container = node("visible", 4000, 4000, main);
    const anchor = node("visible", 4000, 4000, container);
    expect(resolveScrollContainer({ parentElement: anchor } as any, styleOf as any)).toBe(main);
  });

  it("ignora ancestral overflow-hidden e sem overflow real", () => {
    const shell = node("hidden", 4000, 800);
    const inner = node("auto", 800, 800, shell);
    const anchor = node("visible", 800, 800, inner);
    expect(resolveScrollContainer({ parentElement: anchor } as any, styleOf as any)).toBe(null);
  });
});

describe("hasVerticalOverflow", () => {
  it("exige margem mínima de conteúdo", () => {
    expect(hasVerticalOverflow({ scrollTop: 0, clientHeight: 800, scrollHeight: 2000 })).toBe(true);
    expect(hasVerticalOverflow({ scrollTop: 0, clientHeight: 800, scrollHeight: 810 })).toBe(false);
  });
});

describe("edgeScrollAction", () => {
  it("no topo aponta para baixo", () => {
    expect(edgeScrollAction({ scrollTop: 0, clientHeight: 800, scrollHeight: 4000 })).toBe("down");
  });
  it("no fim aponta para cima", () => {
    expect(edgeScrollAction({ scrollTop: 3200, clientHeight: 800, scrollHeight: 4000 })).toBe("up");
  });
  it("metade inferior aponta para cima", () => {
    expect(edgeScrollAction({ scrollTop: 1900, clientHeight: 800, scrollHeight: 4000 })).toBe("up");
  });
});

describe("scrollKeyIntent", () => {
  it("PageDown/PageUp movem ~uma viewport", () => {
    expect(scrollKeyIntent("PageDown", 900)).toEqual({ type: "delta", delta: 820 });
    expect(scrollKeyIntent("PageUp", 900)).toEqual({ type: "delta", delta: -820 });
  });
  it("Home/End vão aos extremos", () => {
    expect(scrollKeyIntent("Home", 900)).toEqual({ type: "top" });
    expect(scrollKeyIntent("End", 900)).toEqual({ type: "bottom" });
  });
  it("outras teclas são ignoradas", () => {
    expect(scrollKeyIntent("ArrowDown", 900)).toBe(null);
  });
});

describe("shouldHandleScrollKey", () => {
  const base = { key: "PageDown", target: null, modalOpen: false };

  it("trata a tecla sem exigir clique prévio", () => {
    expect(shouldHandleScrollKey(base)).toBe(true);
  });

  it("nunca sequestra campos editáveis", () => {
    expect(shouldHandleScrollKey({ ...base, target: { tagName: "INPUT" } as any })).toBe(false);
    expect(shouldHandleScrollKey({ ...base, target: { tagName: "TEXTAREA" } as any })).toBe(false);
    expect(shouldHandleScrollKey({ ...base, target: { tagName: "SELECT" } as any })).toBe(false);
    expect(
      shouldHandleScrollKey({ ...base, target: { tagName: "DIV", isContentEditable: true } as any })
    ).toBe(false);
  });

  it("modal aberto tem prioridade", () => {
    expect(shouldHandleScrollKey({ ...base, modalOpen: true })).toBe(false);
  });

  it("atalhos com modificador seguem nativos", () => {
    expect(shouldHandleScrollKey({ ...base, metaKey: true })).toBe(false);
    expect(shouldHandleScrollKey({ ...base, ctrlKey: true })).toBe(false);
  });

  it("teclas fora do conjunto não são tratadas", () => {
    expect(shouldHandleScrollKey({ ...base, key: "a" })).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("reconhece alvos de digitação", () => {
    expect(isEditableTarget({ tagName: "input" } as any)).toBe(true);
    expect(isEditableTarget({ tagName: "BUTTON" } as any)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
