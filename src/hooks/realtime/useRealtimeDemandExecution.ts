import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseRealtimeDemandExecutionOptions {
  tenantId: string | null | undefined;
  demandId: string | null | undefined;
  onChange: () => void;
  enabled?: boolean;
}

/**
 * Mantém o checklist de EXECUÇÃO sincronizado entre pessoas com o mesmo card
 * aberto. Assinatura local: só existe enquanto o card está aberto.
 */
export function useRealtimeDemandExecution({
  tenantId,
  demandId,
  onChange,
  enabled = true,
}: UseRealtimeDemandExecutionOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tenantId || !demandId) return;
    const channel = supabase
      .channel(`rt-dexec-${demandId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demand_execution_runs",
          filter: `demand_id=eq.${demandId}`,
        },
        () => onChangeRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demand_execution_items",
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
