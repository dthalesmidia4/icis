import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { PageHeader } from "@/components/PageHeader";
import { Loader2, Trash2, FileDown, MoreVertical, Sparkles, Check, Cloud, Lightbulb, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsPDF from "jspdf";
import { useQuery } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

interface StrategicAnswers {
  [key: string]: string;
}

const strategicQuestions = [
  "O que você deseja alcançar com sua comunicação neste momento? (Objetivo principal como vendas, leads, lançamento, autoridade, engajamento.)",
  "Por que esse objetivo é importante para você agora? (Desafios, oportunidades, sazonalidade, concorrência, necessidade interna.)",
  "Quem você deseja atingir com esse conteúdo? (Perfil, comportamento, região, dores e necessidades do público.)",
  "Quando você espera começar a ver resultados? (Prazo estimado: semanas, próximo mês, campanha específica.)",
  "Como você prefere que essa comunicação seja feita? (Tom e formatos: direto, humanizado, premium, educativo, reels, vídeos, stories, carrosséis.)",
  "Existe algum estilo de comunicação ou abordagem que você NÃO quer que seja utilizada? (Formas de comunicação, temas ou formatos que devem ser evitados.)",
  "Como sua empresa atrai clientes hoje? (Fontes atuais: redes sociais, indicações, anúncios, Google, WhatsApp.)",
  "Quais são os seus principais diferenciais frente aos concorrentes? (Três pontos que tornam sua empresa mais competitiva.)",
  "Quanto você pode investir em tráfego pago ou impulsionamento? (Valor aproximado ou nível: zero, baixo, médio, alto.)",
  "Quais limitações precisamos considerar antes de montar seu cronograma? (Tempo, equipe, estoque, gravação, orçamento, restrições internas, legislação, preferências de formatos.)"
];

export default function GenerateQuestions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [answers, setAnswers] = useState<StrategicAnswers>({});
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
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

  // Query para verificar se já existe estratégia
  const { data: existingStrategy } = useQuery({
    queryKey: ["existing-strategy", selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return null;

      const { data, error } = await supabase
        .from("strategies")
        .select("id, created_at")
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
      const answer = answers[key]?.trim() || "";

      // Quebrar pergunta em múltiplas linhas para caber na página
      doc.setFont("helvetica", "bold");
      const questionText = `${idx + 1}. ${question}`;
      const questionLines = doc.splitTextToSize(questionText, 170);
      
      // Verificar se cabe na página (pergunta + espaço para resposta)
      const neededSpace = answer ? 50 : 60;
      if (yPosition + (questionLines.length * 5) + neededSpace > 280) {
        doc.addPage();
        yPosition = 20;
      }

      questionLines.forEach((line: string) => {
        doc.text(line, 20, yPosition);
        yPosition += 5;
      });
      yPosition += 3;

      if (answer) {
        // Se há resposta, exibir normalmente
        doc.setFont("helvetica", "normal");
        const answerLines = doc.splitTextToSize(answer, 170);
        answerLines.forEach((line: string) => {
          if (yPosition > 275) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, 20, yPosition);
          yPosition += 5;
        });
        yPosition += 10;
      } else {
        // Se não há resposta, deixar espaço em branco maior para escrita manual
        yPosition += 45;
      }
    });

    doc.save(
      `Perguntas_Estrategicas_${selectedClient?.fantasy_name || selectedClient?.name}.pdf`
    );

    toast({
      title: "PDF exportado",
      description: "O arquivo foi baixado com sucesso.",
    });
  };

  const handleGenerateStrategyClick = () => {
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

    // Se já existe estratégia, mostrar modal de confirmação
    if (existingStrategy) {
      setShowConfirmModal(true);
      return;
    }

    // Caso contrário, gerar diretamente
    handleGenerateStrategy();
  };

  const handleGenerateStrategy = async () => {
    setShowConfirmModal(false);
    
    if (!selectedClient || !tenantId) {
      toast({
        title: "Erro",
        description: "Dados insuficientes para gerar a estratégia",
        variant: "destructive",
      });
      return;
    }
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
      <div className="pb-8">
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
    <div className="pb-8">
      {/* Header Fixo usando PageHeader */}
      <PageHeader
        title="Perguntas Guias"
        subtitle={selectedClient.fantasy_name || selectedClient.name}
        backTo="/client-hub"
        rightContent={
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
            <Button onClick={handleGenerateStrategyClick} disabled={isGeneratingStrategy}>
              {isGeneratingStrategy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Estratégia
            </Button>
          </div>
        }
      />

      {/* Modal de Confirmação */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <AlertDialogTitle>Estratégia já registrada</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base">
              Já existe uma estratégia registrada para <span className="font-medium text-foreground">{selectedClient?.fantasy_name || selectedClient?.name}</span>. 
              Ao continuar, a estratégia atual será <span className="font-medium text-destructive">substituída permanentemente</span> pela nova geração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateStrategy} className="bg-destructive hover:bg-destructive/90">
              Substituir Estratégia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Container Principal */}
      <div className="container mx-auto px-6 py-8">
        <div className="bg-card rounded-lg border shadow-sm p-8 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="max-w-[900px] mx-auto space-y-6">
            {strategicQuestions.map((question, idx) => {
              const key = `question_${idx}`;
              // Separar pergunta principal da descrição em parênteses
              const match = question.match(/^(.+?)(\s*\(.+\))$/);
              const mainQuestion = match ? match[1] : question;
              const description = match ? match[2] : null;
              
              return (
                <div key={key} className="space-y-3">
                  <Label 
                    htmlFor={key} 
                    className="text-base font-semibold text-foreground leading-relaxed block"
                  >
                    {idx + 1}. {mainQuestion}
                    {description && (
                      <span className="text-muted-foreground font-normal text-sm">
                        {description}
                      </span>
                    )}
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
