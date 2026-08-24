/**
 * Lógica pura da trava de senha do Financeiro.
 *
 * Regras não negociáveis:
 * - fail closed: sem status confiável, nada de conteúdo financeiro;
 * - `configured=false` NUNCA libera automaticamente;
 * - o desbloqueio vive apenas em memória (nenhum storage/cookie).
 */

export const FINANCE_PASSWORD_MIN = 4;
export const FINANCE_PASSWORD_MAX = 64;

export interface FinancePasswordStatusPayload {
  configured?: boolean;
  can_setup?: boolean;
}

export interface FinancePasswordStatus {
  configured: boolean;
  canSetup: boolean;
}

/** Fase visível do gate. Só `unlocked` renderiza os filhos. */
export type FinanceGatePhase = "loading" | "error" | "setup" | "setup_blocked" | "unlock" | "unlocked";

export function parseFinancePasswordStatus(data: unknown): FinancePasswordStatus {
  const payload = (data ?? {}) as FinancePasswordStatusPayload;
  return { configured: !!payload.configured, canSetup: !!payload.can_setup };
}

/**
 * Fase inicial a partir do status. `unlockedInMemory` só pode vir do estado
 * React do gate (senha validada ou criada neste mount).
 */
export function resolveFinanceGatePhase(
  status: FinancePasswordStatus | null,
  opts: { statusError?: boolean; unlockedInMemory?: boolean } = {},
): FinanceGatePhase {
  if (opts.statusError) return "error";
  if (!status) return "loading";
  if (opts.unlockedInMemory) return "unlocked";
  if (status.configured) return "unlock";
  return status.canSetup ? "setup" : "setup_blocked";
}

export function shouldRenderFinanceChildren(phase: FinanceGatePhase): boolean {
  return phase === "unlocked";
}

/** Validação do par nova senha / confirmação. */
export function validateNewFinancePassword(
  password: string,
  confirmation: string,
): { ok: true } | { ok: false; message: string } {
  const value = password ?? "";
  if (value.trim().length < FINANCE_PASSWORD_MIN) {
    return { ok: false, message: `A senha deve ter pelo menos ${FINANCE_PASSWORD_MIN} caracteres` };
  }
  if (value.length > FINANCE_PASSWORD_MAX) {
    return { ok: false, message: `A senha deve ter no máximo ${FINANCE_PASSWORD_MAX} caracteres` };
  }
  if (value !== confirmation) return { ok: false, message: "As senhas não conferem" };
  return { ok: true };
}

/** Só super_admin / quem o banco autoriza pode trocar a senha nos Ajustes. */
export function canManageFinancePassword(status: FinancePasswordStatus | null): boolean {
  return !!status?.canSetup;
}
