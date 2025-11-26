import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const AdvancedPlans = () => {
  const navigate = useNavigate();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();
  const [isGenerating, setIsGenerating] = useState(false);
  const [advancedPlan, setAdvancedPlan] = useState<any>(null);

  // Buscar dados cadastrais do cliente
  const { data: clientData } = useQuery({
    queryKey: ["client-data", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return null;
      const { data, error } = await supabase
        .from("tenant_companies")
        .select("*")
        .eq("id", selectedClient.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient?.id,
  });

  // Buscar estratégia geral
  const { data: strategyData } = useQuery({
    queryKey: ["strategy", selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient?.id || !tenantId) return null;
      const { data, error } = await supabase
        .from("strategies")
        .select("*")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient?.id && !!tenantId,
  });

  // Buscar perguntas guias e respostas
  const { data: questionsData } = useQuery({
    queryKey: ["questions-session", selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient?.id || !tenantId) return null;
      const { data, error } = await supabase
        .from("question_sessions")
        .select("*")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient?.id && !!tenantId,
  });

  // Buscar prompt avançado
  const { data: advancedPromptData } = useQuery({
    queryKey: ["advanced-prompt", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "advanced_planning_prompt")
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const handleGenerateAdvancedPlan = async () => {
    if (!advancedPromptData?.prompt_content) {
      toast.error("Configure o Prompt de Planejamento Avançado em /dev-hub → /dev/prompts antes de gerar o planejamento.");
      return;
    }

    if (!clientData || !strategyData || !questionsData) {
      toast.error("Dados insuficientes para gerar o planejamento avançado.");
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-advanced-plan", {
        body: {
          clientData,
          strategy: strategyData.strategy_text,
          questions: questionsData.questions,
          answers: questionsData.answers,
          prompt: advancedPromptData.prompt_content,
        },
      });

      if (error) throw error;

      setAdvancedPlan(data.result);
      toast.success("Planejamento avançado gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar planejamento avançado:", error);
      toast.error("Erro ao gerar o planejamento avançado. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!selectedClient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Nenhum cliente selecionado</p>
      </div>
    );
  }

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container max-w-7xl mx-auto px-6 py-8">
        {/* Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/client-hub")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">
                Planejamento Avançado – {displayName}
              </h1>
              <p className="text-muted-foreground mt-1">
                Geração de ideias avançadas e estratégias fora da caixinha com base nos dados cadastrados do cliente.
              </p>
            </div>
            <Button
              onClick={handleGenerateAdvancedPlan}
              disabled={isGenerating || !advancedPromptData?.prompt_content}
              size="lg"
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Gerar Planejamento Avançado
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Layout em duas colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna esquerda: Contexto */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dados Cadastrais do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="font-semibold">Nome da Empresa:</p>
                  <p className="text-muted-foreground">{clientData?.name || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Nome Fantasia:</p>
                  <p className="text-muted-foreground">{clientData?.fantasy_name || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Segmento/Ramo:</p>
                  <p className="text-muted-foreground">{clientData?.sector || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Produtos/Serviços:</p>
                  <p className="text-muted-foreground">{clientData?.products_services || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Tamanho:</p>
                  <p className="text-muted-foreground">{clientData?.size || "—"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Estratégia Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {strategyData?.strategy_text || "Nenhuma estratégia cadastrada."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Perguntas Guias (Respostas)</CardTitle>
              </CardHeader>
              <CardContent>
                {questionsData?.questions && questionsData?.answers ? (
                  <Accordion type="single" collapsible className="w-full">
                    {(questionsData.questions as any[]).map((question: any, index: number) => (
                      <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger className="text-sm text-left">
                          {question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                          {(questionsData.answers as any)[index] || "Sem resposta"}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma pergunta respondida.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Coluna direita: Resultados */}
          <div className="lg:col-span-2">
            <Card className="min-h-[600px]">
              <CardHeader>
                <CardTitle className="text-xl">Resultados Avançados</CardTitle>
              </CardHeader>
              <CardContent>
                {!advancedPlan && !isGenerating && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-lg">
                      Clique em <strong>Gerar Planejamento Avançado</strong> para criar ideias com base nos dados do cliente.
                    </p>
                  </div>
                )}

                {isGenerating && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground text-lg">
                      Gerando planejamento avançado...
                    </p>
                  </div>
                )}

                {advancedPlan && !isGenerating && (
                  <div className="space-y-6">
                    {advancedPlan.campanhas_avancadas && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Campanhas Avançadas</h3>
                        <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {advancedPlan.campanhas_avancadas}
                        </div>
                      </div>
                    )}

                    {advancedPlan.ideias_conteudo && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Ideias de Conteúdo</h3>
                        <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {advancedPlan.ideias_conteudo}
                        </div>
                      </div>
                    )}

                    {advancedPlan.cronograma_sugerido && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Cronograma Sugerido</h3>
                        <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {advancedPlan.cronograma_sugerido}
                        </div>
                      </div>
                    )}

                    {advancedPlan.ganchos_criativos && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Ganchos Criativos</h3>
                        <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {advancedPlan.ganchos_criativos}
                        </div>
                      </div>
                    )}

                    {advancedPlan.oportunidades_segmento && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Oportunidades do Segmento</h3>
                        <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {advancedPlan.oportunidades_segmento}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedPlans;
