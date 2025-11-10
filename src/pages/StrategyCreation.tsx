import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Save, Sparkles, Eraser, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}

interface Question {
  id: string;
  question: string;
  type: 'short' | 'long';
}

export default function StrategyCreation() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [strategyText, setStrategyText] = useState('');
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showBackModal, setShowBackModal] = useState(false);
  useEffect(() => {
    if (!selectedClient && !showModal) {
      // Se o modal foi fechado sem selecionar um cliente, voltar ao hub
      navigate('/');
    }
  }, [showModal, selectedClient, navigate]);
  const handleClientSelected = (client: Client) => {
    setSelectedClient(client);
    setShowModal(false);
  };
  const handleSave = async () => {
    if (!strategyText.trim()) {
      toast.error('Por favor, descreva a estratégia');
      return;
    }
    if (!selectedClient || !tenantId) {
      toast.error('Informações do cliente ou tenant não encontradas');
      return;
    }
    
    setIsSaving(true);
    setIsGenerating(true);
    
    try {
      // 1. Salvar a estratégia
      toast.info('Salvando estratégia...');
      
      const { data: strategyData, error: strategyError } = await supabase
        .from('strategies')
        .insert({
          company_id: selectedClient.id,
          tenant_id: tenantId,
          strategy_text: strategyText,
          status: 'Em elaboração'
        })
        .select()
        .single();
      
      if (strategyError) throw strategyError;
      
      setStrategyId(strategyData.id);
      toast.success('✅ Estratégia salva com sucesso!');
      
      // 2. Gerar perguntas automaticamente
      toast.info('🤖 Gerando perguntas guias...');
      
      const { data: questionData, error: questionError } = await supabase.functions.invoke(
        'generate-questions',
        {
          body: {
            companyId: selectedClient.id,
            strategyId: strategyData.id,
            tenantId: tenantId
          }
        }
      );

      if (questionError) {
        console.error('Erro ao gerar perguntas:', questionError);
        toast.error('⚠️ Não foi possível gerar as perguntas guias. Tente novamente mais tarde.');
        return;
      }

      if (questionData?.error) {
        console.error('Erro na resposta:', questionData.error);
        toast.error(`⚠️ ${questionData.error}`);
        return;
      }
      
      // Fetch the generated questions from the session
      const { data: sessionData, error: sessionError } = await supabase
        .from('question_sessions')
        .select('questions')
        .eq('id', questionData.sessionId)
        .single();

      if (sessionError || !sessionData) {
        console.error('Erro ao buscar perguntas:', sessionError);
        toast.error('Erro ao carregar perguntas geradas.');
        return;
      }

      const generatedQuestions: Question[] = (sessionData.questions as any[]).map((q, idx) => ({
        id: `q_${idx}`,
        question: q.question || q.text || q,
        type: ((q.question || q.text || q).length > 100 ? 'long' : 'short') as 'short' | 'long'
      }));

      setQuestions(generatedQuestions);
      toast.success('✅ Perguntas guias geradas com sucesso!');
      
    } catch (error) {
      console.error('Erro ao salvar estratégia:', error);
      toast.error('Erro ao salvar estratégia. Tente novamente.');
    } finally {
      setIsSaving(false);
      setIsGenerating(false);
    }
  };

  const handleClearForm = () => {
    setAnswers({});
    toast.success('Formulário limpo com sucesso');
  };

  const handleGeneratePlan = async () => {
    if (!strategyId || !selectedClient || !tenantId) {
      toast.error('Dados incompletos para gerar o plano');
      return;
    }

    const unansweredQuestions = questions.filter(q => !answers[q.id]?.trim());
    if (unansweredQuestions.length > 0) {
      toast.warning('Algumas perguntas não foram respondidas');
    }

    try {
      toast.info('Gerando plano mensal...');
      
      // Save answers to the question session
      const { data: sessionData } = await supabase
        .from('question_sessions')
        .select('id')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (sessionData) {
        await supabase
          .from('question_sessions')
          .update({
            answers,
            status: 'completed'
          })
          .eq('id', sessionData.id);
      }

      toast.success('✅ Plano mensal gerado com sucesso!');
      
      // Navigate to the plan page or appropriate next step
      navigate('/plan', {
        state: {
          companyId: selectedClient.id,
          strategyId: strategyId
        }
      });
      
    } catch (error) {
      console.error('Erro ao gerar plano:', error);
      toast.error('Erro ao gerar plano. Tente novamente.');
    }
  };
  const handleBack = () => {
    const hasUnsavedAnswers = Object.keys(answers).some(key => answers[key]?.trim());
    
    if (hasUnsavedAnswers || questions.length > 0) {
      setShowBackModal(true);
    } else {
      navigate('/strategies');
    }
  };

  const confirmBack = () => {
    navigate('/strategies');
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <ClientSelectionModal 
        open={showModal} 
        onOpenChange={setShowModal} 
        onClientSelected={handleClientSelected} 
      />

      <ConfirmationModal
        open={showBackModal}
        onOpenChange={setShowBackModal}
        title="Confirmar saída"
        description={
          Object.keys(answers).some(key => answers[key]?.trim())
            ? "Existem respostas não salvas. Ao voltar, você pode perder essas respostas. Deseja continuar?"
            : "Ao voltar, as perguntas podem ser refeitas com base na estratégia atual. Deseja continuar?"
        }
        onConfirm={confirmBack}
      />

      {selectedClient && (
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button variant="ghost" onClick={handleBack} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Criar Estratégia</h1>
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
                <Label htmlFor="strategy" className="text-base font-semibold">
                  Descreva a estratégia principal deste cliente *
                </Label>
              </div>
              
              <Textarea 
                id="strategy" 
                placeholder="Exemplo: Aumentar presença digital através de conteúdo educativo nas redes sociais, focando em LinkedIn e Instagram. Público-alvo: profissionais de 25-45 anos interessados em tecnologia..." 
                value={strategyText} 
                onChange={e => setStrategyText(e.target.value)} 
                className="min-h-[300px] resize-y"
                disabled={!!strategyId}
              />
            </div>

            {!strategyId && (
              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={handleBack} 
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || !strategyText.trim()} 
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar Estratégia'}
                </Button>
              </div>
            )}

            {isGenerating && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-muted-foreground">Gerando perguntas guias...</p>
              </div>
            )}

            {strategyId && questions.length > 0 && (
              <div className="space-y-6 pt-6 border-t">
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-bold">Perguntas Guias para o Cronograma</h2>
                </div>

                <div className="space-y-6">
                  {questions.map((question, index) => (
                    <div key={question.id} className="space-y-2">
                      <Label 
                        htmlFor={question.id} 
                        className="text-base font-medium"
                      >
                        {index + 1}. {question.question}
                      </Label>
                      
                      {question.type === 'short' ? (
                        <Input
                          id={question.id}
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            [question.id]: e.target.value
                          }))}
                          placeholder="Digite sua resposta..."
                          className="w-full"
                        />
                      ) : (
                        <Textarea
                          id={question.id}
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            [question.id]: e.target.value
                          }))}
                          placeholder="Digite sua resposta..."
                          className="min-h-[120px] resize-y"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <Button
                    variant="outline"
                    onClick={handleClearForm}
                  >
                    <Eraser className="h-4 w-4 mr-2" />
                    Limpar Formulário
                  </Button>
                  
                  <Button
                    onClick={handleGeneratePlan}
                    className="bg-gradient-to-r from-green-600 to-green-500 hover:opacity-90"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Gerar Plano Mensal
                  </Button>
                </div>
              </div>
            )}

            {strategyId && questions.length === 0 && !isGenerating && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma pergunta foi gerada. Ajuste a estratégia e tente novamente.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}