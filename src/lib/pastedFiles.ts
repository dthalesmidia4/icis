/**
 * Helpers puros para arquivos vindos de clipboard (paste) ou drop externo.
 * Mantidos fora do componente para permitir testes unitários.
 */

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

const SAFE_EXT = /^[a-z0-9]{1,5}$/;

export function extensionForMime(mime?: string | null): string {
  if (!mime) return "bin";
  const known = MIME_EXTENSIONS[mime.toLowerCase()];
  if (known) return known;
  const sub = mime.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  return SAFE_EXT.test(sub) ? sub : "bin";
}

export function hasUsableFileName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 && dot < trimmed.length - 1;
}

export function buildPastedFileName(mime: string | undefined, index: number, now = Date.now()): string {
  return `arquivo-colado-${now}-${index + 1}.${extensionForMime(mime)}`;
}

/** Renomeia apenas arquivos sem nome/extensão útil, preservando bytes e MIME. */
export function normalizePastedFiles(files: File[], now = Date.now()): File[] {
  return files.map((file, index) => {
    if (hasUsableFileName(file.name)) return file;
    return new File([file], buildPastedFileName(file.type, index, now), {
      type: file.type,
      lastModified: file.lastModified || now,
    });
  });
}

/** Extrai File[] reais de um ClipboardData, ignorando texto/HTML/URL. */
export function extractClipboardFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const collected: File[] = Array.from(data.files || []);
  if (!collected.length && data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) collected.push(file);
    }
  }
  const seen = new Set<string>();
  return collected.filter((file) => {
    const key = `${file.name}|${file.size}|${file.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
