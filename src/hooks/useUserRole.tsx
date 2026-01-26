import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';

export type UserRole = 'super_admin' | 'agency_admin' | 'agency_user' | null;

interface UseUserRoleReturn {
  role: UserRole;
  isSuperAdmin: boolean;
  isAgencyAdmin: boolean;
  isAgencyUser: boolean;
  canAccessAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
  refreshRole: () => Promise<void>;
}

export function useUserRole(): UseUserRoleReturn {
  const { user, isLoading: authLoading } = useAuth();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [role, setRole] = useState<UserRole>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRole = useCallback(async () => {
    // Aguardar auth e tenant terminarem de carregar
    if (authLoading || tenantLoading) {
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
        console.error('[useUserRole] Error checking super_admin:', superAdminError);
      }

      if (isSuperAdminResult === true) {
        setIsSuperAdmin(true);
        setRole('super_admin');
        setIsLoading(false);
        return;
      }

      setIsSuperAdmin(false);

      // Buscar role no tenant atual
      if (tenantId) {
        const { data: userRole, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (roleError) {
          console.error('[useUserRole] Error fetching user role:', roleError);
          throw new Error('Erro ao carregar permissões do usuário');
        }

        if (userRole?.role) {
          setRole(userRole.role as UserRole);
        } else {
          setRole(null);
        }
      } else {
        setRole(null);
      }
    } catch (err) {
      console.error('[useUserRole] Error:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [user, tenantId, authLoading, tenantLoading]);

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
