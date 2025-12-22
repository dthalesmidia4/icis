import { useNavigate } from "react-router-dom";
import { UserPlus, Building2, CalendarDays, LayoutGrid } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
const Home = () => {
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const getUserFirstName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0];
    }
    return 'Usuário';
  };
  const actionCards = [{
    title: "Gerenciar Clientes",
    icon: Building2,
    gradient: "from-blue-500 to-indigo-600",
    route: "/clientes"
  }, {
    title: "Cadastrar Cliente",
    icon: UserPlus,
    gradient: "from-green-500 to-emerald-600",
    route: "/registration"
  }, {
    title: "Conteúdo Programado",
    icon: CalendarDays,
    gradient: "from-purple-500 to-violet-600",
    route: "/content-schedule"
  }, {
    title: "Kanban Central",
    icon: LayoutGrid,
    gradient: "from-cyan-500 to-teal-600",
    route: "/kanban-central"
  }];
  return <div className="pb-8">
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
          {actionCards.map((card, index) => <Card key={index} className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={() => navigate(card.route)}>
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
              
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <card.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                
                <h3 className={`text-base sm:text-xl font-bold transition-colors ${index === 0 ? 'text-indigo-600 dark:text-indigo-400' : index === 1 ? 'text-emerald-600 dark:text-emerald-400' : index === 2 ? 'text-violet-600 dark:text-violet-400' : 'text-teal-600 dark:text-teal-400'}`}>
                  {card.title}
                </h3>
              </div>
            </Card>)}
        </div>
      </div>
    </div>;
};
export default Home;