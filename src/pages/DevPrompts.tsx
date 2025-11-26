import { Button } from "@/components/ui/button";
import { Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const DEFAULT_PLAN_PROMPT = `ATENÇÃO - DATA E MÊS DE REFERÊNCIA:

O contexto acima contém:
- DATA ATUAL (ex: 17 de novembro de 2025)
- ANO ATUAL (ex: 2025)
- MÊS ATUAL (ex: novembro de 2025)
- MÊS DE REFERÊNCIA PARA O CRONOGRAMA (pode ser o mês atual ou um mês específico escolhido pelo cliente)

REGRA FUNDAMENTAL:
- Você DEVE usar o "MÊS DE REFERÊNCIA PARA O CRONOGRAMA" informado acima como base para todo o planejamento.
- Sempre inicie a seção de cronograma com: "Mês de Referência: [MÊS DE REFERÊNCIA exato do contexto]"
- Todas as datas e semanas devem ser deste mês/ano especificado
- NUNCA use datas antigas ou de anos passados
- Se o ano atual é 2025, TODAS as datas devem ser de 2025

---

Com base nos dados fornecidos acima, crie um plano de marketing detalhado e estruturado. O plano deve incluir:

1. RESUMO EXECUTIVO
   - Visão geral do negócio
   - Principais objetivos de marketing
   - Público-alvo identificado
   - Proposta de valor

2. ANÁLISE DE MERCADO
   - Contexto do setor
   - Perfil do cliente ideal
   - Canais prioritários

3. ESTRATÉGIA DE CONTEÚDO
   - Pilares estratégicos baseados nas informações fornecidas
   - Posicionamento de marca
   - Mensagens-chave

4. CRONOGRAMA DE AÇÕES (DETALHADO POR SEMANA)

OBRIGATÓRIO: Sempre inicie esta seção com:
"Mês de Referência: [MÊS E ANO DO CONTEXTO ACIMA]"

Para cada semana do mês, especifique:
- Semana 1 (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

- Semana 2 (DD/MM - DD/MM)
  * Segunda-feira: [...]
  * Quarta-feira: [...]
  * Sexta-feira: [...]

(Continue para todas as 4 semanas do mês)

5. MÉTRICAS E KPIs
   - Indicadores de sucesso
   - Ferramentas de monitoramento sugeridas
   - Frequência de análise

6. RECURSOS NECESSÁRIOS
   - Ferramentas recomendadas
   - Orçamento sugerido (se aplicável)
   - Equipe necessária

INSTRUÇÕES IMPORTANTES:
- Seja específico e prático nas recomendações
- Considere o tamanho e setor da empresa ao sugerir ações
- Priorize qualidade sobre quantidade
- Adapte a linguagem ao público-alvo identificado
- Seja realista quanto aos recursos necessários
- Use SEMPRE o mês e ano de referência informados no contexto
- NUNCA use datas do passado - todas as datas devem ser do ano atual informado

Formate o plano de forma clara e organizada, usando títulos, subtítulos e bullets para facilitar a leitura.`;

const DevPrompts = () => {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [questionsPromptContent, setQuestionsPromptContent] = useState("");
  const [planPromptContent, setPlanPromptContent] = useState("");
  const [advancedPlanPromptContent, setAdvancedPlanPromptContent] = useState("");

  // Buscar o prompt de geração de perguntas
  const { data: questionsPromptData, isLoading: isLoadingQuestions } = useQuery({
    queryKey: ["system-prompt", "generate_questions_prompt", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_questions_prompt")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Buscar o prompt de geração de plano
  const { data: planPromptData, isLoading: isLoadingPlan } = useQuery({
    queryKey: ["system-prompt", "generate_plan_prompt", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_plan_prompt")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Buscar o prompt de planejamento avançado
  const { data: advancedPlanPromptData, isLoading: isLoadingAdvanced } = useQuery({
    queryKey: ["system-prompt", "advanced_planning_prompt", tenantId],
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

  // Atualizar o estado quando os dados forem carregados
  useEffect(() => {
    if (questionsPromptData) {
      setQuestionsPromptContent(questionsPromptData.prompt_content);
    }
  }, [questionsPromptData]);

  useEffect(() => {
    if (planPromptData) {
      setPlanPromptContent(planPromptData.prompt_content);
    }
  }, [planPromptData]);

  useEffect(() => {
    if (advancedPlanPromptData) {
      setAdvancedPlanPromptContent(advancedPlanPromptData.prompt_content);
    }
  }, [advancedPlanPromptData]);

  // Mutation para salvar o prompt de perguntas
  const saveQuestionsPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      const { error } = await supabase
        .from("system_prompts")
        .update({ prompt_content: content })
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_questions_prompt");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success("Prompt de perguntas salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    },
  });

  // Mutation para salvar o prompt de plano
  const savePlanPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      const { error } = await supabase
        .from("system_prompts")
        .update({ prompt_content: content })
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_plan_prompt");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success("Prompt de plano salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    },
  });

  const handleSaveQuestions = () => {
    saveQuestionsPromptMutation.mutate(questionsPromptContent);
  };

  const handleSavePlan = () => {
    savePlanPromptMutation.mutate(planPromptContent);
  };

  const handleRestorePlanDefault = () => {
    setPlanPromptContent(DEFAULT_PLAN_PROMPT);
    toast.success("Prompt restaurado para a versão padrão com regras atualizadas!");
  };

  // Mutation para salvar o prompt de planejamento avançado
  const saveAdvancedPlanPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      // Verifica se já existe
      const { data: existing } = await supabase
        .from("system_prompts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "advanced_planning_prompt")
        .maybeSingle();

      if (existing) {
        // Update
        const { error } = await supabase
          .from("system_prompts")
          .update({ prompt_content: content })
          .eq("tenant_id", tenantId)
          .eq("prompt_key", "advanced_planning_prompt");

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from("system_prompts")
          .insert({
            tenant_id: tenantId,
            prompt_key: "advanced_planning_prompt",
            prompt_title: "Prompt de Planejamento Avançado",
            prompt_content: content,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success("Prompt de planejamento avançado salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    },
  });

  const handleSaveAdvancedPlan = () => {
    saveAdvancedPlanPromptMutation.mutate(advancedPlanPromptContent);
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gerenciamento de Prompts</h1>
        <p className="text-muted-foreground">
          Configure os prompts utilizados pelo sistema para geração de perguntas e planos estratégicos.
        </p>
      </div>

      <div className="space-y-6">
          <Tabs defaultValue="questions" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="questions">Prompt de Perguntas</TabsTrigger>
              <TabsTrigger value="plan">Prompt de Plano</TabsTrigger>
              <TabsTrigger value="advanced">Planejamento Avançado</TabsTrigger>
            </TabsList>
            
            <TabsContent value="questions">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {questionsPromptData?.prompt_title || "Prompt de geração de perguntas"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingQuestions ? (
                    <div className="text-muted-foreground">Carregando...</div>
                  ) : (
                    <>
                      <Textarea
                        value={questionsPromptContent}
                        onChange={(e) => setQuestionsPromptContent(e.target.value)}
                        placeholder="Digite o prompt aqui..."
                        className="min-h-[300px] font-mono text-sm"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveQuestions}
                          disabled={saveQuestionsPromptMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {saveQuestionsPromptMutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="plan">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {planPromptData?.prompt_title || "Prompt de geração de plano"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingPlan ? (
                    <div className="text-muted-foreground">Carregando...</div>
                  ) : (
                    <>
                      <Textarea
                        value={planPromptContent}
                        onChange={(e) => setPlanPromptContent(e.target.value)}
                        placeholder="Digite o prompt aqui..."
                        className="min-h-[300px] font-mono text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={handleRestorePlanDefault}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restaurar Padrão
                        </Button>
                        <Button
                          onClick={handleSavePlan}
                          disabled={savePlanPromptMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {savePlanPromptMutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {advancedPlanPromptData?.prompt_title || "Prompt de Planejamento Avançado"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingAdvanced ? (
                    <div className="text-muted-foreground">Carregando...</div>
                  ) : (
                    <>
                      <Textarea
                        value={advancedPlanPromptContent}
                        onChange={(e) => setAdvancedPlanPromptContent(e.target.value)}
                        placeholder="Digite o prompt de planejamento avançado aqui..."
                        className="min-h-[300px] font-mono text-sm"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveAdvancedPlan}
                          disabled={saveAdvancedPlanPromptMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {saveAdvancedPlanPromptMutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </div>
  );
};

export default DevPrompts;
