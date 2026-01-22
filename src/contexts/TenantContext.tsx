import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TenantContextType {
  tenantId: string | null;
  tenantType: 'agency' | 'client' | 'subclient' | null;
  tenantName: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenantType: null,
  tenantName: null,
  isLoading: true,
  error: null,
  refreshTenant: async () => {},
});

export const useTenant = () => useContext(TenantContext);

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider = ({ children }: TenantProviderProps) => {
  const { user, isLoading: authLoading } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<'agency' | 'client' | 'subclient' | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 3;

  const loadTenant = useCallback(async () => {
    // Aguardar auth terminar de carregar
    if (authLoading) {
      return;
    }

    if (!user) {
      console.log('[TenantContext] No user, clearing tenant state');
      setTenantId(null);
      setTenantType(null);
      setTenantName(null);
      setError(null);
      setIsLoading(false);
      retryCount.current = 0;
      return;
    }

    try {
      setError(null);
      console.log('[TenantContext] Loading tenant for user:', user.id);

      // Buscar o perfil do usuário com tenant_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[TenantContext] Error fetching profile:', profileError);
        throw new Error('Erro ao carregar perfil do usuário');
      }

      if (!profile?.tenant_id) {
        console.log('[TenantContext] User has no tenant_id');
        setTenantId(null);
        setTenantType(null);
        setTenantName(null);
        setIsLoading(false);
        retryCount.current = 0;
        return;
      }

      // Buscar informações do tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, tenant_type, name')
        .eq('id', profile.tenant_id)
        .single();

      if (tenantError) {
        console.error('[TenantContext] Error fetching tenant:', tenantError);
        throw new Error('Erro ao carregar dados da agência');
      }

      console.log('[TenantContext] Tenant loaded:', tenant);
      setTenantId(tenant.id);
      setTenantType(tenant.tenant_type as 'agency' | 'client' | 'subclient');
      setTenantName(tenant.name);
      retryCount.current = 0;
    } catch (err) {
      console.error('[TenantContext] Error loading tenant:', err);
      setError(err as Error);

      // Retry automático até maxRetries vezes
      if (retryCount.current < maxRetries) {
        retryCount.current += 1;
        const delay = 1000 * retryCount.current; // 1s, 2s, 3s
        console.log(`[TenantContext] Retrying in ${delay}ms (attempt ${retryCount.current}/${maxRetries})`);
        setTimeout(() => {
          loadTenant();
        }, delay);
        return; // Não setar isLoading = false ainda
      }
    } finally {
      if (retryCount.current === 0 || retryCount.current >= maxRetries) {
        setIsLoading(false);
      }
    }
  }, [user, authLoading]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  const refreshTenant = useCallback(async () => {
    console.log('[TenantContext] Refreshing tenant...');
    retryCount.current = 0;
    setIsLoading(true);
    setError(null);
    await loadTenant();
  }, [loadTenant]);

  return (
    <TenantContext.Provider value={{ tenantId, tenantType, tenantName, isLoading, error, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
};
