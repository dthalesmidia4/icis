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
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    try {
      // Fetch active (non-archived) demands with due_date that might be overdue
      const { data: demands } = await supabase
        .from('demands')
        .select('id, title, due_date, due_time, client_id, tenant_companies!demands_client_id_fkey(name, fantasy_name)')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', todayStr);

      if (!demands) return;

      const newLateDemands: LateDemand[] = [];

      for (const demand of demands) {
        // Skip if already alerted
        if (checkedIds.current.has(demand.id)) continue;

        const dueDate = demand.due_date as string;
        const dueTime = (demand.due_time as string) || '23:59';

        // Build the full due datetime
        const dueDatetime = new Date(`${dueDate}T${dueTime}:00`);

        if (now >= dueDatetime) {
          checkedIds.current.add(demand.id);
          const company = demand.tenant_companies as any;
          newLateDemands.push({
            id: demand.id,
            title: demand.title,
            clientName: company?.fantasy_name || company?.name || 'Cliente',
            dueDate,
            dueTime: demand.due_time as string | null,
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
