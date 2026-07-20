import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useBreadcrumbOverrideValues } from "@/contexts/BreadcrumbOverrideContext";
import { Home, Users, Target, FileText, Lightbulb, Calendar, CalendarDays, ListTodo, LayoutGrid, Code, User, Settings } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ElementType;
}

interface BreadcrumbConfig {
  items: BreadcrumbItem[];
  requiresClient?: boolean;
}

const routeConfig: Record<string, BreadcrumbConfig> = {
  '/home': {
    items: [{ label: 'Home', href: '/home', icon: Home }]
  },
  '/clientes': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users }
    ]
  },
  '/client-hub': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', icon: Target }
    ],
    requiresClient: true
  },
  '/client-guide': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Anamnese', icon: FileText }
    ],
    requiresClient: true
  },
  
  '/strategies': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Estratégia', icon: Lightbulb }
    ],
    requiresClient: true
  },
  '/strategy-creation': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Criar Estratégia', icon: Lightbulb }
    ],
    requiresClient: true
  },
  '/plan-period': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Períodos', icon: Calendar }
    ],
    requiresClient: true
  },
  
  '/kanban-central': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Visão Geral', icon: LayoutGrid }
    ]
  },
  '/scheduled': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Visão Geral', href: '/kanban-central', icon: LayoutGrid },
      { label: 'Agendamentos', icon: CalendarDays }
    ]
  },
  '/dev-hub': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Developer', icon: Code }
    ]
  },
  '/dev-prompts': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Developer', href: '/dev-hub', icon: Code },
      { label: 'Prompts' }
    ]
  },
  '/dev-apis': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Developer', href: '/dev-hub', icon: Code },
      { label: 'APIs' }
    ]
  },
  '/dev-webhooks': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Developer', href: '/dev-hub', icon: Code },
      { label: 'Webhooks' }
    ]
  },
  '/profile-settings': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Perfil', icon: User }
    ]
  },
  '/admin-dashboard': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Admin', icon: Settings }
    ]
  }
};

export function useBreadcrumb() {
  const location = useLocation();
  const { selectedClient } = useSelectedClient();
  const overrides = useBreadcrumbOverrideValues();

  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const path = location.pathname;
    
    // Tentar encontrar configuração exata
    let config = routeConfig[path];
    
    // Se não encontrou, tentar match parcial para rotas dinâmicas
    if (!config) {
      // Para rotas como /clientes/:id
      if (path.startsWith('/clientes/') && path !== '/clientes') {
        config = {
          items: [
            { label: 'Home', href: '/home', icon: Home },
            { label: 'Clientes', href: '/clientes', icon: Users },
            { label: '{clientName}', icon: Target }
          ],
          requiresClient: true
        };
      } else if (path.startsWith('/colaboradores/') && path !== '/minha-empresa/colaboradores') {
        config = {
          items: [
            { label: 'Home', href: '/home', icon: Home },
            { label: 'Visão Geral', href: '/kanban-central', icon: LayoutGrid },
            { label: 'Demandas de {collaboratorName}', icon: User }
          ]
        };
      }
    }

    if (!config) {
      // Fallback: retornar apenas Home
      return [{ label: 'Home', href: '/home', icon: Home }];
    }

    // Substituir tokens
    const clientName = selectedClient?.fantasy_name || selectedClient?.name || 'Cliente';
    const tokens: Record<string, string> = {
      clientName,
      collaboratorName: overrides.collaboratorName || 'Colaborador',
      ...overrides,
    };
    
    return config.items.map(item => ({
      ...item,
      label: Object.entries(tokens).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, v),
        item.label
      )
    }));
  }, [location.pathname, selectedClient, overrides]);

  const currentPage = breadcrumbs[breadcrumbs.length - 1];
  const parentBreadcrumbs = breadcrumbs.slice(0, -1);

  return {
    breadcrumbs,
    currentPage,
    parentBreadcrumbs,
    hasMultipleLevels: breadcrumbs.length > 1
  };
}
