import {
  UserPlus,
  ClipboardList,
  LayoutGrid,
  Briefcase,
  FileText,
  Lightbulb,
  CalendarDays,
  Building2,
} from "lucide-react";
import type { HubSectionId } from "@/hooks/useHubPermissions";

export interface NavigationItem {
  id: HubSectionId;
  title: string;
  icon: React.ElementType;
  route: string;
  adminOnly?: boolean;
  requiresAgency?: boolean;
}

/**
 * Lista centralizada de itens de navegação principais.
 * Qualquer item adicionado aqui aparece automaticamente na Home e na Sidebar.
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'clientes',
    title: "Cadastrar Cliente",
    icon: UserPlus,
    route: "/registration",
  },
  {
    id: 'clientes',
    title: "Cadastros de Clientes",
    icon: ClipboardList,
    route: "/cadastros-clientes",
  },
  {
    id: 'kanban',
    title: "Kanban Central",
    icon: LayoutGrid,
    route: "/kanban-central",
  },
  {
    id: 'minha-empresa',
    title: "Minha Empresa",
    icon: Briefcase,
    route: "/minha-empresa",
    requiresAgency: true,
  },
  {
    id: 'clientes',
    title: "Perguntas Guias",
    icon: FileText,
    route: "/guide",
  },
  {
    id: 'clientes',
    title: "Estratégias",
    icon: Lightbulb,
    route: "/strategy-clients",
  },
  {
    id: 'clientes',
    title: "Cronograma",
    icon: CalendarDays,
    route: "/schedules",
  },
  {
    id: 'schedule',
    title: "Agendamento de Conteúdos",
    icon: CalendarDays,
    route: "/scheduled",
  },
  {
    id: 'clientes',
    title: "Gerenciar (Legado)",
    icon: Building2,
    route: "/clientes",
    adminOnly: true,
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
