import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Home, Users, Target, FileText, Lightbulb, Calendar, ListTodo, LayoutGrid, Code, User, Settings } from "lucide-react";

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
      { label: 'Perguntas Guias', icon: FileText }
    ],
    requiresClient: true
  },
  '/generate-questions': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Gerar Perguntas', icon: FileText }
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
  '/schedule': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: '{clientName}', href: '/client-hub' },
      { label: 'Demandas', icon: ListTodo }
    ],
    requiresClient: true
  },
  '/kanban-central': {
    items: [
      { label: 'Home', href: '/home', icon: Home },
      { label: 'Kanban Central', icon: LayoutGrid }
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
      }
    }

    if (!config) {
      // Fallback: retornar apenas Home
      return [{ label: 'Home', href: '/home', icon: Home }];
    }

    // Substituir {clientName} pelo nome real do cliente
    const clientName = selectedClient?.fantasy_name || selectedClient?.name || 'Cliente';
    
    return config.items.map(item => ({
      ...item,
      label: item.label.replace('{clientName}', clientName)
    }));
  }, [location.pathname, selectedClient]);

  const currentPage = breadcrumbs[breadcrumbs.length - 1];
  const parentBreadcrumbs = breadcrumbs.slice(0, -1);

  return {
    breadcrumbs,
    currentPage,
    parentBreadcrumbs,
    hasMultipleLevels: breadcrumbs.length > 1
  };
}
