import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Save, Edit2, Trash2, FileQuestion, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ClientSelectionModal } from '@/components/ClientSelectionModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
interface Client {
  id: string;
  name: string;
  cnpj_cpf: string;
  email: string;
}
export default function StrategyCreation() {
  const navigate = useNavigate();
  const {
    tenantId
  } = useTenant();
  const [showModal, setShowModal] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [strategyText, setStrategyText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [existingStrategy, setExistingStrategy] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  useEffect(() => {
    if (!selectedClient && !showModal) {
      // Se o modal foi fechado sem selecionar um cliente, voltar ao hub
      navigate('/');
    }
  }, [showModal, selectedClient, navigate]);
  const handleClientSelected = async (client: Client) => {
    setSelectedClient(client);
    setShowModal(false);

    // Carregar estratégia existente
    setIsLoadingStrategy(true);
    try {
      const {
        data,
        error
      } = await supabase.from('strategies').select('*').eq('company_id', client.id).eq('tenant_id', tenantId).order('created_at', {
        ascending: false
      }).limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setExistingStrategy(data);
        setStrategyText(data.strategy_text);
        setIsEditMode(false);
      } else {
        setIsEditMode(true);
      }
    } catch (error) {
      console.error('Erro ao carregar estratégia:', error);
      toast.error('Erro ao carregar estratégia existente');
      setIsEditMode(true);
    } finally {
      setIsLoadingStrategy(false);
    }
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
      toast.info('Salvando estratégia...');
      let strategyData;
      if (existingStrategy) {
        // Atualizar estratégia existente
        const {
          data,
          error: updateError
        } = await supabase.from('strategies').update({
          strategy_text: strategyText,
          updated_at: new Date().toISOString()
        }).eq('id', existingStrategy.id).select().single();
        if (updateError) throw updateError;
        strategyData = data;
      } else {
        // Criar nova estratégia
        const {
          data,
          error: insertError
        } = await supabase.from('strategies').insert({
          company_id: selectedClient.id,
          tenant_id: tenantId,
          strategy_text: strategyText,
          status: 'Em elaboração'
        }).select().single();
        if (insertError) throw insertError;
        strategyData = data;
      }
      toast.success('✅ Estratégia salva com sucesso!');

      // Gerar perguntas automaticamente em background
      toast.info('🤖 Gerando perguntas guias com base na estratégia. Isso pode levar alguns segundos…', {
        duration: 5000
      });
      supabase.functions.invoke('generate-questions', {
        body: {
          companyId: selectedClient.id,
          strategyId: strategyData.id,
          tenantId: tenantId
        }
      }).then(({
        data: questionData,
        error: questionError
      }) => {
        if (questionError || questionData?.error) {
          console.error('Erro ao gerar perguntas:', questionError || questionData.error);
          toast.error('⚠️ Não foi possível gerar as perguntas guias. Tente novamente mais tarde.');
        } else {
          toast.success('✅ Perguntas guias geradas com sucesso!');
        }
      });
      navigate('/questions', {
        state: {
          companyId: selectedClient.id,
          strategyId: strategyData.id,
          companyName: selectedClient.name,
          companyCnpjCpf: selectedClient.cnpj_cpf
        }
      });
    } catch (error) {
      console.error('Erro ao salvar estratégia:', error);
      toast.error('Erro ao salvar estratégia. Tente novamente.');
    } finally {
      setIsSaving(false);
      setShowConfirmModal(false);
    }
  };
  const handleSaveClick = () => {
    if (existingStrategy) {
      setShowConfirmModal(true);
    } else {
      handleSave();
    }
  };
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setStrategyText(existingStrategy.strategy_text);
  };
  const handleBack = () => {
    if (selectedClient) {
      setSelectedClient(null);
      setStrategyText('');
      setExistingStrategy(null);
      setIsEditMode(false);
      setShowModal(true);
    } else {
      navigate('/');
    }
  };
  const handleDeleteStrategy = async () => {
    if (!existingStrategy) return;
    setIsDeleting(true);
    try {
      // Deletar a estratégia
      const {
        error
      } = await supabase.from('strategies').delete().eq('id', existingStrategy.id);
      if (error) throw error;
      toast.success('✅ Estratégia removida com sucesso!');

      // Resetar estado e voltar para seleção de cliente
      setSelectedClient(null);
      setStrategyText('');
      setExistingStrategy(null);
      setIsEditMode(false);
      setShowModal(true);
    } catch (error) {
      console.error('Erro ao remover estratégia:', error);
      toast.error('Erro ao remover estratégia. Tente novamente.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };
  return <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <ClientSelectionModal open={showModal} onOpenChange={setShowModal} onClientSelected={handleClientSelected} />
      
      <ConfirmationModal open={showConfirmModal} onOpenChange={setShowConfirmModal} title="Substituir estratégia existente?" description="A estratégia anterior será substituída pela nova versão. Esta ação não pode ser desfeita. Deseja continuar?" onConfirm={handleSave} loading={isSaving} />

      

      <ConfirmationModal open={showDeleteModal} onOpenChange={setShowDeleteModal} title="Remover estratégia?" description="Esta ação não pode ser desfeita. A estratégia e todas as perguntas guias relacionadas serão removidas permanentemente. Deseja continuar?" onConfirm={handleDeleteStrategy} loading={isDeleting} />

      {selectedClient && <div className="container max-w-4xl mx-auto py-8 px-4">
          <Button variant="ghost" onClick={handleBack} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg shadow-lg p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Estratégia</h1>
              
            </div>

            <div className="p-6 bg-accent/50 rounded-lg border">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold mb-1">
                      {selectedClient.name}
                    </h3>
                    {existingStrategy && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate('/generate-questions', {
                          state: {
                            companyId: selectedClient.id,
                            strategyId: existingStrategy.id,
                            companyName: selectedClient.name,
                            companyCnpjCpf: selectedClient.cnpj_cpf
                          }
                        })}
                        className="gap-2"
                      >
                        <FileQuestion className="h-4 w-4" />
                        Perguntas Guias
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    CNPJ/CPF: {selectedClient.cnpj_cpf}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="strategy" className="text-base font-semibold">
                  {existingStrategy ? 'Estratégia do Cliente' : 'Descreva a estratégia principal deste cliente *'}
                </Label>
                {existingStrategy && !isEditMode && <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)} className="gap-2">
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </Button>}
              </div>
              
              {isLoadingStrategy ? <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-sm text-muted-foreground">Carregando estratégia...</p>
                    </div>
                  </CardContent>
                </Card> : existingStrategy && !isEditMode ? <Card>
                  <CardContent className="py-6">
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                      {strategyText}
                    </p>
                  </CardContent>
                </Card> : <Textarea id="strategy" placeholder="Exemplo: Aumentar presença digital através de conteúdo educativo nas redes sociais, focando em LinkedIn e Instagram. Público-alvo: profissionais de 25-45 anos interessados em tecnologia..." value={strategyText} onChange={e => setStrategyText(e.target.value)} className="min-h-[300px] resize-y" />}
            </div>

            <div className="flex justify-between items-center gap-3 pt-4">
              <div>
                {isEditMode && existingStrategy && <Button variant="destructive" onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Remover Estratégia
                  </Button>}
              </div>

              <div className="flex gap-3">
                {existingStrategy && !isEditMode && <Button variant="secondary" onClick={() => navigate('/plans')}>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Ver Plano
                  </Button>}
                
                {isEditMode && existingStrategy && <Button variant="outline" onClick={handleCancelEdit}>
                    Cancelar Edição
                  </Button>}
                
                {isEditMode && <Button onClick={handleSaveClick} disabled={isSaving || !strategyText.trim()} className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Salvando...' : 'Salvar Estratégia'}
                  </Button>}
              </div>
            </div>
          </div>
        </div>}
    </div>;
}