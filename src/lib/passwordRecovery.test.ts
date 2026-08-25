import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_SUCCESS_QUERY,
  RECOVERY_ENTRY_QUERY,
  RECOVERY_PENDING_KEY,
  RECOVERY_REQUEST_GENERIC_MESSAGE,
  RESET_PASSWORD_PATH,
  buildRecoveryEntryUrl,
  classifyRecoveryUrl,
  hasValidRecoveryEvidence,
  isRecoveryEntryLocation,
  isValidRecoveryEmail,
  validateNewPassword,
} from "./passwordRecovery";

const authSource = readFileSync("src/pages/Auth.tsx", "utf8");
const pageSource = readFileSync("src/pages/ResetPassword.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const protectedRouteSource = readFileSync("src/components/ProtectedRoute.tsx", "utf8");
const useAuthSource = readFileSync("src/hooks/useAuth.tsx", "utf8");

describe("login: esqueci minha senha", () => {
  it("1. o login contém o gatilho 'Esqueci minha senha'", () => {
    expect(authSource).toContain("Esqueci minha senha");
  });

  it("2. o pedido usa resetPasswordForEmail com callback raiz /?recovery=1", () => {
    expect(authSource).toContain("resetPasswordForEmail");
    expect(authSource).toContain("buildRecoveryEntryUrl(window.location.origin)");
    expect(authSource).not.toContain("buildResetPasswordRedirectUrl(window.location.origin)");
    expect(buildRecoveryEntryUrl("https://icis.lovable.app")).toBe("https://icis.lovable.app/?recovery=1");
    expect(RECOVERY_ENTRY_QUERY).toBe("recovery=1");
    expect(RESET_PASSWORD_PATH).toBe("/reset-password");
  });

  it("11. resetPasswordForEmail checa retorno .error sem expor erro bruto", () => {
    expect(authSource).toContain("const { error } = await supabase.auth.resetPasswordForEmail");
    expect(authSource).toContain("if (error)");
    expect(authSource).toContain("RECOVERY_REQUEST_GENERIC_FAILURE");
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

  it("2b. a rota / com recovery entry renderiza ResetPassword antes de ProtectedRoute", () => {
    const rootEntryStart = appSource.indexOf("const RootEntry");
    const recoveryCheck = appSource.indexOf("isRecoveryEntryLocation", rootEntryStart);
    const resetReturn = appSource.indexOf("return <ResetPassword />", rootEntryStart);
    const protectedReturn = appSource.indexOf("<ProtectedRoute>", rootEntryStart);
    expect(rootEntryStart).toBeGreaterThanOrEqual(0);
    expect(recoveryCheck).toBeGreaterThan(rootEntryStart);
    expect(resetReturn).toBeGreaterThan(recoveryCheck);
    expect(protectedReturn).toBeGreaterThan(resetReturn);
    expect(appSource).toContain('<Route path="/" element={<RootEntry />} />');
  });

  it("12. compat /reset-password permanece pública", () => {
    const route = appSource
      .split("\n")
      .find((line) => line.includes('path="/reset-password"'));
    expect(route).toContain("element={<ResetPassword />}");
    expect(route).not.toContain("ProtectedRoute");
  });

  it("13. fallback de deep route não depende de _redirects no Lovable", () => {
    expect(buildRecoveryEntryUrl("https://icis.lovable.app")).toBe("https://icis.lovable.app/?recovery=1");
    expect(existsSync("public/_redirects")).toBe(false);
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
        recoveryPending: false,
        recoveryEntry: true,
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

  it("reconhece entry root, hash recovery e compat legado", () => {
    expect(isRecoveryEntryLocation("/", "?recovery=1", "")).toBe(true);
    expect(isRecoveryEntryLocation("/reset-password", "", "")).toBe(true);
    expect(isRecoveryEntryLocation("/", "", "#type=recovery")).toBe(true);
    expect(isRecoveryEntryLocation("/", "", "")).toBe(false);
  });

  it("5. PASSWORD_RECOVERY marca pending", () => {
    expect(pageSource).toContain("if (event === 'PASSWORD_RECOVERY')");
    expect(pageSource).toContain("markRecoveryPending()");
    expect(useAuthSource).toContain("if (event === 'PASSWORD_RECOVERY')");
    expect(useAuthSource).toContain("markRecoveryPending()");
  });

  it("8. refresh /?recovery=1 com pending + session continua ready", () => {
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: false,
        sessionFromCode: false,
        urlKind: "none",
        hasSession: true,
        recoveryPending: true,
        recoveryEntry: true,
      }),
    ).toBe(true);
  });

  it("9. sessão comum + /?recovery=1 sem pending é inválida", () => {
    expect(
      hasValidRecoveryEvidence({
        passwordRecoveryEvent: false,
        sessionFromCode: false,
        urlKind: "none",
        hasSession: true,
        recoveryPending: false,
        recoveryEntry: true,
      }),
    ).toBe(false);
  });
});

describe("bloqueio de sessão temporária de recovery", () => {
  it("3. ProtectedRoute bloqueia pending recovery mesmo com user presente", () => {
    expect(protectedRouteSource).toContain("isRecoveryPending()");
    expect(protectedRouteSource).toContain("<Navigate to={`/?${RECOVERY_ENTRY_QUERY}`} replace />");
    expect(protectedRouteSource.indexOf("if (!user)")).toBeLessThan(
      protectedRouteSource.indexOf("if (isRecoveryPending())"),
    );
  });

  it("4. Auth não redireciona recovery pending para Home normal", () => {
    expect(authSource).toContain("isRecoveryPending() ? `/?${RECOVERY_ENTRY_QUERY}` : '/'");
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
    const clearIndex = pageSource.indexOf("clearRecoveryPending();", pageSource.indexOf("toast.success('Senha alterada"));
    const signOutIndex = pageSource.indexOf("await supabase.auth.signOut()", clearIndex);
    const navigateIndex = pageSource.indexOf("navigate(`/auth?${PASSWORD_RESET_SUCCESS_QUERY}`, { replace: true })", signOutIndex);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(signOutIndex).toBeGreaterThan(clearIndex);
    expect(navigateIndex).toBeGreaterThan(signOutIndex);
    expect(pageSource).toContain("supabase.auth.signOut()");
    expect(pageSource).toContain("navigate(`/auth?${PASSWORD_RESET_SUCCESS_QUERY}`, { replace: true })");
    expect(PASSWORD_RESET_SUCCESS_QUERY).toBe("password-reset=success");
  });

  it("7. cancelar limpa pending e encerra sessão temporária", () => {
    const leaveStart = pageSource.indexOf("const leaveRecovery");
    const clearIndex = pageSource.indexOf("clearRecoveryPending();", leaveStart);
    const signOutIndex = pageSource.indexOf("await supabase.auth.signOut()", leaveStart);
    const navigateIndex = pageSource.indexOf("navigate(target, { replace: true })", leaveStart);
    expect(leaveStart).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeGreaterThan(leaveStart);
    expect(signOutIndex).toBeGreaterThan(clearIndex);
    expect(navigateIndex).toBeGreaterThan(signOutIndex);
  });
});

describe("segurança", () => {
  it("10. nenhum token/code é persistido; só boolean pending em sessionStorage", () => {
    const helperSource = readFileSync("src/lib/passwordRecovery.ts", "utf8");
    expect(pageSource).not.toMatch(/localStorage\.setItem/);
    expect(pageSource).not.toMatch(/sessionStorage\.setItem/);
    expect(helperSource).toContain("sessionStorage");
    expect(helperSource).toContain("setItem(RECOVERY_PENDING_KEY, \"1\")");
    expect(RECOVERY_PENDING_KEY).toBe("icis_password_recovery_pending");
    expect(helperSource).not.toMatch(/setItem\([^\n]*(access_token|refresh_token|code|token_hash|password)/i);
  });

  it("não loga tokens, e-mail ou senha", () => {
    expect(pageSource).not.toMatch(/console\.(log|error|warn)/);
    expect(pageSource).toContain("history.replaceState");
    expect(pageSource).not.toMatch(/access_token|refresh_token/);
  });

  it("12. link inválido mostra estado seguro sem erro bruto do Supabase", () => {
    expect(pageSource).toContain("Este link de recuperação é inválido ou expirou.");
    expect(pageSource).not.toContain("error.message");
  });
});
