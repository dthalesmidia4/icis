import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { logProgressEvent } from "@/lib/progressHistory";

interface AnamnesisSection {
  title: string;
  questions: string[];
}

const sections: AnamnesisSection[] = [
  {
    title: "Informações Gerais",
    questions: [
      "Como você se descreve como pessoa?",
      "Quais são seus principais pontos fortes?",
      "Quais são seus principais pontos que você acredita que precisa melhorar?",
      "O que você espera desenvolver em você durante o tempo na empresa?",
      "Você costuma se sentir confortável falando com outras pessoas?",
    ],
  },
  {
    title: "Comunicação",
    questions: [
      "Você sente facilidade para se expressar quando está falando com outras pessoas?",
      "Você sente dificuldade para explicar suas ideias com clareza?",
      "Você já teve dificuldade em apresentações ou ao falar em público?",
      "Você acredita que fala rápido, devagar ou de forma equilibrada?",
      "Você costuma organizar mentalmente o que vai falar antes de falar?",
    ],
  },
  {
    title: "Dicção e Fala",
    questions: [
      "Você sente que sua fala é clara para as pessoas entenderem?",
      "Você acha que precisa melhorar sua dicção ou forma de falar?",
      "Você costuma ficar nervoso ao falar em público?",
      "Quando está falando, você sente que consegue manter calma e controle?",
    ],
  },
  {
    title: "Postura e Presença",
    questions: [
      "Você acredita que transmite confiança quando fala com outras pessoas?",
      "Você se considera uma pessoa com boa postura corporal?",
      "Você costuma manter contato visual quando conversa com alguém?",
      "Você se sente seguro ao se posicionar em uma conversa ou discussão?",
    ],
  },
  {
    title: "Raciocínio e Pensamento",
    questions: [
      "Você sente facilidade para entender textos ou informações novas?",
      "Você costuma refletir antes de responder perguntas ou situações?",
      "Você gosta de aprender coisas novas e desenvolver seu raciocínio?",
      "Quando surge um problema, você costuma pensar em soluções ou espera alguém orientar?",
    ],
  },
  {
    title: "Leitura e Aprendizado",
    questions: [
      "Você tem o hábito de leitura?",
      "Que tipo de conteúdo você costuma ler?",
      "Você sente dificuldade para interpretar textos ou entender conteúdos mais complexos?",
      "Você acredita que a leitura pode ajudar no seu desenvolvimento profissional?",
    ],
  },
  {
    title: "Argumentação e Exposição de Ideias",
    questions: [
      "Você se sente confortável defendendo sua opinião em uma conversa?",
      "Você costuma explicar bem suas ideias quando alguém pede sua opinião?",
      "Você prefere ouvir mais ou falar mais em discussões?",
      "Você sente que consegue organizar bem seus pensamentos ao falar?",
    ],
  },
  {
    title: "Comportamento e Evolução",
    questions: [
      "Você se considera uma pessoa disciplinada?",
      "Você tem facilidade em receber feedback ou críticas construtivas?",
      "Como você reage quando alguém aponta algo que você precisa melhorar?",
      "Você está disposto a participar de atividades de desenvolvimento como leitura, apresentações e exercícios de comunicação?",
    ],
  },
  {
    title: "Expectativas de Desenvolvimento",
    questions: [
      "Que habilidades você gostaria de melhorar em você?",
      "O que você acredita que mais precisa desenvolver neste momento?",
      "Como você imagina sua evolução pessoal e profissional nos próximos anos?",
      "Existe alguma dificuldade pessoal que você acredita que possa impactar seu desenvolvimento?",
    ],
  },
];

