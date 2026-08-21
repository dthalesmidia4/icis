import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_OVERVIEW_MODE,
  isOverviewMode,
  overviewModeStorageKey,
  readOverviewMode,
  writeOverviewMode,
} from "./overviewMode";

describe("overviewMode", () => {
  beforeEach(() => window.localStorage.clear());

  it("padrão inicial é o escritório virtual", () => {
    expect(DEFAULT_OVERVIEW_MODE).toBe("escritorio");
    expect(readOverviewMode("u1", "t1")).toBeNull();
  });

  it("valida modos", () => {
    expect(isOverviewMode("operacional")).toBe(true);
    expect(isOverviewMode("kanban")).toBe(false);
  });

  it("memoriza por usuário e tenant", () => {
    writeOverviewMode("u1", "t1", "operacional");
    expect(readOverviewMode("u1", "t1")).toBe("operacional");
    expect(readOverviewMode("u2", "t1")).toBeNull();
    expect(readOverviewMode("u1", "t2")).toBeNull();
  });

  it("ignora valores inválidos gravados por terceiros", () => {
    window.localStorage.setItem(overviewModeStorageKey("u1", "t1"), "lixo");
    expect(readOverviewMode("u1", "t1")).toBeNull();
  });
});
