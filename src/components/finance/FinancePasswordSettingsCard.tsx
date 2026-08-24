/**
 * Alteração da senha do Financeiro (Ajustes).
 *
 * Só aparece para quem o banco autoriza (`can_setup`, hoje super_admin).
 * Nunca mostra senha atual nem hash; grava exclusivamente via
 * `public.set_finance_password`.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FINANCE_PASSWORD_MAX,
  canManageFinancePassword,
  type FinancePasswordStatus,
  parseFinancePasswordStatus,
  validateNewFinancePassword,
} from "@/lib/financePasswordGate";

export default function FinancePasswordSettingsCard() {
  const { agencyId } = useAgency();
  const [status, setStatus] = useState<FinancePasswordStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) return;
    const { data, error } = await supabase.rpc("finance_password_status", { _tenant_id: agencyId });
    if (error) {
      setStatus(null);
      return;
    }
    setStatus(parseFinancePasswordStatus(data));
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManageFinancePassword(status)) return null;

  const save = async () => {
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
      toast.error("Não foi possível salvar a nova senha");
      return;
    }
    setPassword("");
    setConfirmPassword("");
    toast.success("Nova senha do Financeiro salva");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-2">
        <KeyRound className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <p className="text-[15px] font-semibold">Alterar senha do Financeiro</p>
          <p className="text-sm text-muted-foreground">
            Esta senha será solicitada sempre que alguém entrar no Financeiro. Ela nunca é exibida —
            defina uma nova para substituir a atual.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Nova senha</Label>
          <Input
            type="password"
            value={password}
            maxLength={FINANCE_PASSWORD_MAX}
            className="h-10"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label>Confirmar senha</Label>
          <Input
            type="password"
            value={confirmPassword}
            maxLength={FINANCE_PASSWORD_MAX}
            className="h-10"
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>
      </div>
      <Button className="min-h-10" disabled={busy || !password.trim()} onClick={save}>
        {busy ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </Card>
  );
}
