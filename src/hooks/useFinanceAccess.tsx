/**
 * Acesso ao Financeiro.
 *
 * Regra (espelhada na RLS via `public.has_finance_access`):
 * - super_admin e agency_admin: sempre;
 * - agency_manager: só com `user_roles.finance_access = true`;
 * - qualquer outro papel: nunca.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/contexts/AgencyContext";

export function useFinanceAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [canAccess, setCanAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const check = useCallback(async () => {
    if (authLoading || agencyLoading) return;
    if (!user || !agencyId) {
      setCanAccess(false);
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("has_finance_access", { _tenant_id: agencyId });
    if (error) console.error("[useFinanceAccess]", error);
    setCanAccess(data === true);
    setIsLoading(false);
  }, [user, agencyId, authLoading, agencyLoading]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`finance-access-${user.id}`)
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

  return { canAccess, isLoading: isLoading || authLoading || agencyLoading, refresh: check };
}
