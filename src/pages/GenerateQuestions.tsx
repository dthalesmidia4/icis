import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Loader2, Save, Trash2, FileDown, Sparkles } from "lucide-react";
import jsPDF from "jspdf";
import { PeriodSelectionModal } from "@/components/PeriodSelectionModal";
import { useQuery } from "@tanstack/react-query";
import { useLocalPlanState } from "@/hooks/useLocalPlanState";
import { toast as sonnerToast } from "sonner";

interface StrategicAnswers {
  [key: string]: string;
}

const strategicQuestions = [
  {
    category: "1. Identidade e posicionamento",
    questions: [
      "Qual é o posicionamento atual da sua marca e como você quer que ela seja percebida pelos clientes?",
      "O que diferencia sua empresa da concorrência (3 vantagens reais)?",
      "Quais produtos/serviços são mais importantes para o seu faturamento hoje?"
    ]
  },
  {
    category: "2. Objetivos comerciais e de marketing",
    questions: [
      "Quais são os 3 principais objetivos para os próximos 30–90 dias? (ex.: gerar leads, aumentar vendas, atrair clientes presenciais, lançar produto, fortalecer presença digital)",
      "Existe alguma meta numérica ou expectativa clara? (ex.: +20% em vendas, +50 leads/mês, +10% em visitas, +X seguidores)"
    ]
  },
  {
    category: "3. Público-alvo e comportamento",
    questions: [
      "Quem são seus públicos prioritários? (idade, região, perfil de consumo, necessidades)",
      "Quais dores, desejos ou problemas esse público quer resolver?",
      "Como seus clientes normalmente descobrem sua empresa hoje?"
    ]
  },
  {
    category: "4. Produtos, serviços e prioridades",
    questions: [
      "Quais produtos/serviços devemos priorizar nas campanhas deste período?",
      "Existem ofertas fixas, combos, lançamentos ou sazonalidades que devemos comunicar?"
    ]
  },
  {
    category: "5. Canais e presença digital",
    questions: [
      "Em quais canais sua empresa já está ativa? (Instagram, TikTok, Facebook, WhatsApp, Site, TV Indoor, Google etc.)",
      "Quais canais você quer priorizar?",
      "Existe algum tipo de conteúdo que você NÃO quer usar? (ex.: humor, polêmica, voz, avatar etc.)"
    ]
  },
  {
    category: "6. Conteúdos e formatos",
    questions: [
      "Quais formatos você considera mais importantes? (Reels, carrosséis, posts estáticos, stories, vídeos comerciais, identidade visual, TV indoor)",
      "Existe algum estilo de comunicação que você prefere? (ex.: direto, premium, humanizado, técnico, divertido, minimalista)"
    ]
  },
  {
    category: "7. Campanhas, calendário e sazonalidades",
    questions: [
      "Há datas, eventos, ações internas ou sazonalidades que devemos incluir no planejamento?",
      "Você tem lançamentos previstos para os próximos meses?"
    ]
  },
  {
    category: "8. Estrutura interna, materiais e limitações",
    questions: [
      "Quais materiais você já possui? (fotos profissionais, vídeos, banco de imagens, logotipo, identidade visual, cardápio, catálogo, depoimentos)",
      "Sua empresa tem equipe disponível para gravações? Com que frequência?",
      "Quais limitações devemos saber? (tempo, orçamento, legislação, área de atuação, estoque, prazos)"
    ]
  },
  {
    category: "9. Aprovação e operação",
    questions: [
      "Quem aprova os conteúdos e com qual prazo médio?",
      "Pode descrever como funciona hoje seu fluxo de vendas (do primeiro contato ao fechamento)?",
      "Qual é a maior dificuldade atual na comunicação da empresa?"
    ]
  },
  {
    category: "10. Expectativas sobre a agência",
    questions: [
      "O que você espera que a agência resolva para você nos próximos meses?",
      "Se pudéssemos entregar apenas três resultados que realmente fariam diferença, quais seriam?"
    ]
  }
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
    if (savedState?.inProgress && selectedClient) {
      toast({
        title: "Geração em andamento",
        description: "Detectamos uma geração de plano interrompida. Os dados foram restaurados.",
      });
    }
  }, [savedState, selectedClient]);

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

    strategicQuestions.forEach((section) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.text(section.category, 20, yPosition);
      yPosition += 7;

      section.questions.forEach((question, qIdx) => {
        const key = `${section.category}_${qIdx}`;
        const answer = answers[key] || "Sem resposta";

        if (yPosition > 260) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFont("helvetica", "normal");
        const questionLines = doc.splitTextToSize(question, 170);
        questionLines.forEach((line: string) => {
          doc.text(line, 20, yPosition);
          yPosition += 5;
        });

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

        yPosition += 5;
      });

      yPosition += 5;
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
    const allAnswered = strategicQuestions.every((section) =>
      section.questions.every((_, qIdx) => {
        const key = `${section.category}_${qIdx}`;
        return answers[key] && answers[key].trim().length > 0;
      })
    );

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

      // Limpar estado salvo após sucesso
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            Isso pode levar alguns segundos. Estamos consolidando seus dados e criando um
            cronograma sob medida...
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
            <h1 className="text-3xl font-bold text-foreground">
              Perguntas Estratégicas da Empresa
            </h1>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={isSaving} variant="outline">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Respostas
              </Button>
              <Button onClick={handleClear} variant="outline">
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Tudo
              </Button>
              <Button onClick={handleExportPDF} variant="outline">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
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
        <div className="bg-card rounded-lg border shadow-sm p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {strategicQuestions.map((section) => (
              <div key={section.category} className="space-y-6">
                <h2 className="text-xl font-semibold text-foreground border-b pb-2">
                  {section.category}
                </h2>
                {section.questions.map((question, qIdx) => {
                  const key = `${section.category}_${qIdx}`;
                  return (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key} className="text-sm font-medium text-foreground">
                        {question}
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
                        className="min-h-[100px] resize-y"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
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
