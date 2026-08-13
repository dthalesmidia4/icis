/**
 * Helpers puros para exclusão em massa de ANEXOS FINAIS (`demands.attachments`).
 * Nunca deve ser usado para `reference_attachments`.
 */

export interface BulkRemovableAttachment {
  url?: string;
  storagePath?: string | null;
}

/** A ação em massa só existe quando há mais de 1 anexo final. */
export function canBulkRemoveAttachments(
  attachments: BulkRemovableAttachment[] | null | undefined
): boolean {
  return (attachments?.length ?? 0) > 1;
}

/** Coleta apenas os storagePath válidos dos anexos finais (nunca URLs). */
export function collectAttachmentStoragePaths(
  attachments: BulkRemovableAttachment[] | null | undefined
): string[] {
  return (attachments ?? [])
    .map((a) => (typeof a?.storagePath === "string" ? a.storagePath.trim() : ""))
    .filter((p): p is string => p.length > 0);
}
