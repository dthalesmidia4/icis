import { describe, expect, it } from "vitest";
import {
  refreshScopeFor,
  showsGlobalLoading,
  STAGE_PATCH_COLUMNS,
} from "@/lib/boardRefreshPolicy";

describe("boardRefreshPolicy", () => {
  it("E: troca simples de etapa não recarrega o quadro inteiro nem liga loading global", () => {
    for (const reason of ["stage_change", "type_stage_change", "reassign", "proceed", "card_saved"] as const) {
      expect(refreshScopeFor(reason)).toBe("card");
      expect(showsGlobalLoading(reason)).toBe(false);
    }
  });

  it("mudanças de composição do quadro continuam com recarga completa", () => {
    for (const reason of ["archive", "unarchive", "create", "delete", "bulk_allocation", "release_queue"] as const) {
      expect(refreshScopeFor(reason)).toBe("full");
      expect(showsGlobalLoading(reason)).toBe(true);
    }
  });

  it("F: o patch pontual cobre os campos que definem etapa/responsável", () => {
    for (const col of ["current_function_key", "demand_type_key", "assigned_to", "status_id", "updated_at"]) {
      expect(STAGE_PATCH_COLUMNS).toContain(col as any);
    }
  });
});
