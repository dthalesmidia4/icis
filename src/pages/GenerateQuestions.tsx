import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, FileText, Loader2, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocalPlanState } from '@/hooks/useLocalPlanState';
interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}
export default function GenerateQuestions() {
  const navigate = useNavigate();
  const {
    tenantId
  } = useTenant();
  const {
    toast
  } = useToast();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const {
    saveState,
    clearState,
    savedState
  } = useLocalPlanState();
  const {
    data: questionSession,
    isLoading: loadingSession
  } = useQuery({
    queryKey: ['question-session', selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return null;
      const {
        data,
        error
      } = await supabase.from('question_sessions').select('*').eq('company_id', selectedClient.id).eq('tenant_id', tenantId).order('created_at', {
        ascending: false
      }).limit(1).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!selectedClient && !!tenantId
  });
  // Load answers when session is loaded
  useEffect(() => {
    if (questionSession?.answers) {
      setAnswers(questionSession.answers as Record<string, string>);
    }
  }, [questionSession]);
  const handleClientSelected = (client: Client) => {
    setSelectedClient(client);
    setShowModal(false);
  };
  const handleBack = () => {
    navigate('/');
  };
  const handleViewStrategy = () => {
    navigate('/strategies');
  };
  const handleGeneratePlan = async () => {
    if (!selectedClient || !questionSession || !tenantId) {
      toast({
        title: "Erro",
        description: "Dados insuficientes para gerar o plano",
        variant: "destructive"
      });
      return;
    }

    // Verificar se todas as perguntas foram respondidas
    const questions = Array.isArray(questionSession.questions) ? questionSession.questions : [];
    const allAnswered = questions.every((q: any, index: number) => {
      const qId = q.id || `q_${index}`;
      return answers[qId] && answers[qId].trim().length > 0;
    });
    if (!allAnswered) {
      toast({
        title: "Atenção",
        description: "Por favor, responda todas as perguntas antes de gerar o plano",
        variant: "destructive"
      });
      return;
    }
    setIsGeneratingPlan(true);

    // Salvar estado localmente
    saveState(selectedClient.id, questionSession.strategy_id, tenantId);
    try {
      // Chamar edge function para gerar plano
      const {
        data,
        error
      } = await supabase.functions.invoke('generate-plan', {
        body: {
          companyId: selectedClient.id,
          strategyId: questionSession.strategy_id,
          tenantId: tenantId
        }
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao gerar plano');
      }

      // Limpar estado salvo após sucesso
      clearState();
      toast({
        title: "Sucesso!",
        description: "Plano gerado com sucesso"
      });

      // Redirecionar para a página de planos
      navigate(`/plans?planId=${data.planId}`);
    } catch (error: any) {
      console.error('Erro ao gerar plano:', error);
      let errorMessage = 'Não foi possível gerar o plano. ';
      if (error.message?.includes('Limite de requisições')) {
        errorMessage += 'Limite de requisições excedido. Aguarde alguns instantes.';
      } else if (error.message?.includes('Créditos insuficientes')) {
        errorMessage += 'Créditos insuficientes. Adicione créditos em Settings → Workspace → Usage.';
      } else if (error.message?.includes('prompt do sistema')) {
        errorMessage += 'Configure o prompt de geração de plano em Dev → Prompts do Sistema.';
      } else {
        errorMessage += 'Verifique sua conexão e tente novamente.';
      }
      toast({
        title: "Erro ao gerar plano",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Restaurar estado ao carregar, se houver
  useEffect(() => {
    if (savedState?.inProgress && selectedClient) {
      toast({
        title: "Geração em andamento",
        description: "Detectamos uma geração de plano interrompida. Os dados foram restaurados."
      });
    }
  }, [savedState, selectedClient]);
  return <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <ClientSelectionModal open={showModal} onOpenChange={open => {
      setShowModal(open);
      if (!open && !selectedClient) {
        navigate('/');
      }
    }} onClientSelected={handleClientSelected} />

      {selectedClient && <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button variant="ghost" onClick={handleBack} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Perguntas Guias</h1>
              
            </div>

            <div className="p-6 bg-accent/50 rounded-lg border">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">
                    {selectedClient.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    CNPJ/CPF: {selectedClient.cnpj_cpf}
                  </p>
                </div>
                {questionSession && Array.isArray(questionSession.questions) && questionSession.questions.length > 0 && <div className="flex gap-2">
                    <Button size="lg" className="gap-2" onClick={handleViewStrategy}>
                      <FileText className="h-5 w-5" />
                      Ver Estratégia
                    </Button>
                    <Button size="lg" className="gap-2" onClick={handleGeneratePlan} disabled={isGeneratingPlan}>
                      {isGeneratingPlan ? <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Gerando Plano...
                        </> : <>
                          <Sparkles className="h-5 w-5" />
                          Gerar Plano
                        </>}
                    </Button>
                    
                  </div>}
              </div>
            </div>

            {isGeneratingPlan ? <div className="flex flex-col items-center justify-center py-16 space-y-6">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  </div>
                  <Sparkles className="h-6 w-6 text-primary absolute -top-2 -right-2 animate-pulse" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold">Gerando plano estratégico personalizado</h3>
                  <p className="text-muted-foreground max-w-md">
                    Isso pode levar alguns segundos. Estamos consolidando seus dados e criando um cronograma sob medida...
                  </p>
                </div>
              </div> : loadingSession ? <div className="space-y-8">
                {/* Loading Header */}
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-lg font-semibold">Carregando perguntas...</p>
                    <p className="text-sm text-muted-foreground">Por favor, aguarde um momento</p>
                  </div>
                </div>

                {/* Loading Skeletons */}
                <div className="space-y-6">
                  {[1, 2, 3].map(i => <Card key={i} className="p-6">
                      <div className="flex items-start gap-3">
                        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-3">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-24 w-full" />
                        </div>
                      </div>
                    </Card>)}
                </div>
              </div> : !questionSession ? <Card className="p-12 text-center border-dashed border-2">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold">Nenhuma pergunta encontrada</h3>
                  <p className="text-muted-foreground">
                    As perguntas guias são geradas automaticamente ao criar uma estratégia para este cliente.
                  </p>
                  <Button onClick={() => navigate('/strategies')} className="mt-4">
                    Criar Estratégia
                  </Button>
                </div>
              </Card> : <div className="space-y-8">
                {/* Perguntas e Respostas */}
                <div className="space-y-6">
                  {Array.isArray(questionSession.questions) && questionSession.questions.length > 0 ? questionSession.questions.map((q: any, index: number) => {
              const questionId = q.id || `q_${index}`;
              const questionText = q.question || q.text || q;
              const currentAnswer = answers[questionId] || '';
              return <Card key={questionId} className="p-6 hover:shadow-md transition-shadow">
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-3">
                                <Label className="text-base font-semibold">
                                  {questionText}
                                </Label>
                                
                                <div className="text-foreground/90">
                                  {currentAnswer ? <p className="whitespace-pre-wrap">{currentAnswer}</p> : <p className="text-muted-foreground italic">Sem resposta</p>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card>;
            }) : <Card className="p-6 text-center">
                      <p className="text-muted-foreground">
                        Nenhuma pergunta disponível
                      </p>
                    </Card>}
                </div>

                {/* Status */}
                <div className="flex items-center justify-between pt-4 border-t text-xs text-muted-foreground">
                  <p>
                    Status: {questionSession.status === 'completed' ? '✅ Concluído' : '⏳ Em progresso'}
                  </p>
                  <p>
                    Atualizado em: {new Date(questionSession.updated_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>}
          </div>
        </div>}
    </div>;
}