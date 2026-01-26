/**
 * useAgencyRole - Hook para gerenciar roles no novo modelo Agency
 * 
 * NOVO MODELO:
 * - SUPER_ADMIN: via tabela super_admins (RPC is_super_admin)
 * - AGENCY_ADMIN: via agency_memberships.role = 'agency_admin'
 * - AGENCY_USER: via agency_memberships.role = 'agency_user'
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgency } from '@/contexts/AgencyContext';

export type AgencyRole = 'super_admin' | 'agency_admin' | 'agency_user' | null;

interface UseAgencyRoleReturn {
  role: AgencyRole;
  isSuperAdmin: boolean;
  isAgencyAdmin: boolean;
  isAgencyUser: boolean;
  canAccessAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
  refreshRole: () => Promise<void>;
}

export function useAgencyRole(): UseAgencyRoleReturn {
  const { user, isLoading: authLoading } = useAuth();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [role, setRole] = useState<AgencyRole>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRole = useCallback(async () => {
    // Aguardar auth e agency terminarem de carregar
    if (authLoading || agencyLoading) {
      return;
    }

    if (!user) {
      setRole(null);
      setIsSuperAdmin(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setError(null);

      // Verificar se é super_admin usando RPC (evita recursão RLS)
      const { data: isSuperAdminResult, error: superAdminError } = await supabase
        .rpc('is_super_admin');

      if (superAdminError) {
        console.error('[useAgencyRole] Error checking super_admin:', superAdminError);
      }

      if (isSuperAdminResult === true) {
        setIsSuperAdmin(true);
        setRole('super_admin');
        setIsLoading(false);
        return;
      }

      setIsSuperAdmin(false);

      // Buscar role na agency atual via agency_memberships
      // Usar type assertion porque a tabela ainda não está no types.ts
      if (agencyId) {
        const { data: membership, error: membershipError } = await supabase
          .from('agency_memberships' as any)
          .select('role')
          .eq('user_id', user.id)
          .eq('agency_id', agencyId)
          .maybeSingle() as { data: { role: string } | null; error: any };

        if (membershipError) {
          console.error('[useAgencyRole] Error fetching membership:', membershipError);
          // Não lançar erro, tentar fallback
        }

        if (membership?.role) {
          setRole(membership.role as AgencyRole);
        } else {
          // Fallback: verificar user_roles legado durante transição
          const { data: legacyRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .in('role', ['agency_admin', 'agency_user'])
            .maybeSingle();

          if (legacyRole?.role) {
            setRole(legacyRole.role as AgencyRole);
          } else {
            setRole(null);
          }
        }
      } else {
        setRole(null);
      }
    } catch (err) {
      console.error('[useAgencyRole] Error:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [user, agencyId, authLoading, agencyLoading]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  const refreshRole = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await fetchRole();
  }, [fetchRole]);

  return {
    role,
    isSuperAdmin,
    isAgencyAdmin: role === 'agency_admin' || isSuperAdmin,
    isAgencyUser: role === 'agency_user',
    canAccessAdmin: role === 'agency_admin' || isSuperAdmin,
    isLoading,
    error,
    refreshRole,
  };
}

// Re-export para compatibilidade com código existente
/** @deprecated Use useAgencyRole() */
export { useAgencyRole as useUserRole };
export type { AgencyRole as UserRole };
