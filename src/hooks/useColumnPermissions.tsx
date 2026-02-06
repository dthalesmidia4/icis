import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAgency } from '@/contexts/AgencyContext';
import { useAgencyRole } from './useAgencyRole';

interface ColumnPermission {
  status_id: string;
  can_view: boolean;
}

export function useColumnPermissions() {
  const { user } = useAuth();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const { role, isLoading: roleLoading } = useAgencyRole();
  const [permissions, setPermissions] = useState<ColumnPermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Admins e managers não têm restrições de colunas
  const isAdmin = role === 'super_admin' || role === 'agency_admin' || role === 'agency_manager';

  const fetchPermissions = useCallback(async () => {
    // Aguardar agencyId e role carregarem
    if (agencyLoading || roleLoading) return;

    // Admins veem tudo - não precisa buscar permissões
    if (isAdmin) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    if (!user?.id || !agencyId) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_column_permissions')
        .select('status_id, can_view')
        .eq('user_id', user.id)
        .eq('tenant_id', agencyId);

      if (error) throw error;

      setPermissions(data || []);
    } catch (error) {
      console.error('Erro ao buscar permissões de colunas:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, agencyId, isAdmin, roleLoading, agencyLoading]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Setup realtime subscription para atualizar permissões em tempo real
  useEffect(() => {
    if (!user?.id || !agencyId || isAdmin) return;

    const channel = supabase
      .channel(`column-permissions-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_column_permissions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // Refetch permissions on any change
          fetchPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, agencyId, isAdmin, fetchPermissions]);

  // Função para verificar se o usuário pode ver uma coluna específica
  const canViewColumn = useCallback((statusId: string): boolean => {
    // Admins podem ver tudo
    if (isAdmin) return true;
    
    // Se não há permissões salvas, o usuário pode ver tudo (comportamento padrão)
    if (permissions.length === 0) return true;
    
    const permission = permissions.find(p => p.status_id === statusId);
    // Se não encontrou permissão específica, assume que pode ver
    if (!permission) return true;
    
    return permission.can_view;
  }, [permissions, isAdmin]);

  // Filtrar uma lista de colunas baseado nas permissões
  const filterColumns = useCallback(<T extends { id: string }>(columns: T[]): T[] => {
    // Admins veem todas as colunas
    if (isAdmin) return columns;
    
    // Se não há permissões, retornar todas as colunas
    if (permissions.length === 0) return columns;
    
    return columns.filter(col => canViewColumn(col.id));
  }, [permissions, isAdmin, canViewColumn]);

  return {
    permissions,
    loading: loading || roleLoading || agencyLoading,
    canViewColumn,
    filterColumns,
    refetch: fetchPermissions,
    isAdmin
  };
}
