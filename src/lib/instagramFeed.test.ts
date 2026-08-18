import { describe, it, expect } from "vitest";
import { buildInstagramFeed, resolveFeedKind, type FeedDemandInput } from "./instagramFeed";

const demand = (over: Partial<FeedDemandInput>): FeedDemandInput => ({
  id: over.id || "d1",
  title: over.title || "DF-001 — Teste",
  demand_type: "demand_type" in over ? over.demand_type ?? null : "Criativo estático",
  demand_type_key: "demand_type_key" in over ? over.demand_type_key ?? null : "criativo_estatico",
  channel: over.channel ?? null,
  publish_date: over.publish_date ?? "2026-08-20",
  publish_time: over.publish_time ?? null,
  attachments: over.attachments ?? [],
  post_caption: over.post_caption ?? null,
  current_function_key: over.current_function_key ?? "planejar",
  status_id: over.status_id ?? null,
});

const img = (n: string) => ({ url: `https://x/${n}.png`, name: `${n}.png`, type: "image/png" });
const mp4 = (n: string) => ({ url: `https://x/${n}.mp4`, name: `${n}.mp4`, type: "video/mp4" });

const build = (demands: FeedDemandInput[], planItems: any[] = []) =>
  buildInstagramFeed({ demands, planItems, stageNames: { planejar: "Planejar" } });

describe("instagramFeed", () => {
  it("A: canal null + criativo_estatico entra", () => {
    expect(build([demand({})]).length).toBe(1);
  });

  it("B: canal Facebook exclui", () => {
    expect(build([demand({ channel: "Facebook" })]).length).toBe(0);
  });

  it("C: canal Instagram, Facebook inclui", () => {
    expect(build([demand({ channel: "Instagram, Facebook" })]).length).toBe(1);
  });

  it("D: carrossel com 8 imagens", () => {
    const [e] = build([
      demand({
        demand_type_key: "carrossel",
        demand_type: "Carrossel",
        attachments: Array.from({ length: 8 }, (_, i) => img(`s${i}`)),
      }),
    ]);
    expect(e.kind).toBe("carousel");
    expect(e.mediaCount).toBe(8);
    expect(e.previewKind).toBe("image");
    expect(e.previewUrl).toBe("https://x/s0.png");
    expect(e.media.length).toBe(8);
    expect(e.media[0]).toEqual({ url: "https://x/s0.png", kind: "image", name: "s0.png" });
  });

  it("E: vídeo com 2 imagens e nenhum mp4 usa a primeira imagem", () => {
    const [e] = build([
      demand({
        demand_type_key: "video_captado",
        demand_type: "Vídeo captado",
        attachments: [img("a"), img("b")],
      }),
    ]);
    expect(e.kind).toBe("video");
    expect(e.previewKind).toBe("image");
    expect(e.previewUrl).toBe("https://x/a.png");
    expect(e.media.length).toBe(1);
  });

  it("F: vídeo só com mp4 usa video-file", () => {
    const [e] = build([
      demand({ demand_type_key: "video_gerado", demand_type: "Vídeo gerado", attachments: [mp4("v")] }),
    ]);
    expect(e.previewKind).toBe("video-file");
  });

  it("G: estático com 2 imagens não vira carrossel", () => {
    const [e] = build([demand({ attachments: [img("a"), img("b")] })]);
    expect(e.kind).toBe("static");
    expect(e.mediaCount).toBe(1);
    expect(e.previewUrl).toBe("https://x/a.png");
    expect(e.media).toEqual([{ url: "https://x/a.png", kind: "image", name: "a.png" }]);
  });

  it("H: stories-only legado é excluído", () => {
    expect(resolveFeedKind({ typeKey: null, typeLabel: "Stories" })).toBeNull();
    expect(build([demand({ demand_type_key: null, demand_type: "Stories" })]).length).toBe(0);
  });

  it("I: legado Vídeo Reels sem key entra como vídeo", () => {
    const [e] = build([demand({ demand_type_key: null, demand_type: "Vídeo Reels" })]);
    expect(e.kind).toBe("video");
  });

  it("J: legado Post Estático sem key entra como estático", () => {
    const [e] = build([demand({ demand_type_key: null, demand_type: "Post Estático" })]);
    expect(e.kind).toBe("static");
  });

  it("K: data mais nova primeiro", () => {
    const list = build([
      demand({ id: "old", title: "DF-001 — Antiga", publish_date: "2026-08-01" }),
      demand({ id: "new", title: "DF-002 — Nova", publish_date: "2026-08-30" }),
    ]);
    expect(list[0].demandId).toBe("new");
  });

  it("L: mesma data, horário mais recente primeiro", () => {
    const list = build([
      demand({ id: "m", title: "DF-001 — Manhã", publish_time: "09:00" }),
      demand({ id: "t", title: "DF-002 — Tarde", publish_time: "18:30" }),
    ]);
    expect(list[0].demandId).toBe("t");
  });

  it("M: snapshot equivalente não duplica", () => {
    const list = build(
      [demand({ id: "live", title: "DF-004 — Título novo", demand_type_key: "video_captado", demand_type: "Vídeo captado" })],
      [{ titulo: "DF-004 — Título antigo", tipo: "Criativo estático", typeKey: null, data: "2026-08-20", canal: null }]
    );
    expect(list.length).toBe(1);
    expect(list[0].isDemand).toBe(true);
  });

  it("snapshot sem live entra como planejado", () => {
    const list = build([], [{ titulo: "DF-050 — Novo", tipo: "Carrossel", typeKey: "carrossel", data: "2026-08-21", canal: null }]);
    expect(list.length).toBe(1);
    expect(list[0].stageLabel).toBe("Planejado · produção não iniciada");
    expect(list[0].demandId).toBeNull();
  });
});

