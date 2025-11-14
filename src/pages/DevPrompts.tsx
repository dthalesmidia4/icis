import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const DEFAULT_PLAN_PROMPT = `REGRA FUNDAMENTAL - MÊS DE REFERÊNCIA:

Existe uma variável chamada "MÊS SELECIONADO PARA O CRONOGRAMA" no contexto.
- Se essa variável estiver preenchida: use EXATAMENTE esse valor como mês de referência do cronograma.
- Se estiver vazia, "Não especificado" ou "Não informado": use o MÊS ATUAL (baseado na data de hoje) como mês de referência.

IMPORTANTE: 
- NUNCA escreva frases como "mês não foi especificado", "mês genérico", "sugere-se definir o mês" ou qualquer justificativa sobre ausência de mês.
- Sempre informe diretamente no formato: "Mês de Referência: [Nome do Mês] de [Ano]"
- Use o mês definido para estruturar o cronograma em 4 semanas.

---

Com base nos dados fornecidos acima, crie um plano de marketing detalhado e estruturado. O plano deve incluir:

1. RESUMO EXECUTIVO
- Visão geral do plano de marketing
- Principais objetivos e metas

2. ANÁLISE DE SITUAÇÃO
- Contexto do negócio
- Público-alvo principal
- Oportunidades identificadas

3. ESTRATÉGIA DE MARKETING
- Pilares estratégicos baseados nas informações fornecidas
- Posicionamento de marca
- Mensagens-chave

4. CRONOGRAMA DE AÇÕES (DETALHADO POR SEMANA)

IMPORTANTE: Sempre inicie esta seção com:
"Mês de Referência: [Nome do Mês] de [Ano]"

Para cada semana do mês, especifique:
- Semana 1 (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

- Semana 2 (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

- Semana 3 (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

- Semana 4 (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

Tipos de conteúdo sugeridos: Post, Vídeo, Story, Reels, E-mail, Blog, Anúncio
Canais sugeridos: Instagram, Facebook, LinkedIn, YouTube, E-mail, WhatsApp, Site

5. MÉTRICAS E KPIs
- Principais indicadores de desempenho a serem acompanhados
- Metas quantitativas quando aplicável

6. RECOMENDAÇÕES FINAIS
- Dicas práticas de implementação
- Pontos de atenção

INSTRUÇÕES IMPORTANTES:
- Seja específico e prático nas recomendações
- Considere o tamanho e setor da empresa ao sugerir ações
- Priorize qualidade sobre quantidade
- Adapte a linguagem ao público-alvo identificado
- Seja realista quanto aos recursos necessários
- SEMPRE defina e informe o mês de referência conforme a regra fundamental no início deste prompt

Formate o plano de forma clara e organizada, usando títulos, subtítulos e bullets para facilitar a leitura.`;

const DevPrompts = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [questionsPromptContent, setQuestionsPromptContent] = useState("");
  const [planPromptContent, setPlanPromptContent] = useState("");

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Navbar */}
      <nav className="w-full bg-card border-b border-border sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dev-hub")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h2 className="text-lg font-semibold">Prompts do Sistema</h2>
            <div className="w-20"></div>
          </div>
        </div>
      </nav>

      {/* Área Principal */}
      <main className="p-6 lg:p-12">
        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="questions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="questions">Prompt de Perguntas</TabsTrigger>
              <TabsTrigger value="plan">Prompt de Plano</TabsTrigger>
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
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default DevPrompts;
