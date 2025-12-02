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

const DEFAULT_DEMANDAS_PROMPT = `Você é um estrategista de marketing digital premium. Sua tarefa é gerar DUAS linhas de demandas para um período de campanha.

CONTEXTO DISPONÍVEL:
- Dados cadastrais da empresa (razão social, nome fantasia, setor, tamanho, produtos/serviços)
- Estratégia global de marketing previamente definida
- Respostas das perguntas guias estratégicas
- Período selecionado (título, datas, orçamento, objetivo, canal prioritário, observações/restrições)

REGRAS OBRIGATÓRIAS:
1. Cada demanda DEVE ter: titulo (curto e objetivo), descricao (2-4 frases: O QUE CRIAR, COMO EXECUTAR, RESULTADO ESPERADO), tipo_conteudo, canal, data_sugerida
2. As datas DEVEM estar DENTRO do período especificado (entre data_inicio e data_fim)
3. Gere entre 8 a 15 demandas para cada linha
4. Considere o orçamento e restrições mencionadas nas observações
5. Respeite os formatos que o cliente NÃO deseja usar (se mencionados)
6. Distribua as demandas de forma equilibrada ao longo do período
7. Seja específico e contextualizado - use as informações do cliente para criar demandas personalizadas

LINHA NORMAL (default_plan):
- Demandas tradicionais, operacionais e seguras
- Conteúdos comprovados que funcionam no mercado
- Abordagem conservadora e consistente
- Foco em resultados previsíveis e mensuráveis

LINHA ULTRA (ultra_plan):
- Demandas ousadas, criativas e fora da caixa
- Ideias inovadoras com potencial viral
- Campanhas disruptivas e diferenciadas
- Abordagem de alto risco/alto impacto

FORMATO DE RESPOSTA (JSON válido):
{
  "default_plan": [
    {
      "titulo": "...",
      "descricao": "...",
      "tipo_conteudo": "...",
      "canal": "...",
      "data_sugerida": "YYYY-MM-DD"
    }
  ],
  "ultra_plan": [...],
  "normal_summary": "Descrição breve do tom e abordagem do plano normal",
  "ultra_summary": "Descrição breve do tom e abordagem do plano ultra"
}`;

const DevPrompts = () => {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [strategyPromptContent, setStrategyPromptContent] = useState("");
  const [demandasPromptContent, setDemandasPromptContent] = useState("");

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

  // Buscar o prompt de geração de demandas
  const { data: demandasPromptData, isLoading: isLoadingDemandas } = useQuery({
    queryKey: ["system-prompt", "generate_demandas_prompt", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_demandas_prompt")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (strategyPromptData) {
      setStrategyPromptContent(strategyPromptData.prompt_content);
    } else {
      setStrategyPromptContent(DEFAULT_STRATEGY_PROMPT);
    }
  }, [strategyPromptData]);

  useEffect(() => {
    if (demandasPromptData) {
      setDemandasPromptContent(demandasPromptData.prompt_content);
    } else {
      setDemandasPromptContent(DEFAULT_DEMANDAS_PROMPT);
    }
  }, [demandasPromptData]);

  // Mutation para salvar o prompt de estratégia
  const saveStrategyPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      const { data: existing } = await supabase
        .from("system_prompts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_strategy_prompt")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("system_prompts")
          .update({ prompt_content: content })
          .eq("tenant_id", tenantId)
          .eq("prompt_key", "generate_strategy_prompt");

        if (error) throw error;
      } else {
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

  // Mutation para salvar o prompt de demandas
  const saveDemandasPromptMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");

      const { data: existing } = await supabase
        .from("system_prompts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("prompt_key", "generate_demandas_prompt")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("system_prompts")
          .update({ prompt_content: content })
          .eq("tenant_id", tenantId)
          .eq("prompt_key", "generate_demandas_prompt");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_prompts")
          .insert({
            tenant_id: tenantId,
            prompt_key: "generate_demandas_prompt",
            prompt_title: "Prompt de Geração de Demandas",
            prompt_content: content,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success("Prompt de demandas salvo com sucesso!");
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

  const handleSaveDemandas = () => {
    saveDemandasPromptMutation.mutate(demandasPromptContent);
  };

  const handleRestoreDemandasDefault = () => {
    setDemandasPromptContent(DEFAULT_DEMANDAS_PROMPT);
    toast.success("Prompt de demandas restaurado para a versão padrão!");
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gerenciamento de Prompts</h1>
        <p className="text-muted-foreground">
          Configure os prompts utilizados pelo sistema para geração de estratégias e demandas.
        </p>
      </div>

      <div className="space-y-6">
        <Tabs defaultValue="strategy" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="strategy">Estratégia</TabsTrigger>
            <TabsTrigger value="demandas">Demandas</TabsTrigger>
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
                      Este prompt é usado para gerar a estratégia global de marketing a partir das respostas das perguntas guias. Utiliza GPT-5 Mini.
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
          
          <TabsContent value="demandas">
            <Card>
              <CardHeader>
                <CardTitle>
                  {demandasPromptData?.prompt_title || "Prompt de Geração de Demandas"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingDemandas ? (
                  <div className="text-muted-foreground">Carregando...</div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      Este prompt é usado para gerar as demandas do período, combinando estratégia geral, informações do período e dados cadastrais da empresa. Utiliza GPT-5 Mini.
                    </p>
                    <Textarea
                      value={demandasPromptContent}
                      onChange={(e) => setDemandasPromptContent(e.target.value)}
                      placeholder="Digite o prompt de geração de demandas aqui..."
                      className="min-h-[400px] font-mono text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={handleRestoreDemandasDefault}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restaurar Padrão
                      </Button>
                      <Button
                        onClick={handleSaveDemandas}
                        disabled={saveDemandasPromptMutation.isPending}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saveDemandasPromptMutation.isPending ? "Salvando..." : "Salvar"}
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