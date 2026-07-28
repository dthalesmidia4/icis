import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from "@/lib/reorderSequence";

export function useWorkHoursConfig(tenantId: string | null | undefined) {
  const [config, setConfig] = useState<WorkHoursConfig>(DEFAULT_WORK_HOURS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenantId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        const wh = ((data.settings as any) || {}).work_hours || {};
        setConfig({
          start: wh.start || DEFAULT_WORK_HOURS.start,
          end: wh.end || DEFAULT_WORK_HOURS.end,
          lunchStart: wh.lunch_start || wh.lunchStart || DEFAULT_WORK_HOURS.lunchStart,
          lunchEnd: wh.lunch_end || wh.lunchEnd || DEFAULT_WORK_HOURS.lunchEnd,
          tz: wh.tz || DEFAULT_WORK_HOURS.tz,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return { config, loading };
}
