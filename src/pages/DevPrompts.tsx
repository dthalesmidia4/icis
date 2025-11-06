import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const DevPrompts = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [promptContent, setPromptContent] = useState("");

  // Buscar o prompt de geração de perguntas
  const { data: promptData, isLoading } = useQuery({
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

  // Atualizar o estado quando os dados forem carregados
  useEffect(() => {
    if (promptData) {
      setPromptContent(promptData.prompt_content);
    }
  }, [promptData]);

  // Mutation para salvar o prompt
  const savePromptMutation = useMutation({
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
      toast.success("Prompt salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar prompt:", error);
      toast.error("Erro ao salvar o prompt");
    },
  });

  const handleSave = () => {
    savePromptMutation.mutate(promptContent);
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
          {/* Card do Prompt */}
          <Card>
            <CardHeader>
              <CardTitle>
                {promptData?.prompt_title || "Prompt de geração de perguntas para o cronograma"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-muted-foreground">Carregando...</div>
              ) : (
                <>
                  <Textarea
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    placeholder="Digite o prompt aqui..."
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSave}
                      disabled={savePromptMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savePromptMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DevPrompts;
