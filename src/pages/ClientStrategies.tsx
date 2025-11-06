import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Plus, BarChart3, FileText, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ClientStrategies = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");

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
    queryKey: ['client-strategies', id, tenantId, searchTerm],
    queryFn: async () => {
      if (!id || !tenantId) return [];

      let query = supabase
        .from('strategies')
        .select('*')
        .eq('company_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('strategy_text', `%${searchTerm}%`);
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

  const isLoading = clientLoading || strategiesLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando estratégias...</p>
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
            Voltar aos Detalhes
          </Button>

          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                  <BarChart3 className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl">Estratégias e Planos</CardTitle>
                  <CardDescription>
                    {client.name} • {client.sector}
                  </CardDescription>
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
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por palavra-chave..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
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
                          Nenhuma estratégia criada ainda
                        </p>
                        <Button
                          onClick={() => navigate(`/strategy?companyId=${id}`)}
                          variant="outline"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Primeira Estratégia
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {strategies.map((strategy) => (
                        <Card 
                          key={strategy.id}
                          className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                          onClick={() => navigate(`/strategy?companyId=${id}`)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <Badge variant="outline">Estratégia</Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(strategy.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm line-clamp-3 leading-relaxed">
                              {strategy.strategy_text}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Planos de Marketing */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Planos de Marketing
                  </h3>
                  
                  {!plans || plans.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center">
                        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground mb-4">
                          Nenhum plano de marketing criado ainda
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Crie uma estratégia primeiro para gerar planos de marketing
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {plans.map((plan) => (
                        <Card 
                          key={plan.id}
                          className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                          onClick={() => navigate(`/plan?planId=${plan.id}`)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
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
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(plan.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Plano criado em {format(new Date(plan.created_at), "MMMM 'de' yyyy", { locale: ptBR })}
                            </p>
                            {plan.approved_at && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Aprovado em {format(new Date(plan.approved_at), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ClientStrategies;
