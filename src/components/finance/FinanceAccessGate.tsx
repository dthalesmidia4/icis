/**
 * Trava de senha do Financeiro.
 *
 * A senha NUNCA é validada no cliente: o hash vive em `tenants` e a conferência
 * acontece em `public.verify_finance_password` (SECURITY DEFINER). Aqui só
 * guardamos, na sessão do navegador, o fato de que a senha já foi aceita —
 * então recarregar a página não pede de novo, mas fechar o navegador pede.
 *
 * A trava é a SEGUNDA camada: quem não tem `has_finance_access` já não chega
 * até aqui, e a RLS continua sendo a autoridade final sobre os dados.
 */
import { useCallback, useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toast } from "sonner";

interface Props {
  children: React.ReactNode;
}

interface PasswordStatus {
  configured: boolean;
  canSetup: boolean;
}

const sessionKey = (tenantId: string) => `finance-unlocked:${tenantId}`;

export default function FinanceAccessGate({ children }: Props) {
  const { agencyId } = useAgency();
  const [status, setStatus] = useState<PasswordStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"unlock" | "setup">("unlock");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) return;
    const { data, error } = await supabase.rpc("finance_password_status", { _tenant_id: agencyId });
    if (error) {
      // Sem status confiável, não inventamos liberação: mantém travado.
      setStatus({ configured: true, canSetup: false });
      return;
    }
    const payload = (data ?? {}) as { configured?: boolean; can_setup?: boolean };
    const next = { configured: !!payload.configured, canSetup: !!payload.can_setup };
    setStatus(next);
    setMode(next.configured ? "unlock" : "setup");
    if (!next.configured) setUnlocked(true); // nada configurado: não há o que travar
    else setUnlocked(sessionStorage.getItem(sessionKey(agencyId)) === "1");
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnlock = async () => {
    if (!agencyId || !password.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_finance_password", {
      _tenant_id: agencyId,
      _password: password,
    });
    setBusy(false);
    if (error || data !== true) {
      toast.error("Senha incorreta");
      setPassword("");
      return;
    }
    sessionStorage.setItem(sessionKey(agencyId), "1");
    setPassword("");
    setUnlocked(true);
  };

  const handleSetup = async () => {
    if (!agencyId) return;
    if (password.trim().length < 4) {
      toast.error("A senha deve ter pelo menos 4 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_finance_password", {
      _tenant_id: agencyId,
      _password: password,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível definir a senha");
      return;
    }
    sessionStorage.setItem(sessionKey(agencyId), "1");
    setPassword("");
    setConfirmPassword("");
    toast.success("Senha do Financeiro definida");
    setStatus({ configured: true, canSetup: true });
    setUnlocked(true);
  };

  if (!agencyId || !status) return <LoadingScreen title="Verificando a trava do Financeiro..." />;

  if (unlocked) return <>{children}</>;

  return (
    <div className="container max-w-md mx-auto px-4 py-16">
      <Card className="p-6 space-y-5 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          {mode === "setup" ? (
            <ShieldCheck className="w-6 h-6 text-primary" />
          ) : (
            <Lock className="w-6 h-6 text-primary" />
          )}
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {mode === "setup" ? "Definir senha do Financeiro" : "Financeiro protegido"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "setup"
              ? "Escolha uma senha para proteger a tela. Ela será pedida uma vez por sessão."
              : "Digite a senha do Financeiro para continuar. Ela é pedida uma vez por sessão."}
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              autoFocus
              className="h-10"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (mode === "setup" ? handleSetup : handleUnlock)();
              }}
            />
          </div>
          {mode === "setup" && (
            <div>
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                className="h-10"
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetup();
                }}
              />
            </div>
          )}
        </div>

        <Button
          className="w-full min-h-10"
          disabled={busy || !password.trim()}
          onClick={mode === "setup" ? handleSetup : handleUnlock}
        >
          {busy ? "Verificando..." : mode === "setup" ? "Salvar senha e entrar" : "Entrar"}
        </Button>

        {mode === "unlock" && status.canSetup && (
          <Button variant="ghost" className="w-full" onClick={() => setMode("setup")}>
            Trocar a senha do Financeiro
          </Button>
        )}
      </Card>
    </div>
  );
}
