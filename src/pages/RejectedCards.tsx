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
import { cn } from "@/lib/utils";

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
}

const RejectedCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodData | null>(null);
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

      const savedPeriodId = localStorage.getItem(`approve_cards_period_${selectedClient.id}`);

      const { data: periods, error } = await supabase
        .from('period_plans')
        .select('id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      let bestPeriod: PeriodData | null = null;

      if (savedPeriodId) {
        const saved = (periods || []).find(p => p.id === savedPeriodId);
        if (saved) {
          const rp = Array.isArray((saved as any).rejected_plan) ? (saved as any).rejected_plan : [];
          // Only use saved period if it actually has rejected cards
          if (rp.length > 0) {
            bestPeriod = { ...saved, rejected_plan: rp } as PeriodData;
          }
        }
      }

      if (!bestPeriod && periods && periods.length > 0) {
        // Find first period with rejected cards
        for (const p of periods) {
          const rp = Array.isArray((p as any).rejected_plan) ? (p as any).rejected_plan : [];
          if (rp.length > 0) {
            bestPeriod = { ...p, rejected_plan: rp } as PeriodData;
            break;
          }
        }
        if (!bestPeriod) {
          bestPeriod = {
            ...periods[0],
            rejected_plan: Array.isArray((periods[0] as any).rejected_plan) ? (periods[0] as any).rejected_plan : [],
          } as PeriodData;
        }
      }

      setPeriod(bestPeriod);

      if (bestPeriod) {
        const rp = bestPeriod.rejected_plan || [];
        const rejectedCards: RejectedCardItem[] = rp.map((item: any, i: number) => ({
          ...item,
          _index: i,
          _originalSource: item._originalSource || 'default',
          _rejectedAt: item._rejectedAt,
        }));
        setCards(rejectedCards);
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

  const handleOpenReevaluate = (index: number) => {
    setReevalCardIndex(index);
    setReevalReason('');
    setReevalModalOpen(true);
  };

  const handleReevaluate = async () => {
    if (reevalCardIndex === null || !period || !selectedClient || !tenantId) return;
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
        // Update the rejected_plan with the new card data
        const updatedRejected = [...(period.rejected_plan || [])];
        updatedRejected[reevalCardIndex] = {
          ...updatedRejected[reevalCardIndex],
          ...data.updatedCard,
          _originalSource: card._originalSource,
          _rejectedAt: card._rejectedAt,
          _reevaluatedAt: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('period_plans')
          .update({ rejected_plan: updatedRejected as unknown as null })
          .eq('id', period.id);

        if (updateError) throw updateError;

        setPeriod({ ...period, rejected_plan: updatedRejected });
        setCards(updatedRejected.map((item: any, i: number) => ({
          ...item,
          _index: i,
          _originalSource: item._originalSource || 'default',
          _rejectedAt: item._rejectedAt,
        })));

        setReevalModalOpen(false);
        toast.success("Card reavaliado com sucesso!");
      }
    } catch (error: any) {
      console.error('Error reevaluating:', error);
      toast.error(error.message || "Erro ao reavaliar card");
    } finally {
      setReevalLoading(false);
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
    if (!period || !selectedClient || !tenantId || !pipelineId || !initialStatusId) return;

    setApprovingIndex(index);
    try {
      const card = cards[index];
      const title = card.titulo || card.title || 'Sem título';
      const tipo = card.tipo || card.tipo_conteudo || card.type || null;
      const channel = card.canal || card.channel || null;
      const objetivo = card.objetivo || card.objective || null;
      const conteudo = card.conteudo || card.descricao || card.description || null;
      const instrucoes = card.instrucoes_de_producao || null;
      const cta = card.cta_recomendado || null;
      const dateStr = card.data_sugerida || card.suggested_date || card.date || null;

      const instructionParts = [instrucoes, cta ? `CTA: ${cta}` : ''].filter(Boolean);

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
        source: 'card',
        observations: null,
      }).select('id').single();

      if (insertError) throw insertError;

      // Remove from rejected_plan
      const updatedRejected = [...(period.rejected_plan || [])];
      updatedRejected.splice(index, 1);

      const { error: updateError } = await supabase
        .from('period_plans')
        .update({ rejected_plan: updatedRejected as unknown as null })
        .eq('id', period.id);

      if (updateError) throw updateError;

      setPeriod({ ...period, rejected_plan: updatedRejected });
      setCards(updatedRejected.map((item: any, i: number) => ({
        ...item,
        _index: i,
        _originalSource: item._originalSource || 'default',
      })));

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
      </div>
    </div>
  );
};

export default RejectedCards;
