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
import { AlertCircle, RefreshCw, Check, RotateCcw, Loader2, ThumbsDown } from "lucide-react";
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
  }, [isInitialized, selectedClient]);

  const fetchData = async () => {
    if (!selectedClient || !tenantId) return;
    setLoading(true);
    try {
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
          bestPeriod = {
            ...saved,
            rejected_plan: Array.isArray((saved as any).rejected_plan) ? (saved as any).rejected_plan : [],
          } as PeriodData;
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

  const handleRestoreCard = async (index: number) => {
    if (!period || !selectedClient) return;

    try {
      const card = cards[index];
      const updatedRejected = [...(period.rejected_plan || [])];
      updatedRejected.splice(index, 1);

      // Restore to original plan
      const source = card._originalSource === 'ultra' ? 'ultra_plan' : 'default_plan';
      const originalPlan = Array.isArray(period[source === 'ultra_plan' ? 'ultra_plan' : 'default_plan'])
        ? [...period[source === 'ultra_plan' ? 'ultra_plan' : 'default_plan']]
        : [];

      // Remove internal tracking fields before restoring
      const { _index, _originalSource, _rejectedAt, _reevaluatedAt, ...cleanCard } = card as any;
      originalPlan.push(cleanCard);

      const { error } = await supabase
        .from('period_plans')
        .update({
          rejected_plan: updatedRejected as unknown as null,
          [source]: originalPlan as unknown as null,
        })
        .eq('id', period.id);

      if (error) throw error;

      setPeriod({
        ...period,
        rejected_plan: updatedRejected,
        [source]: originalPlan,
      });
      setCards(updatedRejected.map((item: any, i: number) => ({
        ...item,
        _index: i,
        _originalSource: item._originalSource || 'default',
      })));

      toast.success("Card restaurado para aprovação!");
    } catch (error) {
      console.error('Error restoring card:', error);
      toast.error("Erro ao restaurar card");
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
              {cards.length} card(s) reprovado(s) — Clique em "Reavaliar Conteúdo" para melhorar com IA ou "Restaurar" para devolver à aprovação.
            </p>
            {cards.map((card, idx) => (
              <div key={idx} className="relative">
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleRestoreCard(idx); }}
                    className="gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar
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
