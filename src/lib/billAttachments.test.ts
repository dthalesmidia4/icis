import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } },
}));

import { billAttachmentPath } from "./billAttachments";

describe("billAttachmentPath", () => {
  it("extrai o path de uma URL pública legada", () => {
    expect(
      billAttachmentPath(
        "https://x.supabase.co/storage/v1/object/public/bill-attachments/tenant-1/abc.pdf",
      ),
    ).toBe("tenant-1/abc.pdf");
  });

  it("extrai o path de uma URL assinada", () => {
    expect(
      billAttachmentPath(
        "https://x.supabase.co/storage/v1/object/sign/bill-attachments/tenant-1/abc.pdf?token=zz",
      ),
    ).toBe("tenant-1/abc.pdf");
  });

  it("aceita path puro", () => {
    expect(billAttachmentPath("tenant-1/abc.pdf")).toBe("tenant-1/abc.pdf");
    expect(billAttachmentPath("/tenant-1/abc.pdf")).toBe("tenant-1/abc.pdf");
  });

  it("ignora vazio e URLs de outros buckets", () => {
    expect(billAttachmentPath(null)).toBeNull();
    expect(billAttachmentPath("   ")).toBeNull();
    expect(billAttachmentPath("https://x.supabase.co/storage/v1/object/public/other/abc.pdf")).toBeNull();
  });
});
