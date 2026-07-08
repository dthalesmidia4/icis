import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { DemandaCard, DemandaItem } from "@/components/DemandaCard";
import { DemandReviewModal } from "@/components/DemandReviewModal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Package, AlertCircle, RefreshCw, Check, CheckCheck, Eye, Shield, Rocket, Pencil, ThumbsDown, Settings2 } from "lucide-react";
import PeriodConfigViewerModal from "@/components/PeriodConfigViewerModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { coerceDemandTypeKey, normalizeDemandTypeKey } from "@/lib/proceedDemand";

interface PeriodData {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  status: string;
  default_plan: any[];
  ultra_plan: any[];
}

interface CardItem extends DemandaItem {
  _index: number;
  _source: 'default' | 'ultra';
}

const ApproveCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [approvedIndexes, setApprovedIndexes] = useState<Set<number>>(new Set());
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [initialStatusId, setInitialStatusId] = useState<string | null>(null);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<'normal' | 'ultra'>('normal');
  const [reviewDemands, setReviewDemands] = useState<any[]>([]);

  // Edit period modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Period config viewer
  const [configViewerOpen, setConfigViewerOpen] = useState(false);

  // Edit card modal state
  const [editCardModalOpen, setEditCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [editCardTitle, setEditCardTitle] = useState('');
  const [editCardType, setEditCardType] = useState('');
  const [editCardChannel, setEditCardChannel] = useState('');
  const [editCardObjective, setEditCardObjective] = useState('');
  const [editCardContent, setEditCardContent] = useState('');
  const [editCardDate, setEditCardDate] = useState('');
  const [editCardSaving, setEditCardSaving] = useState(false);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  // No longer using localStorage for period persistence - always show most recent period with plans

  const fetchData = async () => {
    if (!selectedClient || !tenantId) return;
    setLoading(true);
    try {
      // Fetch pipeline + initial status
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .single();

      if (pipeline) {
        setPipelineId(pipeline.id);
        const { data: status } = await supabase
          .from('pipeline_statuses')
          .select('id')
          .eq('pipeline_id', pipeline.id)
          .eq('is_initial', true)
          .single();
        if (status) setInitialStatusId(status.id);
      }

      // Fetch latest periods with generated plans
      const { data: periods, error } = await supabase
        .from('period_plans')
        .select('id, period_title, period_start, period_end, status, default_plan, ultra_plan')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Pick the most recent period that has generated plans; fallback to latest overall
      let bestPeriod: PeriodData | null = null;
      if (periods && periods.length > 0) {
        const withPlans = periods.find(p => {
          const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
          const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
          return dp.length > 0 || up.length > 0;
        });
        bestPeriod = (withPlans || periods[0]) as PeriodData;
      }

      setPeriod(bestPeriod);

      if (bestPeriod) {
        const dp = Array.isArray(bestPeriod.default_plan) ? bestPeriod.default_plan : [];
        const up = Array.isArray(bestPeriod.ultra_plan) ? bestPeriod.ultra_plan : [];
        
        const allCards: CardItem[] = [
          ...dp.map((item: any, i: number) => ({ ...item, _index: i, _source: 'default' as const })),
          ...up.map((item: any, i: number) => ({ ...item, _index: dp.length + i, _source: 'ultra' as const })),
        ];
        setCards(allCards);

        // Check which cards are already saved as demands
        if (allCards.length > 0) {
          const { data: existingDemands } = await supabase
            .from('demands')
            .select('title')
            .eq('period_plan_id', bestPeriod.id)
            .eq('client_id', selectedClient.id);

          if (existingDemands) {
            const savedTitles = new Set(existingDemands.map(d => d.title));
            const alreadyApproved = new Set<number>();
            allCards.forEach(card => {
              const title = card.titulo || card.title || '';
              if (savedTitles.has(title)) {
                alreadyApproved.add(card._index);
              }
            });
            setApprovedIndexes(alreadyApproved);
          }
        }
      } else {
        setCards([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  // Fire-and-forget auto image generation for static posts and carousels
  const triggerAutoGenerate = useCallback((demandTitle: string, demandType: string | null, demandId: string) => {
    const tipo = (demandType || '').toLowerCase();
    const isStaticPost = tipo.includes('post');
    const isCarousel = tipo.includes('carrossel') || tipo.includes('carousel');
    if (!isStaticPost && !isCarousel) return;

    const functionName = isCarousel ? 'auto-generate-carousel' : 'auto-generate-post';
    const label = isCarousel ? 'carrossel' : 'imagem';

    console.log(`[AutoGen] Triggering ${functionName} for "${demandTitle}" (type: ${demandType})`);
    toast.info(`Gerando ${label} automaticamente para "${demandTitle}"...`, { duration: 5000 });

    supabase.functions.invoke(functionName, {
      body: { demandId, source: 'planned', minimalText: true },
    }).then(({ data, error }) => {
      if (error) {
        console.error('[AutoGen] Error:', error);
        toast.error(`Erro na geração automática de "${demandTitle}"`);
        return;
      }
      if (data?.skipped) {
        console.log('[AutoGen] Skipped:', data.reason);
        return;
      }
      if (data?.success) {
        const msg = isCarousel
          ? `${data.totalGenerated} slides gerados e anexados a "${demandTitle}"!`
          : `Imagem gerada e anexada a "${demandTitle}"!`;
        toast.success(msg);
      }
    }).catch(err => {
      console.error('[AutoGen] Exception:', err);
    });
  }, []);

  const handleApprove = useCallback(async (card: CardItem) => {
    if (!selectedClient || !tenantId || !pipelineId || !initialStatusId || !period) return;

    setApprovingIndex(card._index);
    try {
      const title = card.titulo || card.title || 'Sem título';
      const tipo = card.tipo || card.tipo_conteudo || card.type || null;
      const channel = card.canal || card.channel || null;
      const objetivo = card.objetivo || card.objective || null;
      const conteudo = card.conteudo || card.descricao || card.description || null;
      const instrucoes = card.instrucoes_de_producao || null;
      const cta = card.cta_recomendado || null;
      const dateStr = card.data_sugerida || card.suggested_date || card.date || null;

      const instructionParts = [instrucoes, cta ? `CTA: ${cta}` : ''].filter(Boolean);
      const explicitKey = coerceDemandTypeKey((card as any).demand_type_key || (card as any).type_key);
      const demandTypeKey = explicitKey ?? normalizeDemandTypeKey(tipo);

      const { data: insertedData, error } = await supabase.from('demands').insert({
        tenant_id: tenantId,
        client_id: selectedClient.id,
        pipeline_id: pipelineId,
        status_id: initialStatusId,
        period_plan_id: period.id,
        title,
        objective: objetivo,
        description: conteudo || null,
        instructions: instructionParts.join('\n\n') || null,
        publish_date: dateStr || null,
        channel,
        demand_type: tipo,
        demand_type_key: demandTypeKey,
        source: card._source === 'ultra' ? 'ultra_card' : 'card',
        observations: null,
      } as any).select('id').single();

      if (error) throw error;

      setApprovedIndexes(prev => new Set([...prev, card._index]));
      toast.success(`"${title}" aprovado e enviado ao Kanban!`);

      // Trigger auto image generation (fire-and-forget)
      if (insertedData?.id) {
        triggerAutoGenerate(title, tipo, insertedData.id);
      }
    } catch (error) {
      console.error('Error approving card:', error);
      toast.error("Erro ao aprovar card");
    } finally {
      setApprovingIndex(null);
    }
  }, [selectedClient, tenantId, pipelineId, initialStatusId, period, triggerAutoGenerate]);

  const handleApproveAll = async () => {
    const pending = cards.filter(c => !approvedIndexes.has(c._index));
    if (pending.length === 0) return;

    for (const card of pending) {
      await handleApprove(card);
    }
  };

  const handleReject = useCallback(async (card: CardItem) => {
    if (!period || !selectedClient) return;

    try {
      const isDefault = card._source === 'default';
      const planKey = isDefault ? 'default_plan' : 'ultra_plan';
      const plan = isDefault
        ? (Array.isArray(period.default_plan) ? [...period.default_plan] : [])
        : (Array.isArray(period.ultra_plan) ? [...period.ultra_plan] : []);

      const indexInPlan = isDefault ? card._index : card._index - (Array.isArray(period.default_plan) ? period.default_plan.length : 0);

      if (indexInPlan < 0 || indexInPlan >= plan.length) return;

      // Remove from plan
      const [removedCard] = plan.splice(indexInPlan, 1);

      // Add to rejected_plan
      const rejectedPlan = Array.isArray((period as any).rejected_plan) ? [...(period as any).rejected_plan] : [];
      rejectedPlan.push({
        ...removedCard,
        _originalSource: card._source,
        _rejectedAt: new Date().toISOString(),
      });

      const { error } = await supabase
        .from('period_plans')
        .update({
          [planKey]: plan as unknown as null,
          rejected_plan: rejectedPlan as unknown as null,
        } as any)
        .eq('id', period.id);

      if (error) throw error;

      toast.success(`Card reprovado e movido para reavaliação`);
      fetchData();
    } catch (error) {
      console.error('Error rejecting card:', error);
      toast.error("Erro ao reprovar card");
    }
  }, [period, selectedClient]);

  // Open review modal for a specific plan type
  const handleOpenReview = (mode: 'normal' | 'ultra') => {
    if (!period) return;
    const planData = mode === 'normal' 
      ? (Array.isArray(period.default_plan) ? period.default_plan : [])
      : (Array.isArray(period.ultra_plan) ? period.ultra_plan : []);
    setReviewMode(mode);
    setReviewDemands(planData);
    setReviewModalOpen(true);
  };

  // Handle review confirm - update the JSON plan with selected items
  const handleReviewConfirm = async (selectedDemands: any[], _smartSelections: any[]) => {
    setReviewModalOpen(false);
    if (!period) return;

    try {
      const field = reviewMode === 'normal' ? 'default_plan' : 'ultra_plan';
      await supabase.from('period_plans').update({
        [field]: selectedDemands as unknown as null
      } as any).eq('id', period.id);

      toast.success(`${selectedDemands.length} demandas ${reviewMode === 'normal' ? 'normais' : 'ultra'} atualizadas!`);
      fetchData(); // Reload to reflect changes
    } catch (error) {
      console.error('Error updating plan:', error);
      toast.error('Erro ao atualizar demandas');
    }
  };

  if (!isInitialized || !selectedClient) return null;

  const handleOpenEditPeriod = () => {
    if (!period) return;
    setEditTitle(period.period_title);
    setEditStart(period.period_start);
    setEditEnd(period.period_end);
    setEditModalOpen(true);
  };

  const handleOpenEditCard = (card: CardItem) => {
    setEditingCard(card);
    setEditCardTitle(card.titulo || card.title || '');
    setEditCardType(card.tipo || card.tipo_conteudo || card.type || '');
    setEditCardChannel(card.canal || card.channel || '');
    setEditCardObjective(card.objetivo || card.objective || '');
    setEditCardContent(card.conteudo || card.descricao || card.description || '');
    setEditCardDate(card.data_sugerida || card.suggested_date || card.date || '');
    setEditCardModalOpen(true);
  };

  const handleSaveEditCard = async () => {
    if (!period || !editingCard) return;
    setEditCardSaving(true);
    try {
      const isDefault = editingCard._source === 'default';
      const planKey = isDefault ? 'default_plan' : 'ultra_plan';
      const plan = isDefault
        ? (Array.isArray(period.default_plan) ? [...period.default_plan] : [])
        : (Array.isArray(period.ultra_plan) ? [...period.ultra_plan] : []);

      const indexInPlan = isDefault ? editingCard._index : editingCard._index - (Array.isArray(period.default_plan) ? period.default_plan.length : 0);

      if (indexInPlan >= 0 && indexInPlan < plan.length) {
        const item = { ...plan[indexInPlan] };
        // Update all possible key variants
        if ('titulo' in item) item.titulo = editCardTitle;
        else item.title = editCardTitle;
        if ('tipo' in item) item.tipo = editCardType;
        else if ('tipo_conteudo' in item) item.tipo_conteudo = editCardType;
        else item.type = editCardType;
        if ('canal' in item) item.canal = editCardChannel;
        else item.channel = editCardChannel;
        if ('objetivo' in item) item.objetivo = editCardObjective;
        else item.objective = editCardObjective;
        if ('conteudo' in item) item.conteudo = editCardContent;
        else if ('descricao' in item) item.descricao = editCardContent;
        else item.description = editCardContent;
        if ('data_sugerida' in item) item.data_sugerida = editCardDate;
        else if ('suggested_date' in item) item.suggested_date = editCardDate;
        else item.date = editCardDate;

        plan[indexInPlan] = item;

        const { error } = await supabase.from('period_plans').update({
          [planKey]: plan as unknown as null,
        } as any).eq('id', period.id);

        if (error) throw error;

        // Update local state
        const updatedPeriod = { ...period, [planKey]: plan };
        setPeriod(updatedPeriod as PeriodData);
        fetchData();
        setEditCardModalOpen(false);
        toast.success("Card atualizado!");
      }
    } catch (error) {
      console.error('Error updating card:', error);
      toast.error("Erro ao atualizar card");
    } finally {
      setEditCardSaving(false);
    }
  };

  const handleSaveEditPeriod = async () => {
    if (!period || !editTitle.trim() || !editStart || !editEnd) {
      toast.error("Preencha todos os campos");
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase.from('period_plans').update({
        period_title: editTitle.trim(),
        period_start: editStart,
        period_end: editEnd,
      }).eq('id', period.id);
      if (error) throw error;
      setPeriod({ ...period, period_title: editTitle.trim(), period_start: editStart, period_end: editEnd });
      setEditModalOpen(false);
      toast.success("Período atualizado!");
    } catch (error) {
      console.error('Error updating period:', error);
      toast.error("Erro ao atualizar período");
    } finally {
      setEditSaving(false);
    }
  };

  const displayName = selectedClient.fantasy_name || selectedClient.name;
  const pendingCount = cards.filter(c => !approvedIndexes.has(c._index)).length;
  const approvedCount = approvedIndexes.size;

  const defaultCards = cards.filter(c => c._source === 'default');
  const ultraCards = cards.filter(c => c._source === 'ultra');
  const defaultPending = defaultCards.filter(c => !approvedIndexes.has(c._index)).length;
  const ultraPending = ultraCards.filter(c => !approvedIndexes.has(c._index)).length;

  const formatDateStr = (d: string) => {
    try {
      return format(new Date(d + 'T12:00:00'), "dd MMM yyyy", { locale: ptBR });
    } catch {
      return d;
    }
  };

  return (
    <div className="pb-8">
      <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <PageHeader
          title="Aprovar Produção"
          subtitle={`Cards gerados para ${displayName}`}
          backTo="/client-hub"
          actions={[
            ...(pendingCount > 0 ? [{
              label: `Aprovar Todos (${pendingCount})`,
              onClick: handleApproveAll,
              icon: <CheckCheck className="w-4 h-4" />,
              variant: "default" as const,
            }] : []),
            {
              label: "Atualizar",
              onClick: fetchData,
              icon: <RefreshCw className="w-4 h-4" />,
              variant: "outline" as const,
            }
          ]}
        />

        {loading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : !period || cards.length === 0 ? (
          <Card className="p-8 text-center mt-6">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum card gerado</h3>
            <p className="text-muted-foreground mb-4">
              Nenhum período com cards gerados foi encontrado. Gere um novo período primeiro.
            </p>
            <Button onClick={() => navigate('/plan-period')}>
              Planejar Período
            </Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Period header */}
            <Card className="p-4 sm:p-6 border-primary/20 bg-primary/5 relative">
              <div className="flex items-center justify-center gap-3 flex-wrap pr-10">
                <CalendarDays className="w-5 h-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-bold">{period.period_title}</h2>
                <span className="text-xl sm:text-2xl text-muted-foreground">
                  {formatDateStr(period.period_start)} — {formatDateStr(period.period_end)}
                </span>
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Ver configurações respondidas"
                  onClick={() => setConfigViewerOpen(true)}
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenEditPeriod}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            <PeriodConfigViewerModal
              open={configViewerOpen}
              onOpenChange={setConfigViewerOpen}
              periodId={period.id}
            />

            {/* Review buttons */}
            <div className="flex flex-wrap gap-3">
              {defaultCards.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => handleOpenReview('normal')}
                  className="gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Revisar Demandas Normais ({defaultPending}/{defaultCards.length})
                </Button>
              )}
              {ultraCards.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => handleOpenReview('ultra')}
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Rocket className="w-4 h-4" />
                  Revisar Demandas Ultra ({ultraCards.length})
                </Button>
              )}
            </div>

            {/* Cards list */}
            <div className="space-y-4">
              {/* Default cards section */}
              {defaultCards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Demandas Normais ({defaultCards.length})
                  </h3>
                  <div className="space-y-3">
                    {defaultCards.map((card) => {
                      const isApproved = approvedIndexes.has(card._index);
                      const isApproving = approvingIndex === card._index;
                      return (
                        <div
                          key={card._index}
                          className={cn(
                            "flex flex-col md:flex-row md:items-stretch gap-3",
                            isApproved && "opacity-60"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <DemandaCard demanda={card} variant="normal" />
                          </div>
                          <div className="flex flex-row md:flex-col items-stretch justify-end gap-2 shrink-0 md:w-44">
                            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={(e) => { e.stopPropagation(); handleOpenEditCard(card); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {isApproved ? (
                              <Badge variant="default" className="bg-green-600 text-sm py-1 px-3 flex items-center justify-center flex-1 md:flex-none">
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Aprovado
                              </Badge>
                            ) : (
                              <>
                                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleReject(card); }} className="gap-1 flex-1 md:flex-none">
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                  Reprovar
                                </Button>
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApprove(card); }} disabled={isApproving} className="flex-1 md:flex-none">
                                  {isApproving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                  Aprovar Card
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ultra cards section */}
              {ultraCards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Demandas Ultra ({ultraCards.length})
                  </h3>
                  <div className="space-y-3">
                    {ultraCards.map((card) => {
                      const isApproved = approvedIndexes.has(card._index);
                      const isApproving = approvingIndex === card._index;
                      return (
                        <div
                          key={card._index}
                          className={cn(
                            "flex flex-col md:flex-row md:items-stretch gap-3",
                            isApproved && "opacity-60"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <DemandaCard demanda={card} variant="ultra" />
                          </div>
                          <div className="flex flex-row md:flex-col items-stretch justify-end gap-2 shrink-0 md:w-44">
                            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={(e) => { e.stopPropagation(); handleOpenEditCard(card); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {isApproved ? (
                              <Badge variant="default" className="bg-green-600 text-sm py-1 px-3 flex items-center justify-center flex-1 md:flex-none">
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Aprovado
                              </Badge>
                            ) : (
                              <>
                                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleReject(card); }} className="gap-1 flex-1 md:flex-none">
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                  Reprovar
                                </Button>
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApprove(card); }} disabled={isApproving} className="flex-1 md:flex-none">
                                  {isApproving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                  Aprovar Card
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review Modal */}
        <DemandReviewModal
          open={reviewModalOpen}
          onOpenChange={setReviewModalOpen}
          mode={reviewMode}
          demands={reviewDemands}
          onConfirm={handleReviewConfirm}
          onRegenerate={() => {}}
          hideSmartSuggestions={true}
          confirmLabel={`Confirmar Seleção (${reviewDemands.length})`}
        />

        {/* Edit Period Modal */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Período</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Período</label>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Início</label>
                  <Input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Fim</label>
                  <Input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveEditPeriod} disabled={editSaving}>
                {editSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Card Modal */}
        <Dialog open={editCardModalOpen} onOpenChange={setEditCardModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Card</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <Input value={editCardTitle} onChange={e => setEditCardTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo</label>
                  <Input value={editCardType} onChange={e => setEditCardType(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal</label>
                  <Input value={editCardChannel} onChange={e => setEditCardChannel(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Objetivo</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                  value={editCardObjective}
                  onChange={e => setEditCardObjective(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Conteúdo</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px]"
                  value={editCardContent}
                  onChange={e => setEditCardContent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Sugerida</label>
                <Input value={editCardDate} onChange={e => setEditCardDate(e.target.value)} placeholder="ex: 2026-03-15" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCardModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveEditCard} disabled={editCardSaving}>
                {editCardSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ApproveCards;