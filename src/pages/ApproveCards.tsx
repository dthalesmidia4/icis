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
import { CalendarDays, Package, AlertCircle, RefreshCw, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

      // Find first period with plans in JSON
      let bestPeriod: PeriodData | null = null;
      for (const p of (periods || [])) {
        const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
        const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
        if (dp.length > 0 || up.length > 0) {
          bestPeriod = p as PeriodData;
          break;
        }
      }

      if (!bestPeriod && periods && periods.length > 0) {
        // No JSON plans found — check if latest period has demands already saved
        bestPeriod = periods[0] as PeriodData;
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
            .eq('client_id', selectedClient.id)
            .is('archived_at', null);

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

      // Build instructions field
      const instructionParts = [conteudo, instrucoes, cta ? `CTA: ${cta}` : ''].filter(Boolean);

      const { error } = await supabase.from('demands').insert({
        tenant_id: tenantId,
        client_id: selectedClient.id,
        pipeline_id: pipelineId,
        status_id: initialStatusId,
        period_plan_id: period.id,
        title,
        objective: objetivo,
        instructions: instructionParts.join('\n\n') || null,
        publish_date: dateStr || null,
        channel,
        demand_type: tipo,
        source: 'card',
        observations: null,
      });

      if (error) throw error;

      setApprovedIndexes(prev => new Set([...prev, card._index]));
      toast.success(`"${title}" aprovado e enviado ao Kanban!`);
    } catch (error) {
      console.error('Error approving card:', error);
      toast.error("Erro ao aprovar card");
    } finally {
      setApprovingIndex(null);
    }
  }, [selectedClient, tenantId, pipelineId, initialStatusId, period]);

  const handleApproveAll = async () => {
    const pending = cards.filter(c => !approvedIndexes.has(c._index));
    if (pending.length === 0) return;

    for (const card of pending) {
      await handleApprove(card);
    }
  };

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;
  const pendingCount = cards.filter(c => !approvedIndexes.has(c._index)).length;
  const approvedCount = approvedIndexes.size;

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
            <Card className="p-4 sm:p-6 border-primary/20 bg-primary/5">
              <div className="flex items-center gap-3 mb-3">
                <CalendarDays className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">{period.period_title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDateStr(period.period_start)} — {formatDateStr(period.period_end)}
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{cards.length} cards gerados</span>
                </div>
                {approvedCount > 0 && (
                  <Badge variant="default" className="bg-green-600">
                    <Check className="w-3 h-3 mr-1" />
                    {approvedCount} aprovados
                  </Badge>
                )}
                {pendingCount > 0 && (
                  <Badge variant="secondary">
                    {pendingCount} pendentes
                  </Badge>
                )}
              </div>
            </Card>

            {/* Cards list */}
            <div className="space-y-4">
              {cards.map((card) => {
                const isApproved = approvedIndexes.has(card._index);
                const isApproving = approvingIndex === card._index;

                return (
                  <div key={card._index} className={`relative ${isApproved ? 'opacity-60' : ''}`}>
                    <DemandaCard
                      demanda={card}
                      variant={card._source === 'ultra' ? 'ultra' : 'normal'}
                    />
                    <div className="mt-2 flex justify-end">
                      {isApproved ? (
                        <Badge variant="default" className="bg-green-600 text-sm py-1 px-3">
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          Aprovado — No Kanban
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleApprove(card)}
                          disabled={isApproving}
                        >
                          {isApproving ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4 mr-2" />
                          )}
                          Aprovar Card
                        </Button>
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
  );
};

export default ApproveCards;
