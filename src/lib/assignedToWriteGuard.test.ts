/**
 * GUARDA DE CONTRATO: nenhum caminho de UI pode gravar `assigned_to`
 * diretamente. Toda troca de responsável passa por `applyReassign`
 * (administrativa) ou pelos módulos de transição real de processo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

/** Módulos autorizados a escrever `assigned_to` (transições reais / contrato). */
const ALLOWLIST = new Set([
  "lib/reassignDemand.ts",
  "lib/proceedDemand.ts",
  "lib/flowTransition.ts",
  "lib/flowTransitionCore.ts",
  "lib/bulkAllocation.ts",
  "lib/reactivateDemand.ts",
  "lib/typeStageChange.ts",
  "lib/draftDemand.ts",
  "lib/returnTargetResolution.ts",
  "lib/releaseQueue.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("gravação de assigned_to", () => {
  it("só acontece nos módulos do contrato central", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      // .update({ ... assigned_to ... }) na mesma linha ou logo abaixo
      if (/\.update\(\s*\{[^}]*assigned_to\s*:/s.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
