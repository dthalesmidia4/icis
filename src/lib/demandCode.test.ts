import { describe, expect, it } from "vitest";
import { dedupeSnapshotAgainstLive } from "@/lib/demandCode";
import { buildInstagramFeed } from "@/lib/instagramFeed";

const UUID = "e5bfd3bd-d0b2-42f7-8bc0-4391c4a139d2";

describe("dedupeSnapshotAgainstLive — vínculo por UUID", () => {
  it("descarta snapshot com demand_id quando a demand viva mudou de título", () => {
    const result = dedupeSnapshotAgainstLive(
      [{ demand_id: UUID, titulo: "SV-012 · Título antigo" }],
      [{ id: UUID, title: "SV-012 · Título editado depois" }]
    );
    expect(result).toEqual([]);
  });

  it("mantém snapshot planejado sem demand materializada", () => {
    const result = dedupeSnapshotAgainstLive(
      [{ demand_id: null, titulo: "Peça ainda não criada" }],
      [{ id: UUID, title: "Outra coisa" }]
    );
    expect(result).toHaveLength(1);
  });

  it("fallback por título continua valendo para snapshots legados sem UUID", () => {
    const result = dedupeSnapshotAgainstLive(
      [{ titulo: "Post institucional" }],
      [{ id: UUID, title: "post institucional" }]
    );
    expect(result).toEqual([]);
  });
});

describe("buildInstagramFeed — snapshot não concorre com demand viva", () => {
  it("renderiza só a demand viva (clicável pelo UUID) quando o título foi editado", () => {
    const entries = buildInstagramFeed({
      demands: [
        {
          id: UUID,
          title: "SV-012 · Título editado depois",
          demand_type: "Estático",
          demand_type_key: "static",
          publish_date: "2026-08-20",
          publish_time: "10:00:00",
          channel: "instagram",
          attachments: null,
          reference_attachments: null,
          post_caption: null,
          classifications: [],
          current_function_key: null,
          status_id: null,
        } as any,
      ],
      planItems: [
        {
          demand_id: UUID,
          titulo: "SV-012 · Título antigo",
          tipo: "Estático",
          typeKey: "static",
          canal: "instagram",
          data: "2026-08-20",
        },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].isDemand).toBe(true);
    expect(entries[0].demandId).toBe(UUID);
  });
});
