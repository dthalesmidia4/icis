import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { UserPlus, Building2 } from "lucide-react";
import { Layout } from "@/components/Layout";
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
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="container max-w-6xl mx-auto px-6 py-12">
          {/* Header de Boas-vindas */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold mb-3">
              Olá, {getUserFirstName()}! 👋
            </h1>
            <p className="text-lg text-muted-foreground">
              Bem-vindo de volta à {tenantName || 'sua plataforma'}
            </p>
          </div>

          {/* Cards de Ação */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {actionCards.map((card, index) => (
              <Card
                key={index}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 border-2 hover:border-primary/50"
                onClick={() => navigate(card.route)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
                
                <div className="relative p-8">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <card.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  
                  <p className="text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Footer Info */}
          <div className="mt-16 text-center">
            <p className="text-sm text-muted-foreground">
              Selecione uma opção acima para começar
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Home;
