/**
 * AgencyContext - Contexto para gerenciar informações da agência do usuário
 * 
 * NOVO MODELO (substitui TenantContext):
 * - Tenant = Agency (sem hierarquia pai/filho)
 * - Apenas 3 roles: SUPER_ADMIN, AGENCY_ADMIN, AGENCY_USER
 * - Vínculo via agency_memberships
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AgencyContextType {
  agencyId: string | null;
  agencyName: string | null;
  agencySlug: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshAgency: () => Promise<void>;
  
  // Compatibilidade com código legado (DEPRECATED)
  /** @deprecated Use agencyId */
  tenantId: string | null;
  /** @deprecated Use agencyName */
  tenantName: string | null;
  /** @deprecated Use refreshAgency */
  refreshTenant: () => Promise<void>;
  /** @deprecated Sempre retorna 'agency' no novo modelo */
  tenantType: 'agency' | null;
}

const AgencyContext = createContext<AgencyContextType>({
  agencyId: null,
  agencyName: null,
  agencySlug: null,
  isLoading: true,
  error: null,
  refreshAgency: async () => {},
  // Compatibilidade legada
  tenantId: null,
  tenantName: null,
  tenantType: null,
  refreshTenant: async () => {},
});

export const useAgency = () => useContext(AgencyContext);

// Alias para compatibilidade com código existente
/** @deprecated Use useAgency() */
export const useTenant = () => {
  const context = useContext(AgencyContext);
  return {
    tenantId: context.agencyId,
    tenantName: context.agencyName,
    tenantType: context.agencyId ? 'agency' as const : null,
    isLoading: context.isLoading,
    error: context.error,
    refreshTenant: context.refreshAgency,
  };
};

interface AgencyProviderProps {
  children: ReactNode;
}

export const AgencyProvider = ({ children }: AgencyProviderProps) => {
  const { user, isLoading: authLoading } = useAuth();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [agencySlug, setAgencySlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 3;

  const loadAgency = useCallback(async () => {
    // Aguardar auth terminar de carregar
    if (authLoading) {
      return;
    }

    if (!user) {
      console.log('[AgencyContext] No user, clearing agency state');
      setAgencyId(null);
      setAgencyName(null);
      setAgencySlug(null);
      setError(null);
      setIsLoading(false);
      retryCount.current = 0;
      return;
    }

    try {
      setError(null);
      console.log('[AgencyContext] Loading agency for user:', user.id);

      // Buscar o perfil do usuário com agency_id
      // Usar type assertion porque as novas colunas ainda não estão no types.ts
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('agency_id, tenant_id')
        .eq('id', user.id)
        .maybeSingle() as { data: { agency_id: string | null; tenant_id: string | null } | null; error: any };

      if (profileError) {
        console.error('[AgencyContext] Error fetching profile:', profileError);
        throw new Error('Erro ao carregar perfil do usuário');
      }

      if (!profile?.agency_id) {
        console.log('[AgencyContext] User has no agency_id, checking legacy tenant_id');
        
        // Fallback para tenant_id legado (período de transição)
        if (profile?.tenant_id) {
          // Buscar agency via legacy_tenant_id
          const { data: agency, error: agencyError } = await supabase
            .from('agencies' as any)
            .select('id, name, slug')
            .eq('legacy_tenant_id', profile.tenant_id)
            .maybeSingle() as { data: { id: string; name: string; slug: string } | null; error: any };

          if (agency && !agencyError) {
            console.log('[AgencyContext] Found agency via legacy mapping:', agency);
            setAgencyId(agency.id);
            setAgencyName(agency.name);
            setAgencySlug(agency.slug);
            retryCount.current = 0;
            setIsLoading(false);
            return;
          }
        }
        
        setAgencyId(null);
        setAgencyName(null);
        setAgencySlug(null);
        setIsLoading(false);
        retryCount.current = 0;
        return;
      }

      // Buscar informações da agency
      const { data: agency, error: agencyError } = await supabase
        .from('agencies' as any)
        .select('id, name, slug')
        .eq('id', profile.agency_id)
        .single() as { data: { id: string; name: string; slug: string }; error: any };

      if (agencyError) {
        console.error('[AgencyContext] Error fetching agency:', agencyError);
        throw new Error('Erro ao carregar dados da agência');
      }

      console.log('[AgencyContext] Agency loaded:', agency);
      setAgencyId(agency.id);
      setAgencyName(agency.name);
      setAgencySlug(agency.slug);
      retryCount.current = 0;
    } catch (err) {
      console.error('[AgencyContext] Error loading agency:', err);
      setError(err as Error);

      // Retry automático até maxRetries vezes
      if (retryCount.current < maxRetries) {
        retryCount.current += 1;
        const delay = 1000 * retryCount.current;
        console.log(`[AgencyContext] Retrying in ${delay}ms (attempt ${retryCount.current}/${maxRetries})`);
        setTimeout(() => {
          loadAgency();
        }, delay);
        return;
      }
    } finally {
      if (retryCount.current === 0 || retryCount.current >= maxRetries) {
        setIsLoading(false);
      }
    }
  }, [user, authLoading]);

  useEffect(() => {
    loadAgency();
  }, [loadAgency]);

  const refreshAgency = useCallback(async () => {
    console.log('[AgencyContext] Refreshing agency...');
    retryCount.current = 0;
    setIsLoading(true);
    setError(null);
    await loadAgency();
  }, [loadAgency]);

  return (
    <AgencyContext.Provider value={{ 
      agencyId, 
      agencyName, 
      agencySlug,
      isLoading, 
      error, 
      refreshAgency,
      // Compatibilidade legada
      tenantId: agencyId,
      tenantName: agencyName,
      tenantType: agencyId ? 'agency' : null,
      refreshTenant: refreshAgency,
    }}>
      {children}
    </AgencyContext.Provider>
  );
};

// Re-export para compatibilidade
/** @deprecated Use AgencyProvider */
export const TenantProvider = AgencyProvider;
