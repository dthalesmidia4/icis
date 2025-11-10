import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Sparkles, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';

interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}

interface Strategy {
  id: string;
  name: string;
  strategy_text: string;
  status: string;
  created_at: string;
}

interface Question {
  id: number;
  question: string;
  type: string;
}

export default function GenerateQuestions() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);

  const { data: strategies, isLoading: loadingStrategies } = useQuery({
    queryKey: ['strategies', selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return [];

      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Strategy[];
    },
    enabled: !!selectedClient && !!tenantId
  });

  const handleClientSelected = (client: Client) => {
    setSelectedClient(client);
    setShowModal(false);
  };

  const handleGenerateQuestions = async () => {
    if (!selectedStrategy || !selectedClient || !tenantId) {
      toast.error('Selecione uma estratégia');
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-questions', {
        body: {
          companyId: selectedClient.id,
          strategyId: selectedStrategy.id,
          tenantId: tenantId
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setQuestions(data.questions);
      setSessionId(data.sessionId);
      setShowQuestions(true);
      toast.success('Perguntas geradas com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar perguntas:', error);
      toast.error('Erro ao gerar perguntas. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleAnswerChange = (value: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: value
    }));
  };

  const handleSaveAnswers = async () => {
    if (!sessionId) return;

    // Verificar se todas as perguntas foram respondidas
    const unansweredQuestions = questions.filter((_, index) => !answers[index]?.trim());
    if (unansweredQuestions.length > 0) {
      toast.error('Por favor, responda todas as perguntas antes de continuar');
      return;
    }

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

      toast.success('Respostas salvas com sucesso!');
      // TODO: Navegar para geração do cronograma
      navigate('/');
    } catch (error) {
      console.error('Erro ao salvar respostas:', error);
      toast.error('Erro ao salvar respostas. Tente novamente.');
    }
  };

  const handleBack = () => {
    if (showQuestions) {
      setShowQuestions(false);
      setQuestions([]);
      setAnswers({});
      setCurrentQuestionIndex(0);
    } else if (selectedClient) {
      setSelectedClient(null);
      setSelectedStrategy(null);
    } else {
      navigate('/dev');
    }
  };

  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <ClientSelectionModal
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open && !selectedClient) {
            navigate('/dev');
          }
        }}
        onClientSelected={handleClientSelected}
      />

      {selectedClient && !showQuestions && (
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Gerar Perguntas para Cronograma</h1>
              <p className="text-muted-foreground">
                Selecione uma estratégia existente para gerar perguntas personalizadas
              </p>
            </div>

            <div className="p-6 bg-accent/50 rounded-lg border">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">
                    Cliente Selecionado
                  </p>
                  <h3 className="text-xl font-semibold mb-1">
                    {selectedClient.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    CNPJ/CPF: {selectedClient.cnpj_cpf}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  Selecione uma estratégia *
                </Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Escolha a estratégia que será usada para gerar as perguntas
                </p>
              </div>

              {loadingStrategies ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando estratégias...
                </div>
              ) : !strategies || strategies.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-muted-foreground mb-4">
                    Nenhuma estratégia encontrada para este cliente.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/strategies')}
                  >
                    Criar nova estratégia
                  </Button>
                </Card>
              ) : (
                <div className="space-y-3">
                  {strategies.map((strategy) => (
                    <Card
                      key={strategy.id}
                      className={`p-4 cursor-pointer transition-all border-2 ${
                        selectedStrategy?.id === strategy.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedStrategy(strategy)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">
                            {strategy.name || 'Estratégia sem nome'}
                          </h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {strategy.strategy_text}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Status: {strategy.status}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isGenerating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleGenerateQuestions}
                disabled={isGenerating || !selectedStrategy}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:opacity-90"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? 'Gerando...' : 'Gerar Perguntas'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedClient && showQuestions && currentQuestion && (
        <div className="container max-w-3xl mx-auto py-8 px-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold mb-2">Perguntas Estratégicas</h1>
              <p className="text-muted-foreground">
                Responda as perguntas para refinar seu cronograma de marketing
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Pergunta {currentQuestionIndex + 1} de {questions.length}</span>
                <span>{Math.round(progress)}% completo</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Question Card */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 to-secondary/5 border-2">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {currentQuestionIndex + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-4">
                      {currentQuestion.question}
                    </h3>
                    <Textarea
                      value={answers[currentQuestionIndex] || ''}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Digite sua resposta aqui..."
                      className="min-h-[150px] resize-y"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-4">
              <Button
                variant="outline"
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>

              <div className="flex gap-2">
                {questions.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      answers[index]?.trim()
                        ? 'bg-primary'
                        : index === currentQuestionIndex
                        ? 'bg-primary/50'
                        : 'bg-muted'
                    }`}
                  />
                ))}
              </div>

              {currentQuestionIndex === questions.length - 1 ? (
                <Button
                  onClick={handleSaveAnswers}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Gerar Cronograma Final
                </Button>
              ) : (
                <Button
                  onClick={handleNextQuestion}
                  disabled={currentQuestionIndex === questions.length - 1}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>

            {/* Save reminder */}
            {answers[currentQuestionIndex]?.trim() && (
              <div className="text-center text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 inline mr-1 text-emerald-500" />
                Resposta registrada
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
