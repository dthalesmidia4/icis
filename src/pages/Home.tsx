import { useNavigate } from "react-router-dom";
import { UserPlus, Building2, CalendarDays, LayoutGrid, Briefcase, Loader2 } from "lucide-react";
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
      id: 'kanban' as HubSectionId,
      title: "Kanban Central",
      icon: LayoutGrid,
      gradient: "from-cyan-500 to-teal-600",
      titleColor: "text-teal-600 dark:text-teal-400",
      route: "/kanban-central"
    },
    {
      id: 'clientes' as HubSectionId,
      title: "Gerenciar Clientes",
      icon: Building2,
      gradient: "from-blue-500 to-indigo-600",
      titleColor: "text-indigo-600 dark:text-indigo-400",
      route: "/clientes"
    },
    {
      id: 'schedule' as HubSectionId,
      title: "Agendamento",
      icon: CalendarDays,
      gradient: "from-purple-500 to-violet-600",
      titleColor: "text-violet-600 dark:text-violet-400",
      route: "/content-schedule"
    },
    ...(agencyId ? [{
      id: 'minha-empresa' as HubSectionId,
      title: "Minha Empresa",
      icon: Briefcase,
      gradient: "from-orange-500 to-amber-600",
      titleColor: "text-amber-600 dark:text-amber-400",
      route: "/minha-empresa"
    }] : []),
    {
      id: 'clientes' as HubSectionId,
      title: "Cadastrar Cliente",
      icon: UserPlus,
      gradient: "from-green-500 to-emerald-600",
      titleColor: "text-emerald-600 dark:text-emerald-400",
      route: "/registration"
    },
  ];

  // Filtrar cards baseado nas permissões (admins veem tudo)
  const actionCards = allActionCards.filter(card => 
    isAdmin || canAccess(card.id)
  );

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
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
              
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <card.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                
                <h3 className={`text-base sm:text-xl font-bold transition-colors ${card.titleColor}`}>
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
