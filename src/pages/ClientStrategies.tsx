import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Plus, BarChart3, FileText, Calendar, CheckCircle2, Edit, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmationModal } from "@/components/ConfirmationModal";

const ClientStrategies = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client-basic', id, tenantId],
    queryFn: async () => {
      if (!id || !tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_companies')
        .select('id, name, sector')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("Cliente não encontrado");
          navigate('/clientes');
          return null;
        }
        throw error;
      }

      return data;
    },
    enabled: !!id && !!tenantId
  });

  const { data: strategies, isLoading: strategiesLoading } = useQuery({
    queryKey: ['client-strategies', id, tenantId, searchTerm, statusFilter],
    queryFn: async () => {
      if (!id || !tenantId) return [];

      let query = supabase
        .from('strategies')
        .select('*')
        .eq('company_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,strategy_text.ilike.%${searchTerm}%`);
      }

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!tenantId
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['client-plans', id, tenantId],
    queryFn: async () => {
      if (!id || !tenantId) return [];

      const { data, error } = await supabase
        .from('marketing_plans')
        .select('*')
        .eq('company_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!tenantId
  });

  const approvePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase
        .from('marketing_plans')
        .update({ 
          approved: true, 
          approved_at: new Date().toISOString() 
        })
        .eq('id', planId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      // Update strategy status to "Aprovada"
      if (data.strategy_id) {
        await supabase
          .from('strategies')
          .update({ status: 'Aprovada' })
          .eq('id', data.strategy_id)
          .eq('tenant_id', tenantId);
      }

      return data;
    },
    onSuccess: () => {
      toast.success("✅ Planejamento aprovado com sucesso! Você pode agora acompanhar as próximas etapas no painel do cliente.");
      queryClient.invalidateQueries({ queryKey: ['client-plans', id, tenantId] });
      queryClient.invalidateQueries({ queryKey: ['client-strategies', id, tenantId] });
      setApproveModalOpen(false);
      setSelectedPlanId(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao aprovar planejamento: " + error.message);
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Aprovada':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'Em execução':
        return <Clock className="h-4 w-4" />;
      default:
        return <Edit className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case 'Aprovada':
        return "default";
      case 'Em execução':
        return "secondary";
      default:
        return "outline";
    }
  };

  const isLoading = clientLoading || strategiesLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando estratégias e planejamentos...</p>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate(`/clientes/${id}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos Detalhes do Cliente
          </Button>

          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                    <BarChart3 className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Estratégias e Planejamentos</CardTitle>
                    <CardDescription>
                      Acompanhe e gerencie as estratégias de marketing e os planejamentos de {client.name}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/strategy?companyId=${id}`)}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Estratégia
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou palavra-chave..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="Em elaboração">Em elaboração</SelectItem>
                      <SelectItem value="Aprovada">Aprovada</SelectItem>
                      <SelectItem value="Em execução">Em execução</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Estratégias */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Estratégias Criadas
                  </h3>
                  
                  {!strategies || strategies.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground mb-4">
                          {searchTerm || statusFilter !== 'all' 
                            ? "Nenhuma estratégia encontrada com os filtros aplicados" 
                            : "Nenhuma estratégia cadastrada ainda"}
                        </p>
                        {!searchTerm && statusFilter === 'all' && (
                          <Button
                            onClick={() => navigate(`/strategy?companyId=${id}`)}
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Criar Primeira Estratégia
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {strategies.map((strategy) => {
                        const strategyPlans = plans?.filter(p => p.strategy_id === strategy.id) || [];
                        
                        return (
                          <Card 
                            key={strategy.id}
                            className="hover:shadow-lg transition-all"
                          >
                            <CardContent className="p-6">
                              <div className="space-y-4">
                                {/* Strategy Header */}
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <h4 className="text-lg font-semibold">
                                        {strategy.name || "Estratégia sem título"}
                                      </h4>
                                      <Badge 
                                        variant={getStatusVariant(strategy.status)}
                                        className="flex items-center gap-1"
                                      >
                                        {getStatusIcon(strategy.status)}
                                        {strategy.status}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {strategy.strategy_text}
                                    </p>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground ml-4">
                                    <div>Criada em</div>
                                    <div className="font-medium">
                                      {format(new Date(strategy.created_at), "dd/MM/yyyy", { locale: ptBR })}
                                    </div>
                                    {strategy.period_start && strategy.period_end && (
                                      <div className="mt-2">
                                        <div>Período</div>
                                        <div className="font-medium">
                                          {format(new Date(strategy.period_start), "dd/MM/yy", { locale: ptBR })} - {format(new Date(strategy.period_end), "dd/MM/yy", { locale: ptBR })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Associated Plans */}
                                {strategyPlans.length > 0 && (
                                  <div className="border-t pt-4">
                                    <h5 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      Planejamentos Vinculados
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {strategyPlans.map((plan) => (
                                        <Card 
                                          key={plan.id}
                                          className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50"
                                          onClick={() => navigate(`/plan?planId=${plan.id}`)}
                                        >
                                          <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-2">
                                              <Badge 
                                                variant={plan.approved ? "default" : "secondary"}
                                                className={plan.approved ? "bg-green-500" : ""}
                                              >
                                                {plan.approved ? (
                                                  <>
                                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                                    Aprovado
                                                  </>
                                                ) : (
                                                  "Em Análise"
                                                )}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">
                                                {format(new Date(plan.created_at), "dd/MM/yy", { locale: ptBR })}
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              Criado em {format(new Date(plan.created_at), "MMMM 'de' yyyy", { locale: ptBR })}
                                            </p>
                                            {plan.approved_at && (
                                              <p className="text-xs text-green-600 mt-1">
                                                Aprovado em {format(new Date(plan.approved_at), "dd/MM/yyyy", { locale: ptBR })}
                                              </p>
                                            )}
                                            {!plan.approved && (
                                              <div className="flex gap-2 mt-3">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/plan?planId=${plan.id}`);
                                                  }}
                                                  className="flex-1"
                                                >
                                                  <Edit className="h-3 w-3 mr-1" />
                                                  Editar
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPlanId(plan.id);
                                                    setApproveModalOpen(true);
                                                  }}
                                                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                                                >
                                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                                  Aprovar
                                                </Button>
                                              </div>
                                            )}
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(`/strategy?companyId=${id}&strategyId=${strategy.id}`)}
                                  >
                                    <Edit className="h-3 w-3 mr-1" />
                                    Editar Estratégia
                                  </Button>
                                  {strategyPlans.length === 0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => navigate(`/plan?strategyId=${strategy.id}`)}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Criar Planejamento
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationModal
        open={approveModalOpen}
        onOpenChange={setApproveModalOpen}
        title="Aprovar Planejamento"
        description="Tem certeza que deseja aprovar este planejamento? Esta ação marcará o plano como aprovado e atualizará o status da estratégia."
        onConfirm={() => selectedPlanId && approvePlanMutation.mutate(selectedPlanId)}
        loading={approvePlanMutation.isPending}
      />
    </div>
  );
};

export default ClientStrategies;