describe("resolveFeedMedia (fallback de referências)", () => {
  const img = (n: string) => ({ url: `https://x/${n}.png`, name: `${n}.png`, type: "image/png" });

  it("prefere attachments quando ambos existem", () => {
    const r = resolveFeedMedia({
      kind: "static",
      attachments: [img("final")],
      referenceAttachments: [img("ref")],
    });
    expect(r.mediaSource).toBe("attachment");
    expect(r.previewUrl).toContain("final");
  });

  it("usa referência quando não há attachment válido", () => {
    const r = resolveFeedMedia({ kind: "static", attachments: [], referenceAttachments: [img("ref")] });
    expect(r.mediaSource).toBe("reference");
    expect(r.previewUrl).toContain("ref");
  });

  it("sem nenhuma mídia retorna fallback vazio", () => {
    const r = resolveFeedMedia({ kind: "static" });
    expect(r.mediaSource).toBeNull();
    expect(r.previewKind).toBe("none");
    expect(r.media).toEqual([]);
  });

  it("carrossel usa todas as referências como slides no fallback", () => {
    const r = resolveFeedMedia({
      kind: "carousel",
      attachments: null,
      referenceAttachments: [img("a"), img("b"), img("c")],
    });
    expect(r.mediaSource).toBe("reference");
    expect(r.mediaCount).toBe(3);
    expect(r.media).toHaveLength(3);
  });

  it("entradas inválidas/vazias não quebram a resolução", () => {
    const r = resolveFeedMedia({
      kind: "static",
      attachments: [null, {}, { url: "" }, "https://x/doc.txt"] as unknown,
      referenceAttachments: [img("ref")],
    });
    expect(r.mediaSource).toBe("reference");
  });

  it("attachment adicionado depois vence a referência", () => {
    const before = resolveFeedMedia({ kind: "video", referenceAttachments: [img("ref")] });
    expect(before.mediaSource).toBe("reference");
    const after = resolveFeedMedia({
      kind: "video",
      attachments: [{ url: "https://x/v.mp4", name: "v.mp4", type: "video/mp4" }],
      referenceAttachments: [img("ref")],
    });
    expect(after.mediaSource).toBe("attachment");
    expect(after.previewKind).toBe("video-file");
  });

  it("buildInstagramFeed marca mediaSource=reference no fallback", () => {
    const [entry] = buildInstagramFeed({
      demands: [
        {
          id: "d1",
          title: "Post",
          demand_type_key: "criativo_estatico",
          publish_date: "2026-08-10",
          attachments: [],
          reference_attachments: [img("ref")],
        },
      ],
      planItems: [],
    });
    expect(entry.mediaSource).toBe("reference");
    expect(feedHasMedia(entry)).toBe(true);
  });
});
