import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAgency } from '@/contexts/AgencyContext';

// Seções do Hub que podem ter permissões controladas
export const HUB_SECTIONS = [
  { id: 'clientes', label: 'Clientes', description: 'Acesso à lista e gestão de clientes' },
  { id: 'kanban', label: 'Kanban Central', description: 'Visualização do quadro Kanban' },
  { id: 'schedule', label: 'Agendar Publicação', description: 'Programação de conteúdos' },
  { id: 'minha-empresa', label: 'Minha Empresa', description: 'Configurações da empresa' },
  { id: 'dev-hub', label: 'Hub de Desenvolvimento', description: 'Ferramentas de desenvolvimento' },
] as const;

export type HubSectionId = typeof HUB_SECTIONS[number]['id'];

interface HubPermission {
  hub_section: string;
  can_access: boolean;
}

export function useHubPermissions() {
  const { user } = useAuth();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [permissions, setPermissions] = useState<HubPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    // Aguardar o agencyId estar disponível
    if (agencyLoading) return;
    
    if (!user?.id || !agencyId) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_hub_permissions')
        .select('hub_section, can_access')
        .eq('user_id', user.id)
        .eq('tenant_id', agencyId);

      if (error) throw error;

      console.log('[Permissions] Hub permissions loaded:', data?.length, 'entries');
      setPermissions(data || []);
    } catch (error) {
      console.error('Erro ao buscar permissões de hub:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, agencyId, agencyLoading]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Setup realtime subscription para atualizar permissões em tempo real
  useEffect(() => {
    if (!user?.id || !agencyId) return;

    const channel = supabase
      .channel(`hub-permissions-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_hub_permissions',
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
  }, [user?.id, agencyId, fetchPermissions]);

  // Função para verificar se o usuário pode acessar uma seção específica
  const canAccess = useCallback((sectionId: HubSectionId | string): boolean => {
    // Se não há permissões salvas, o usuário pode acessar tudo (comportamento padrão)
    if (permissions.length === 0) return true;
    
    const permission = permissions.find(p => p.hub_section === sectionId);
    // Se não encontrou permissão específica para esta seção, assume que pode acessar
    if (!permission) return true;
    
    // Retorna o valor de can_access (true = pode acessar, false = bloqueado)
    return permission.can_access === true;
  }, [permissions]);

  return {
    permissions,
    loading: loading || agencyLoading,
    canAccess,
    refetch: fetchPermissions
  };
}
