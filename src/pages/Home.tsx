import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { UserPlus, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenantName } = useTenant();

  const getUserFirstName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0];
    }
    return 'Usuário';
  };

  const actionCards = [
    {
      title: "Gerenciar Clientes",
      icon: Building2,
      gradient: "from-blue-500 to-indigo-600",
      route: "/clientes",
      description: "Acesse a hub de controle de cada cliente"
    },
    {
      title: "Cadastrar Cliente",
      icon: UserPlus,
      gradient: "from-green-500 to-emerald-600",
      route: "/registration",
      description: "Adicione um novo cliente à plataforma"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Header de Boas-vindas */}
          <div className="mb-8 sm:mb-12 text-center">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words">
              Olá, {getUserFirstName()}! 👋
            </h1>
          </div>

          {/* Cards de Ação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {actionCards.map((card, index) => (
              <Card
                key={index}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => navigate(card.route)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
                
                <div className="relative p-6 sm:p-8">
                  <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <card.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  
                  <h3 className="text-lg sm:text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>

        {/* Footer Info */}
        <div className="mt-10 sm:mt-16 text-center">
          <p className="text-xs sm:text-sm text-muted-foreground px-4">
            Selecione uma opção acima para começar
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;
