import { supabase } from "@/integrations/supabase/client";

export const BILL_ATTACHMENTS_BUCKET = "bill-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * O bucket de comprovantes é privado. Registros antigos guardaram a URL pública
 * completa; novos registros guardam apenas o path. Esta função extrai o path
 * em ambos os casos.
 */
export function billAttachmentPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (!value) return null;

  const marker = `/${BILL_ATTACHMENTS_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index >= 0) {
    const path = value.slice(index + marker.length).split("?")[0];
    return path ? decodeURIComponent(path) : null;
  }

  if (/^https?:\/\//i.test(value)) return null;
  return value.replace(/^\/+/, "");
}

/** Gera uma URL assinada temporária para visualizar/baixar o comprovante. */
export async function resolveBillAttachmentUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  const path = billAttachmentPath(stored);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BILL_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
