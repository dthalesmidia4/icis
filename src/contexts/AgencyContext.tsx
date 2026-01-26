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
  // Um pouco mais alto para cobrir o caso de cadastro via convite,
  // onde o tenant_id pode demorar alguns segundos para ser preenchido pelo RPC.
  const maxRetries = 5;

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

      // Primeiro, tentar buscar apenas tenant_id (sempre existe na tabela profiles)
      // Isso evita erro 400 se agency_id ainda não existir
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[AgencyContext] Error fetching profile:', profileError);
        throw new Error('Erro ao carregar perfil do usuário');
      }

      // Se não tem tenant_id, usuário não tem agency vinculada
      if (!profile?.tenant_id) {
        // IMPORTANTE: após signup + uso de convite, o tenant_id pode ser atualizado
        // alguns instantes depois (RPC + commit). Então re-tentamos antes de concluir
        // que o usuário realmente não tem agência.
        if (retryCount.current < maxRetries) {
          retryCount.current += 1;
          const delay = 800 * retryCount.current;
          console.log(
            `[AgencyContext] tenant_id ainda não disponível. Re-tentando em ${delay}ms (attempt ${retryCount.current}/${maxRetries})`
          );
          setTimeout(() => {
            loadAgency();
          }, delay);
          return;
        }

        console.log('[AgencyContext] User has no tenant_id after retries, no agency assigned');
        setAgencyId(null);
        setAgencyName(null);
        setAgencySlug(null);
        setIsLoading(false);
        retryCount.current = 0;
        return;
      }

      // Buscar dados do tenant (que funciona como agency no modelo atual)
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (tenantError) {
        console.error('[AgencyContext] Error fetching tenant:', tenantError);
        throw new Error('Erro ao carregar dados da agência');
      }

      if (tenant) {
        console.log('[AgencyContext] Using tenant as agency:', tenant);
        setAgencyId(tenant.id);
        setAgencyName(tenant.name);
        setAgencySlug(tenant.slug);
        retryCount.current = 0;
        setIsLoading(false);
        return;
      }

      setAgencyId(null);
      setAgencyName(null);
      setAgencySlug(null);
      setIsLoading(false);
      retryCount.current = 0;
      return;

      // Este bloco não será alcançado com o código atual, mas mantemos para quando
      // a migração completa for aplicada e agency_id existir
      console.log('[AgencyContext] Unexpected state - no agency found');
      setAgencyId(null);
      setAgencyName(null);
      setAgencySlug(null);
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
