import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeDeskObjects, type DeskObjectKey } from "@/lib/officeDeskObjects";

/**
 * Personalização das mesas do tenant carregada EM LOTE (uma única query),
 * para que a sala nunca dispare N consultas por estação.
 * Cada usuário só consegue gravar a própria mesa (RLS).
 */
export function useOfficeDeskPreferences(tenantId: string | null | undefined) {
  const [byUser, setByUser] = useState<Record<string, DeskObjectKey[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) {
      setByUser({});
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("office_desk_preferences")
      .select("user_id, objects")
      .eq("tenant_id", tenantId);
    if (error) console.error("[useOfficeDeskPreferences] load error", error);
    const map: Record<string, DeskObjectKey[]> = {};
    ((data || []) as any[]).forEach((row) => {
      if (row?.user_id) map[row.user_id] = sanitizeDeskObjects(row.objects);
    });
    setByUser(map);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const save = useCallback(
    async (userId: string, objects: DeskObjectKey[]) => {
      if (!tenantId) return { error: new Error("tenant ausente") };
      const clean = sanitizeDeskObjects(objects);
      // Atualização otimista: a estação responde na hora.
      setByUser((prev) => ({ ...prev, [userId]: clean }));
      const { error } = await supabase
        .from("office_desk_preferences")
        .upsert(
          { tenant_id: tenantId, user_id: userId, objects: clean as unknown as any },
          { onConflict: "tenant_id,user_id" },
        );
      if (error) {
        console.error("[useOfficeDeskPreferences] save error", error);
        load();
      }
      return { error };
    },
    [tenantId, load],
  );

  return { byUser, loading, save, refetch: load };
}

export default useOfficeDeskPreferences;
