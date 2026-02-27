import {
  UserPlus,
  ClipboardList,
  LayoutGrid,
  Briefcase,
  CalendarDays,
  Users,
} from "lucide-react";
import type { HubSectionId } from "@/hooks/useHubPermissions";

export interface NavigationItem {
  id: HubSectionId;
  title: string;
  icon: React.ElementType;
  route: string;
  adminOnly?: boolean;
  requiresAgency?: boolean;
  /** When true, Home will open the client selection modal instead of navigating */
  opensClientModal?: boolean;
}

/**
 * Lista centralizada de itens de navegação principais.
 * Qualquer item adicionado aqui aparece automaticamente na Home e na Sidebar.
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'clientes',
    title: "Cliente",
    icon: Users,
    route: "/client-hub",
    opensClientModal: true,
  },
  {
    id: 'kanban',
    title: "Kanban Central",
    icon: LayoutGrid,
    route: "/kanban-central",
  },
  {
    id: 'schedule',
    title: "Agendamento de Conteúdos",
    icon: CalendarDays,
    route: "/scheduled",
  },
  {
    id: 'minha-empresa',
    title: "Minha Empresa",
    icon: Briefcase,
    route: "/minha-empresa",
    requiresAgency: true,
  },
];

/**
 * Filtra os itens de navegação com base nas permissões do usuário.
 */
export function getFilteredNavigationItems(options: {
  agencyId?: string | null;
  isAdmin: boolean;
  isAdminOnly: boolean;
  canAccess: (id: HubSectionId) => boolean;
}): NavigationItem[] {
  const { agencyId, isAdmin, isAdminOnly, canAccess } = options;

  return NAVIGATION_ITEMS.filter((item) => {
    if (item.requiresAgency && !agencyId) return false;
    if (item.adminOnly) return isAdminOnly;
    return isAdmin || canAccess(item.id);
  });
}
