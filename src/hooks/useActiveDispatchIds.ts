import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeScheduledDispatches, useDebouncedCallback } from "@/hooks/realtime";

/**
 * Retorna um Set com os `card_id` (demands.id) que possuem um dispatch
 * de publicação atualmente ativo (status `scheduled` ou `dispatching`)
 * no tenant informado. Reagem em tempo real a mudanças na tabela
 * `scheduled_publication_dispatches`.
 */
export function useActiveDispatchIds(tenantId: string | null | undefined) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchIds = useCallback(async () => {
    if (!tenantId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("scheduled_publication_dispatches")
      .select("card_id")
      .eq("tenant_id", tenantId)
      .in("status", ["scheduled", "dispatching"]);
    if (error) {
      console.error("[useActiveDispatchIds] fetch error", error);
      setLoading(false);
      return;
    }
    const next = new Set<string>();
    (data || []).forEach((row: any) => {
      if (row?.card_id) next.add(row.card_id as string);
    });
    setIds(next);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    fetchIds();
  }, [fetchIds]);

  const debouncedRefetch = useDebouncedCallback(() => {
    fetchIds();
  }, 250);

  useRealtimeScheduledDispatches({
    tenantId: tenantId || null,
    enabled: !!tenantId,
    onChange: () => debouncedRefetch(),
  });

  return { activeDispatchIds: ids, count: ids.size, loading };
}
