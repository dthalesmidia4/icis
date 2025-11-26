import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, UserPlus, Users, BarChart3, FileQuestion, Calendar, ClipboardList } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
const Index = () => {
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const {
    tenantId,
    isLoading: tenantLoading
  } = useTenant();

  // Redirecionar para setup se não tiver tenant configurado
  useEffect(() => {
    if (!tenantLoading && user && !tenantId) {
      navigate('/agency-setup', { replace: true });
    }
  }, [tenantLoading, user, tenantId, navigate]);
  const actionCards = [{
    title: "Cadastro de Clientes",
    icon: UserPlus,
    color: "from-blue-500 to-blue-600",
    route: "/registration",
    emoji: "💬"
  }, {
    title: "Lista de Clientes",
    icon: Users,
    color: "from-purple-500 to-purple-600",
    route: "/clientes",
    emoji: "📋"
  }, {
    title: "Estratégias",
    icon: BarChart3,
    color: "from-emerald-500 to-emerald-600",
    route: "/strategies",
    emoji: "📊"
  }, {
    title: "Perguntas Guias",
    icon: FileQuestion,
    color: "from-orange-500 to-orange-600",
    route: "/client-guide",
    emoji: "❓"
  }, {
    title: "Planejamento",
    icon: ClipboardList,
    color: "from-pink-500 to-pink-600",
    route: "/plans",
    emoji: "📅"
  }, {
    title: "Cronograma",
    icon: Calendar,
    color: "from-teal-500 to-teal-600",
    route: "/schedule",
    emoji: "🗂️"
  }];
  return (
    <main className="p-6 lg:p-12">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
            Hub de Controle
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Acesse rapidamente as principais funcionalidades da plataforma
          </p>
        </div>

        {/* Cards de Ação */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {actionCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Card 
                key={index} 
                className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-primary/50" 
                onClick={() => navigate(card.route)}
              >
                <CardContent className="p-6 flex flex-col items-center text-center px-[24px] py-[24px] my-[24px] mx-[24px]">
                  {/* Ícone com Gradiente */}
                  <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="h-10 w-10 text-white" />
                  </div>

                  {/* Título */}
                  <h3 className="text-xl font-semibold mb-3">{card.title}</h3>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Info */}
        {user && (
          <div className="mt-12 text-center">
            <p className="text-xs text-muted-foreground">
              Logado como: <span className="font-medium">{user.email}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
};
export default Index;