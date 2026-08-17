import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseRealtimeDemandChangeRequestsOptions {
  tenantId: string | null | undefined;
  demandId: string | null | undefined;
  onChange: () => void;
  enabled?: boolean;
}

/**
 * Mantém o checklist de alterações sincronizado entre dois usuários com o
 * mesmo card aberto. Assinatura local: só existe enquanto o card está aberto.
 */
export function useRealtimeDemandChangeRequests({
  tenantId,
  demandId,
  onChange,
  enabled = true,
}: UseRealtimeDemandChangeRequestsOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tenantId || !demandId) return;
    const channel = supabase
      .channel(`rt-dcr-${demandId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demand_change_requests",
          filter: `demand_id=eq.${demandId}`,
        },
        () => onChangeRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demand_change_request_items",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => onChangeRef.current(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, demandId, enabled]);
}
