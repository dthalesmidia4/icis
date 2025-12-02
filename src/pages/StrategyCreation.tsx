import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Edit2, Trash2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useTenant } from '@/contexts/TenantContext';
import { useSelectedClient } from '@/contexts/SelectedClientContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';

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
      
      // Recarregar estratégia e voltar para modo visualização
      setExistingStrategy(strategyData);
      setIsEditMode(false);
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

  // Parse strategy text into sections based on ## headings
  const parseStrategySections = (text: string) => {
    if (!text) return [];
    
    const sections: { title: string; content: string }[] = [];
    const lines = text.split('\n');
    let currentSection: { title: string; content: string } | null = null;
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: line.replace('## ', '').trim(),
          content: ''
        };
      } else if (currentSection) {
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      } else {
        // Content before first ## heading
        if (!sections.length && line.trim()) {
          if (!currentSection) {
            currentSection = { title: 'Visão Geral', content: '' };
          }
          currentSection.content += (currentSection.content ? '\n' : '') + line;
        }
      }
    }
    
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  };

  if (!selectedClient) return null;

  const strategySections = parseStrategySections(strategyText);

  return <div className="flex flex-col min-h-screen bg-background">
      <ConfirmationModal open={showConfirmModal} onOpenChange={setShowConfirmModal} title="Substituir estratégia existente?" description="A estratégia anterior será substituída pela nova versão, impactando no planejamento e nas demandas. Deseja continuar?" onConfirm={handleSave} loading={isSaving} />

      <ConfirmationModal open={showDeleteModal} onOpenChange={setShowDeleteModal} title="Remover estratégia?" description="Esta ação não pode ser desfeita. A estratégia e todas as perguntas guias relacionadas serão removidas permanentemente. Deseja continuar?" onConfirm={handleDeleteStrategy} loading={isDeleting} />

      <PageHeader
        title="Estratégia Geral"
        subtitle={selectedClient.fantasy_name || selectedClient.name}
        onBack={handleBack}
        actions={[
          ...(existingStrategy && !isEditMode ? [{
            label: 'Planejar Período',
            onClick: () => navigate('/plan-period'),
            icon: <CalendarDays className="h-4 w-4" />,
            variant: 'secondary' as const,
          }] : []),
          ...(isEditMode && existingStrategy ? [{
            label: 'Cancelar Edição',
            onClick: handleCancelEdit,
            variant: 'outline' as const,
          }] : []),
          ...(isEditMode ? [{
            label: isSaving ? 'Salvando...' : 'Salvar Estratégia',
            onClick: handleSaveClick,
            icon: <Save className="h-4 w-4" />,
            disabled: isSaving || !strategyText.trim(),
            loading: isSaving,
            className: 'bg-gradient-to-r from-primary to-secondary hover:opacity-90',
          }] : []),
        ]}
      />

      {/* Container Principal */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-4xl mx-auto px-6 py-8 space-y-6">
          
          {isLoadingStrategy ? (
            <Card className="p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Carregando estratégia...</p>
              </div>
            </Card>
          ) : existingStrategy && !isEditMode ? (
            <>
              {/* Header Card with Edit Button */}
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Estratégia do Cliente</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Visualize e edite a estratégia principal de marketing
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)} className="gap-2">
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </Button>
                </div>
              </Card>

              {/* Strategy Content - Split by sections */}
              {strategySections.length > 0 ? (
                strategySections.map((section, index) => (
                  <Card key={index} className="p-6">
                    <h4 className="text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
                      {section.title}
                    </h4>
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed text-sm">
                      {section.content.trim()}
                    </p>
                  </Card>
                ))
              ) : (
                <Card className="p-6">
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {strategyText}
                  </p>
                </Card>
              )}

              {/* Observations Card */}
              <Card className="p-6">
                <h4 className="text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
                  Observações e Restrições
                </h4>
                {observations ? (
                  <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed text-sm">
                    {observations}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Nenhuma observação registrada
                  </p>
                )}
              </Card>
            </>
          ) : (
            <>
              {/* Edit Mode - Strategy Input */}
              <Card className="p-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="strategy" className="text-base font-semibold">
                      {existingStrategy ? 'Editar Estratégia' : 'Descreva a estratégia principal deste cliente *'}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">
                      Use ## para criar seções (ex: ## Objetivos, ## Público-Alvo)
                    </p>
                  </div>
                  <Textarea
                    id="strategy"
                    placeholder="Exemplo:&#10;## Objetivos&#10;Aumentar presença digital através de conteúdo educativo nas redes sociais...&#10;&#10;## Público-Alvo&#10;Profissionais de 25-45 anos interessados em tecnologia..."
                    value={strategyText}
                    onChange={e => setStrategyText(e.target.value)}
                    className="min-h-[300px] resize-y"
                  />
                </div>
              </Card>

              {/* Edit Mode - Observations Input */}
              <Card className="p-6">
                <div className="space-y-4">
                  <Label htmlFor="observations" className="text-base font-semibold">
                    Observações e Restrições
                  </Label>
                  <Textarea
                    id="observations"
                    placeholder="Adicione restrições específicas do cliente (ex: não publicar aos domingos, evitar temas polêmicos, priorizar tom formal, etc.)"
                    value={observations}
                    onChange={e => setObservations(e.target.value)}
                    className="min-h-[120px] resize-y"
                  />
                </div>
              </Card>

              {/* Delete Button - Only in edit mode with existing strategy */}
              {isEditMode && existingStrategy && (
                <Card className="p-6 border-destructive/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-destructive">Zona de Perigo</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Remover a estratégia permanentemente
                      </p>
                    </div>
                    <Button variant="destructive" onClick={() => setShowDeleteModal(true)} disabled={isDeleting} className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Remover Estratégia
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>;
}