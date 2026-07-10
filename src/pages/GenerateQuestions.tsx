import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
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

import { useQuery } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

interface StrategicAnswers {
  [key: string]: string;
}

interface QuestionSection {
  title: string;
  emoji: string;
  questions: { question: string; hint?: string }[];
}

const anamnesisSections: QuestionSection[] = [
  {
    title: "Identidade e Posicionamento",
    emoji: "🧭",
    questions: [
      { question: "Em uma frase: o que você faz e para quem?" },
      { question: "Por que você existe? Qual transformação real você provoca na vida do cliente?" },
      { question: "Como você quer ser descrito por quem já te contratou?", hint: "Ex: especialista, próximo, premium, acessível, inovador." },
      { question: "Quais são os 3 pontos em que você é genuinamente melhor que seus concorrentes?" },
      { question: "O que você nunca quer que associem à sua marca?" },
    ],
  },
  {
    title: "Cliente Ideal",
    emoji: "👤",
    questions: [
      { question: "Descreva seu melhor cliente já atendido: quem é, qual problema tinha, o que mudou depois de trabalhar com você." },
      { question: "Qual é o maior medo ou frustração que esse cliente carrega antes de te contratar?" },
      { question: "O que ele já tentou antes de chegar até você — e não funcionou?" },
      { question: "O que ele realmente quer conquistar?", hint: "Não o serviço, mas a vida que o serviço representa." },
      { question: "Existe um perfil de cliente que você não quer mais atender? Por quê?" },
    ],
  },
  {
    title: "Barreiras de Compra",
    emoji: "🚧",
    questions: [
      { question: "Quando alguém some sem comprar, qual costuma ser a razão real?" },
      { question: "O que as pessoas acham caro, arriscado ou difícil de entender no que você oferece?" },
      { question: "Seu público já conhece a solução que você oferece, ou ainda precisa ser educado sobre ela?" },
    ],
  },
  {
    title: "Prova e Autoridade",
    emoji: "📣",
    questions: [
      { question: "Quais resultados concretos você já gerou?", hint: "Números, tempo, volume de clientes." },
      { question: "Descreva o caso de cliente mais marcante que você já atendeu." },
      { question: "Você tem algum método, processo ou entrega que poucos no mercado têm?" },
    ],
  },
  {
    title: "Capacidade de Produção",
    emoji: "🎙️",
    questions: [
      { question: "Você consegue aparecer em vídeo? Em qual formato?", hint: "Reels, bastidores, entrevistas, câmera frontal." },
      { question: "Você tem fotos ou vídeos do seu ambiente, produto ou serviço disponíveis para uso?" },
      { question: "Você pode mostrar clientes, pacientes ou resultados reais? Existe alguma restrição legal ou ética?" },
      { question: "Quantas vezes por semana você consegue postar de forma sustentável — não o ideal, o real?" },
      { question: "Existe algum assunto, imagem ou abordagem que você não quer nos conteúdos, por qualquer razão?" },
    ],
  },
  {
    title: "Histórico de Conteúdo",
    emoji: "🧠",
    questions: [
      { question: "Qual conteúdo já gerou mais resultado para você?", hint: "Mensagens, vendas, salvamentos, comentários." },
      { question: "Qual tipo de conteúdo você sente que não faz sentido para o seu negócio ou público?" },
      { question: "Já tentou alguma estratégia que não funcionou? O que acha que foi o motivo?" },
    ],
  },
  {
    title: "Contexto de Mercado",
    emoji: "🌍",
    questions: [
      { question: "O mercado em que você atua está crescendo, estagnado ou em transformação? O que está mudando?" },
      { question: "Existe sazonalidade importante no seu negócio?", hint: "Datas, épocas do ano, ciclos." },
      { question: "Se o conteúdo pudesse gerar um único resultado para o seu negócio, qual seria?" },
    ],
  },
];

