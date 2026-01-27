import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/components/TaskCard";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseRealtimeAttachmentsOptions {
  tenantId: string | null;
  periodPlanId?: string | null;
  onCardUpdate?: (cardId: string, attachments: Attachment[]) => void;
  onDemandUpdate?: (demandId: string, attachments: Attachment[]) => void;
  enabled?: boolean;
}

export function useRealtimeAttachments({
  tenantId,
  periodPlanId,
  onCardUpdate,
  onDemandUpdate,
  enabled = true
}: UseRealtimeAttachmentsOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Handle card updates from realtime
  const handleCardChange = useCallback((
    payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
  ) => {
    if (payload.eventType === 'UPDATE' && payload.new) {
      const newData = payload.new;
      const cardId = newData.id as string;
      const attachments = (newData.attachments as Attachment[]) || [];
      
      console.log('[Realtime] Card updated:', cardId, 'attachments:', attachments.length);
      onCardUpdate?.(cardId, attachments);
    }
  }, [onCardUpdate]);

  // Handle demand updates from realtime
  const handleDemandChange = useCallback((
    payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
  ) => {
    if (payload.eventType === 'UPDATE' && payload.new) {
      const newData = payload.new;
      const demandId = newData.id as string;
      const attachments = (newData.attachments as Attachment[]) || [];
      
      console.log('[Realtime] Demand updated:', demandId, 'attachments:', attachments.length);
      onDemandUpdate?.(demandId, attachments);
    }
  }, [onDemandUpdate]);

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

    // Subscribe to cards table updates
    if (periodPlanId) {
      // Filtered by period_plan_id for specific period views
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cards',
          filter: `period_plan_id=eq.${periodPlanId}`
        },
        handleCardChange
      );

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
          table: 'cards',
          filter: `tenant_id=eq.${tenantId}`
        },
        handleCardChange
      );

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
  }, [tenantId, periodPlanId, enabled, handleCardChange, handleDemandChange]);

  return {
    isSubscribed: !!channelRef.current
  };
}
