import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "./_shared";

export interface UseRealtimeScheduledDispatchesOptions {
  tenantId: string | null | undefined;
  clientId?: string | null;
  cardId?: string | null;
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
 * Assina `public.scheduled_publication_dispatches` filtrado por tenant no server.
 * Aplica filtros locais por client_id e/ou card_id (demanda).
 */
export function useRealtimeScheduledDispatches({
  tenantId,
  clientId,
  cardId,
  onChange,
  enabled = true,
  debounceMs = 200,
}: UseRealtimeScheduledDispatchesOptions) {
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
    const scope = [tenantId, clientId ?? "*", cardId ?? "*"].join("-");
    const channel = supabase
      .channel(`rt-dispatches-${scope}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_publication_dispatches", filter: `tenant_id=eq.${tenantId}` },
        (payload: any) => {
          const rowNew = (payload.new as Record<string, any>) || null;
          const rowOld = (payload.old as Record<string, any>) || null;
          const row = rowNew || rowOld;
          if (!row) return;

          const rowClient = row.client_id ?? null;
          if (clientId && rowClient && rowClient !== clientId) return;

          const rowCard = row.card_id ?? null;
          if (cardId && rowCard && rowCard !== cardId) return;

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
  }, [tenantId, clientId, cardId, enabled]);
}
