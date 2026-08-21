import { describe, expect, it } from "vitest";
import { groupOfficeQueue, queueGroupKey } from "./officeQueueGroups";

const TODAY = "2026-08-20";

describe("queueGroupKey", () => {
  it("usa a data de início", () => {
    expect(queueGroupKey({ id: "1", title: "a", dueDate: "2026-08-22" }, TODAY)).toBe("2026-08-22");
  });

  it("card que começou antes e termina hoje pertence a hoje", () => {
    expect(
      queueGroupKey({ id: "1", title: "a", dueDate: "2026-08-18", deliveryDate: TODAY }, TODAY),
    ).toBe(TODAY);
  });

  it("sem datas cai em sem data", () => {
    expect(queueGroupKey({ id: "1", title: "a" }, TODAY)).toBe("__sem_data__");
  });
});

describe("groupOfficeQueue", () => {
  const make = (n: number, dueDate: string | null) =>
    Array.from({ length: n }).map((_, i) => ({ id: `${dueDate}-${i}`, title: `c${i}`, dueDate }));

  it("mantém DOM constante em volume alto", () => {
    const groups = groupOfficeQueue(make(39, TODAY), { todayISO: TODAY, visibleLimit: 4 });
    expect(groups).toHaveLength(1);
    expect(groups[0].visible).toHaveLength(4);
    expect(groups[0].total).toBe(39);
    expect(groups[0].overflow).toBe(35);
    expect(groups[0].label).toBe("Hoje");
  });

  it("cria mini-pilhas por agrupamento e resume o excedente", () => {
    const items = [
      ...make(2, TODAY),
      ...make(1, "2026-08-21"),
      ...make(3, "2026-08-22"),
      ...make(5, "2026-08-25"),
      ...make(1, null),
    ];
    const groups = groupOfficeQueue(items, { todayISO: TODAY, maxGroups: 3 });
    expect(groups.map((g) => g.label)).toEqual(["Hoje", "Amanhã", "22/08", "Depois"]);
    expect(groups[3].total).toBe(6);
    expect(groups[3].visible).toHaveLength(0);
  });
});