export default function EmployeeAnamnesis() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { agencyId } = useAgency();
  const { user } = useAuth();

  const employeeId = searchParams.get("employeeId");
  const employeeName = searchParams.get("employeeName") || "Funcionário";

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [observerNotes, setObserverNotes] = useState("");
  const [interviewDate, setInterviewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [interviewerName, setInterviewerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 0: true });
  const [strategyText, setStrategyText] = useState("");

  useEffect(() => {
    if (employeeId && agencyId) {
      loadExisting();
      loadExistingStrategy();
    }
    loadInterviewerName();
  }, [employeeId, agencyId]);

  const loadExistingStrategy = async () => {
    if (!employeeId || !agencyId) return;
    const { data } = await supabase
      .from("employee_progress_history" as any)
      .select("event_data")
      .eq("tenant_id", agencyId)
      .eq("employee_id", employeeId)
      .eq("event_type", "estrategia")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const eventData = (data[0] as any).event_data;
      if (eventData?.strategyText) {
        setStrategyText(eventData.strategyText);
      } else if (eventData?.strategyPreview) {
        setStrategyText(eventData.strategyPreview);
      }
    }
  };

  const loadInterviewerName = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    if (data) setInterviewerName(data.full_name);
  };

  const loadExisting = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employee_anamnesis" as any)
        .select("*")
        .eq("tenant_id", agencyId!)
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        const record = data[0] as any;
        setExistingId(record.id);
        setAnswers((record.answers as Record<string, string>) || {});
        setObserverNotes(record.observer_notes || "");
        setInterviewDate(record.interview_date || format(new Date(), "yyyy-MM-dd"));
      }
    } catch (err) {
      console.error("Erro ao carregar anamnese:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const getQuestionKey = (sectionIdx: number, questionIdx: number) =>
    `s${sectionIdx}_q${questionIdx}`;

  const toggleSection = (idx: number) => {
    setOpenSections((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const [generatingStrategy, setGeneratingStrategy] = useState(false);

  const handleSave = async () => {
    if (!agencyId || !employeeId || !user?.id) return;
    setSaving(true);
    try {
      const payload = {
        tenant_id: agencyId,
        employee_id: employeeId,
        interviewer_id: user.id,
        interview_date: interviewDate,
        answers,
        observer_notes: observerNotes || null,
      };

      if (existingId) {
        const { error } = await supabase
          .from("employee_anamnesis" as any)
          .update(payload as any)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("employee_anamnesis" as any)
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        if (data) setExistingId((data as any).id);
      }
      toast.success("Anamnese salva com sucesso!");

      // Log to progress history
      await logProgressEvent({
        tenantId: agencyId,
        employeeId,
        eventType: "anamnese",
        eventTitle: existingId ? "Anamnese atualizada" : "Anamnese realizada",
        eventData: { answeredCount: Object.values(answers).filter((v) => v.trim()).length, hasObserverNotes: !!observerNotes },
        createdBy: user.id,
      });

      // Generate strategy via GPT
      await generateStrategy();
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro ao salvar anamnese");
    } finally {
      setSaving(false);
    }
  };

  const generateStrategy = async () => {
    setGeneratingStrategy(true);
    try {
      toast.info("Gerando estratégia de desenvolvimento com IA...", { duration: 5000 });
      
      const { data, error } = await supabase.functions.invoke("generate-employee-strategy", {
        body: {
          employeeId,
          employeeName,
          tenantId: agencyId,
          answers,
          observerNotes,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.strategyText) {
        setStrategyText(data.strategyText);
        toast.success("Estratégia de desenvolvimento gerada com sucesso!", { duration: 4000 });

        // Log strategy generation to progress history (save full text)
        await logProgressEvent({
          tenantId: agencyId!,
          employeeId: employeeId!,
          eventType: "estrategia",
          eventTitle: "Estratégia geral gerada pela IA",
          eventData: { strategyText: data.strategyText, strategyPreview: data.strategyText.substring(0, 300) },
          createdBy: user?.id,
        });
      }
    } catch (err: any) {
      console.error("Erro ao gerar estratégia:", err);
      toast.error("Erro ao gerar estratégia. A anamnese foi salva normalmente.");
    } finally {
      setGeneratingStrategy(false);
    }
  };

  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;
  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <PageHeader title="Anamnese Pessoal" backTo="/leitura" />

        <Card className="p-6 mt-6">
          <h2 className="text-xl font-bold text-foreground mb-1">
            Formulário de Anamnese – Desenvolvimento do Funcionário
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Este formulário tem como objetivo entender melhor o funcionário, identificar pontos de
            desenvolvimento e direcionar o processo de evolução pessoal e profissional dentro da
            empresa.
          </p>

          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Entrevistador</Label>
              <Input value={interviewerName} readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Funcionário</Label>
              <Input value={employeeName} readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Data</Label>
              <Input
                type="date"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
              />
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {answeredCount}/{totalQuestions} respondidas
            </span>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {sections.map((section, sIdx) => {
              const sectionAnswered = section.questions.filter(
                (_, qIdx) => answers[getQuestionKey(sIdx, qIdx)]?.trim()
              ).length;
              const isOpen = openSections[sIdx] ?? false;

              return (
                <Collapsible key={sIdx} open={isOpen} onOpenChange={() => toggleSection(sIdx)}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-semibold text-foreground text-left">
                          {section.title}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {sectionAnswered}/{section.questions.length}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4 pt-3 pb-2 px-2">
                      {section.questions.map((question, qIdx) => {
                        const key = getQuestionKey(sIdx, qIdx);
                        return (
                          <div key={key} className="space-y-1.5">
                            <Label className="text-sm font-medium text-foreground">
                              {question}
                            </Label>
                            <AutoResizeTextarea
                              placeholder="Resposta..."
                              value={answers[key] || ""}
                              onChange={(e) => handleAnswerChange(key, e.target.value)}
                              minHeight={60}
                              className="text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>

          {/* Observer notes */}
          <div className="mt-8 space-y-2">
            <Label className="text-base font-semibold text-foreground">
              Observações do Entrevistador
            </Label>
            <p className="text-xs text-muted-foreground">
              Espaço para registrar comportamentos observados durante a entrevista, como
              comunicação, postura, clareza ao falar, organização de pensamento e nível de
              confiança.
            </p>
            <AutoResizeTextarea
              placeholder="Registre suas observações aqui..."
              value={observerNotes}
              onChange={(e) => setObserverNotes(e.target.value)}
              minHeight={100}
            />
          </div>

          {/* Save */}
          <div className="flex justify-end mt-6">
            <Button onClick={handleSave} disabled={saving || generatingStrategy} size="lg">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : generatingStrategy ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Salvando..." : generatingStrategy ? "Gerando estratégia..." : "Salvar Anamnese"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
