import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';

interface LateDemand {
  id: string;
  title: string;
  clientName: string;
  dueDate: string;
  dueTime: string | null;
}

export function useLateDemandAlerts() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [lateDemands, setLateDemands] = useState<LateDemand[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const checkedIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if user has late notification enabled
  useEffect(() => {
    if (!user?.id || !tenantId) return;

    const checkSetting = async () => {
      const { data } = await supabase
        .from('user_late_notification_settings')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      setIsEnabled(data?.enabled ?? false);
    };

    checkSetting();

    // Listen for changes to the setting
    const channel = supabase
      .channel('late-notif-settings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_late_notification_settings',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        checkSetting();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, tenantId]);

  const checkOverdueDemands = useCallback(async () => {
    if (!tenantId || !isEnabled) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    try {
      // Fetch active (non-archived) demands with delivery_date that might be overdue
      // Also fetch the status to exclude final statuses (Feito, Publicado, etc.)
      const { data: demands } = await supabase
        .from('demands')
        .select('id, title, delivery_date, delivery_time, client_id, status_id, tenant_companies!demands_client_id_fkey(name, fantasy_name), pipeline_statuses!demands_status_id_fkey(name, is_final)')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .not('delivery_date', 'is', null)
        .lte('delivery_date', todayStr);

      if (!demands) return;

      const newLateDemands: LateDemand[] = [];

      for (const demand of demands) {
        // Skip if already alerted
        if (checkedIds.current.has(demand.id)) continue;

        // Skip if the status is final (Feito, Publicado, etc.)
        const status = demand.pipeline_statuses as any;
        if (status?.is_final) continue;

        // Also skip by name for extra safety
        const statusName = (status?.name || '').toLowerCase();
        if (statusName === 'feito' || statusName === 'feitos' || statusName === 'publicado') continue;

        const deliveryDate = demand.delivery_date as string;
        const deliveryTime = (demand.delivery_time as string) || '23:59';

        // Build the full delivery datetime
        const deliveryDatetime = new Date(`${deliveryDate}T${deliveryTime}:00`);

        if (now >= deliveryDatetime) {
          checkedIds.current.add(demand.id);
          const company = demand.tenant_companies as any;
          newLateDemands.push({
            id: demand.id,
            title: demand.title,
            clientName: company?.fantasy_name || company?.name || 'Cliente',
            dueDate: deliveryDate,
            dueTime: demand.delivery_time as string | null,
          });
        }
      }

      if (newLateDemands.length > 0) {
        setLateDemands(prev => [...prev, ...newLateDemands]);
      }
    } catch (error) {
      console.error('Error checking overdue demands:', error);
    }
  }, [tenantId, isEnabled]);

  // Poll every 60 seconds
  useEffect(() => {
    if (!isEnabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Initial check
    checkOverdueDemands();

    intervalRef.current = setInterval(checkOverdueDemands, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isEnabled, checkOverdueDemands]);

  const dismissDemand = useCallback((demandId: string) => {
    setLateDemands(prev => prev.filter(d => d.id !== demandId));
  }, []);

  const dismissAll = useCallback(() => {
    setLateDemands([]);
  }, []);

  return {
    lateDemands,
    isEnabled,
    dismissDemand,
    dismissAll,
  };
}
