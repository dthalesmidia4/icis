import { describe, expect, it } from "vitest";
import {
  isPlanningFunction,
  splitCollaboratorCardGroups,
} from "./collaboratorCardGroups";

const card = (id: string, key: string | null) => ({ id, current_function_key: key });

describe("isPlanningFunction", () => {
  it("só a chave exata planejar", () => {
    expect(isPlanningFunction("planejar")).toBe(true);
    expect(isPlanningFunction(" Planejar ")).toBe(true);
    expect(isPlanningFunction("planejamento")).toBe(false);
    expect(isPlanningFunction("replanejar")).toBe(false);
    expect(isPlanningFunction(null)).toBe(false);
  });
});

describe("splitCollaboratorCardGroups", () => {
  it("agrupa planejar mesmo com 1 card e fora da lista principal", () => {
    const cards = [card("a", "planejar"), card("b", "captar")];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.planningCards.map((c) => c.id)).toEqual(["a"]);
    expect(g.mainCards.map((c) => c.id)).toEqual(["b"]);
  });

  it("planejar nunca cai em revisão nem na principal", () => {
    const cards = [
      card("p1", "planejar"),
      card("p2", "planejar"),
      card("r1", "revisar_arte"),
      card("r2", "revisar_roteiro"),
      card("r3", "revisar_conteudo"),
      card("pub1", "revisar_publicacao"),
      card("m1", "executar"),
    ];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.shouldGroupReview).toBe(true);
    expect(g.planningCards.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(g.reviewCards.map((c) => c.id)).toEqual(["r1", "r2", "r3"]);
    expect(g.publicationReviewCards.map((c) => c.id)).toEqual(["pub1"]);
    expect(g.mainCards.map((c) => c.id)).toEqual(["m1"]);
  });


  it("mantém o limiar de revisão: abaixo de 3 volta para a principal", () => {
    const cards = [card("r1", "revisar_arte"), card("r2", "revisar_arte"), card("p1", "planejar")];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.shouldGroupReview).toBe(false);
    expect(g.reviewCards).toEqual([]);
    expect(g.mainCards.map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(g.planningCards.map((c) => c.id)).toEqual(["p1"]);
  });

  it("aguardando cliente continua com grupo próprio", () => {
    const cards = [card("w1", "aguardando_cliente"), card("p1", "planejar"), card("m1", "captar")];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.awaitingCards.map((c) => c.id)).toEqual(["w1"]);
    expect(g.planningCards.map((c) => c.id)).toEqual(["p1"]);
    expect(g.mainCards.map((c) => c.id)).toEqual(["m1"]);
  });

  it("revisar_publicacao e enviar_cliente têm grupos próprios", () => {
    const cards = [
      card("rev1", "revisar"),
      card("rev2", "revisar_arte"),
      card("rev3", "revisar_roteiro"),
      card("pub1", "revisar_publicacao"),
      card("send1", "enviar_cliente"),
      card("m1", "executar"),
    ];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.reviewCards.map((c) => c.id)).toEqual(["rev1", "rev2", "rev3"]);
    expect(g.publicationReviewCards.map((c) => c.id)).toEqual(["pub1"]);
    expect(g.clientSendCards.map((c) => c.id)).toEqual(["send1"]);
    expect(g.mainCards.map((c) => c.id)).toEqual(["m1"]);
  });

  it("enviar_cliente e revisar_publicacao nunca voltam à principal abaixo do limiar", () => {
    const cards = [card("pub1", "revisar_publicacao"), card("send1", "enviar_cliente"), card("m1", "captar")];
    const g = splitCollaboratorCardGroups(cards);
    expect(g.shouldGroupReview).toBe(false);
    expect(g.mainCards.map((c) => c.id)).toEqual(["m1"]);
    expect(g.publicationReviewCards.map((c) => c.id)).toEqual(["pub1"]);
    expect(g.clientSendCards.map((c) => c.id)).toEqual(["send1"]);
  });

  it("preserva a ordem de entrada e não perde nenhum card", () => {
    const cards = [
      card("1", "planejar"),
      card("2", null),
      card("3", "aguardando_cliente"),
      card("4", "planejar"),
      card("5", "enviar_cliente"),
      card("6", "revisar_publicacao"),
    ];
    const g = splitCollaboratorCardGroups(cards);
    const all = [
      ...g.mainCards,
      ...g.planningCards,
      ...g.awaitingCards,
      ...g.reviewCards,
      ...g.clientSendCards,
      ...g.publicationReviewCards,
    ];
    expect(all).toHaveLength(cards.length);
    expect(g.planningCards.map((c) => c.id)).toEqual(["1", "4"]);
  });
});

