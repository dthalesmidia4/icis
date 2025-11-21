import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Calendar, FileText, Lightbulb, ListTodo } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useEffect } from "react";
import { toast } from "sonner";
const ClientHub = () => {
  const navigate = useNavigate();
  const {
    selectedClient
  } = useSelectedClient();
  useEffect(() => {
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
  }, [selectedClient, navigate]);
  if (!selectedClient) return null;
  const displayName = selectedClient.fantasy_name || selectedClient.name;
  const actionCards = [{
    title: "Estratégias",
    icon: Lightbulb,
    gradient: "from-yellow-400 to-orange-500",
    route: "/strategies",
    emoji: "💡"
  }, {
    title: "Perguntas Guias",
    icon: FileText,
    gradient: "from-blue-400 to-cyan-500",
    route: "/generate-questions",
    emoji: "❓"
  }, {
    title: "Planejamento",
    icon: Calendar,
    gradient: "from-purple-400 to-pink-500",
    route: "/plans",
    emoji: "📋"
  }, {
    title: "Cronograma",
    icon: ListTodo,
    gradient: "from-green-400 to-emerald-500",
    route: "/schedule",
    emoji: "📅"
  }];
  return <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="container max-w-6xl mx-auto px-6 py-12">
          {/* Header do Cliente */}
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-3 mb-4 px-6 py-3 bg-primary/10 rounded-full">
              <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
              <span className="text-sm font-medium text-primary">Cliente Ativo</span>
            </div>
            <h1 className="text-4xl font-bold mb-3">
              {displayName}
            </h1>
            <p className="text-lg text-muted-foreground">
              Hub de Controle Estratégico
            </p>
          </div>

          {/* Cards de Ação */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {actionCards.map((card, index) => <Card key={index} className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 border-2 hover:border-primary/50" onClick={() => navigate(card.route)}>
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
                
                <div className="relative p-8 flex flex-col items-center justify-center text-center min-h-[200px]">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <card.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className={`text-xl font-bold transition-colors ${
                    index === 0 ? 'text-orange-600 dark:text-orange-400' :
                    index === 1 ? 'text-cyan-600 dark:text-cyan-400' :
                    index === 2 ? 'text-pink-600 dark:text-pink-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {card.title}
                  </h3>
                </div>
              </Card>)}
          </div>

          {/* Footer Info */}
          <div className="mt-16 text-center">
            <p className="text-sm text-muted-foreground">
              Todas as ações serão aplicadas para {displayName}
            </p>
          </div>
        </div>
      </div>
    </Layout>;
};
export default ClientHub;