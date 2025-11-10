import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const state = location.state as LocationState;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!state?.strategyId || !state?.companyId) {
      toast.error('Informações da estratégia não encontradas');
      navigate('/');
      return;
    }

    loadQuestions();
  }, [state, navigate]);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);

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
        toast.error('Erro ao carregar perguntas');
        return;
      }

      if (!session) {
        // Aguardar um pouco e tentar novamente (perguntas podem estar sendo geradas)
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

    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
      toast.error('Erro ao carregar perguntas');
    } finally {
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

  const handleCompleteAndAdvance = async () => {
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
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Respostas salvas com sucesso! Avançando...');
      
      // Navegar para a próxima etapa (ajustar conforme necessário)
      setTimeout(() => {
        navigate('/');
      }, 1500);

    } catch (error) {
      console.error('Erro ao concluir:', error);
      toast.error('Erro ao salvar respostas. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryGeneration = async () => {
    setIsLoading(true);
    toast.info('Gerando novas perguntas...');

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
      toast.error('Não foi possível gerar as perguntas. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">
                Carregando perguntas guias...
              </p>
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
            <div className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">
                Nenhuma pergunta encontrada para esta estratégia.
              </p>
              <Button onClick={handleRetryGeneration}>
                Gerar Perguntas Novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {questions.map((question, index) => (
                  <div key={question.id} className="space-y-2">
                    <Label htmlFor={question.id} className="text-base font-medium">
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
                        className="min-h-[120px] resize-y"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={handleSaveAnswers}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Respostas
                </Button>
                <Button
                  onClick={handleCompleteAndAdvance}
                  disabled={isSaving}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Concluir e Avançar'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
