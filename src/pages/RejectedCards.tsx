import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { DemandaCard, DemandaItem } from "@/components/DemandaCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Check, Loader2, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ContentRequirementsDiffModal from "@/components/ContentRequirementsDiffModal";
import { cn } from "@/lib/utils";
import { coerceDemandTypeKey, normalizeDemandTypeKey } from "@/lib/proceedDemand";
import { useRealtimePeriodPlans, useRealtimeDemands, useDebouncedCallback } from "@/hooks/realtime";

interface PeriodData {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  default_plan: any[];
  ultra_plan: any[];
  rejected_plan: any[];
}

interface RejectedCardItem extends DemandaItem {
  _index: number;
  _originalSource: string;
  _rejectedAt?: string;
  _periodId: string;
  _periodTitle?: string;
  _rejectedIndex: number;
}


const RejectedCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodData[]>([]);
  const [cards, setCards] = useState<RejectedCardItem[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [initialStatusId, setInitialStatusId] = useState<string | null>(null);
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [approvedIndexes, setApprovedIndexes] = useState<Set<number>>(new Set());


  // Reevaluate modal
  const [reevalModalOpen, setReevalModalOpen] = useState(false);
  const [reevalReason, setReevalReason] = useState('');
  const [reevalCardIndex, setReevalCardIndex] = useState<number | null>(null);
  const [reevalLoading, setReevalLoading] = useState(false);

  // Content requirements diff modal
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffSaving, setDiffSaving] = useState(false);
  const [diffCurrent, setDiffCurrent] = useState('');
  const [diffProposed, setDiffProposed] = useState('');
  const [diffMode, setDiffMode] = useState<'meaningful' | 'ambiguous'>('meaningful');
  const [diffReasoning, setDiffReasoning] = useState('');
  const [pendingReeval, setPendingReeval] = useState<{ updatedCard: any; cardIndex: number } | null>(null);

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

      const { data: periodsData, error } = await supabase
        .from('period_plans')
        .select('id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan, operational_status')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalizedAll: (PeriodData & { operational_status?: string })[] = (periodsData || []).map((p: any) => ({
        ...p,
        default_plan: Array.isArray(p.default_plan) ? p.default_plan : [],
        ultra_plan: Array.isArray(p.ultra_plan) ? p.ultra_plan : [],
        rejected_plan: Array.isArray(p.rejected_plan) ? p.rejected_plan : [],
      }));

      // Escopo estrito: somente o período atual (em_andamento) do cliente.
      const currentPeriod = normalizedAll.find((p) => p.operational_status === 'em_andamento') || null;
      const normalized: PeriodData[] = currentPeriod ? [currentPeriod] : [];

      setPeriods(normalized);

      const allRejected: RejectedCardItem[] = [];
      let globalIdx = 0;
      for (const p of normalized) {
        p.rejected_plan.forEach((item: any, i: number) => {
          allRejected.push({
            ...item,
            _index: globalIdx++,
            _originalSource: item._originalSource || 'default',
            _rejectedAt: item._rejectedAt,
            _periodId: p.id,
            _periodTitle: p.period_title,
            _rejectedIndex: i,
          });
        });
      }
      setCards(allRejected);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };


  const handleOpenReevaluate = (index: number) => {
    setReevalCardIndex(index);
    setReevalReason('');
    setReevalModalOpen(true);
  };

  const persistReevaluation = async (
    cardIndex: number,
    updatedCard: any,
    requirementsToApply: string | null,
  ) => {
    if (!selectedClient || !tenantId) return;
    const card = cards[cardIndex];
    if (!card) return;
    const period = periods.find(p => p.id === card._periodId);
    if (!period) return;

    const updatedRejected = [...(period.rejected_plan || [])];
    updatedRejected[card._rejectedIndex] = {
      ...updatedRejected[card._rejectedIndex],
      ...updatedCard,
      _originalSource: card._originalSource,
      _rejectedAt: card._rejectedAt,
      _reevaluatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('period_plans')
      .update({ rejected_plan: updatedRejected as unknown as null })
      .eq('id', period.id);
    if (updateError) throw updateError;

    if (requirementsToApply !== null) {
      console.log('[Reeval] Persisting content_requirements update', {
        clientId: selectedClient.id,
        previousLen: (selectedClient as any)?.content_requirements?.length ?? 'unknown',
        newLen: requirementsToApply.length,
        preview: requirementsToApply.slice(0, 200),
      });
      const { error: reqError } = await supabase
        .from('tenant_companies')
        .update({ content_requirements: requirementsToApply } as any)
        .eq('id', selectedClient.id);
      if (reqError) {
        console.error('[Reeval] content_requirements update FAILED:', reqError);
        throw reqError;
      }
      console.log('[Reeval] content_requirements update OK');
    }

    const newPeriods = periods.map(p => p.id === period.id ? { ...p, rejected_plan: updatedRejected } : p);
    setPeriods(newPeriods);
    const newCards: RejectedCardItem[] = [];
    let g = 0;
    for (const p of newPeriods) {
      p.rejected_plan.forEach((item: any, i: number) => {
        newCards.push({
          ...item,
          _index: g++,
          _originalSource: item._originalSource || 'default',
          _rejectedAt: item._rejectedAt,
          _periodId: p.id,
          _periodTitle: p.period_title,
          _rejectedIndex: i,
        });
      });
    }
    setCards(newCards);
  };

  const handleReevaluate = async () => {
    if (reevalCardIndex === null || !selectedClient || !tenantId) return;

    if (!reevalReason.trim()) {
      toast.error("Descreva o motivo da reavaliação");
      return;
    }

    setReevalLoading(true);
    try {
      const card = cards[reevalCardIndex];

      const { data, error } = await supabase.functions.invoke('reevaluate-card', {
        body: {
          card,
          reason: reevalReason.trim(),
          clientId: selectedClient.id,
          tenantId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.updatedCard) {
        const proposal = data.requirementsProposal || { current: '', proposed: '', additions: '' };
        const learningStatus: 'meaningful' | 'none' | 'ambiguous' =
          data.learningStatus === 'meaningful' || data.learningStatus === 'none' || data.learningStatus === 'ambiguous'
            ? data.learningStatus
            : 'ambiguous';
        const cardIndex = reevalCardIndex;

        console.log('[Reeval] response:', {
          learningStatus,
          reasoning: data.learningReasoning,
          additionsLen: (proposal.additions || '').length,
          currentLen: (proposal.current || '').length,
          proposedLen: (proposal.proposed || '').length,
        });

        setDiffReasoning(data.learningReasoning || '');

        if (learningStatus === 'meaningful') {
          setPendingReeval({ updatedCard: data.updatedCard, cardIndex });
          setDiffCurrent(proposal.current || '');
          setDiffProposed(proposal.proposed || proposal.current || '');
          setDiffMode('meaningful');
          setReevalModalOpen(false);
          setDiffOpen(true);
        } else if (learningStatus === 'none') {
          await persistReevaluation(cardIndex, data.updatedCard, null);
          setReevalModalOpen(false);
          toast.success("Card reavaliado com sucesso!");
        } else {
          setPendingReeval({ updatedCard: data.updatedCard, cardIndex });
          setDiffCurrent(proposal.current || '');
          setDiffProposed(proposal.current || '');
          setDiffMode('ambiguous');
          setReevalModalOpen(false);
          setDiffOpen(true);
          toast.info("A IA não identificou regra nova clara. Edite manualmente se quiser registrar.");
        }
      }
    } catch (error: any) {
      console.error('Error reevaluating:', error);
      toast.error(error.message || "Erro ao reavaliar card");
    } finally {
      setReevalLoading(false);
    }
  };

  const handleDiffConfirm = async (action: 'apply' | 'skip', finalRequirements?: string) => {
    if (!pendingReeval) return;
    setDiffSaving(true);
    try {
      await persistReevaluation(
        pendingReeval.cardIndex,
        pendingReeval.updatedCard,
        action === 'apply' ? (finalRequirements ?? '').trim() : null,
      );
      setDiffOpen(false);
      setPendingReeval(null);
      toast.success(
        action === 'apply'
          ? 'Card reavaliado e exigências de conteúdo atualizadas!'
          : 'Card reavaliado com sucesso!',
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao salvar reavaliação');
    } finally {
      setDiffSaving(false);
    }
  };

  // Fire-and-forget auto image generation for static posts and carousels
  const triggerAutoGenerate = (demandTitle: string, demandType: string | null, demandId: string) => {
    const tipo = (demandType || '').toLowerCase();
    const isStaticPost = tipo.includes('post');
    const isCarousel = tipo.includes('carrossel') || tipo.includes('carousel');
    if (!isStaticPost && !isCarousel) return;

    const functionName = isCarousel ? 'auto-generate-carousel' : 'auto-generate-post';
    const label = isCarousel ? 'carrossel' : 'imagem';

    console.log(`[AutoGen] Triggering ${functionName} for "${demandTitle}" (type: ${demandType})`);
    toast.info(`Gerando ${label} automaticamente para "${demandTitle}"...`, { duration: 5000 });

    supabase.functions.invoke(functionName, {
      body: { demandId },
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
  };

  const handleApproveCard = async (index: number) => {
    if (!selectedClient || !tenantId || !pipelineId || !initialStatusId) return;
    const card = cards[index];
    if (!card) return;
    const period = periods.find(p => p.id === card._periodId);
    if (!period) return;

    setApprovingIndex(index);
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

      const { data: insertedData, error: insertError } = await supabase.from('demands').insert({
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
        source: 'card',
        observations: null,
      } as any).select('id').single();

      if (insertError) throw insertError;

      // Remove from rejected_plan
      const updatedRejected = [...(period.rejected_plan || [])];
      updatedRejected.splice(card._rejectedIndex, 1);

      const { error: updateError } = await supabase
        .from('period_plans')
        .update({ rejected_plan: updatedRejected as unknown as null })
        .eq('id', period.id);

      if (updateError) throw updateError;

      const newPeriods = periods.map(p => p.id === period.id ? { ...p, rejected_plan: updatedRejected } : p);
      setPeriods(newPeriods);
      const newCards: RejectedCardItem[] = [];
      let g = 0;
      for (const p of newPeriods) {
        p.rejected_plan.forEach((item: any, i: number) => {
          newCards.push({
            ...item,
            _index: g++,
            _originalSource: item._originalSource || 'default',
            _rejectedAt: item._rejectedAt,
            _periodId: p.id,
            _periodTitle: p.period_title,
            _rejectedIndex: i,
          });
        });
      }
      setCards(newCards);

      toast.success(`"${title}" aprovado e enviado ao Kanban!`);

      // Trigger auto image generation (fire-and-forget)
      if (insertedData?.id) {
        triggerAutoGenerate(title, tipo, insertedData.id);
      }


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
  };

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  return (
    <div className="pb-8">
      <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <PageHeader
          title="Demandas Reprovadas"
          subtitle={`Cards reprovados de ${displayName}`}
          backTo="/client-hub"
          actions={[
            {
              label: "Atualizar",
              onClick: fetchData,
              icon: <RefreshCw className="w-4 h-4" />,
              variant: "outline" as const,
            },
          ]}
        />

        {loading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <Card className="p-8 text-center mt-6">
            <ThumbsDown className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum card reprovado</h3>
            <p className="text-muted-foreground mb-4">
              Cards reprovados na página de aprovação aparecerão aqui para reavaliação.
            </p>
            <Button onClick={() => navigate('/approve-cards')}>
              Ir para Aprovação
            </Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              {cards.length} card(s) reprovado(s) — Clique em "Reavaliar Conteúdo" para melhorar com IA ou "Aprovar" para enviar ao Kanban.
            </p>
            {cards.map((card, idx) => (
              <div key={idx} className="relative">
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleApproveCard(idx); }}
                    className="gap-1"
                    disabled={approvingIndex === idx}
                  >
                    {approvingIndex === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleOpenReevaluate(idx); }}
                    className="gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reavaliar Conteúdo
                  </Button>
                </div>
                <DemandaCard
                  demanda={card}
                  variant={card._originalSource === 'ultra' ? 'ultra' : 'normal'}
                />
              </div>
            ))}
          </div>
        )}

        {/* Reevaluate Modal */}
        <Dialog open={reevalModalOpen} onOpenChange={setReevalModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Reavaliar Conteúdo com IA</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Descreva o motivo da reavaliação. A IA usará este motivo junto com a estratégia e anamnese do cliente para melhorar o card.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo da reavaliação</label>
                <Textarea
                  placeholder="Ex: O conteúdo está muito genérico, precisa ser mais específico para o público-alvo do cliente..."
                  value={reevalReason}
                  onChange={e => setReevalReason(e.target.value)}
                  className="min-h-[120px]"
                  disabled={reevalLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReevalModalOpen(false)} disabled={reevalLoading}>
                Cancelar
              </Button>
              <Button onClick={handleReevaluate} disabled={reevalLoading || !reevalReason.trim()}>
                {reevalLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reavaliando...
                  </>
                ) : (
                  "Reavaliar com IA"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ContentRequirementsDiffModal
          open={diffOpen}
          onOpenChange={(o) => { if (!o && !diffSaving) { setDiffOpen(false); setPendingReeval(null); } }}
          current={diffCurrent}
          proposed={diffProposed}
          mode={diffMode}
          reasoning={diffReasoning}
          loading={diffSaving}
          onConfirm={handleDiffConfirm}
        />
      </div>
    </div>
  );
};

export default RejectedCards;
