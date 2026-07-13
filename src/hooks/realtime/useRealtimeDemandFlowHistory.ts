import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseRealtimeDemandFlowHistoryOptions {
  tenantId: string | null | undefined;
  clientId?: string | null;
  demandId?: string | null;
  onInsert: (row: Record<string, any>) => void;
  enabled?: boolean;
}

/**
 * Assina INSERTs em `public.demand_flow_history` filtrando por tenant no server.
 */
export function useRealtimeDemandFlowHistory({
  tenantId,
  clientId,
  demandId,
  onInsert,
  enabled = true,
}: UseRealtimeDemandFlowHistoryOptions) {
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    const channelName = `rt-dfh-${tenantId}-${clientId ?? "*"}-${demandId ?? "*"}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "demand_flow_history",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const row = (payload.new as Record<string, any>) || null;
          if (!row) return;
          if (demandId && row.demand_id !== demandId) return;
          if (clientId && row.client_id && row.client_id !== clientId) return;
          onInsertRef.current(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, clientId, demandId, enabled]);
}
