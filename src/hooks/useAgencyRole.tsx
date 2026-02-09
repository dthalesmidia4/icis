/**
 * useAgencyRole - Hook para gerenciar roles no modelo atual
 * 
 * - SUPER_ADMIN: via tabela super_admins (RPC is_super_admin)
 * - AGENCY_ADMIN: via user_roles.role = 'agency_admin'
 * - AGENCY_MANAGER: via user_roles.role = 'agency_manager'
 * - AGENCY_USER: via user_roles.role = 'agency_user'
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgency } from '@/contexts/AgencyContext';
import { VALID_AGENCY_ROLES, type ValidAgencyRole } from '@/lib/constants/roles';

export type AgencyRole = 'super_admin' | ValidAgencyRole | null;

interface UseAgencyRoleReturn {
  role: AgencyRole;
  isSuperAdmin: boolean;
  isAgencyAdmin: boolean;
  isAgencyManager: boolean;
  isAgencyUser: boolean;
  canAccessAdmin: boolean;
  canManageTeam: boolean;
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

      // Buscar role via user_roles (schema atual funcional)
      // Usar VALID_AGENCY_ROLES para manter consistência
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', VALID_AGENCY_ROLES)
        .maybeSingle();

      if (roleError) {
        console.error('[useAgencyRole] Error fetching role:', roleError);
      }

      if (userRole?.role) {
        setRole(userRole.role as AgencyRole);
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

  // Derivar permissões baseadas na role
  const isAgencyAdmin = role === 'agency_admin' || isSuperAdmin;
  const isAgencyManager = role === 'agency_manager';
  const isAgencyUser = role === 'agency_user';
  
  // Quem pode acessar área administrativa (admin e manager)
  const canAccessAdmin = isAgencyAdmin || isAgencyManager;
  
  // Quem pode gerenciar equipe (admin e manager)
  const canManageTeam = isAgencyAdmin || isAgencyManager;

  return {
    role,
    isSuperAdmin,
    isAgencyAdmin,
    isAgencyManager,
    isAgencyUser,
    canAccessAdmin,
    canManageTeam,
    isLoading,
    error,
    refreshRole,
  };
}

// Re-export para compatibilidade com código existente
/** @deprecated Use useAgencyRole() */
export { useAgencyRole as useUserRole };
export type { AgencyRole as UserRole };
