import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Loader2, Save, Trash2, FileDown, Sparkles, ArrowLeft, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import { PeriodSelectionModal } from "@/components/PeriodSelectionModal";
import { useQuery } from "@tanstack/react-query";
import { useLocalPlanState } from "@/hooks/useLocalPlanState";
import { toast as sonnerToast } from "sonner";

interface StrategicAnswers {
  [key: string]: string;
}

const strategicQuestions = [
  "O que você deseja alcançar com a sua comunicação e marketing neste momento? (Ex.: aumentar vendas, gerar leads, divulgar um produto específico, fortalecer a marca.)",
  "Por qual motivo esse objetivo é tão importante para o seu negócio agora? (Desafios, oportunidades, concorrência, sazonalidade.)",
  "Quem é o público que você precisa impactar? (Perfil, comportamento, faixa etária, região, dores e desejos.)",
  "Em quais canais o seu público está mais presente e onde devemos concentrar esforços? (Instagram, TikTok, WhatsApp, YouTube, TV indoor, site, Google.)",
  "Em qual prazo você espera começar a ver resultados dessas ações? (Ex.: nas próximas semanas, no próximo mês, alinhado a metas internas, campanhas em andamento.)",
  "De que forma você prefere que a comunicação seja desenvolvida? (Tom direto, humanizado, premium, técnico; formatos como reels, carrosséis, vídeos comerciais.)",
  "Como sua empresa atrai clientes hoje? (Fontes atuais de tráfego: indicações, redes sociais, anúncios, parcerias, Google.)",
  "Quais diferenciais reais tornam sua empresa mais competitiva? (3 vantagens que devem orientar campanhas e criativos.)",
  "Qual é o orçamento disponível para ações, anúncios ou impulsionamentos? (Valor mensal, porcentagem ou limite aproximado.)",
  "Quais materiais você já possui que podem ajudar na produção dos conteúdos? (Fotos, vídeos, identidade visual, catálogo, cardápio, depoimentos, equipe para gravação.)",
  "Existem datas, eventos ou ocasiões especiais que precisamos incluir no planejamento? (Feriados, semanas temáticas, lançamentos, campanhas internas.)",
  "Quem será o responsável pela aprovação dos conteúdos e qual o tempo médio dessa aprovação?",
  "Há alguma limitação que devemos considerar? (Orçamento, tempo, legislação, estoque, equipe, restrições internas.)",
  "Qual é o maior desafio que impede sua marca de ter resultados melhores hoje? (Visibilidade, conversão, comunicação, público errado, falta de constância.)",
  "Quais tipos de conteúdo são essenciais para o seu negócio? (Reels, carrosséis, stories, vídeos comerciais, TV indoor, posts estáticos, campanhas pagas.)"
];

