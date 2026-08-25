import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_SUCCESS_QUERY,
  RECOVERY_REQUEST_GENERIC_MESSAGE,
  RESET_PASSWORD_PATH,
  buildResetPasswordRedirectUrl,
  classifyRecoveryUrl,
  hasValidRecoveryEvidence,
  isValidRecoveryEmail,
  validateNewPassword,
} from "./passwordRecovery";

const authSource = readFileSync("src/pages/Auth.tsx", "utf8");
const pageSource = readFileSync("src/pages/ResetPassword.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

describe("login: esqueci minha senha", () => {
  it("1. o login contém o gatilho 'Esqueci minha senha'", () => {
    expect(authSource).toContain("Esqueci minha senha");
  });

  it("2. o pedido usa resetPasswordForEmail com redirectTo em /reset-password", () => {
    expect(authSource).toContain("resetPasswordForEmail");
    expect(authSource).toContain("buildResetPasswordRedirectUrl(window.location.origin)");
    expect(buildResetPasswordRedirectUrl("https://icis.lovable.app")).toBe(
      "https://icis.lovable.app/reset-password",
    );
    expect(RESET_PASSWORD_PATH).toBe("/reset-password");
  });

  it("3. a mensagem de sucesso não enumera a existência da conta", () => {
    expect(RECOVERY_REQUEST_GENERIC_MESSAGE).toMatch(/Se existir uma conta/i);
    expect(RECOVERY_REQUEST_GENERIC_MESSAGE).not.toMatch(/não encontrad|inexistent|cadastrad[oa] com/i);
    expect(authSource).toContain("RECOVERY_REQUEST_GENERIC_MESSAGE");
  });

  it("valida formato de e-mail antes de enviar", () => {
    expect(isValidRecoveryEmail("a@b.com")).toBe(true);
    expect(isValidRecoveryEmail(" ")).toBe(false);
    expect(isValidRecoveryEmail("sem-arroba")).toBe(false);
  });
});

describe("rota /reset-password", () => {
  it("4. é pública, fora de ProtectedRoute/RequireTenant/Layout", () => {
    const route = appSource
      .split("\n")
      .find((line) => line.includes('path="/reset-password"'));
    expect(route).toBeTruthy();
    expect(route).toContain("element={<ResetPassword />}");
    expect(route).not.toContain("ProtectedRoute");
    expect(route).not.toContain("RequireTenant");
    expect(route).not.toContain("Layout");
  });

  it("5. a página trata o evento PASSWORD_RECOVERY", () => {
    expect(pageSource).toContain("onAuthStateChange");
    expect(pageSource).toContain("PASSWORD_RECOVERY");
  });
});

describe("prova de recovery", () => {
  it("6. não aceita sessão comum sem evidência de recovery", () => {
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: false,
        sessionFromCode: false,
        urlKind: "none",
        hasSession: true,
      }),
    ).toBe(false);
  });

  it("aceita evento PASSWORD_RECOVERY, code trocado ou hash de recovery com sessão", () => {
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: true,
        sessionFromCode: false,
        urlKind: "none",
        hasSession: false,
      }),
    ).toBe(true);
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: false,
        sessionFromCode: true,
        urlKind: "code",
        hasSession: true,
      }),
    ).toBe(true);
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: false,
        sessionFromCode: false,
        urlKind: "recovery_hash",
        hasSession: true,
      }),
    ).toBe(true);
  });

  it("erro do provedor nunca é prova válida", () => {
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: true,
        sessionFromCode: true,
        urlKind: "provider_error",
        hasSession: true,
      }),
    ).toBe(false);
  });

  it("classifica os formatos de URL de retorno", () => {
    expect(classifyRecoveryUrl("?code=abc", "").kind).toBe("code");
    expect(classifyRecoveryUrl("?code=abc", "").code).toBe("abc");
    expect(classifyRecoveryUrl("", "#type=recovery&access_token=x").kind).toBe("recovery_hash");
    expect(classifyRecoveryUrl("?error_code=otp_expired", "").kind).toBe("provider_error");
    expect(classifyRecoveryUrl("", "").kind).toBe("none");
    expect(classifyRecoveryUrl("", "").hasSensitiveParams).toBe(false);
    expect(classifyRecoveryUrl("?code=abc", "").hasSensitiveParams).toBe(true);
  });
});

describe("nova senha", () => {
  it("7. senha com menos de 6 caracteres é rejeitada", () => {
    const r = validateNewPassword("12345", "12345");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/6 caracteres/);
  });

  it("senha vazia ou só espaços é rejeitada", () => {
    expect(validateNewPassword("      ", "      ").ok).toBe(false);
  });

  it("8. confirmação diferente é rejeitada", () => {
    const r = validateNewPassword("segura123", "segura124");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/não coincidem/);
  });

  it("aceita senha válida com confirmação igual", () => {
    expect(validateNewPassword("segura123", "segura123").ok).toBe(true);
  });

  it("9. atualiza via supabase.auth.updateUser({ password })", () => {
    expect(pageSource).toContain("supabase.auth.updateUser({ password })");
  });

  it("10. sucesso faz signOut e volta para /auth", () => {
    expect(pageSource).toContain("supabase.auth.signOut()");
    expect(pageSource).toContain("navigate(`/auth?${PASSWORD_RESET_SUCCESS_QUERY}`, { replace: true })");
    expect(PASSWORD_RESET_SUCCESS_QUERY).toBe("password-reset=success");
  });
});

describe("segurança", () => {
  it("11. nenhum token é persistido em localStorage/sessionStorage pela página", () => {
    expect(pageSource).not.toMatch(/localStorage\.setItem/);
    expect(pageSource).not.toMatch(/sessionStorage\.setItem/);
    expect(pageSource).not.toMatch(/access_token|refresh_token/);
  });

  it("não loga tokens, e-mail ou senha", () => {
    expect(pageSource).not.toMatch(/console\.(log|error|warn)/);
    expect(pageSource).toContain("history.replaceState");
  });

  it("12. link inválido mostra estado seguro sem erro bruto do Supabase", () => {
    expect(pageSource).toContain("Este link de recuperação é inválido ou expirou.");
    expect(pageSource).not.toContain("error.message");
  });
});
