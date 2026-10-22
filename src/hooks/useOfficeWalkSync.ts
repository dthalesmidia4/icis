import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GridPoint } from '@/lib/officeIso';

/**
 * Compartilha a caminhada manual entre dispositivos via Realtime Presence
 * (efêmero, sem tabela). Cada pessoa publica só o próprio alvo; null = voltou ao anchor real.
 */
export function useOfficeWalkSync(tenantId: string | null | undefined, myId: string | undefined, myTarget: GridPoint | null) {
  const [remote, setRemote] = useState<Record<string, GridPoint>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const targetRef = useRef(myTarget); targetRef.current = myTarget;
  const readyRef = useRef(false);

  useEffect(() => {
    if (!tenantId || !myId) return;
    const ch = supabase.channel(`office-walk:${tenantId}`, { config: { presence: { key: myId } } });
    channelRef.current = ch;
    const sync = () => {
      const state = ch.presenceState() as Record<string, { target?: GridPoint | null }[]>;
      const out: Record<string, GridPoint> = {};
      for (const [uid, metas] of Object.entries(state)) {
        if (uid === myId) continue;
        const t = metas[metas.length - 1]?.target;
        if (t && Number.isFinite(t.x) && Number.isFinite(t.y)) out[uid] = { x: t.x, y: t.y };
      }
      setRemote(out);
    };
    ch.on('presence', { event: 'sync' }, sync)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { readyRef.current = true; ch.track({ target: targetRef.current }); }
      });
    return () => { readyRef.current = false; channelRef.current = null; supabase.removeChannel(ch); };
  }, [tenantId, myId]);

  useEffect(() => {
    if (readyRef.current) channelRef.current?.track({ target: myTarget });
  }, [myTarget?.x, myTarget?.y]);

  return remote;
}