export default function GenerateQuestions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [answers, setAnswers] = useState<StrategicAnswers>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const { saveState, clearState, savedState } = useLocalPlanState();
  const hasShownRestoredToast = useRef(false);

  useEffect(() => {
    if (!selectedClient) {
      sonnerToast.error("Nenhum cliente selecionado");
      navigate("/home");
    }
  }, [selectedClient, navigate]);

  const { data: questionSession, isLoading: loadingSession } = useQuery({
    queryKey: ["question-session", selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return null;

      const { data, error } = await supabase
        .from("question_sessions")
        .select("*")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!selectedClient && !!tenantId,
  });

  useEffect(() => {
    if (questionSession?.answers) {
      setAnswers(questionSession.answers as StrategicAnswers);
    }
  }, [questionSession]);

  useEffect(() => {
    // Só mostrar toast se o estado pertencer ao cliente atual e não foi mostrado ainda
    if (savedState?.inProgress && 
        selectedClient && 
        savedState.companyId === selectedClient.id &&
        !hasShownRestoredToast.current) {
      hasShownRestoredToast.current = true;
      toast({
        title: "Geração em andamento",
        description: "Detectamos uma geração de plano interrompida. Os dados foram restaurados.",
      });
    } else if (savedState && selectedClient && savedState.companyId !== selectedClient.id) {
      // Limpar estado de outro cliente automaticamente
      clearState();
    }
  }, [savedState, selectedClient, clearState, toast]);

  const handleSave = async () => {
    if (!selectedClient || !tenantId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from("question_sessions").upsert({
        company_id: selectedClient.id,
        tenant_id: tenantId,
        answers,
        questions: strategicQuestions,
        status: "in_progress",
      });

      if (error) throw error;

      toast({
        title: "Respostas salvas",
        description: "Suas respostas foram salvas com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as respostas.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setAnswers({});
    toast({
      title: "Campos limpos",
      description: "Todos os campos foram limpos.",
    });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let yPosition = 20;

    doc.setFontSize(16);
    doc.text("Perguntas Estratégicas da Empresa", 20, yPosition);
    yPosition += 10;

    doc.setFontSize(12);
    doc.text(selectedClient?.fantasy_name || selectedClient?.name || "", 20, yPosition);
    yPosition += 15;

    doc.setFontSize(10);

    strategicQuestions.forEach((question, idx) => {
      const key = `question_${idx}`;
      const answer = answers[key] || "Sem resposta";

      if (yPosition > 260) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.text(`${idx + 1}. ${question}`, 20, yPosition);
      yPosition += 7;

      doc.setFont("helvetica", "italic");
      const answerLines = doc.splitTextToSize(answer, 170);
      answerLines.forEach((line: string) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        doc.text(line, 20, yPosition);
        yPosition += 5;
      });

      yPosition += 8;
    });

    doc.save(
      `Perguntas_Estrategicas_${selectedClient?.fantasy_name || selectedClient?.name}.pdf`
    );

    toast({
      title: "PDF exportado",
      description: "O arquivo foi baixado com sucesso.",
    });
  };

  const handleOpenPeriodModal = () => {
    if (!selectedClient || !tenantId) {
      toast({
        title: "Erro",
        description: "Dados insuficientes para gerar o plano",
        variant: "destructive",
      });
      return;
    }

    // Verificar se todas as perguntas foram respondidas
    const allAnswered = strategicQuestions.every((_, idx) => {
      const key = `question_${idx}`;
      return answers[key] && answers[key].trim().length > 0;
    });

    if (!allAnswered) {
      toast({
        title: "Atenção",
        description: "Por favor, responda todas as perguntas antes de gerar o plano",
        variant: "destructive",
      });
      return;
    }

    setShowPeriodModal(true);
  };

  const handleGeneratePlan = async (periodData: {
    titulo: string;
    dataInicio: Date;
    dataFim: Date;
  }) => {
    setShowPeriodModal(false);
    setIsGeneratingPlan(true);

    // Salvar respostas primeiro
    await handleSave();

    // Salvar estado localmente
    saveState(selectedClient!.id, null, tenantId!);

    try {
      // Chamar edge function para gerar plano
      const { data, error } = await supabase.functions.invoke("generate-plan", {
        body: {
          companyId: selectedClient!.id,
          tenantId: tenantId!,
          periodData: {
            titulo: periodData.titulo,
            dataInicio: periodData.dataInicio.toISOString().split("T")[0],
            dataFim: periodData.dataFim.toISOString().split("T")[0],
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Erro ao gerar plano");
      }

      // Limpar estado salvo ANTES da navegação
      clearState();
      
      toast({
        title: "Sucesso!",
        description: "Plano gerado com sucesso",
      });

      // Redirecionar para a página de planos
      navigate(`/plans?planId=${data.planId}`);
    } catch (error: any) {
      console.error("Erro ao gerar plano:", error);
      let errorMessage = "Não foi possível gerar o plano. ";
      if (error.message?.includes("Limite de requisições")) {
        errorMessage += "Limite de requisições excedido. Aguarde alguns instantes.";
      } else if (error.message?.includes("Créditos insuficientes")) {
        errorMessage +=
          "Créditos insuficientes. Adicione créditos em Settings → Workspace → Usage.";
      } else if (error.message?.includes("prompt do sistema")) {
        errorMessage +=
          "Configure o prompt de geração de plano em Dev → Prompts do Sistema.";
      } else {
        errorMessage += "Verifique sua conexão e tente novamente.";
      }
      toast({
        title: "Erro ao gerar plano",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  if (!selectedClient) return null;

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-muted rounded-md animate-pulse" />
                <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
                <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
                <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
                <div className="h-10 w-40 bg-muted rounded-md animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-6 py-8">
          <div className="bg-card rounded-lg border shadow-sm p-8">
            <div className="max-w-[900px] mx-auto space-y-6">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-32 w-full bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isGeneratingPlan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
          <Sparkles className="h-6 w-6 text-primary absolute -top-2 -right-2 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold">Gerando plano estratégico personalizado</h3>
          <p className="text-muted-foreground max-w-md">
            Isso pode levar alguns segundos. Estamos consolidando seus dados e criando as
            demandas sob medida...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Fixo */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/client-hub")}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-3xl font-bold text-foreground">
                Perguntas Guias
              </h1>
            </div>
            <div className="flex gap-3">
              {/* Dropdown para Mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="md:hidden">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background z-50">
                  <DropdownMenuItem onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar Respostas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleClear}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Tudo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <FileDown className="w-4 h-4 mr-2" />
                    Exportar PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Botões individuais para Desktop */}
              <Button onClick={handleSave} disabled={isSaving} variant="outline" className="hidden md:flex">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Respostas
              </Button>
              <Button onClick={handleClear} variant="outline" className="hidden md:flex">
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Tudo
              </Button>
              <Button onClick={handleExportPDF} variant="outline" className="hidden md:flex">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              
              {/* Botão principal sempre visível */}
              <Button onClick={handleOpenPeriodModal} disabled={isGeneratingPlan}>
                {isGeneratingPlan && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Sparkles className="w-4 h-4 mr-2" />
                Gerar Planejamento
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Container Principal */}
      <div className="container mx-auto px-6 py-8">
        <div className="bg-card rounded-lg border shadow-sm p-8 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="max-w-[900px] mx-auto space-y-6">
            {strategicQuestions.map((question, idx) => {
              const key = `question_${idx}`;
              return (
                <div key={key} className="space-y-3">
                  <Label 
                    htmlFor={key} 
                    className="text-base font-semibold text-foreground leading-relaxed block"
                  >
                    {idx + 1}. {question}
                  </Label>
                  <Textarea
                    id={key}
                    value={answers[key] || ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder="Digite sua resposta aqui..."
                    className="min-h-[120px] resize-y focus:ring-2 focus:ring-primary/20 transition-all"
                    rows={4}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Period Selection Modal */}
      <PeriodSelectionModal
        open={showPeriodModal}
        onClose={() => setShowPeriodModal(false)}
        onConfirm={handleGeneratePlan}
        isGenerating={isGeneratingPlan}
      />
    </div>
  );
}
