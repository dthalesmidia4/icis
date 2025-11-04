import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TenantContextType {
  tenantId: string | null;
  tenantType: 'agency' | 'client' | 'subclient' | null;
  tenantName: string | null;
  isLoading: boolean;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenantType: null,
  tenantName: null,
  isLoading: true,
  refreshTenant: async () => {}
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<'agency' | 'client' | 'subclient' | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTenant = async () => {
    if (!user) {
      setTenantId(null);
      setTenantType(null);
      setTenantName(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile?.tenant_id) {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, name, tenant_type')
          .eq('id', profile.tenant_id)
          .single();

        if (tenantError) throw tenantError;

        if (tenant) {
          setTenantId(tenant.id);
          setTenantType(tenant.tenant_type as 'agency' | 'client' | 'subclient');
          setTenantName(tenant.name);
        }
      }
    } catch (error) {
      console.error('Error loading tenant:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenant();
  }, [user]);

  const refreshTenant = async () => {
    setIsLoading(true);
    await loadTenant();
  };

  return (
    <TenantContext.Provider value={{ tenantId, tenantType, tenantName, isLoading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
};
