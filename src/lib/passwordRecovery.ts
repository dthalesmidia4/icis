/**
 * Regras puras do fluxo de recuperação de senha.
 *
 * Este módulo NÃO manipula tokens: apenas classifica a *forma* dos parâmetros
 * da URL (presença de `code`, `type=recovery`, erro do provedor) e valida a
 * nova senha. Nada aqui é logado nem persistido.
 */

/** Caminho público da tela de redefinição (usado no redirectTo do Supabase). */
export const RESET_PASSWORD_PATH = "/reset-password";

/** Entrada primária do callback: raiz, para não depender de deep-link do hosting. */
export const RECOVERY_ENTRY_QUERY = "recovery=1";

/** Marcador local não sensível: indica apenas que há recovery em andamento nesta aba. */
export const RECOVERY_PENDING_KEY = "icis_password_recovery_pending";

/** Mensagem genérica anti-enumeração exibida após pedir o link. */
export const RECOVERY_REQUEST_GENERIC_MESSAGE =
  "Se existir uma conta com este e-mail, você receberá um link para redefinir sua senha.";

/** Mensagem genérica de falha temporária (sem detalhes internos). */
export const RECOVERY_REQUEST_GENERIC_FAILURE =
  "Não foi possível concluir a solicitação agora. Tente novamente em alguns minutos.";

/** Mensagem única mostrada no login após reset concluído. */
export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Senha redefinida. Entre com sua nova senha.";

/** Query flag segura (sem token) usada no retorno para /auth. */
export const PASSWORD_RESET_SUCCESS_QUERY = "password-reset=success";

/** Query flag que abre o /auth já no formulário de recuperação. */
export const RECOVERY_OPEN_QUERY = RECOVERY_ENTRY_QUERY;

export const MIN_PASSWORD_LENGTH = 6;

/** Monta o redirectTo absoluto a partir da origin atual (sem hardcode de domínio). */
export function buildResetPasswordRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${RESET_PASSWORD_PATH}`;
}

/** Monta o callback primário em rota que sempre existe no hosting. */
export function buildRecoveryEntryUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/?${RECOVERY_ENTRY_QUERY}`;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markRecoveryPending(): void {
  getSessionStorage()?.setItem(RECOVERY_PENDING_KEY, "1");
}

export function clearRecoveryPending(): void {
  getSessionStorage()?.removeItem(RECOVERY_PENDING_KEY);
}

export function isRecoveryPending(): boolean {
  return getSessionStorage()?.getItem(RECOVERY_PENDING_KEY) === "1";
}

export type RecoveryUrlKind =
  /** Provedor devolveu erro explícito (link expirado/usado). */
  | "provider_error"
  /** Fluxo PKCE: há `code` para trocar por sessão. */
  | "code"
  /** Fluxo implícito: hash com type=recovery. */
  | "recovery_hash"
  /** Nenhuma evidência de recovery na URL. */
  | "none";

export interface RecoveryUrlClassification {
  kind: RecoveryUrlKind;
  /** Presente apenas quando kind === "code". Não é um token de sessão. */
  code?: string;
  /** Indica se a URL traz algum parâmetro que deve ser limpo do histórico. */
  hasSensitiveParams: boolean;
}

/**
 * Classifica a URL de retorno do e-mail de recuperação.
 * Recebe `search` (?a=b) e `hash` (#a=b) já como strings cruas.
 */
export function classifyRecoveryUrl(
  search: string,
  hash: string,
): RecoveryUrlClassification {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const hasSensitiveParams =
    Boolean(
      query.get("code") ||
        query.get("error") ||
        query.get("error_code") ||
        query.get("error_description") ||
        query.get("token_hash"),
    ) ||
    Boolean(
      fragment.get("access_token") ||
        fragment.get("refresh_token") ||
        fragment.get("type") ||
        fragment.get("error") ||
        fragment.get("error_description"),
    );

  if (
    query.get("error") ||
    query.get("error_code") ||
    query.get("error_description") ||
    fragment.get("error") ||
    fragment.get("error_description")
  ) {
    return { kind: "provider_error", hasSensitiveParams };
  }

  const code = query.get("code");
  if (code) {
    return { kind: "code", code, hasSensitiveParams };
  }

  if (fragment.get("type") === "recovery") {
    return { kind: "recovery_hash", hasSensitiveParams };
  }

  return { kind: "none", hasSensitiveParams };
}

/**
 * Indica quando a URL deve ser tratada como entrada pública do recovery antes
 * de qualquer ProtectedRoute. `/reset-password` fica apenas como compat legado.
 */
export function isRecoveryEntryLocation(
  pathname: string,
  search: string,
  hash: string,
): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === RESET_PASSWORD_PATH) return true;

  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (query.get("recovery") === "1") return true;

  const classification = classifyRecoveryUrl(search, hash);
  return classification.kind === "recovery_hash" || classification.kind === "provider_error";
}

export interface RecoveryEvidence {
  /** Evento PASSWORD_RECOVERY observado nesta navegação. */
  passwordRecoveryEvent: boolean;
  /** Sessão estabelecida a partir do `code` recebido nesta navegação. */
  sessionFromCode: boolean;
  /** Classificação da URL de entrada. */
  urlKind: RecoveryUrlKind;
  /** Existe alguma sessão no cliente (pode ser sessão comum pré-existente). */
  hasSession: boolean;
  /** Marcador local não sensível criado por prova de recovery anterior nesta aba. */
  recoveryPending?: boolean;
  /** URL atual é a entrada pública do recovery (`/?recovery=1` ou compat). */
  recoveryEntry?: boolean;
}

/**
 * Uma sessão comum pré-existente NUNCA é prova de recovery: é preciso o evento
 * PASSWORD_RECOVERY, a sessão criada a partir do código desta navegação, ou o
 * hash de recovery com sessão efetivamente estabelecida. Em refresh, a sessão
 * só continua válida se houver o marcador local não sensível de recovery.
 */
export function hasValidRecoveryEvidence(evidence: RecoveryEvidence): boolean {
  if (evidence.urlKind === "provider_error") return false;
  if (evidence.passwordRecoveryEvent) return true;
  if (evidence.sessionFromCode) return true;
  if (evidence.urlKind === "recovery_hash" && evidence.hasSession) return true;
  if (evidence.recoveryPending && evidence.recoveryEntry && evidence.hasSession) return true;
  return false;
}

export interface ResetPasswordValidation {
  ok: boolean;
  message?: string;
}

/** Valida nova senha + confirmação com a mesma regra mínima do cadastro. */
export function validateNewPassword(
  password: string,
  confirmation: string,
): ResetPasswordValidation {
  if (!password || !password.trim()) {
    return { ok: false, message: "Informe uma nova senha." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (password !== confirmation) {
    return { ok: false, message: "As senhas não coincidem." };
  }
  return { ok: true };
}

/** Validação simples de formato de e-mail para o pedido de recuperação. */
export function isValidRecoveryEmail(email: string): boolean {
  const value = email.trim();
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
