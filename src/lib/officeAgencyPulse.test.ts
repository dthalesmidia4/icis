import { describe, expect, it } from "vitest";
import {
  buildOfficeMissions,
  countOverloadedDesks,
  deriveAgencyPulse,
  effectiveDeliveryDate,
  levelFromDeliveries,
  type PulseCard,
} from "./officeAgencyPulse";

const NOW = new Date("2026-08-26T15:00:00").getTime();
const TODAY = "2026-08-26";

const card = (partial: Partial<PulseCard> & { id: string }): PulseCard => ({
  functionKey: "criar_arte",
  startTs: null,
  endTs: null,
  deliveryDate: null,
  dueDate: null,
  ...partial,
});

describe("officeAgencyPulse — XP e nível", () => {
  it("25 XP por entrega e 1000 XP por nível", () => {
    expect(levelFromDeliveries(0)).toEqual({
      deliveredTotal: 0,
      totalXp: 0,
      level: 1,
      xpInLevel: 0,
      nextLevelXp: 1000,
    });
    const l = levelFromDeliveries(50);
    expect(l.totalXp).toBe(1250);
    expect(l.level).toBe(2);
    expect(l.xpInLevel).toBe(250);
  });
});

describe("officeAgencyPulse — derivação real", () => {
  const cards = [
    card({ id: "a", startTs: NOW - 1000, endTs: NOW + 60_000, deliveryDate: TODAY }),
    card({ id: "b", startTs: NOW - 5000, endTs: NOW - 1000, dueDate: TODAY }),
    card({ id: "c", functionKey: "aguardando_cliente" }),
    card({ id: "d", functionKey: "revisar", startTs: NOW - 10, endTs: NOW + 10 }),
  ];

  it("conta em andamento, em risco, revisão e aguardando cliente", () => {
    const pulse = deriveAgencyPulse({ cards, now: NOW, today: TODAY, deliveredToday: 2 });
    expect(pulse.inProgress).toBe(2); // a + d
    expect(pulse.atRisk).toBe(1); // b (prazo vencido)
    expect(pulse.awaitingClient).toBe(1);
    expect(pulse.inReview).toBe(1);
  });

  it("percentual do dia usa data efetiva e nunca inventa 100%", () => {
    const pulse = deriveAgencyPulse({ cards, now: NOW, today: TODAY, deliveredToday: 2 });
    expect(pulse.todayTarget).toBe(4); // 2 entregues + a + b
    expect(pulse.progressPct).toBe(50);

    const empty = deriveAgencyPulse({ cards: [], now: NOW, today: TODAY, deliveredToday: 0 });
    expect(empty.todayTarget).toBe(0);
    expect(empty.progressPct).toBeNull();
  });

  it("aguardando cliente nunca conta como em risco/andamento", () => {
    const pulse = deriveAgencyPulse({
      cards: [card({ id: "x", functionKey: "aguardando_cliente", startTs: NOW - 1, endTs: NOW - 1 })],
      now: NOW,
      today: TODAY,
      deliveredToday: 0,
    });
    expect(pulse.atRisk).toBe(0);
    expect(pulse.inProgress).toBe(0);
    expect(pulse.awaitingClient).toBe(1);
  });

  it("data efetiva cai para due_date", () => {
    expect(effectiveDeliveryDate(card({ id: "z", dueDate: "2026-01-01" }))).toBe("2026-01-01");
  });
});

describe("officeAgencyPulse — missões coletivas", () => {
  it("badge X/3 com progresso real", () => {
    const ok = buildOfficeMissions({ atRisk: 0, inReview: 0, overloadedDesks: 0 });
    expect(ok.doneCount).toBe(3);
    expect(ok.missions.every((m) => m.detail === null)).toBe(true);

    const bad = buildOfficeMissions({ atRisk: 3, inReview: 4, overloadedDesks: 2 });
    expect(bad.doneCount).toBe(0);
    expect(bad.missions.map((m) => m.detail)).toEqual([
      "3 em atraso",
      "4 em revisão",
      "2 mesas sobrecarregadas",
    ]);
  });

  it("mesa sobrecarregada usa o limite da pilha física", () => {
    expect(countOverloadedDesks([15, 16, 3, 40])).toBe(2);
  });
});
