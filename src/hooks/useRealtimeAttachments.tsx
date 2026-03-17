import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/components/TaskCard";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseRealtimeAttachmentsOptions {
  tenantId: string | null;
  periodPlanId?: string | null;
  onAttachmentUpdate?: (itemId: string, attachments: Attachment[]) => void;
  onDemandFullUpdate?: (demandId: string, payload: Record<string, any>) => void;
  onDemandInsert?: (demandId: string, payload: Record<string, any>) => void;
  onDemandDelete?: (demandId: string) => void;
  // Legacy callbacks - kept for backward compatibility
  onCardUpdate?: (cardId: string, attachments: Attachment[]) => void;
  onDemandUpdate?: (demandId: string, attachments: Attachment[]) => void;
  enabled?: boolean;
}

export function useRealtimeAttachments({
  tenantId,
  periodPlanId,
  onAttachmentUpdate,
  onDemandFullUpdate,
  onDemandInsert,
  onDemandDelete,
  onCardUpdate,
  onDemandUpdate,
  enabled = true
}: UseRealtimeAttachmentsOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleDemandChange = useCallback((
    payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
  ) => {
    if (payload.eventType === 'UPDATE' && payload.new) {
      const newData = payload.new;
      const demandId = newData.id as string;
      const attachments = (newData.attachments as Attachment[]) || [];
      const source = newData.source as string;
      
      console.log('[Realtime] Demand updated:', demandId, 'source:', source);
      
      // Full update callback (includes status_id, title, etc.)
      onDemandFullUpdate?.(demandId, newData);
      
      // Attachment-specific callback
      onAttachmentUpdate?.(demandId, attachments);
      
      // Legacy support
      if (source === 'card') {
        onCardUpdate?.(demandId, attachments);
      } else {
        onDemandUpdate?.(demandId, attachments);
      }
    } else if (payload.eventType === 'INSERT' && payload.new) {
      const newData = payload.new;
      console.log('[Realtime] Demand inserted:', newData.id);
      onDemandInsert?.(newData.id as string, newData);
    } else if (payload.eventType === 'DELETE' && payload.old) {
      const oldData = payload.old;
      console.log('[Realtime] Demand deleted:', oldData.id);
      onDemandDelete?.(oldData.id as string);
    }
  }, [onAttachmentUpdate, onDemandFullUpdate, onDemandInsert, onDemandDelete, onCardUpdate, onDemandUpdate]);

  useEffect(() => {
    if (!enabled || !tenantId) {
      return;
    }

    const channelName = periodPlanId 
      ? `realtime-demands-${tenantId}-${periodPlanId}` 
      : `realtime-demands-${tenantId}`;

    console.log('[Realtime] Setting up subscription:', channelName);

    const channel = supabase.channel(channelName);

    const filter = periodPlanId
      ? `period_plan_id=eq.${periodPlanId}`
      : `tenant_id=eq.${tenantId}`;

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'demands', filter }, handleDemandChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demands', filter }, handleDemandChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'demands', filter }, handleDemandChange);

    channel.subscribe((status) => {
      console.log('[Realtime] Subscription status:', status);
    });

    channelRef.current = channel;

    return () => {
      console.log('[Realtime] Cleaning up subscription:', channelName);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenantId, periodPlanId, enabled, handleDemandChange]);

  return {
    isSubscribed: !!channelRef.current
  };
}
