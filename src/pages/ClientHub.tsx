import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FileText, Lightbulb, ListTodo, Sparkles } from "lucide-react";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";

const ClientHub = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loadingDemandas, setLoadingDemandas] = useState(false);

  useEffect(() => {
    // Aguardar inicialização do contexto antes de verificar cliente
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
  }, [isInitialized, selectedClient, navigate]);

  // Mostrar loading enquanto contexto não inicializa
  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const handleDemandasClick = async () => {
    if (!selectedClient || !tenantId) return;
    
    setLoadingDemandas(true);
    try {
      // Buscar o último período gerado para o cliente
      const { data: latestPeriod, error } = await supabase
        .from('period_plans')
        .select('id, period_title, status')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .in('status', ['generated', 'approved', 'mode_selected', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (latestPeriod) {
        // Navegar para o schedule com o período encontrado
        navigate('/schedule', { state: { periodPlanId: latestPeriod.id } });
      } else {
        // Nenhum período encontrado, ir para plan-period para criar um
        toast.info("Nenhum período encontrado. Crie um novo período primeiro.");
        navigate('/plan-period');
      }
    } catch (error) {
      console.error('Error fetching latest period:', error);
      toast.error("Erro ao buscar período. Tente novamente.");
    } finally {
      setLoadingDemandas(false);
    }
  };
  
  const actionCards = [{
    title: "Perguntas Guias",
    icon: FileText,
    gradient: "from-blue-400 to-cyan-500",
    route: "/client-guide",
    action: () => navigate("/client-guide")
  }, {
    title: "Estratégia Geral",
    icon: Lightbulb,
    gradient: "from-yellow-400 to-orange-500",
    route: "/strategies",
    action: () => navigate("/strategies")
  }, {
    title: "Períodos",
    icon: Sparkles,
    gradient: "from-violet-400 to-fuchsia-500",
    route: "/plan-period",
    action: () => navigate("/plan-period")
  }, {
    title: loadingDemandas ? "Carregando..." : "Demandas",
    icon: ListTodo,
    gradient: "from-green-400 to-emerald-500",
    route: "/schedule",
    action: handleDemandasClick
  }];
  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header do Cliente */}
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/clientes" />
          </div>
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 px-4 sm:px-6 py-2 sm:py-3 bg-primary/10 rounded-full">
            <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-medium text-primary">Cliente Ativo</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
            {displayName}
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Hub de Controle Estratégico
          </p>
        </div>

        {/* Cards de Ação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {actionCards.map((card, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" 
              onClick={card.action}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
              
              <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <card.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                
                <h3 className={`text-base sm:text-xl font-bold transition-colors ${index === 0 ? 'text-cyan-600 dark:text-cyan-400' : index === 1 ? 'text-orange-600 dark:text-orange-400' : index === 2 ? 'text-fuchsia-600 dark:text-fuchsia-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {card.title}
                </h3>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-10 sm:mt-16 text-center">
          
        </div>
      </div>
    </div>
  );
};

export default ClientHub;