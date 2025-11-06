import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

export default function GenerateQuestions() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
    if (!selectedStrategy) {
      toast.error('Selecione uma estratégia');
      return;
    }

    setIsGenerating(true);

    try {
      // TODO: Implementar geração de perguntas com IA
      toast.success('Perguntas geradas com sucesso!');
      // navigate para a próxima tela
    } catch (error) {
      console.error('Erro ao gerar perguntas:', error);
      toast.error('Erro ao gerar perguntas. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    if (selectedClient) {
      setSelectedClient(null);
      setSelectedStrategy(null);
    } else {
      navigate('/');
    }
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
    </div>
  );
}
