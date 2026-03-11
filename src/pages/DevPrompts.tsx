import { Button } from "@/components/ui/button";
import { Save, RotateCcw, Plus, ChevronDown, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DEFAULT_PROMPTS: Record<string, { title: string; content: string }> = {
  generate_strategy_prompt: {
    title: "Prompt de Geração de Estratégia",
    content: `Você é um estrategista de marketing sênior com mais de 15 anos de experiência em criar estratégias globais e atemporais para negócios de diversos setores.

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
Baseie todas as recomendações nas informações fornecidas pelo cliente.`,
  },
  generate_demandas_prompt: {
    title: "Prompt de Geração de Demandas",
    content: `Você é um estrategista de marketing digital premium. Sua tarefa é gerar DUAS linhas de demandas para um período de campanha.

FORMATO DE RESPOSTA (JSON válido):
{
  "default_plan": [{ "titulo": "...", "descricao": "...", "tipo_conteudo": "...", "canal": "...", "data_sugerida": "YYYY-MM-DD" }],
  "ultra_plan": [...],
  "normal_summary": "...",
  "ultra_summary": "..."
}`,
  },
  generate_posts_prompt: {
    title: "Prompt de Geração de Posts",
    content: `Você é um redator e criador de conteúdo especializado em marketing digital com foco em redes sociais.

Sua tarefa é gerar o CONTEÚDO COMPLETO de um post para publicação, com base nas informações da demanda, estratégia do cliente e dados cadastrais da empresa.

FORMATO DE RESPOSTA:
Retorne o texto do post pronto para publicação, sem formatação JSON.`,
  },
  reavaliacao_prompt: {
    title: "Prompt de Reavaliação",
    content: "",
  },
  generate_video_prompt: {
    title: "Prompt de Geração de Vídeo",
    content: "",
  },
};

interface PromptItem {
  id?: string;
  prompt_key: string;
  prompt_title: string;
  prompt_content: string;
  isNew?: boolean;
}

const DevPrompts = () => {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [newPrompts, setNewPrompts] = useState<PromptItem[]>([]);

  // Fetch ALL prompts for this tenant
  const { data: allPrompts, isLoading } = useQuery({
    queryKey: ["system-prompts-all", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("system_prompts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Build the combined list: DB prompts + known defaults not yet in DB
  const getPromptsList = (): PromptItem[] => {
    const dbPrompts = (allPrompts || []).map((p) => ({
      id: p.id,
      prompt_key: p.prompt_key,
      prompt_title: p.prompt_title,
      prompt_content: p.prompt_content,
    }));

    const dbKeys = new Set(dbPrompts.map((p) => p.prompt_key));

    // Add default prompts that aren't in DB yet (as virtual items)
    const defaultItems: PromptItem[] = Object.entries(DEFAULT_PROMPTS)
      .filter(([key]) => !dbKeys.has(key))
      .map(([key, val]) => ({
        prompt_key: key,
        prompt_title: val.title,
        prompt_content: val.content,
      }));

    return [...dbPrompts, ...defaultItems, ...newPrompts];
  };

  const getContent = (prompt: PromptItem) => {
    if (editedContents[prompt.prompt_key] !== undefined) {
      return editedContents[prompt.prompt_key];
    }
    return prompt.prompt_content;
  };

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (prompt: PromptItem) => {
    if (!tenantId) return;
    const content = getContent(prompt);
    setSavingKeys((prev) => ({ ...prev, [prompt.prompt_key]: true }));

    try {
      if (prompt.id) {
        // Update existing
        const { error } = await supabase
          .from("system_prompts")
          .update({ prompt_content: content })
          .eq("id", prompt.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from("system_prompts").insert({
          tenant_id: tenantId,
          prompt_key: prompt.prompt_key,
          prompt_title: prompt.prompt_title,
          prompt_content: content,
        });
        if (error) throw error;
      }

      // Remove from newPrompts if it was there
      setNewPrompts((prev) => prev.filter((p) => p.prompt_key !== prompt.prompt_key));
      setEditedContents((prev) => {
        const next = { ...prev };
        delete next[prompt.prompt_key];
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["system-prompts-all"] });
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success(`"${prompt.prompt_title}" salvo com sucesso!`);
    } catch (error) {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    } finally {
      setSavingKeys((prev) => ({ ...prev, [prompt.prompt_key]: false }));
    }
  };

  const handleDelete = async (prompt: PromptItem) => {
    if (prompt.isNew) {
      setNewPrompts((prev) => prev.filter((p) => p.prompt_key !== prompt.prompt_key));
      return;
    }
    if (!prompt.id) {
      toast.info("Este prompt ainda não foi salvo no banco.");
      return;
    }

    try {
      const { error } = await supabase.from("system_prompts").delete().eq("id", prompt.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["system-prompts-all"] });
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      toast.success(`"${prompt.prompt_title}" excluído!`);
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir o prompt");
    }
  };

  const handleRestoreDefault = (prompt: PromptItem) => {
    const def = DEFAULT_PROMPTS[prompt.prompt_key];
    if (def) {
      setEditedContents((prev) => ({ ...prev, [prompt.prompt_key]: def.content }));
      toast.success("Restaurado para o padrão!");
    }
  };

  const handleAddNew = async () => {
    if (!tenantId) return;

    const newKey = `custom_prompt_${Date.now()}`;
    const newTitle = "Novo Prompt";

    // Insert into DB immediately
    try {
      const { data, error } = await supabase
        .from("system_prompts")
        .insert({
          tenant_id: tenantId,
          prompt_key: newKey,
          prompt_title: newTitle,
          prompt_content: "",
        })
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["system-prompts-all"] });
      setOpenItems((prev) => ({ ...prev, [newKey]: true }));
      toast.success("Novo prompt criado!");
    } catch (error) {
      console.error("Erro ao criar prompt:", error);
      toast.error("Erro ao criar novo prompt");
    }
  };

  const handleTitleChange = async (prompt: PromptItem, newTitle: string) => {
    if (!prompt.id) return;
    try {
      const { error } = await supabase
        .from("system_prompts")
        .update({ prompt_title: newTitle })
        .eq("id", prompt.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["system-prompts-all"] });
    } catch {
      // silent - will save on blur
    }
  };

  const prompts = getPromptsList();

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BackButton to="/dev-hub" />
          <h1 className="text-3xl font-bold">Gerenciamento de Prompts</h1>
        </div>
        <p className="text-muted-foreground">
          Configure os prompts utilizados pelo sistema para geração de estratégias e demandas.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Carregando prompts...</div>
      ) : (
        <div className="space-y-3">
          {prompts.map((prompt) => {
            const isOpen = openItems[prompt.prompt_key] || false;
            const hasDefault = !!DEFAULT_PROMPTS[prompt.prompt_key];
            const isSaving = savingKeys[prompt.prompt_key] || false;
            const isCustom = !hasDefault;

            return (
              <Collapsible
                key={prompt.prompt_key}
                open={isOpen}
                onOpenChange={() => toggleItem(prompt.prompt_key)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isOpen ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                        <div>
                          <p className="font-semibold text-sm">{prompt.prompt_title}</p>
                          <p className="text-xs text-muted-foreground">{prompt.prompt_key}</p>
                        </div>
                      </div>
                      {prompt.id && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Salvo
                        </span>
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 space-y-4">
                      {/* Editable title for custom prompts */}
                      {isCustom && prompt.id && (
                        <Input
                          value={prompt.prompt_title}
                          onChange={(e) => handleTitleChange(prompt, e.target.value)}
                          placeholder="Nome do prompt"
                          className="font-semibold"
                        />
                      )}

                      <Textarea
                        value={getContent(prompt)}
                        onChange={(e) =>
                          setEditedContents((prev) => ({
                            ...prev,
                            [prompt.prompt_key]: e.target.value,
                          }))
                        }
                        placeholder="Digite o conteúdo do prompt aqui..."
                        className="min-h-[300px] font-mono text-sm"
                      />

                      <div className="flex justify-between">
                        <div>
                          {(isCustom || prompt.id) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Excluir
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir prompt?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir "{prompt.prompt_title}"? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(prompt)}>
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {hasDefault && (
                            <Button variant="outline" size="sm" onClick={() => handleRestoreDefault(prompt)}>
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restaurar Padrão
                            </Button>
                          )}
                          <Button size="sm" onClick={() => handleSave(prompt)} disabled={isSaving}>
                            <Save className="h-4 w-4 mr-1" />
                            {isSaving ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}

          {/* Add new prompt button */}
          <Button variant="outline" className="w-full border-dashed" onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Novo Prompt
          </Button>
        </div>
      )}
    </div>
  );
};

export default DevPrompts;
