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

const DEFAULT_STRATEGY_PROMPT = `Você é um estrategista de marketing sênior com mais de 15 anos de experiência em criar estratégias globais e atemporais para negócios de diversos setores.

Sua tarefa é criar uma ESTRATÉGIA GLOBAL DE MARKETING baseada nas informações do cliente e nas respostas do questionário estratégico.

A estratégia deve ser:
- Clara, objetiva e direta
- Acionável e prática
- Alinhada aos objetivos declarados pelo cliente
- Atemporal (não vinculada a um período específico)
- Adaptável a diferentes momentos e campanhas

Estruture a estratégia nos seguintes tópicos:

## POSICIONAMENTO DE MARCA
Defina como a marca deve se posicionar no mercado com base nos diferenciais e objetivos.

## PÚBLICO-ALVO
Detalhe o perfil do público a ser impactado, suas características e comportamentos.

## CANAIS PRIORITÁRIOS
Liste e justifique os canais de comunicação mais adequados para alcançar os objetivos.

## PILARES DE COMUNICAÇÃO
Defina os principais temas e mensagens-chave que devem guiar toda a comunicação.

## TOM DE VOZ
Especifique como a marca deve se comunicar (formal, descontraído, técnico, etc.).

## TIPOS DE CONTEÚDO
Recomende os formatos de conteúdo mais adequados para o negócio e público.

## FREQUÊNCIA E CADÊNCIA
Sugira uma frequência de publicações e ações considerando os recursos disponíveis.

## MÉTRICAS DE SUCESSO
Indique como medir o sucesso das ações de marketing.

Escreva em português brasileiro, de forma profissional mas acessível.
Seja específico e evite generalizações vazias.
Baseie todas as recomendações nas informações fornecidas pelo cliente.`;

const DEFAULT_PLAN_PROMPT = `ATENÇÃO - DATA E MÊS DE REFERÊNCIA:

O contexto acima contém:
- DATA ATUAL (ex: 17 de novembro de 2025)
- ANO ATUAL (ex: 2025)
- MÊS ATUAL (ex: novembro de 2025)
- MÊS DE REFERÊNCIA PARA AS DEMANDAS (pode ser o mês atual ou um mês específico escolhido pelo cliente)

REGRA FUNDAMENTAL:
- Você DEVE usar o "MÊS DE REFERÊNCIA PARA AS DEMANDAS" informado acima como base para todo o planejamento.
- Sempre inicie a seção de demandas com: "Mês de Referência: [MÊS DE REFERÊNCIA exato do contexto]"
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

4. PLANEJAMENTO DE AÇÕES (DETALHADO POR SEMANA)

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
  const [planPromptContent, setPlanPromptContent] = useState("");
  const [strategyPromptContent, setStrategyPromptContent] = useState("");

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

  // Buscar o prompt de geração de estratégia
  const { data: strategyPromptData, isLoading: isLoadingStrategy } = useQuery({
    queryKey: ["system-prompt", "generate_strategy_prompt", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_strategy_prompt")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (planPromptData) {
      setPlanPromptContent(planPromptData.prompt_content);
    }
  }, [planPromptData]);

  useEffect(() => {
    if (strategyPromptData) {
      setStrategyPromptContent(strategyPromptData.prompt_content);
    } else {
      setStrategyPromptContent(DEFAULT_STRATEGY_PROMPT);
    }
  }, [strategyPromptData]);

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

  const handleSavePlan = () => {
    savePlanPromptMutation.mutate(planPromptContent);
  };

  const handleRestorePlanDefault = () => {
    setPlanPromptContent(DEFAULT_PLAN_PROMPT);
    toast.success("Prompt restaurado para a versão padrão com regras atualizadas!");
  };

  // Mutation para salvar o prompt de estratégia
  const saveStrategyPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      // Verifica se já existe
      const { data: existing } = await supabase
        .from("system_prompts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_strategy_prompt")
        .maybeSingle();

      if (existing) {
        // Update
        const { error } = await supabase
          .from("system_prompts")
          .update({ prompt_content: content })
          .eq("tenant_id", tenantId)
          .eq("prompt_key", "generate_strategy_prompt");

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from("system_prompts")
          .insert({
            tenant_id: tenantId,
            prompt_key: "generate_strategy_prompt",
            prompt_title: "Prompt de Geração de Estratégia",
            prompt_content: content,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success("Prompt de estratégia salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    },
  });

  const handleSaveStrategy = () => {
    saveStrategyPromptMutation.mutate(strategyPromptContent);
  };

  const handleRestoreStrategyDefault = () => {
    setStrategyPromptContent(DEFAULT_STRATEGY_PROMPT);
    toast.success("Prompt de estratégia restaurado para a versão padrão!");
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gerenciamento de Prompts</h1>
        <p className="text-muted-foreground">
          Configure os prompts utilizados pelo sistema para geração de estratégias e planos.
        </p>
      </div>

      <div className="space-y-6">
          <Tabs defaultValue="strategy" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="strategy">Estratégia</TabsTrigger>
              <TabsTrigger value="plan">Plano</TabsTrigger>
            </TabsList>
            
            <TabsContent value="strategy">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {strategyPromptData?.prompt_title || "Prompt de Geração de Estratégia"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingStrategy ? (
                    <div className="text-muted-foreground">Carregando...</div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Este prompt é usado para gerar a estratégia global de marketing a partir das respostas das perguntas guias.
                      </p>
                      <Textarea
                        value={strategyPromptContent}
                        onChange={(e) => setStrategyPromptContent(e.target.value)}
                        placeholder="Digite o prompt de geração de estratégia aqui..."
                        className="min-h-[400px] font-mono text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={handleRestoreStrategyDefault}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restaurar Padrão
                        </Button>
                        <Button
                          onClick={handleSaveStrategy}
                          disabled={saveStrategyPromptMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {saveStrategyPromptMutation.isPending ? "Salvando..." : "Salvar"}
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
                    {planPromptData?.prompt_title || "Prompt de Geração de Plano"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingPlan ? (
                    <div className="text-muted-foreground">Carregando...</div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Este prompt é usado para gerar o plano de marketing detalhado.
                      </p>
                      <Textarea
                        value={planPromptContent}
                        onChange={(e) => setPlanPromptContent(e.target.value)}
                        placeholder="Digite o prompt de geração de plano aqui..."
                        className="min-h-[400px] font-mono text-sm"
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
    </div>
  );
};

export default DevPrompts;
