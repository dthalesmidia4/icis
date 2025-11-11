import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
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
  const [isSaving, setIsSaving] = useState(false);
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
  const handleAnswerChange = async (questionId: string, value: string) => {
    const updatedAnswers = {
      ...answers,
      [questionId]: value
    };
    setAnswers(updatedAnswers);

    // Auto-save
    if (questionSession?.id) {
      setIsSaving(true);
      try {
        const {
          error
        } = await supabase.from('question_sessions').update({
          answers: updatedAnswers
        }).eq('id', questionSession.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error saving answer:', error);
        toast({
          title: "Erro ao salvar",
          description: "Não foi possível salvar a resposta automaticamente.",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    }
  };
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
              </div>
            </div>

            {loadingSession ? <div className="text-center py-8 text-muted-foreground">
                Carregando perguntas e respostas...
              </div> : !questionSession ? <Card className="p-8 text-center border-dashed">
                <p className="text-muted-foreground mb-4">
                  Nenhuma pergunta encontrada para este cliente.
                </p>
                <p className="text-sm text-muted-foreground">
                  As perguntas são geradas automaticamente ao criar uma estratégia.
                </p>
              </Card> : <div className="space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">Perguntas Guias</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Preencha as respostas para gerar um plano personalizado
                    </p>
                  </div>
                  {isSaving && <span className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                      Salvando...
                    </span>}
                </div>

                {/* Perguntas e Respostas */}
                <div className="space-y-6">
                  {Array.isArray(questionSession.questions) && questionSession.questions.length > 0 ? questionSession.questions.map((q: any, index: number) => {
              const questionId = q.id || `q_${index}`;
              const questionText = q.question || q.text || q;
              const questionType = q.type || 'long';
              const currentAnswer = answers[questionId] || '';
              return <Card key={questionId} className="p-6 hover:shadow-md transition-shadow">
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-3">
                                <Label htmlFor={questionId} className="text-base font-semibold">
                                  {questionText}
                                </Label>
                                {questionType === 'short' ? <Input id={questionId} value={currentAnswer} onChange={e => handleAnswerChange(questionId, e.target.value)} placeholder="Digite sua resposta..." className="w-full" /> : <Textarea id={questionId} value={currentAnswer} onChange={e => handleAnswerChange(questionId, e.target.value)} placeholder="Digite sua resposta..." className="w-full min-h-[120px] resize-y" />}
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

                {/* Botão Gerar Plano */}
                {Array.isArray(questionSession.questions) && questionSession.questions.length > 0 && <div className="flex justify-end pt-6 border-t">
                    <Button size="lg" className="gap-2">
                      <Sparkles className="h-5 w-5" />
                      Gerar Plano
                    </Button>
                  </div>}

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