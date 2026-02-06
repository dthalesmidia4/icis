import { useNavigate } from "react-router-dom";
import { Building2, Users, UserPlus, UserMinus } from "lucide-react";
import { Card } from "@/components/ui/card";
import BackButton from "@/components/BackButton";

const MyCompany = () => {
  const navigate = useNavigate();

  const actionCards = [
    {
      title: "Cadastro da Empresa",
      description: "Visualize e edite os dados da sua empresa",
      icon: Building2,
      gradient: "from-blue-500 to-indigo-600",
      route: "/minha-empresa/cadastro"
    },
    {
      title: "Acesso dos Colaboradores",
      description: "Veja todos os membros da sua equipe",
      icon: Users,
      gradient: "from-green-500 to-emerald-600",
      route: "/minha-empresa/colaboradores"
    },
    {
      title: "Convidar Colaborador",
      description: "Envie um convite por email",
      icon: UserPlus,
      gradient: "from-purple-500 to-violet-600",
      route: "/minha-empresa/convidar"
    },
    {
      title: "Remover Colaborador",
      description: "Remova membros da empresa",
      icon: UserMinus,
      gradient: "from-red-500 to-rose-600",
      route: "/minha-empresa/remover"
    }
  ];

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-4">
          <BackButton />
        </div>
        
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3">
            Minha Empresa 🏢
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Gerencie sua empresa e equipe
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
                
                <h3 className={`text-base sm:text-xl font-bold transition-colors ${
                  index === 0 ? 'text-indigo-600 dark:text-indigo-400' : 
                  index === 1 ? 'text-emerald-600 dark:text-emerald-400' : 
                  index === 2 ? 'text-violet-600 dark:text-violet-400' : 
                  'text-rose-600 dark:text-rose-400'
                }`}>
                  {card.title}
                </h3>
                
                <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                  {card.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyCompany;
