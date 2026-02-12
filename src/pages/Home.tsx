import { useNavigate } from "react-router-dom";
import { UserPlus, Building2, CalendarDays, LayoutGrid, Briefcase, Loader2, ClipboardList, FileText, Lightbulb } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/contexts/AgencyContext";
import { useHubPermissions, type HubSectionId } from "@/hooks/useHubPermissions";
import { Card } from "@/components/ui/card";
import { useAgencyRole } from "@/hooks/useAgencyRole";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agencyId } = useAgency();
  const { canAccess, loading: permissionsLoading } = useHubPermissions();
  const { role, isLoading: roleLoading } = useAgencyRole();

  // Admins e gestores ignoram as restrições de permissões
  const isAdmin = role === 'super_admin' || role === 'agency_admin' || role === 'agency_manager';

  const getUserFirstName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0];
    }
    return 'Usuário';
  };

  const allActionCards = [
    {
      id: 'clientes' as HubSectionId,
      title: "Cadastrar Cliente",
      icon: UserPlus,
      route: "/registration"
    },
    {
      id: 'clientes' as HubSectionId,
      title: "Cadastros de Clientes",
      icon: ClipboardList,
      route: "/cadastros-clientes"
    },
    {
      id: 'kanban' as HubSectionId,
      title: "Kanban Central",
      icon: LayoutGrid,
      route: "/kanban-central"
    },
    ...(agencyId ? [{
      id: 'minha-empresa' as HubSectionId,
      title: "Minha Empresa",
      icon: Briefcase,
      route: "/minha-empresa"
    }] : []),
    {
      id: 'clientes' as HubSectionId,
      title: "Perguntas Guias",
      icon: FileText,
      route: "/guide"
    },
    {
      id: 'clientes' as HubSectionId,
      title: "Estratégias",
      icon: Lightbulb,
      route: "/strategy-clients"
    },
    {
      id: 'clientes' as HubSectionId,
      title: "Cronograma",
      icon: CalendarDays,
      route: "/schedules"
    },
    {
      id: 'schedule' as HubSectionId,
      title: "Agendamento de Conteúdos",
      icon: CalendarDays,
      route: "/scheduled"
    },
    {
      id: 'clientes' as HubSectionId,
      title: "Gerenciar (Legado)",
      icon: Building2,
      route: "/clientes",
      adminOnly: true
    },
  ];

  const isAdminOnly = role === 'super_admin' || role === 'agency_admin';

  // Filtrar cards baseado nas permissões (admins veem tudo)
  const actionCards = allActionCards.filter(card => {
    if ((card as any).adminOnly) return isAdminOnly;
    return isAdmin || canAccess(card.id);
  });

  // Loading state
  if (permissionsLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header de Boas-vindas */}
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            Olá, {getUserFirstName()}! 👋
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Gerencie seus clientes e conteúdos
          </p>
        </div>

        {/* Cards de Ação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
              onClick={() => navigate(card.route)}
            >
              <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
              
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>
                
                <h3 className="text-base sm:text-xl font-bold transition-colors text-primary">
                  {card.title}
                </h3>
              </div>
            </Card>
          ))}
        </div>

        {actionCards.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum módulo disponível. Entre em contato com o administrador.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
