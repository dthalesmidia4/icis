import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canManageFinancePassword,
  parseFinancePasswordStatus,
  resolveFinanceGatePhase,
  shouldRenderFinanceChildren,
  validateNewFinancePassword,
} from "./financePasswordGate";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("financePasswordGate", () => {
  it("A. configured=false + can_setup=true -> criação obrigatória, sem filhos", () => {
    const phase = resolveFinanceGatePhase({ configured: false, canSetup: true });
    expect(phase).toBe("setup");
    expect(shouldRenderFinanceChildren(phase)).toBe(false);
  });

  it("B. configured=false + can_setup=false -> bloqueado, sem filhos", () => {
    const phase = resolveFinanceGatePhase({ configured: false, canSetup: false });
    expect(phase).toBe("setup_blocked");
    expect(shouldRenderFinanceChildren(phase)).toBe(false);
  });

  it("C. após criar a senha (unlock em memória) -> monta filhos", () => {
    const phase = resolveFinanceGatePhase(
      { configured: true, canSetup: true },
      { unlockedInMemory: true },
    );
    expect(shouldRenderFinanceChildren(phase)).toBe(true);
  });

  it("D. configured=true -> pede senha até validar", () => {
    const locked = resolveFinanceGatePhase({ configured: true, canSetup: false });
    expect(locked).toBe("unlock");
    expect(shouldRenderFinanceChildren(locked)).toBe(false);
    const unlocked = resolveFinanceGatePhase(
      { configured: true, canSetup: false },
      { unlockedInMemory: true },
    );
    expect(shouldRenderFinanceChildren(unlocked)).toBe(true);
  });

  it("E. senha incorreta mantém unlockedInMemory=false -> continua bloqueado", () => {
    const phase = resolveFinanceGatePhase(
      { configured: true, canSetup: false },
      { unlockedInMemory: false },
    );
    expect(phase).toBe("unlock");
  });

  it("F/G. sem status (novo mount/refresh) -> loading e nunca filhos", () => {
    expect(shouldRenderFinanceChildren(resolveFinanceGatePhase(null))).toBe(false);
    // remount: unlock em memória é perdido porque o estado inicia em false
    expect(resolveFinanceGatePhase({ configured: true, canSetup: true })).toBe("unlock");
  });

  it("erro de status faz fail closed", () => {
    const phase = resolveFinanceGatePhase(null, { statusError: true });
    expect(phase).toBe("error");
    expect(shouldRenderFinanceChildren(phase)).toBe(false);
  });

  it("parse trata payload ausente como não configurado e sem permissão", () => {
    expect(parseFinancePasswordStatus(null)).toEqual({ configured: false, canSetup: false });
    expect(parseFinancePasswordStatus({ configured: true, can_setup: true })).toEqual({
      configured: true,
      canSetup: true,
    });
  });

  it("valida tamanho e confirmação da nova senha", () => {
    expect(validateNewFinancePassword("123", "123").ok).toBe(false);
    expect(validateNewFinancePassword("abcd", "abce").ok).toBe(false);
    expect(validateNewFinancePassword("a".repeat(65), "a".repeat(65)).ok).toBe(false);
    expect(validateNewFinancePassword("abcd", "abcd").ok).toBe(true);
  });

  it("I. alteração de senha só para can_setup", () => {
    expect(canManageFinancePassword({ configured: true, canSetup: true })).toBe(true);
    expect(canManageFinancePassword({ configured: true, canSetup: false })).toBe(false);
    expect(canManageFinancePassword(null)).toBe(false);
  });

  it("H. gate não usa storage/cookie e settings usa apenas set_finance_password", () => {
    const gate = read("src/components/finance/FinanceAccessGate.tsx");
    expect(gate).not.toMatch(/sessionStorage|localStorage|document\.cookie/);
    expect(gate).not.toMatch(/uma vez por sessão/);
    const settings = read("src/components/finance/FinancePasswordSettingsCard.tsx");
    expect(settings).not.toMatch(/sessionStorage|localStorage|document\.cookie/);
    expect(settings).toMatch(/set_finance_password/);
    expect(settings).not.toMatch(/verify_finance_password/);
  });

  it("Financial.tsx mantém o gate envolvendo o cockpit e a seção de senha nos Ajustes", () => {
    const page = read("src/pages/Financial.tsx");
    expect(page).toMatch(/<FinanceAccessGate>[\s\S]*<FinancialCockpit \/>[\s\S]*<\/FinanceAccessGate>/);
    expect(page).toMatch(/FinancePasswordSettingsCard/);
  });
});
