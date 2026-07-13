import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "./_shared";

export interface UseRealtimeStrategiesOptions {
  tenantId: string | null | undefined;
  clientId?: string | null;
  companyId?: string | null;
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
 * Assina `public.strategies` filtrado por tenant no server.
 * Aplica filtro local por company_id quando informado.
 */
export function useRealtimeStrategies({
  tenantId,
  clientId,
  companyId,
  onChange,
  enabled = true,
  debounceMs = 250,
}: UseRealtimeStrategiesOptions) {
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
    const target = companyId ?? clientId ?? "*";
    const channel = supabase
      .channel(`rt-strategies-${tenantId}-${target}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strategies", filter: `tenant_id=eq.${tenantId}` },
        (payload: any) => {
          const rowNew = (payload.new as Record<string, any>) || null;
          const rowOld = (payload.old as Record<string, any>) || null;
          const row = rowNew || rowOld;
          if (!row) return;

          const rowCompany = row.company_id ?? null;
          const expected = companyId ?? clientId ?? null;
          if (expected && rowCompany && rowCompany !== expected) return;

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
  }, [tenantId, clientId, companyId, enabled]);
}
