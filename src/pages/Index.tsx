import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, CheckCircle2, UserPlus, Users, BarChart3, FileQuestion, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
const Index = () => {
  const navigate = useNavigate();
  const {
    user,
    signOut
  } = useAuth();
  const {
    tenantName,
    tenantType,
    tenantId,
    isLoading: tenantLoading
  } = useTenant();

  // Redirecionar para setup se não tiver tenant configurado
  useEffect(() => {
    if (!tenantLoading && user && !tenantId) {
      navigate('/agency-setup', { replace: true });
    }
  }, [tenantLoading, user, tenantId, navigate]);

  // Buscar informações detalhadas do tenant
  const {
    data: tenantData
  } = useQuery({
    queryKey: ['tenant-details', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const {
        data,
        error
      } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId
  });
  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };
  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };
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
    route: "/generate-questions",
    emoji: "❓"
  }, {
    title: "Ver Plano do Cronograma",
    icon: Calendar,
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
  return <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Navbar - Informações da Empresa */}
      <nav className="w-full bg-card border-b border-border sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo e Nome da Empresa */}
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-primary">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-lg font-bold">
                  {tenantName ? getInitials(tenantName) : 'EM'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{tenantName || 'Carregando...'}</h3>
                
              </div>
            </div>

            {/* Menu de Navegação */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dev-hub')}>
                Dev
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Área Principal - Hub de Controle */}
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
            return <Card key={index} className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-primary/50" onClick={() => navigate(card.route)}>
                  <CardContent className="p-6 flex flex-col items-center text-center px-[24px] py-[24px] my-[24px] mx-[24px]">
                    {/* Ícone com Gradiente */}
                    <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-10 w-10 text-white" />
                    </div>

                    {/* Título */}
                    <h3 className="text-xl font-semibold mb-3">{card.title}</h3>

                    {/* Indicador de Hover */}
                    
                  </CardContent>
                </Card>;
          })}
          </div>

          {/* Footer Info */}
          {user && <div className="mt-12 text-center">
              <p className="text-xs text-muted-foreground">
                Logado como: <span className="font-medium">{user.email}</span>
              </p>
            </div>}
        </div>
      </main>
    </div>;
};
export default Index;