// Shared helper to fetch a remote image and return inline base64 payload
// suitable for Google AI Studio (Gemini) `inlineData` parts.
export type InlineImage = { mimeType: string; data: string };

export async function fetchInlineImage(url: string): Promise<InlineImage | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const mimeType = (resp.headers.get("content-type") || "image/png").split(";")[0].trim();
    return { mimeType, data: btoa(binary) };
  } catch (e) {
    console.error("fetchInlineImage failed:", e);
    return null;
  }
}

export async function fetchInlineImages(urls: string[]): Promise<InlineImage[]> {
  const out: InlineImage[] = [];
  for (const u of urls) {
    const inline = await fetchInlineImage(u);
    if (inline) out.push(inline);
  }
  return out;
}
