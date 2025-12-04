import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FileText, Lightbulb, ListTodo, Sparkles, Calendar, Loader2, Plus } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PeriodPlan {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
}

const ClientHub = () => {
  const navigate = useNavigate();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periods, setPeriods] = useState<PeriodPlan[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  useEffect(() => {
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  const fetchPeriods = async () => {
    if (!selectedClient || !tenantId) return;
    
    setLoadingPeriods(true);
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, status, created_at")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error) {
      console.error("Error fetching periods:", error);
      toast.error("Erro ao carregar períodos");
    } finally {
      setLoadingPeriods(false);
    }
  };

  const handleDemandasClick = () => {
    fetchPeriods();
    setShowPeriodModal(true);
  };

  const handlePeriodSelect = (periodId: string) => {
    setShowPeriodModal(false);
    navigate(`/schedule?periodPlanId=${periodId}`);
  };

  const handleCreateNewPeriod = () => {
    setShowPeriodModal(false);
    navigate("/plan-period");
  };

  if (!selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const actionCards = [
    {
      title: "Perguntas Guias",
      icon: FileText,
      gradient: "from-blue-400 to-cyan-500",
      route: "/client-guide",
      action: () => navigate("/client-guide"),
    },
    {
      title: "Estratégia Geral",
      icon: Lightbulb,
      gradient: "from-yellow-400 to-orange-500",
      route: "/strategies",
      action: () => navigate("/strategies"),
    },
    {
      title: "Planejar Período",
      icon: Sparkles,
      gradient: "from-violet-400 to-fuchsia-500",
      route: "/plan-period",
      action: () => navigate("/plan-period"),
    },
    {
      title: "Demandas",
      icon: ListTodo,
      gradient: "from-green-400 to-emerald-500",
      route: "/schedule",
      action: handleDemandasClick,
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-emerald-500">Concluído</Badge>;
      case "active":
        return <Badge variant="default" className="bg-blue-500">Ativo</Badge>;
      case "draft":
        return <Badge variant="secondary">Rascunho</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header do Cliente */}
          <div className="mb-8 sm:mb-12 text-center">
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
                  
                  <h3 className={`text-base sm:text-xl font-bold transition-colors ${
                    index === 0 ? 'text-cyan-600 dark:text-cyan-400' :
                    index === 1 ? 'text-orange-600 dark:text-orange-400' :
                    index === 2 ? 'text-fuchsia-600 dark:text-fuchsia-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {card.title}
                  </h3>
                </div>
              </Card>
            ))}
          </div>

          {/* Footer Info */}
          <div className="mt-10 sm:mt-16 text-center">
            <p className="text-xs sm:text-sm text-muted-foreground px-4">
              Todas as ações serão aplicadas para {displayName}
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Seleção de Período */}
      <Dialog open={showPeriodModal} onOpenChange={setShowPeriodModal}>
        <DialogContent className="w-[95vw] max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Selecionar Período
            </DialogTitle>
          </DialogHeader>

          {loadingPeriods ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Nenhum período encontrado</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 px-4">
                Crie um novo período para começar a planejar suas demandas.
              </p>
              <Button onClick={handleCreateNewPeriod} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Criar Novo Período
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[50vh] sm:max-h-[400px] pr-2 sm:pr-4">
                <div className="space-y-2 sm:space-y-3">
                  {periods.map((period) => (
                    <Card
                      key={period.id}
                      className="p-3 sm:p-4 cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary/50 active:scale-[0.98]"
                      onClick={() => handlePeriodSelect(period.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-foreground text-sm sm:text-base truncate">
                            {period.period_title}
                          </h4>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {formatDate(period.period_start)} - {formatDate(period.period_end)}
                          </p>
                        </div>
                        {getStatusBadge(period.status)}
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              <div className="pt-3 sm:pt-4 border-t">
                <Button variant="outline" className="w-full" onClick={handleCreateNewPeriod}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Novo Período
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ClientHub;
