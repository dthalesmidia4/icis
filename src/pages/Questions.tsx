import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/TenantContext';
import { useSelectedClient } from '@/contexts/SelectedClientContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MonthSelectionModal } from '@/components/MonthSelectionModal';

interface Question {
  id: string;
  question: string;
  type?: 'short' | 'long';
}

interface LocationState {
  companyId: string;
  strategyId: string;
  companyName: string;
  companyCnpjCpf: string;
}

export default function Questions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const state = location.state as LocationState;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);

  // Verificar se há cliente selecionado
  useEffect(() => {
    if (!selectedClient) {
      toast.error('Nenhum cliente selecionado');
      navigate('/home');
      return;
    }

    if (!state?.strategyId || !state?.companyId) {
      toast.error('Informações da estratégia não encontradas');
      navigate('/client-hub');
      return;
    }

    // Verificar se o state é do cliente selecionado
    if (state.companyId !== selectedClient.id) {
      toast.error('Cliente não corresponde ao selecionado');
      navigate('/client-hub');
      return;
    }

    loadQuestions();
  }, [state, navigate, selectedClient]);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      setHasError(false);

      // Buscar a sessão de perguntas mais recente para esta estratégia
      const { data: session, error } = await supabase
        .from('question_sessions')
        .select('*')
        .eq('strategy_id', state.strategyId)
        .eq('company_id', state.companyId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar perguntas:', error);
        setHasError(true);
        setIsLoading(false);
        return;
      }

      if (!session) {
        // Aguardar um pouco e tentar novamente (perguntas podem estar sendo geradas)
        // Mantém isLoading = true durante o retry
        setTimeout(loadQuestions, 2000);
        return;
      }

      setSessionId(session.id);
      
      // Processar perguntas do JSONB
      const questionsArray = Array.isArray(session.questions) ? session.questions : [];
      const formattedQuestions: Question[] = questionsArray.map((q: any, index: number) => ({
        id: q.id || `q_${index}`,
        question: q.question || q.text || q,
        type: q.type || (typeof q === 'string' && q.length < 100 ? 'short' : 'long')
      }));

      setQuestions(formattedQuestions);

      // Carregar respostas existentes
      if (session.answers && typeof session.answers === 'object') {
        setAnswers(session.answers as Record<string, string>);
      }

      setIsLoading(false);

    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSaveAnswers = async () => {
    if (!sessionId) {
      toast.error('Sessão não encontrada');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('question_sessions')
        .update({
          answers: answers,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Respostas salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar respostas:', error);
      toast.error('Erro ao salvar respostas. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteAndAdvance = async (selectedMonth: string) => {
    if (!sessionId) {
      toast.error('Sessão não encontrada');
      return;
    }

    if (!selectedMonth) {
      toast.error('Por favor, selecione o mês de referência');
      return;
    }

    setIsSaving(true);
    setShowMonthModal(false);

    try {
      // Salvar respostas
      const { error: updateError } = await supabase
        .from('question_sessions')
        .update({
          answers: answers,
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      toast.success('Respostas salvas! Gerando plano...');

      // Gerar plano
      const { data: planData, error: planError } = await supabase.functions.invoke('generate-plan', {
        body: {
          companyId: state.companyId,
          strategyId: state.strategyId,
          tenantId: tenantId,
          selectedMonth: selectedMonth
        }
      });

      if (planError || planData?.error) {
        throw planError || new Error(planData.error);
      }

      toast.success('Plano gerado com sucesso!');
      
      // Navegar para a página de planos
      navigate('/plans', {
        state: {
          planId: planData.planId,
          companyId: state.companyId,
          strategyId: state.strategyId
        }
      });

    } catch (error) {
      console.error('Erro ao gerar plano:', error);
      toast.error('Erro ao gerar plano. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenMonthModal = async () => {
    if (!sessionId) {
      toast.error('Sessão não encontrada');
      return;
    }

    // Salvar respostas imediatamente antes de abrir o modal
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('question_sessions')
        .update({
          answers: answers,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Respostas salvas!');
      setShowMonthModal(true);
    } catch (error) {
      console.error('Erro ao salvar respostas:', error);
      toast.error('Erro ao salvar respostas. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryGeneration = async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const { data, error } = await supabase.functions.invoke('generate-questions', {
        body: {
          companyId: state.companyId,
          strategyId: state.strategyId,
          tenantId: tenantId
        }
      });

      if (error || data?.error) {
        throw error || new Error(data.error);
      }

      toast.success('Perguntas geradas com sucesso!');
      await loadQuestions();
    } catch (error) {
      console.error('Erro ao gerar perguntas:', error);
      setHasError(true);
      toast.error('Não foi possível gerar as perguntas. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="flex items-center justify-center min-h-[500px]">
            <div className="text-center space-y-6 animate-fade-in">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 blur-3xl animate-pulse"></div>
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto relative z-10" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-foreground">
                  Gerando perguntas personalizadas para seu cronograma...
                </p>
                <p className="text-sm text-muted-foreground">
                  Isso pode levar alguns instantes
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-6 max-w-md animate-fade-in">
              <div className="flex justify-center">
                <div className="p-4 bg-destructive/10 rounded-full">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">
                  Não foi possível carregar as perguntas
                </h3>
                <p className="text-sm text-muted-foreground">
                  Verifique sua conexão e tente novamente.
                </p>
              </div>
              <Button onClick={handleRetryGeneration} className="mt-4">
                Gerar Perguntas Novamente
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Perguntas Guias do Cronograma</h1>
            <div className="text-sm text-muted-foreground">
              {state?.companyName && (
                <p>
                  Cliente: <span className="font-semibold">{state.companyName}</span>
                  {state?.companyCnpjCpf && ` • CNPJ/CPF: ${state.companyCnpjCpf}`}
                </p>
              )}
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-12 space-y-6 animate-fade-in">
              <div className="flex justify-center">
                <div className="p-4 bg-muted rounded-full">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-foreground">
                  Nenhuma pergunta encontrada
                </p>
                <p className="text-sm text-muted-foreground">
                  Gere perguntas para esta estratégia
                </p>
              </div>
              <Button onClick={handleRetryGeneration}>
                Gerar Perguntas Novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-5 animate-fade-in">
                {questions.map((question, index) => (
                  <div key={question.id} className="space-y-3 p-5 bg-accent/5 rounded-lg border border-border/50">
                    <Label htmlFor={question.id} className="text-base font-medium leading-relaxed">
                      {index + 1}. {question.question}
                    </Label>
                    {question.type === 'short' ? (
                      <Input
                        id={question.id}
                        value={answers[question.id] || ''}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        placeholder="Digite sua resposta..."
                        className="w-full"
                      />
                    ) : (
                      <Textarea
                        id={question.id}
                        value={answers[question.id] || ''}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        placeholder="Digite sua resposta..."
                        className="min-h-[100px] resize-y"
                        rows={2}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-8 border-t">
                <Button
                  variant="outline"
                  onClick={handleSaveAnswers}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Rascunho
                </Button>
                <Button
                  onClick={handleOpenMonthModal}
                  disabled={isSaving}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isSaving ? 'Gerando plano...' : 'Salvar Respostas e Gerar Plano'}
                </Button>
              </div>
            </>
          )}
        </div>

        <MonthSelectionModal
          open={showMonthModal}
          onClose={() => setShowMonthModal(false)}
          onConfirm={handleCompleteAndAdvance}
          isGenerating={isSaving}
        />
      </div>
    </div>
  );
}
