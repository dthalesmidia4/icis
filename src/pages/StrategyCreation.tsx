import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Save, Edit2, Trash2, FileQuestion, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useTenant } from '@/contexts/TenantContext';
import { useSelectedClient } from '@/contexts/SelectedClientContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';

export default function StrategyCreation() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [strategyText, setStrategyText] = useState('');
  const [observations, setObservations] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [existingStrategy, setExistingStrategy] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  useEffect(() => {
    if (!selectedClient) {
      toast.error('Nenhum cliente selecionado');
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  useEffect(() => {
    if (selectedClient && tenantId) {
      loadExistingStrategy();
    }
  }, [selectedClient, tenantId]);

  const loadExistingStrategy = async () => {
    if (!selectedClient || !tenantId) return;
    
    setIsLoadingStrategy(true);
    try {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingStrategy(data);
        setStrategyText(data.strategy_text);
        setObservations(data.observations || '');
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
          observations: observations,
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
          observations: observations,
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
    setObservations(existingStrategy.observations || '');
  };
  const handleBack = () => {
    navigate('/client-hub');
  };

  const handleDeleteStrategy = async () => {
    if (!existingStrategy) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('strategies')
        .delete()
        .eq('id', existingStrategy.id);

      if (error) throw error;

      toast.success('✅ Estratégia removida com sucesso!');
      
      // Resetar estado e voltar para hub
      setStrategyText('');
      setExistingStrategy(null);
      setIsEditMode(false);
      navigate('/client-hub');
    } catch (error) {
      console.error('Erro ao remover estratégia:', error);
      toast.error('Erro ao remover estratégia. Tente novamente.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (!selectedClient) return null;

  return <div className="min-h-screen bg-background">
      <ConfirmationModal open={showConfirmModal} onOpenChange={setShowConfirmModal} title="Substituir estratégia existente?" description="A estratégia anterior será substituída pela nova versão. Esta ação não pode ser desfeita. Deseja continuar?" onConfirm={handleSave} loading={isSaving} />

      <ConfirmationModal open={showDeleteModal} onOpenChange={setShowDeleteModal} title="Remover estratégia?" description="Esta ação não pode ser desfeita. A estratégia e todas as perguntas guias relacionadas serão removidas permanentemente. Deseja continuar?" onConfirm={handleDeleteStrategy} loading={isDeleting} />

      {/* Header Fixo */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-background border-b">
        <div className="container max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-3xl font-bold text-foreground">
                Estratégia Geral
              </h1>
            </div>
            <div className="flex gap-3">
              {existingStrategy && !isEditMode && (
                <Button variant="secondary" onClick={() => navigate('/plans')}>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Planejamentos
                </Button>
              )}
              
              {isEditMode && existingStrategy && (
                <Button variant="outline" onClick={handleCancelEdit}>
                  Cancelar Edição
                </Button>
              )}
              
              {isEditMode && (
                <Button onClick={handleSaveClick} disabled={isSaving || !strategyText.trim()} className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar Estratégia'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Container Principal */}
      <div className="container max-w-4xl mx-auto px-6 py-8 pt-32 h-screen overflow-y-auto">
        <div className="bg-card rounded-lg border shadow-sm p-8">
          <div className="space-y-8">
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

            <div className="space-y-2">
              <Label htmlFor="observations" className="text-base font-semibold">
                Observações e Restrições
              </Label>
              {isLoadingStrategy ? <Card>
                  <CardContent className="py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  </CardContent>
                </Card> : existingStrategy && !isEditMode ? observations ? <Card>
                  <CardContent className="py-4">
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed text-sm">
                      {observations}
                    </p>
                  </CardContent>
                </Card> : <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada</p> : <Textarea id="observations" placeholder="Adicione restrições específicas do cliente (ex: não publicar aos domingos, evitar temas polêmicos, priorizar tom formal, etc.)" value={observations} onChange={e => setObservations(e.target.value)} className="min-h-[120px] resize-y" />}
            </div>

            {isEditMode && existingStrategy && (
              <div className="pt-4">
                <Button variant="destructive" onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Remover Estratégia
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>;
}