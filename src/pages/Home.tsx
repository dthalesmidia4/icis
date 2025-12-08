import { useNavigate } from "react-router-dom";
import { UserPlus, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ActionCard from "@/components/ActionCard";
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
  }];
  return <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Header de Boas-vindas */}
          <div className="mb-8 sm:mb-12 text-center">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words">
              Olá, {getUserFirstName()}! 👋
            </h1>
          </div>

          {/* Cards de Ação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {actionCards.map((card, index) => <ActionCard key={index} title={card.title} icon={card.icon} gradient={card.gradient} onClick={() => navigate(card.route)} />)}
          </div>

        {/* Footer Info */}
        
      </div>
    </div>;
};
export default Home;