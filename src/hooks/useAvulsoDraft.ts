import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Persists in-flight standalone-content state to `avulso_drafts` so the user
 * never loses progress when the modal is dismissed or the tab is reloaded.
 *
 * - `key` uniquely identifies the draft slot per client + content type (e.g. `video`).
 * - `state` is any JSON-serializable snapshot of the in-modal state.
 * - Autosaves are debounced by 800ms; the caller can also flush manually.
 * - Returns the last hydrated state (or `null` before hydration finishes).
 */
export function useAvulsoDraft<T>(opts: {
  tenantId: string | null;
  clientId: string | null;
  contentType: string;
  state: T | null;
  enabled: boolean;
  /** Optional short title used for the drafts list. */
  title?: string | null;
}) {
  const { tenantId, clientId, contentType, state, enabled, title } = opts;
  const [hydrated, setHydrated] = useState<T | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const lastSerializedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once when identity becomes available.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!tenantId || !clientId) return;
      setHydrating(true);
      const { data, error } = await supabase
        .from("avulso_drafts")
        .select("id, state")
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .eq("content_type", contentType)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        draftIdRef.current = data.id;
        setHydrated(data.state as T);
        lastSerializedRef.current = JSON.stringify(data.state);
      }
      setHydrating(false);
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [tenantId, clientId, contentType]);

  // Debounced autosave.
  useEffect(() => {
    if (!enabled || !tenantId || !clientId || state == null) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerializedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      if (draftIdRef.current) {
        const { error } = await supabase
          .from("avulso_drafts")
          .update({
            state: state as any,
            title: title ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftIdRef.current);
        if (!error) lastSerializedRef.current = serialized;
      } else {
        const { data, error } = await supabase
          .from("avulso_drafts")
          .insert({
            tenant_id: tenantId,
            client_id: clientId,
            user_id: userId,
            content_type: contentType,
            state: state as any,
            title: title ?? null,
          })
          .select("id")
          .single();
        if (!error && data) {
          draftIdRef.current = data.id;
          lastSerializedRef.current = serialized;
        }
      }
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, enabled, tenantId, clientId, contentType, title]);

  const clearDraft = async () => {
    if (!draftIdRef.current) return;
    await supabase.from("avulso_drafts").delete().eq("id", draftIdRef.current);
    draftIdRef.current = null;
    lastSerializedRef.current = "";
    setHydrated(null);
  };

  return { hydrated, hydrating, clearDraft };
}
