import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';

interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}
export default function GenerateQuestions() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const { data: questionSession, isLoading: loadingSession } = useQuery({
    queryKey: ['question-session', selectedClient?.id, tenantId],
    queryFn: async () => {
      if (!selectedClient || !tenantId) return null;
      
      const { data, error } = await supabase
        .from('question_sessions')
        .select('*')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!selectedClient && !!tenantId
  });
  const handleClientSelected = (client: Client) => {
    setSelectedClient(client);
    setShowModal(false);
  };

  const handleBack = () => {
    navigate('/');
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <ClientSelectionModal 
        open={showModal} 
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open && !selectedClient) {
            navigate('/');
          }
        }} 
        onClientSelected={handleClientSelected} 
      />

      {selectedClient && (
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button variant="ghost" onClick={handleBack} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Perguntas Guias</h1>
              <p className="text-muted-foreground">
                Visualize as perguntas e respostas do cliente
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

            {loadingSession ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando perguntas e respostas...
              </div>
            ) : !questionSession ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-muted-foreground mb-4">
                  Nenhuma pergunta encontrada para este cliente.
                </p>
                <p className="text-sm text-muted-foreground">
                  As perguntas são geradas automaticamente ao criar uma estratégia.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Perguntas e Respostas */}
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold">Perguntas e Respostas</h3>
                  {Array.isArray(questionSession.questions) && questionSession.questions.length > 0 ? (
                    questionSession.questions.map((q: any, index: number) => {
                      const questionId = q.id || `q_${index}`;
                      const questionText = q.question || q.text || q;
                      const answer = questionSession.answers?.[questionId] || '';
                      
                      return (
                        <Card key={questionId} className="p-6">
                          <div className="space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold mb-2">{questionText}</h4>
                                {answer ? (
                                  <div className="p-4 bg-muted/50 rounded-md">
                                    <p className="text-sm whitespace-pre-wrap">{answer}</p>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">
                                    Sem resposta
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  ) : (
                    <Card className="p-6 text-center">
                      <p className="text-muted-foreground">
                        Nenhuma pergunta disponível
                      </p>
                    </Card>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Status: {questionSession.status === 'completed' ? '✅ Concluído' : '⏳ Em progresso'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em: {new Date(questionSession.updated_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}