// Bloco final com campos NOMEADOS (não usam índice) — não colide com question_N
interface GuidelineField {
  key: string;
  question: string;
  hint?: string;
}
const guidelineFields: GuidelineField[] = [
  { key: "tone_of_voice", question: "Descreva o tom de voz ideal em 1–2 linhas.", hint: "Ex.: próximo, técnico, provocador, acolhedor." },
  { key: "content_pillars", question: "Liste 3 a 5 pilares de conteúdo (temas recorrentes)." },
  { key: "preferred_ctas", question: "Quais CTAs você quer priorizar?", hint: "Ex.: chamar no WhatsApp, agendar consulta, comentar 'EU'." },
  { key: "forbidden_words", question: "Palavras, temas ou abordagens que nunca devem aparecer." },
  { key: "active_channels", question: "Quais canais estão ativos hoje?", hint: "Instagram, LinkedIn, WhatsApp, YouTube, TikTok…" },
  { key: "offer_and_ticket", question: "Qual é a oferta principal e faixa de ticket médio?" },
  { key: "main_competitors", question: "Cite 2–3 concorrentes ou referências que você admira ou compete diretamente." },
];

// Flatten questions for backward compatibility with keys
const allQuestions = anamnesisSections.flatMap((s) => s.questions);
const strategicQuestions = [
  ...allQuestions.map((q) => q.hint ? `${q.question} (${q.hint})` : q.question),
  ...guidelineFields.map((g) => `[Diretriz: ${g.key}] ${g.question}${g.hint ? ` (${g.hint})` : ''}`),
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

  // Save states
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialData = useRef(false);
  // Reset when client changes to prevent cross-client data leaks
  const currentClientRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedClient) {
      sonnerToast.error("Nenhum cliente selecionado");
      navigate("/home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset state when client changes
  useEffect(() => {
    if (selectedClient?.id !== currentClientRef.current) {
      currentClientRef.current = selectedClient?.id || null;
      setAnswers({});
      setSessionId(null);
      setLastSaved(null);
      hasLoadedInitialData.current = false;
    }
  }, [selectedClient?.id]);

  const { data: questionSession, isLoading: loadingSession } = useQuery({
    queryKey: ["question-session", selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return null;

      const { data, error } = await supabase
        .from("question_sessions")
        .select("*")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
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

  // Hydrate from loaded session, then unlock auto-save
  useEffect(() => {
    if (loadingSession) return;
    if (questionSession) {
      setSessionId(questionSession.id);
      if (questionSession.answers) {
        setAnswers(questionSession.answers as StrategicAnswers);
      }
      if (questionSession.updated_at) {
        setLastSaved(new Date(questionSession.updated_at));
      }
    }
    // Delay to skip initial render's auto-save
    const t = setTimeout(() => {
      hasLoadedInitialData.current = true;
    }, 200);
    return () => clearTimeout(t);
  }, [questionSession, loadingSession]);

  // Core save routine — insert if no session yet, otherwise update by id
  const persistSession = useCallback(async () => {
    if (!selectedClient || !tenantId) throw new Error("Cliente ou tenant ausente");
    // Guard: never overwrite with empty payload
    if (Object.keys(answers).length === 0) return;

    if (sessionId) {
      const { error } = await supabase
        .from("question_sessions")
        .update({
          answers,
          questions: strategicQuestions,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("tenant_id", tenantId)
        .eq("company_id", selectedClient.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("question_sessions")
        .insert({
          company_id: selectedClient.id,
          tenant_id: tenantId,
          answers,
          questions: strategicQuestions,
          status: "in_progress",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setSessionId(data.id);
    }
    setLastSaved(new Date());
  }, [selectedClient, tenantId, answers, sessionId]);

  // Auto-save silencioso
  const handleAutoSave = useCallback(async () => {
    if (!hasLoadedInitialData.current) return;
    setIsAutoSaving(true);
    try {
      await persistSession();
    } catch (error) {
      console.error("Erro no auto-save:", error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [persistSession]);

  // Manual save
  const handleManualSave = useCallback(async () => {
    if (!selectedClient || !tenantId) return;
    setIsManualSaving(true);
    try {
      // Force-save even if empty by inserting stub
      if (Object.keys(answers).length === 0 && !sessionId) {
        const { data, error } = await supabase
          .from("question_sessions")
          .insert({
            company_id: selectedClient.id,
            tenant_id: tenantId,
            answers: {},
            questions: strategicQuestions,
            status: "in_progress",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setSessionId(data.id);
        setLastSaved(new Date());
      } else {
        await persistSession();
      }
      sonnerToast.success("Anamnese salva com sucesso.");
    } catch (error: any) {
      console.error("Erro ao salvar anamnese:", error);
      sonnerToast.error("Não foi possível salvar a anamnese. Tente novamente.");
    } finally {
      setIsManualSaving(false);
    }
  }, [selectedClient, tenantId, answers, sessionId, persistSession]);

  // Debounce auto-save: salvar 1.5s após parar de digitar
  useEffect(() => {
    if (!hasLoadedInitialData.current) return;
    if (!selectedClient || !tenantId) return;
    if (Object.keys(answers).length === 0) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [answers, selectedClient, tenantId, handleAutoSave]);

  const handleClear = () => {
    setAnswers({});
    toast({
      title: "Campos limpos",
      description: "Todos os campos foram limpos.",
    });
  };

  const handleExportPDF = () => {
    const clientName = selectedClient?.fantasy_name || selectedClient?.name || "Cliente";
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Erro", description: "Não foi possível abrir a janela de impressão. Verifique se pop-ups estão permitidos.", variant: "destructive" });
      return;
    }

    const numberedQuestions = allQuestions.map((q) => q.hint ? `${q.question} (${q.hint})` : q.question);
    const questionsHtml = numberedQuestions.map((question, idx) => {
      const key = `question_${idx}`;
      const answer = answers[key]?.trim() || "";
      return `
        <div class="question-block">
          <p class="question"><strong>${idx + 1}. ${question}</strong></p>
          ${answer
            ? `<p class="answer">${answer.replace(/\n/g, "<br>")}</p>`
            : `<div class="blank-space"></div>`
          }
        </div>
      `;
    }).join("");

    const guidelinesHtml = `
      <h3 style="font-size:13px;margin-top:24px;margin-bottom:8px;">🎯 Diretrizes Estratégicas para IA</h3>
      ${guidelineFields.map((g) => {
        const answer = answers[g.key]?.trim() || "";
        const label = g.hint ? `${g.question} (${g.hint})` : g.question;
        return `
          <div class="question-block">
            <p class="question"><strong>${label}</strong></p>
            ${answer
              ? `<p class="answer">${answer.replace(/\n/g, "<br>")}</p>`
              : `<div class="blank-space"></div>`
            }
          </div>
        `;
      }).join("")}
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Anamnese - ${clientName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.5; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          h2 { font-size: 14px; font-weight: normal; color: #666; margin-bottom: 24px; }
          .question-block { margin-bottom: 16px; page-break-inside: avoid; }
          .question { margin: 0 0 4px 0; font-size: 12px; }
          .answer { margin: 0; font-size: 12px; color: #444; white-space: pre-wrap; }
          .blank-space { height: 50px; border-bottom: 1px solid #ccc; margin-bottom: 8px; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Anamnese - Planejamento de Conteúdo</h1>
        <h2>${clientName}</h2>
        ${questionsHtml}
        ${guidelinesHtml}
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();

    toast({
      title: "PDF exportado",
      description: "O arquivo foi baixado com sucesso.",
    });
  };

  const handleGenerateStrategyClick = () => {
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
        title="Anamnese"
        subtitle={selectedClient.fantasy_name || selectedClient.name}
        backTo="/client-hub"
        rightContent={
          <div className="flex gap-3">
            {/* Dropdown para Mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Mais opções">
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
                <DropdownMenuItem onClick={handleManualSave} disabled={isManualSaving}>
                  <Cloud className="w-4 h-4 mr-2" />
                  Salvar Anamnese
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

            {/* Indicador de Auto-Save + último salvamento */}
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground px-3">
              {isAutoSaving || isManualSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : lastSaved ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span>
                    Último salvamento:{" "}
                    {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
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
            <Button onClick={handleManualSave} disabled={isManualSaving || isAutoSaving} variant="secondary">
              {isManualSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Cloud className="w-4 h-4 mr-2" />
              )}
              Salvar Anamnese
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

      {/* Questionário por Seções */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {(() => {
          let globalIdx = 0;
          return anamnesisSections.map((section) => (
            <div key={section.title} className="space-y-5">
              {/* Section Header */}
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                <span className="text-xl">{section.emoji}</span>
                <h2 className="text-lg font-bold text-foreground tracking-wide uppercase">{section.title}</h2>
              </div>

              {/* Section Questions */}
              {section.questions.map((q) => {
                const idx = globalIdx++;
                const key = `question_${idx}`;
                return (
                  <div key={key} className="space-y-3">
                    <Label
                      htmlFor={key}
                      className="text-base font-semibold text-foreground leading-relaxed block cursor-pointer"
                    >
                      {q.question}
                      {q.hint && (
                        <span className="block mt-1 text-muted-foreground font-normal text-sm">
                          ({q.hint})
                        </span>
                      )}
                    </Label>

                    <AutoResizeTextarea
                      id={key}
                      value={answers[key] || ""}
                      onChange={(e) => handleAnswerChange(key, e.target.value)}
                      placeholder="Digite sua resposta aqui..."
                      aria-label={`Resposta para: ${q.question}`}
                      aria-required="true"
                      aria-invalid={validationErrors.has(key)}
                      minHeight={120}
                      className={`focus:ring-2 focus:ring-primary/20 transition-all bg-muted/50 text-foreground placeholder:text-muted-foreground ${
                        validationErrors.has(key)
                          ? "border-destructive ring-2 ring-destructive/20"
                          : "border-border/50"
                      }`}
                    />
                    {validationErrors.has(key) && (
                      <p className="text-sm text-destructive mt-1" role="alert">
                        Esta pergunta é obrigatória
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}

        {/* Bloco final com chaves nomeadas — Diretrizes Estratégicas para IA */}
        <div className="space-y-5">
          <div className="flex items-center gap-3 pb-2 border-b border-border/50">
            <span className="text-xl">🎯</span>
            <h2 className="text-lg font-bold text-foreground tracking-wide uppercase">
              Diretrizes Estratégicas para IA
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Campos curtos usados diretamente pela IA como restrições e prioridades ao gerar estratégia, planejamentos e conteúdos.
          </p>
          {guidelineFields.map((g) => (
            <div key={g.key} className="space-y-3">
              <Label
                htmlFor={g.key}
                className="text-base font-semibold text-foreground leading-relaxed block cursor-pointer"
              >
                {g.question}
                {g.hint && (
                  <span className="block mt-1 text-muted-foreground font-normal text-sm">
                    ({g.hint})
                  </span>
                )}
              </Label>
              <AutoResizeTextarea
                id={g.key}
                value={answers[g.key] || ""}
                onChange={(e) => handleAnswerChange(g.key, e.target.value)}
                placeholder="Digite sua resposta aqui..."
                aria-label={`Resposta para: ${g.question}`}
                minHeight={90}
                className="focus:ring-2 focus:ring-primary/20 transition-all bg-muted/50 text-foreground placeholder:text-muted-foreground border-border/50"
              />
            </div>
          ))}
        </div>

        {/* Botão de salvar no rodapé */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/50">
          <div className="text-sm text-muted-foreground">
            {lastSaved
              ? `Último salvamento: ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Ainda não salvo"}
          </div>
          <Button onClick={handleManualSave} disabled={isManualSaving || isAutoSaving} size="lg">
            {isManualSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Cloud className="w-4 h-4 mr-2" />
            )}
            Salvar Anamnese
          </Button>
        </div>
      </div>
    </div>
  );
}
