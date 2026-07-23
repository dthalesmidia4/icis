/**
 * Deterministic post-processing for Seedance multi-shot prompts.
 *
 * Models are inconsistent about emitting the requested `\n\n` between CUE blocks:
 * they often collapse everything into a single paragraph, which makes the prompt
 * hard for a human to review. This helper enforces the intended layout regardless
 * of what the model produces.
 *
 * Rules applied (all textual, semantics preserved):
 *  - Blank line before every `CUE <n>` block (except the very first line).
 *  - Line break before every `[cut to]` marker.
 *  - Portuguese spoken dialogue on its own line (both the labelled form
 *    `Portuguese spoken dialogue: "…"` and bare quoted lines inside a CUE).
 *  - Collapse 3+ consecutive newlines into exactly 2.
 *  - Trim trailing/leading whitespace.
 */
export function formatSeedanceScript(raw: string): string {
  if (!raw) return "";
  let out = raw.replace(/\r\n/g, "\n");

  // Blank line before every "CUE <n>" block, but not at start-of-string.
  out = out.replace(/([^\n])\s*(\bCUE\s+\d)/g, "$1\n\n$2");

  // Line break before every "[cut to]".
  out = out.replace(/([^\n])\s*(\[cut to\])/gi, "$1\n$2");

  // Labelled dialogue on its own line.
  out = out.replace(
    /([^\n])\s*(Portuguese spoken dialogue:\s*["“][^"”\n]+["”])/g,
    "$1\n$2",
  );
  out = out.replace(
    /(Portuguese spoken dialogue:\s*["“][^"”\n]+["”])(\s*)(?!\n)/g,
    "$1\n",
  );

  // Bare quoted PT-BR line ("…") when it follows narration on the same line.
  // Only splits when the quote is a full standalone sentence-like segment (starts with a capital).
  out = out.replace(
    /([.!?…])\s+(["“][A-ZÀ-ÿ][^"”\n]{2,}["”])/g,
    "$1\n$2",
  );

  // Collapse 3+ newlines into 2.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
