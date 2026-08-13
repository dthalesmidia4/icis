/**
 * Helpers puros para as DUAS coleções independentes de arquivos de uma demanda:
 * - `final`     → `demands.attachments` (canônico: entrega, descrição, agendamento, publicação)
 * - `reference` → `demands.reference_attachments` (apoio à execução, nunca publicado)
 */

export type AttachmentCollection = "final" | "reference";

/** Segmento extra de path usado apenas por referências. */
export const REFERENCE_PATH_SEGMENT = "references";

/**
 * Define o destino de um upload/drop/paste a partir da seção ativa do TaskCard.
 * Qualquer seção diferente de `referencias` opera nos arquivos finais.
 */
export function resolveUploadCollection(activeSection: string | null | undefined): AttachmentCollection {
  return activeSection === "referencias" ? "reference" : "final";
}

export function extensionFromFileName(fileName: string | null | undefined): string {
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  return /^[a-z0-9]{1,6}$/.test(ext) ? ext : "bin";
}

export interface BuildStoragePathArgs {
  tenantId: string;
  clientId?: string | null;
  periodPlanId?: string | null;
  cardId: string;
  fileName: string;
  collection: AttachmentCollection;
  timestamp?: number;
  uniqueId?: string;
}

/**
 * Mantém EXATAMENTE o path histórico dos arquivos finais e adiciona apenas o
 * segmento `references/` para a coleção de referências.
 */
export function buildAttachmentStoragePath({
  tenantId,
  clientId,
  periodPlanId,
  cardId,
  fileName,
  collection,
  timestamp = Date.now(),
  uniqueId = Math.random().toString(36).substring(2, 9),
}: BuildStoragePathArgs): string {
  const period = periodPlanId || "sem-periodo";
  const base = `${tenantId}/${clientId || ""}/${period}/${cardId}`;
  const leaf = `${timestamp}-${uniqueId}.${extensionFromFileName(fileName)}`;
  return collection === "reference"
    ? `${base}/${REFERENCE_PATH_SEGMENT}/${leaf}`
    : `${base}/${leaf}`;
}

/** Nunca permite que uma coleção seja usada como mídia final por engano. */
export function isReferencePath(storagePath: string | null | undefined): boolean {
  return !!storagePath && storagePath.includes(`/${REFERENCE_PATH_SEGMENT}/`);
}
