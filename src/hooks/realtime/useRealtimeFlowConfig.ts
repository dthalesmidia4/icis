import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "./_shared";

export interface UseRealtimeFlowConfigOptions {
  tenantId: string | null | undefined;
  onChange: () => void;
  enabled?: boolean;
}

/**
 * Um canal único que agrega mudanças nas 3 tabelas de configuração de fluxo.
 */
export function useRealtimeFlowConfig({ tenantId, onChange, enabled = true }: UseRealtimeFlowConfigOptions) {
  const debouncedChange = useDebouncedCallback(onChange, 250);
  const debouncedRef = useRef(debouncedChange);
  useEffect(() => {
    debouncedRef.current = debouncedChange;
  }, [debouncedChange]);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`rt-flow-config-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "flow_functions", filter }, () => debouncedRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "demand_type_flow_rules", filter }, () => debouncedRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "collaborator_function_assignments", filter }, () => debouncedRef.current())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, enabled]);
}
