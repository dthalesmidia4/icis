import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type DemandRealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface UseRealtimeDemandsOptions {
  tenantId: string | null | undefined;
  clientId?: string | null;
  periodPlanId?: string | null;
  assignedTo?: string | null;
  onChange: (event: {
    type: DemandRealtimeEvent;
    id: string;
    new: Record<string, any> | null;
    old: Record<string, any> | null;
  }) => void;
  enabled?: boolean;
}

/**
 * Assina mudanças em `public.demands` filtradas por `tenant_id` no server.
 * Filtros adicionais (client, período, responsável) são aplicados no callback.
 */
export function useRealtimeDemands({
  tenantId,
  clientId,
  periodPlanId,
  assignedTo,
  onChange,
  enabled = true,
}: UseRealtimeDemandsOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const scope = [tenantId, clientId ?? "*", periodPlanId ?? "*", assignedTo ?? "*"].join("-");
    const channelName = `rt-demands-${scope}`;

    const handle = (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
      const type = payload.eventType as DemandRealtimeEvent;
      const rowNew = (payload.new as Record<string, any>) || null;
      const rowOld = (payload.old as Record<string, any>) || null;
      const row = rowNew || rowOld;
      if (!row) return;

      if (clientId && row.client_id && row.client_id !== clientId) return;
      if (periodPlanId && row.period_plan_id && row.period_plan_id !== periodPlanId) return;
      if (assignedTo) {
        const stillMine = rowNew?.assigned_to === assignedTo;
        const wasMine = rowOld?.assigned_to === assignedTo;
        if (!stillMine && !wasMine) return;
      }

      onChangeRef.current({
        type,
        id: (row.id as string) || "",
        new: rowNew,
        old: rowOld,
      });
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demands", filter: `tenant_id=eq.${tenantId}` },
        handle
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, clientId, periodPlanId, assignedTo, enabled]);
}
