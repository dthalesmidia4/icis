import { describe, expect, it } from "vitest";
import { createLongPressCore } from "./longPress";

function harness(delay = 500) {
  let pending: Array<{ id: number; fn: () => void; ms: number }> = [];
  let nextId = 1;
  let fires = 0;
  const core = createLongPressCore({
    delayMs: delay,
    onLongPress: () => {
      fires++;
    },
    setTimer: (fn, ms) => {
      const id = nextId++;
      pending.push({ id, fn, ms });
      return id;
    },
    clearTimer: (h) => {
      pending = pending.filter((p) => p.id !== h);
    },
  });
  return {
    core,
    get fires() {
      return fires;
    },
    tick() {
      const due = pending;
      pending = [];
      due.forEach((p) => p.fn());
    },
  };
}

describe("longPress core", () => {
  it("dispara após o prazo com o ponteiro parado", () => {
    const h = harness();
    h.core.start(10, 10);
    h.tick();
    expect(h.fires).toBe(1);
    expect(h.core.shouldSuppressClick()).toBe(true);
    expect(h.core.shouldSuppressClick()).toBe(false);
  });

  it("soltar antes do prazo é clique — não dispara", () => {
    const h = harness();
    h.core.start(10, 10);
    expect(h.core.end()).toBe(false);
    h.tick();
    expect(h.fires).toBe(0);
    expect(h.core.shouldSuppressClick()).toBe(false);
  });

  it("movimento acima da tolerância cancela (rolagem/arraste)", () => {
    const h = harness();
    h.core.start(10, 10);
    h.core.move(10, 40);
    h.tick();
    expect(h.fires).toBe(0);
  });

  it("movimento dentro da tolerância mantém o gesto", () => {
    const h = harness();
    h.core.start(10, 10);
    h.core.move(13, 12);
    h.tick();
    expect(h.fires).toBe(1);
  });

  it("cancel encerra o gesto pendente", () => {
    const h = harness();
    h.core.start(0, 0);
    h.core.cancel();
    h.tick();
    expect(h.fires).toBe(0);
    expect(h.core.pending).toBe(false);
  });

  it("end após disparo informa long-press e não repete", () => {
    const h = harness();
    h.core.start(0, 0);
    h.tick();
    expect(h.core.end()).toBe(true);
    expect(h.core.end()).toBe(false);
  });
});
