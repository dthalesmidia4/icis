import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Loader2, Save, Trash2, FileDown } from "lucide-react";
import jsPDF from "jspdf";

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

export default function StrategicQuestions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [answers, setAnswers] = useState<StrategicAnswers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!selectedClient) {
      navigate("/clientes");
      return;
    }
    loadAnswers();
  }, [selectedClient]);

  const loadAnswers = async () => {
    if (!selectedClient || !tenantId) return;

    try {
      const { data, error } = await supabase
        .from("question_sessions")
        .select("answers")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.answers) {
        setAnswers(data.answers as StrategicAnswers);
      }
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedClient || !tenantId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("question_sessions")
        .upsert({
          company_id: selectedClient.id,
          tenant_id: tenantId,
          answers,
          questions: strategicQuestions,
          status: "in_progress"
        });

      if (error) throw error;

      toast({
        title: "Respostas salvas",
        description: "Suas respostas foram salvas com sucesso."
      });
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as respostas.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setAnswers({});
    toast({
      title: "Campos limpos",
      description: "Todos os campos foram limpos."
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

    doc.save(`Perguntas_Estrategicas_${selectedClient?.fantasy_name || selectedClient?.name}.pdf`);
    
    toast({
      title: "PDF exportado",
      description: "O arquivo foi baixado com sucesso."
    });
  };

  const handleGeneratePlanning = async () => {
    // TODO: Implementar geração de planejamento
    setIsGenerating(true);
    try {
      await handleSave();
      toast({
        title: "Gerando planejamento",
        description: "O planejamento está sendo gerado..."
      });
      // Navegar para página de planejamento após implementar
      setTimeout(() => {
        navigate("/plans");
      }, 1500);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
              <Button
                onClick={handleSave}
                disabled={isSaving}
                variant="outline"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Respostas
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Tudo
              </Button>
              <Button
                onClick={handleExportPDF}
                variant="outline"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              <Button
                onClick={handleGeneratePlanning}
                disabled={isGenerating}
              >
                {isGenerating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
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
                            [key]: e.target.value
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
    </div>
  );
}
