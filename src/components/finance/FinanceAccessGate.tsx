/**
 * Trava de senha do Financeiro.
 *
 * A senha NUNCA é validada no cliente: o hash vive em `tenants` e a conferência
 * acontece em `public.verify_finance_password` (SECURITY DEFINER).
 *
 * O desbloqueio existe SOMENTE em memória, enquanto este componente está
 * montado: sair do módulo, dar refresh ou reabrir a aba pede senha de novo.
 * Nenhum armazenamento do navegador (storage ou cookie) é usado.
 *
 * A trava é a SEGUNDA camada: quem não tem `has_finance_access` já não chega
 * até aqui, e a RLS continua sendo a autoridade final sobre os dados.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toast } from "sonner";
import {
  FINANCE_PASSWORD_MAX,
  type FinancePasswordStatus,
  parseFinancePasswordStatus,
  resolveFinanceGatePhase,
  shouldRenderFinanceChildren,
  validateNewFinancePassword,
} from "@/lib/financePasswordGate";

interface Props {
  children: React.ReactNode;
}

export default function FinanceAccessGate({ children }: Props) {
  const { agencyId } = useAgency();
  const navigate = useNavigate();
  const [status, setStatus] = useState<FinancePasswordStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  // Único lugar do unlock: memória do componente.
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) return;
    setStatusError(false);
    const { data, error } = await supabase.rpc("finance_password_status", { _tenant_id: agencyId });
    if (error) {
      setStatus(null);
      setStatusError(true);
      return;
    }
    setStatus(parseFinancePasswordStatus(data));
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  const phase = resolveFinanceGatePhase(status, { statusError, unlockedInMemory: unlocked });

  const handleUnlock = async () => {
    if (!agencyId || !password.trim() || busy) return;
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
    setPassword("");
    setUnlocked(true);
  };

  const handleSetup = async () => {
    if (!agencyId || busy) return;
    const check = validateNewFinancePassword(password, confirmPassword);
    if (!check.ok) {
      toast.error(check.message ?? "Senha inválida");
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
    setPassword("");
    setConfirmPassword("");
    toast.success("Senha do Financeiro criada");
    setStatus({ configured: true, canSetup: true });
    setUnlocked(true);
  };

  if (!agencyId || phase === "loading") {
    return <LoadingScreen title="Verificando a trava do Financeiro..." />;
  }

  if (shouldRenderFinanceChildren(phase)) return <>{children}</>;

  const goBack = () => navigate("/");

  if (phase === "error") {
    return (
      <div className="container max-w-md mx-auto px-4 py-16">
        <Card className="p-6 space-y-5 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Não foi possível verificar a senha</h1>
            <p className="text-sm text-muted-foreground">
              O Financeiro permanece bloqueado até a verificação funcionar.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-10" onClick={goBack}>
              Voltar
            </Button>
            <Button className="flex-1 min-h-10" onClick={load}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === "setup_blocked") {
    return (
      <div className="container max-w-md mx-auto px-4 py-16">
        <Card className="p-6 space-y-5 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Financeiro protegido</h1>
          <p className="text-sm text-muted-foreground">
            A senha do Financeiro ainda não foi configurada pelo super admin.
          </p>
          <Button variant="outline" className="w-full min-h-10" onClick={goBack}>
            Voltar
          </Button>
        </Card>
      </div>
    );
  }

  const isSetup = phase === "setup";

  return (
    <div className="container max-w-md mx-auto px-4 py-16">
      <Card className="p-6 space-y-5 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          {isSetup ? (
            <ShieldCheck className="w-6 h-6 text-primary" />
          ) : (
            <Lock className="w-6 h-6 text-primary" />
          )}
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {isSetup ? "Crie a senha do Financeiro" : "Digite a senha do Financeiro"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSetup
              ? "Esta senha será solicitada sempre que alguém entrar no Financeiro."
              : "Digite a senha do Financeiro para continuar."}
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div>
            <Label>{isSetup ? "Nova senha" : "Senha"}</Label>
            <Input
              type="password"
              value={password}
              autoFocus
              maxLength={FINANCE_PASSWORD_MAX}
              className="h-10"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (isSetup ? handleSetup : handleUnlock)();
              }}
            />
          </div>
          {isSetup && (
            <div>
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                maxLength={FINANCE_PASSWORD_MAX}
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
          onClick={isSetup ? handleSetup : handleUnlock}
        >
          {busy ? "Verificando..." : isSetup ? "Criar senha e entrar" : "Entrar"}
        </Button>

        <Button variant="ghost" className="w-full" onClick={goBack}>
          Voltar
        </Button>
      </Card>
    </div>
  );
}
