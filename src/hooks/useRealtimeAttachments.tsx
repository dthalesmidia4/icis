import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/components/TaskCard";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseRealtimeAttachmentsOptions {
  tenantId: string | null;
  periodPlanId?: string | null;
  onAttachmentUpdate?: (itemId: string, attachments: Attachment[]) => void;
  // Legacy callbacks - kept for backward compatibility, both map to onAttachmentUpdate
  onCardUpdate?: (cardId: string, attachments: Attachment[]) => void;
  onDemandUpdate?: (demandId: string, attachments: Attachment[]) => void;
  enabled?: boolean;
}

export function useRealtimeAttachments({
  tenantId,
  periodPlanId,
  onAttachmentUpdate,
  onCardUpdate,
  onDemandUpdate,
  enabled = true
}: UseRealtimeAttachmentsOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Unified handler for demand updates (now all items are in demands table)
  const handleDemandChange = useCallback((
    payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
  ) => {
    if (payload.eventType === 'UPDATE' && payload.new) {
      const newData = payload.new;
      const demandId = newData.id as string;
      const attachments = (newData.attachments as Attachment[]) || [];
      const source = newData.source as string;
      
      console.log('[Realtime] Demand updated:', demandId, 'source:', source, 'attachments:', attachments.length);
      
      // Use unified callback if available
      onAttachmentUpdate?.(demandId, attachments);
      
      // Legacy support: call appropriate callback based on source
      if (source === 'card') {
        onCardUpdate?.(demandId, attachments);
      } else {
        onDemandUpdate?.(demandId, attachments);
      }
    }
  }, [onAttachmentUpdate, onCardUpdate, onDemandUpdate]);

  useEffect(() => {
    if (!enabled || !tenantId) {
      return;
    }

    // Create unique channel name
    const channelName = periodPlanId 
      ? `attachments-${tenantId}-${periodPlanId}` 
      : `attachments-${tenantId}`;

    console.log('[Realtime] Setting up subscription:', channelName);

    // Create the channel with subscriptions
    const channel = supabase.channel(channelName);

    // Subscribe to demands table updates (unified table now)
    if (periodPlanId) {
      // Filtered by period_plan_id for specific period views
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'demands',
          filter: `period_plan_id=eq.${periodPlanId}`
        },
        handleDemandChange
      );
    } else {
      // Subscribe to all updates for tenant (for central views)
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'demands',
          filter: `tenant_id=eq.${tenantId}`
        },
        handleDemandChange
      );
    }

    // Subscribe to the channel
    channel.subscribe((status) => {
      console.log('[Realtime] Subscription status:', status);
    });

    channelRef.current = channel;

    // Cleanup on unmount or dependency change
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
