import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Save, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}

export default function StrategyCreation() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [strategyText, setStrategyText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  console.log('StrategyCreation - selectedClient:', selectedClient);

  useEffect(() => {
    if (!selectedClient) {
      setShowModal(true);
    }
  }, [selectedClient]);

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

    try {
      const { error } = await supabase.from('strategies').insert({
        company_id: selectedClient.id,
        tenant_id: tenantId,
        strategy_text: strategyText,
        status: 'Em elaboração',
      });

      if (error) throw error;

      toast.success('✅ Estratégia criada com sucesso!');
      navigate('/');
    } catch (error) {
      console.error('Erro ao salvar estratégia:', error);
      toast.error('Erro ao salvar estratégia. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (selectedClient) {
      setSelectedClient(null);
      setStrategyText('');
    } else {
      navigate('/');
    }
  };

  const handleGenerateQuestions = () => {
    if (!strategyText.trim()) {
      toast.error('Por favor, descreva a estratégia primeiro');
      return;
    }
    // TODO: Implementar geração de perguntas
    toast.info('Funcionalidade em desenvolvimento');
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
              <h1 className="text-3xl font-bold mb-2">Criar Estratégia</h1>
              <p className="text-muted-foreground">
                Defina uma estratégia de marketing para o cliente selecionado.
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
                <Label htmlFor="strategy" className="text-base font-semibold">
                  Descreva a estratégia principal deste cliente *
                </Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Detalhe os objetivos, público-alvo, canais e ações principais
                </p>
              </div>
              
              <Textarea
                id="strategy"
                placeholder="Exemplo: Aumentar presença digital através de conteúdo educativo nas redes sociais, focando em LinkedIn e Instagram. Público-alvo: profissionais de 25-45 anos interessados em tecnologia..."
                value={strategyText}
                onChange={(e) => setStrategyText(e.target.value)}
                className="min-h-[300px] resize-y"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={handleGenerateQuestions}
                disabled={isSaving || !strategyText.trim()}
              >
                <FileQuestion className="h-4 w-4 mr-2" />
                Gerar perguntas para o cronograma
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
          </div>
        </div>
      )}
    </div>
  );
}
