import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "./_shared";

export interface UseRealtimePeriodPlansOptions {
  tenantId: string | null | undefined;
  clientId?: string | null;
  periodPlanId?: string | null;
  onChange: (event: {
    type: "INSERT" | "UPDATE" | "DELETE";
    id: string;
    new: Record<string, any> | null;
    old: Record<string, any> | null;
  }) => void;
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Assina mudanças em `public.period_plans` filtradas por `tenant_id` no server.
 * Filtros adicionais (clientId/company_id, periodPlanId) aplicados no callback.
 */
export function useRealtimePeriodPlans({
  tenantId,
  clientId,
  periodPlanId,
  onChange,
  enabled = true,
  debounceMs = 200,
}: UseRealtimePeriodPlansOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debounced = useDebouncedCallback((event: any) => {
    onChangeRef.current(event);
  }, debounceMs);
  const debouncedRef = useRef(debounced);
  useEffect(() => {
    debouncedRef.current = debounced;
  }, [debounced]);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    const scope = [tenantId, clientId ?? "*", periodPlanId ?? "*"].join("-");
    const channel = supabase
      .channel(`rt-period-plans-${scope}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "period_plans", filter: `tenant_id=eq.${tenantId}` },
        (payload: any) => {
          const rowNew = (payload.new as Record<string, any>) || null;
          const rowOld = (payload.old as Record<string, any>) || null;
          const row = rowNew || rowOld;
          if (!row) return;

          const rowClient = row.company_id ?? row.client_id ?? null;
          if (clientId && rowClient && rowClient !== clientId) return;
          if (periodPlanId && row.id !== periodPlanId) return;

          debouncedRef.current({
            type: payload.eventType,
            id: (row.id as string) || "",
            new: rowNew,
            old: rowOld,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, clientId, periodPlanId, enabled]);
}
