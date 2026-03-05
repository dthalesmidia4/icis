import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAgency } from '@/contexts/AgencyContext';

// Seções do Hub que podem ter permissões controladas
export const HUB_SECTIONS = [
  { id: 'clientes', label: 'Clientes', description: 'Acesso à lista e gestão de clientes' },
  { id: 'kanban', label: 'Kanban Central', description: 'Visualização do quadro Kanban' },
  { id: 'schedule', label: 'Agendar Publicação', description: 'Programação de conteúdos' },
  { id: 'completed', label: 'Demandas Completas', description: 'Visualização de demandas finalizadas' },
  { id: 'cronogramas', label: 'Cronogramas', description: 'Planejamento e gestão de períodos' },
  { id: 'minha-empresa', label: 'Minha Empresa', description: 'Configurações da empresa' },
  { id: 'dev-hub', label: 'Hub de Desenvolvimento', description: 'Ferramentas de desenvolvimento' },
] as const;

// Botões dentro do Hub do Cliente que podem ter permissões controladas
export const CLIENT_HUB_BUTTONS = [
  { id: 'client_cadastro', label: 'Cadastro', description: 'Acesso ao cadastro do cliente' },
  { id: 'client_anamnese', label: 'Anamnese', description: 'Acesso à anamnese do cliente' },
  { id: 'client_estrategia', label: 'Estratégia', description: 'Acesso à estratégia do cliente' },
  { id: 'client_planejar_periodo', label: 'Planejar Período', description: 'Planejamento de períodos' },
  { id: 'client_aprovar_producao', label: 'Aprovar Produção', description: 'Aprovação de demandas' },
  { id: 'client_demandas_reprovadas', label: 'Demandas Reprovadas', description: 'Visualização de demandas reprovadas' },
  { id: 'client_cronograma_atual', label: 'Cronograma Atual', description: 'Cronograma do período atual' },
  { id: 'client_historico', label: 'Histórico de Períodos', description: 'Histórico de períodos anteriores' },
  { id: 'client_identidade_visual', label: 'Identidade Visual', description: 'Gestão da identidade visual' },
  { id: 'client_conteudo_avulso', label: 'Conteúdo Avulso', description: 'Criação de conteúdo avulso' },
] as const;

export type ClientHubButtonId = typeof CLIENT_HUB_BUTTONS[number]['id'];

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
  const canAccess = useCallback((sectionId: HubSectionId | ClientHubButtonId | string): boolean => {
    // Para botões do cliente (client_*), o padrão é "allow" quando não há permissão salva
    const isClientButton = sectionId.startsWith('client_');

    // Se não há permissões carregadas/salvas para este usuário
    if (permissions.length === 0) {
      // Botões do cliente: permitir por padrão; seções do hub: negar por padrão
      return isClientButton;
    }

    const permission = permissions.find(p => p.hub_section === sectionId);
    // Se não encontrou permissão específica para esta seção
    if (!permission) {
      // Botões do cliente: permitir por padrão; seções do hub: negar por padrão
      return isClientButton;
    }

    return permission.can_access === true;
  }, [permissions]);

  return {
    permissions,
    loading: loading || agencyLoading,
    canAccess,
    refetch: fetchPermissions
  };
}
