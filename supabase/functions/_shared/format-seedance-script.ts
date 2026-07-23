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

/**
 * Estimates whether the Portuguese dialogue in a Seedance script fits the clip duration.
 * PT-BR natural narration averages ~2.3 words/second — we use that as the budget.
 *
 * Returns a report the UI can surface as a warning chip. No mutation is applied to the script.
 */
export function checkSeedanceDialogueBudget(
  script: string,
  durationSeconds: number,
): { spokenWords: number; budgetWords: number; over: boolean; overBy: number } {
  if (!script || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { spokenWords: 0, budgetWords: 0, over: false, overBy: 0 };
  }
  const WORDS_PER_SECOND = 2.3;
  const budgetWords = Math.max(1, Math.round(durationSeconds * WORDS_PER_SECOND));

  // Collect every quoted PT-BR line (labelled or bare) — normalize curly quotes first.
  const normalized = script.replace(/[“”]/g, '"');
  const matches = normalized.match(/"([^"\n]{2,})"/g) ?? [];
  const spokenWords = matches
    .map((m) => m.slice(1, -1).trim())
    .filter(Boolean)
    .reduce((acc, line) => acc + line.split(/\s+/).filter(Boolean).length, 0);

  const over = spokenWords > budgetWords;
  return { spokenWords, budgetWords, over, overBy: over ? spokenWords - budgetWords : 0 };
}
