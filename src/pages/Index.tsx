import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Building2, FileText, Users, LogOut, Edit, CheckCircle2, UserPlus, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenantName, tenantType, tenantId, isLoading: tenantLoading } = useTenant();

  // Redirecionar para setup se não tiver tenant configurado
  useEffect(() => {
    if (!tenantLoading && user && !tenantId) {
      toast.info("Complete o cadastro da sua agência primeiro");
      navigate('/agency-setup');
    }
  }, [tenantLoading, user, tenantId, navigate]);

  // Buscar informações detalhadas do tenant
  const { data: tenantData } = useQuery({
    queryKey: ['tenant-details', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
      
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
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const actionCards = [
    {
      title: "Cadastro de Clientes",
      description: "Adicione novos clientes à sua base, com informações essenciais como nome, contato e setor",
      icon: UserPlus,
      color: "from-blue-500 to-blue-600",
      route: "/registration",
      emoji: "💬"
    },
    {
      title: "Lista de Clientes",
      description: "Visualize todos os clientes cadastrados com filtros, buscas e opções de edição",
      icon: Users,
      color: "from-purple-500 to-purple-600",
      route: "/registration", // Pode criar rota específica depois
      emoji: "📋"
    },
    {
      title: "Estratégias",
      description: "Crie e acompanhe planos de marketing e ações estratégicas da empresa",
      icon: BarChart3,
      color: "from-emerald-500 to-emerald-600",
      route: "/strategy",
      emoji: "📊"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Sidebar - Informações da Empresa */}
        <aside className="w-full lg:w-80 bg-card border-r border-border p-6 lg:sticky lg:top-0 lg:h-screen">
          <div className="flex flex-col h-full">
            {/* Header com botão Sair */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-medium text-muted-foreground">Empresa Logada</h2>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* Logo e Nome da Empresa */}
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="h-16 w-16 border-2 border-primary">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xl font-bold">
                  {tenantName ? getInitials(tenantName) : 'EM'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold truncate">{tenantName || 'Carregando...'}</h3>
                <Badge variant="outline" className="mt-1">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {tenantData?.status || 'ativo'}
                </Badge>
              </div>
            </div>

            <Separator className="mb-6" />

            {/* Informações da Empresa */}
            <div className="space-y-4 flex-1">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                  <p className="text-sm font-medium capitalize">{tenantType || 'N/A'}</p>
                </div>
              </div>

              {tenantData?.cnpj_cpf && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">CNPJ</p>
                    <p className="text-sm font-medium">{tenantData.cnpj_cpf}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Botão Editar Informações */}
            <Button 
              variant="outline" 
              className="w-full mt-6"
              onClick={() => navigate("/agency-setup")}
            >
              <Edit className="h-4 w-4 mr-2" />
              Editar Informações
            </Button>
          </div>
        </aside>

        {/* Área Principal - Hub de Controle */}
        <main className="flex-1 p-6 lg:p-12">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-12 text-center lg:text-left">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                Hub de Controle
              </h1>
              <p className="text-muted-foreground text-lg">
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
                    <CardContent className="p-6">
                      {/* Ícone com Gradiente */}
                      <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>

                      {/* Emoji e Título */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{card.emoji}</span>
                        <h3 className="text-xl font-semibold">{card.title}</h3>
                      </div>

                      {/* Descrição */}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>

                      {/* Indicador de Hover */}
                      <div className="mt-4 flex items-center text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Acessar
                        <svg className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
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
      </div>
    </div>
  );
};

export default Index;