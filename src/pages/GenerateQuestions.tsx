import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Loader2, Trash2, FileDown, ArrowLeft, MoreVertical, Sparkles, Check, Cloud, Lightbulb } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import { useQuery } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

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
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  
  // Auto-save states
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedInitialData = useRef(false);

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

  // Auto-save silencioso
  const handleAutoSave = useCallback(async () => {
    if (!selectedClient || !tenantId) return;
    if (Object.keys(answers).length === 0) return;

    setIsAutoSaving(true);
    try {
      const { error } = await supabase.from("question_sessions").upsert({
        company_id: selectedClient.id,
        tenant_id: tenantId,
        answers,
        questions: strategicQuestions,
        status: "in_progress",
      });

      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error("Erro no auto-save:", error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [selectedClient, tenantId, answers]);

  // Debounce auto-save: salvar 1.5s após parar de digitar
  useEffect(() => {
    // Não ativar auto-save no carregamento inicial
    if (!hasLoadedInitialData.current) return;
    if (!selectedClient || !tenantId) return;
    if (Object.keys(answers).length === 0) return;

    // Limpar timeout anterior
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Aguardar 1.5s de inatividade antes de salvar
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [answers, selectedClient, tenantId, handleAutoSave]);

  // Marcar que os dados iniciais foram carregados
  useEffect(() => {
    if (questionSession) {
      // Pequeno delay para evitar trigger do auto-save no load
      setTimeout(() => {
        hasLoadedInitialData.current = true;
      }, 100);
    }
  }, [questionSession]);

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

  const handleGenerateStrategy = async () => {
    if (!selectedClient || !tenantId) {
      toast({
        title: "Erro",
        description: "Dados insuficientes para gerar a estratégia",
        variant: "destructive",
      });
      return;
    }

    // Verificar perguntas não respondidas e marcar erros
    const unansweredKeys = new Set<string>();
    strategicQuestions.forEach((_, idx) => {
      const key = `question_${idx}`;
      if (!answers[key] || answers[key].trim().length === 0) {
        unansweredKeys.add(key);
      }
    });

    if (unansweredKeys.size > 0) {
      setValidationErrors(unansweredKeys);
      // Scroll para a primeira pergunta não respondida
      const firstErrorKey = Array.from(unansweredKeys)[0];
      const element = document.getElementById(firstErrorKey);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
      }
      return;
    }

    // Limpar erros de validação
    setValidationErrors(new Set());
    setIsGeneratingStrategy(true);

    try {
      // Salvar respostas antes de gerar
      await handleAutoSave();

      // Chamar edge function para gerar estratégia
      const { data, error } = await supabase.functions.invoke('generate-strategy', {
        body: {
          companyId: selectedClient.id,
          tenantId: tenantId,
          answers: answers
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Navegar para a página de estratégias após sucesso
      navigate("/strategies");

    } catch (error: any) {
      console.error("Erro ao gerar estratégia:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível gerar a estratégia. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  // Limpar erro de validação quando o usuário digita
  const handleAnswerChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (validationErrors.has(key) && value.trim().length > 0) {
      setValidationErrors((prev) => {
        const newErrors = new Set(prev);
        newErrors.delete(key);
        return newErrors;
      });
    }
  };

  if (!selectedClient) return null;

  // LoadingScreen durante geração de estratégia
  if (isGeneratingStrategy) {
    return (
      <LoadingScreen
        title="Gerando sua estratégia personalizada"
        description="Estamos analisando as respostas e criando uma estratégia de marketing sob medida para o seu negócio. Isso pode levar alguns segundos..."
        icon={Lightbulb}
        showSparkles={true}
      />
    );
  }

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
                  {/* Auto-save indicator for mobile */}
                  <div className="px-2 py-1.5 text-sm text-muted-foreground flex items-center gap-2 border-b mb-1">
                    {isAutoSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : lastSaved ? (
                      <>
                        <Check className="h-3 w-3 text-green-500" />
                        <span>Salvo automaticamente</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="h-3 w-3" />
                        <span>Auto-save ativo</span>
                      </>
                    )}
                  </div>
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

              {/* Indicador de Auto-Save */}
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground px-3">
                {isAutoSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span>Salvo automaticamente</span>
                  </>
                ) : null}
              </div>
              
              {/* Botões individuais para Desktop */}
              <Button onClick={handleClear} variant="outline" className="hidden md:flex">
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Tudo
              </Button>
              <Button onClick={handleExportPDF} variant="outline" className="hidden md:flex">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              
              {/* Botão principal sempre visível */}
              <Button onClick={handleGenerateStrategy} disabled={isGeneratingStrategy}>
                {isGeneratingStrategy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Sparkles className="w-4 h-4 mr-2" />
                Gerar Estratégia
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
                    onChange={(e) => handleAnswerChange(key, e.target.value)}
                    placeholder="Digite sua resposta aqui..."
                    className={`min-h-[120px] resize-y focus:ring-2 focus:ring-primary/20 transition-all ${
                      validationErrors.has(key) 
                        ? "border-destructive ring-2 ring-destructive/20" 
                        : ""
                    }`}
                    rows={4}
                  />
                  {validationErrors.has(key) && (
                    <p className="text-sm text-destructive mt-1">
                      Esta pergunta é obrigatória
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
