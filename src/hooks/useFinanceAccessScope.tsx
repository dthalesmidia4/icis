/**
 * Escopo de acesso ao Financeiro.
 *
 * Fonte da verdade: RPC `public.finance_access_scope` (SECURITY DEFINER).
 * - `full`  -> super_admin / agency_admin / manager com `finance_access`
 * - `tools` -> `user_roles.finance_tools_access = true`
 * - `none`  -> sem acesso
 *
 * Enquanto carrega, tudo é tratado como bloqueado (fail closed visual). A RLS
 * continua sendo a autoridade final sobre os dados.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/contexts/AgencyContext";
import { FinanceScope, financeScopeFlags, parseFinanceScope } from "@/lib/financeScope";

export function useFinanceAccessScope() {
  const { user, isLoading: authLoading } = useAuth();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [scope, setScope] = useState<FinanceScope>("none");
  const [isLoading, setIsLoading] = useState(true);

  const check = useCallback(async () => {
    if (authLoading || agencyLoading) return;
    if (!user || !agencyId) {
      setScope("none");
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("finance_access_scope", { _tenant_id: agencyId });
    if (error) console.error("[useFinanceAccessScope]", error);
    setScope(error ? "none" : parseFinanceScope(data));
    setIsLoading(false);
  }, [user, agencyId, authLoading, agencyLoading]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`finance-scope-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => check(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, check]);

  const loading = isLoading || authLoading || agencyLoading;
  const flags = financeScopeFlags(loading ? "none" : scope);

  return { ...flags, isLoading: loading, refresh: check };
}
