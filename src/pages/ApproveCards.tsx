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
import { CalendarDays, AlertCircle, RefreshCw, Check, CheckCheck, Shield, Rocket, Pencil, ThumbsDown, Settings2 } from "lucide-react";
import PeriodConfigViewerModal from "@/components/PeriodConfigViewerModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { coerceDemandTypeKey, normalizeDemandTypeKey } from "@/lib/proceedDemand";
import { assignInitialResponsible } from "@/lib/initialFlowFunction";
import { useRealtimePeriodPlans, useRealtimeDemands, useDebouncedCallback } from "@/hooks/realtime";

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
  _periodId: string;
  _source: 'default' | 'ultra';
  _indexInPlan: number; // index inside its source array
  _uid: string;         // stable id "${periodId}:${source}:${index}"
}

const ApproveCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodData[]>([]);
  const [cardsByPeriod, setCardsByPeriod] = useState<Record<string, CardItem[]>>({});
  const [approvedKeys, setApprovedKeys] = useState<Set<string>>(new Set()); // `${periodId}::${title}`
  const [approvingUid, setApprovingUid] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [initialStatusId, setInitialStatusId] = useState<string | null>(null);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<'normal' | 'ultra'>('normal');
  const [reviewDemands, setReviewDemands] = useState<any[]>([]);
  const [reviewPeriodId, setReviewPeriodId] = useState<string | null>(null);

  // Edit period modal state
  const [editingPeriod, setEditingPeriod] = useState<PeriodData | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Period config viewer
  const [configViewerPeriodId, setConfigViewerPeriodId] = useState<string | null>(null);

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

  const approvedKey = (periodId: string, title: string) => `${periodId}::${(title || '').trim()}`;

  const fetchData = useCallback(async () => {
    if (!selectedClient || !tenantId) return;
    setLoading(true);
    try {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .maybeSingle();

      if (pipeline) {
        setPipelineId(pipeline.id);
        const { data: status } = await supabase
          .from('pipeline_statuses')
          .select('id')
          .eq('pipeline_id', pipeline.id)
          .eq('is_initial', true)
          .maybeSingle();
        if (status) setInitialStatusId(status.id);
      }

      // ALL em_andamento periods for this client — same criterion as Visão Geral.
      const { data: periodsRaw, error } = await supabase
        .from('period_plans')
        .select('id, period_title, period_start, period_end, status, default_plan, ultra_plan, operational_status')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .eq('operational_status', 'em_andamento')
        .order('period_start', { ascending: true });

      if (error) throw error;

      const allPeriods = (periodsRaw || []) as unknown as PeriodData[];
      setPeriods(allPeriods);

      // Build cards per period
      const byPeriod: Record<string, CardItem[]> = {};
      const allTitlesByPeriod: Record<string, string[]> = {};
      allPeriods.forEach((p) => {
        const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
        const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
        const list: CardItem[] = [
          ...dp.map((item: any, i: number) => ({
            ...item,
            _periodId: p.id,
            _source: 'default' as const,
            _indexInPlan: i,
            _uid: `${p.id}:default:${i}`,
          })),
          ...up.map((item: any, i: number) => ({
            ...item,
            _periodId: p.id,
            _source: 'ultra' as const,
            _indexInPlan: i,
            _uid: `${p.id}:ultra:${i}`,
          })),
        ];
        byPeriod[p.id] = list;
        allTitlesByPeriod[p.id] = list.map(c => String((c as any).titulo ?? (c as any).title ?? '').trim()).filter(Boolean);
      });
      setCardsByPeriod(byPeriod);

      // Which cards are already materialized as demands
      const periodIds = allPeriods.map(p => p.id);
      const approved = new Set<string>();
      if (periodIds.length > 0) {
        const { data: existingDemands } = await supabase
          .from('demands')
          .select('title, period_plan_id')
          .in('period_plan_id', periodIds)
          .eq('client_id', selectedClient.id);
        (existingDemands || []).forEach((d: any) => {
          if (d.period_plan_id && d.title) approved.add(approvedKey(d.period_plan_id, d.title));
        });
      }
      setApprovedKeys(approved);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [selectedClient, tenantId]);

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

  const debouncedRefetch = useDebouncedCallback(() => { fetchData(); }, 250);

  useRealtimePeriodPlans({
    tenantId,
    clientId: selectedClient?.id ?? null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });
  useRealtimeDemands({
    tenantId,
    clientId: selectedClient?.id ?? null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });

  const triggerAutoGenerate = useCallback((demandTitle: string, demandType: string | null, demandId: string) => {
    const tipo = (demandType || '').toLowerCase();
    const isStaticPost = tipo.includes('post');
    const isCarousel = tipo.includes('carrossel') || tipo.includes('carousel');
    if (!isStaticPost && !isCarousel) return;

    const functionName = isCarousel ? 'auto-generate-carousel' : 'auto-generate-post';
    const label = isCarousel ? 'carrossel' : 'imagem';

    toast.info(`Gerando ${label} automaticamente para "${demandTitle}"...`, { duration: 5000 });

    supabase.functions.invoke(functionName, {
      body: { demandId, source: 'planned', minimalText: true },
    }).then(({ data, error }) => {
      if (error) {
        toast.error(`Erro na geração automática de "${demandTitle}"`);
        return;
      }
      if (data?.skipped) return;
      if (data?.success) {
        const msg = isCarousel
          ? `${data.totalGenerated} slides gerados e anexados a "${demandTitle}"!`
          : `Imagem gerada e anexada a "${demandTitle}"!`;
        toast.success(msg);
      }
    }).catch(err => console.error('[AutoGen] Exception:', err));
  }, []);

  const handleApprove = useCallback(async (card: CardItem) => {
    if (!selectedClient || !tenantId || !pipelineId || !initialStatusId) return;

    setApprovingUid(card._uid);
    try {
      const c: any = card;
      const pick = (...vals: any[]) => {
        for (const v of vals) {
          if (v === null || v === undefined) continue;
          const s = typeof v === 'string' ? v.trim() : v;
          if (s !== '' && s !== null && s !== undefined) return s;
        }
        return null;
      };

      const title = pick(c.titulo, c.title) || 'Sem título';
      const tipo = pick(c.tipo, c.tipo_conteudo, c.type, c.formato);
      const channel = pick(c.canal, c.channel, c.plataforma);
      const objetivo = pick(c.objetivo, c.objective, c.goal);
      const conteudo = pick(
        c.conteudo, c.texto_da_peca, c.descricao_da_tarefa,
        c.descricao, c.description, c.content, c.copy, c.copy_sugerida
      );
      const instrucoes = pick(
        c.instrucoes_de_producao, c.instrucoes, c.instructions,
        c.production_instructions, c.briefing
      );
      const cta = pick(c.cta_recomendado, c.cta, c.call_to_action);
      const caption = pick(c.legenda, c.caption, c.post_caption);
      const dateStr = pick(c.data_sugerida, c.suggested_date, c.date, c.publish_date, c.data_publicacao);
      const racional = pick(c.racional_estrategico, c.rationale, c.strategic_rationale, c.racional);
      const conceitoUltra = pick(c.conceito_ultra, c.ultra_concept, c.conceito);
      const hook = pick(c.hook, c.gancho);
      const tomDeVoz = pick(c.tom_de_voz, c.tone_of_voice);
      const observacoesExtra = pick(c.observacoes, c.observations, c.notas, c.notes);

      const instructionParts = [
        instrucoes,
        cta ? `CTA: ${cta}` : '',
        hook ? `Hook: ${hook}` : '',
        tomDeVoz ? `Tom de voz: ${tomDeVoz}` : '',
      ].filter(Boolean);

      const observationsParts = [
        racional ? `Racional estratégico:\n${racional}` : '',
        conceitoUltra ? `Conceito ultra:\n${conceitoUltra}` : '',
        caption ? `Legenda sugerida:\n${caption}` : '',
        observacoesExtra ? `Observações:\n${observacoesExtra}` : '',
      ].filter(Boolean);

      const explicitKey = coerceDemandTypeKey(c.demand_type_key || c.type_key);
      const demandTypeKey = explicitKey ?? normalizeDemandTypeKey(tipo);

      const payload: any = {
        tenant_id: tenantId,
        client_id: selectedClient.id,
        pipeline_id: pipelineId,
        status_id: initialStatusId,
        period_plan_id: card._periodId,
        title,
        source: card._source === 'ultra' ? 'ultra_card' : 'card',
      };
      if (objetivo) payload.objective = objetivo;
      if (conteudo) payload.description = conteudo;
      if (instructionParts.length) payload.instructions = instructionParts.join('\n\n');
      if (dateStr) payload.publish_date = dateStr;
      if (channel) payload.channel = channel;
      if (tipo) payload.demand_type = tipo;
      if (demandTypeKey) payload.demand_type_key = demandTypeKey;
      if (observationsParts.length) payload.observations = observationsParts.join('\n\n');

      const { data: insertedData, error } = await supabase.from('demands').insert(payload).select('id').single();
      if (error) throw error;

      setApprovedKeys(prev => new Set([...prev, approvedKey(card._periodId, title)]));
      toast.success(`"${title}" aprovado e enviado ao Kanban!`);

      if (insertedData?.id) {
        await assignInitialResponsible(insertedData.id, tenantId, demandTypeKey, {
          metadataSource: card._source === 'ultra' ? 'ultra_card' : 'card',
        });
        triggerAutoGenerate(title, tipo, insertedData.id);
      }
    } catch (error) {
      console.error('Error approving card:', error);
      toast.error("Erro ao aprovar card");
    } finally {
      setApprovingUid(null);
    }
  }, [selectedClient, tenantId, pipelineId, initialStatusId, triggerAutoGenerate]);

  const handleApproveAll = async () => {
    const pending: CardItem[] = [];
    Object.values(cardsByPeriod).forEach(list => {
      list.forEach(c => {
        const title = String((c as any).titulo ?? (c as any).title ?? '').trim();
        if (!approvedKeys.has(approvedKey(c._periodId, title))) pending.push(c);
      });
    });
    for (const card of pending) {
      await handleApprove(card);
    }
  };

  const handleReject = useCallback(async (card: CardItem) => {
    const period = periods.find(p => p.id === card._periodId);
    if (!period) return;

    try {
      const isDefault = card._source === 'default';
      const planKey = isDefault ? 'default_plan' : 'ultra_plan';
      const plan = isDefault
        ? (Array.isArray(period.default_plan) ? [...period.default_plan] : [])
        : (Array.isArray(period.ultra_plan) ? [...period.ultra_plan] : []);

      if (card._indexInPlan < 0 || card._indexInPlan >= plan.length) return;

      const [removedCard] = plan.splice(card._indexInPlan, 1);
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
  }, [periods, fetchData]);

  const handleOpenReview = (periodId: string, mode: 'normal' | 'ultra') => {
    const p = periods.find(x => x.id === periodId);
    if (!p) return;
    const planData = mode === 'normal'
      ? (Array.isArray(p.default_plan) ? p.default_plan : [])
      : (Array.isArray(p.ultra_plan) ? p.ultra_plan : []);
    setReviewMode(mode);
    setReviewDemands(planData);
    setReviewPeriodId(periodId);
    setReviewModalOpen(true);
  };

  const handleReviewConfirm = async (selectedDemands: any[]) => {
    setReviewModalOpen(false);
    if (!reviewPeriodId) return;
    try {
      const field = reviewMode === 'normal' ? 'default_plan' : 'ultra_plan';
      await supabase.from('period_plans').update({
        [field]: selectedDemands as unknown as null
      } as any).eq('id', reviewPeriodId);
      toast.success(`${selectedDemands.length} demandas ${reviewMode === 'normal' ? 'normais' : 'ultra'} atualizadas!`);
      fetchData();
    } catch (error) {
      console.error('Error updating plan:', error);
      toast.error('Erro ao atualizar demandas');
    }
  };

  const handleOpenEditPeriod = (p: PeriodData) => {
    setEditingPeriod(p);
    setEditTitle(p.period_title);
    setEditStart(p.period_start);
    setEditEnd(p.period_end);
    setEditModalOpen(true);
  };

  const handleSaveEditPeriod = async () => {
    if (!editingPeriod || !editTitle.trim() || !editStart || !editEnd) {
      toast.error("Preencha todos os campos");
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase.from('period_plans').update({
        period_title: editTitle.trim(),
        period_start: editStart,
        period_end: editEnd,
      }).eq('id', editingPeriod.id);
      if (error) throw error;
      setEditModalOpen(false);
      toast.success("Período atualizado!");
      fetchData();
    } catch (error) {
      console.error('Error updating period:', error);
      toast.error("Erro ao atualizar período");
    } finally {
      setEditSaving(false);
    }
  };

  const handleOpenEditCard = (card: CardItem) => {
    setEditingCard(card);
    setEditCardTitle((card as any).titulo || (card as any).title || '');
    setEditCardType((card as any).tipo || (card as any).tipo_conteudo || (card as any).type || '');
    setEditCardChannel((card as any).canal || (card as any).channel || '');
    setEditCardObjective((card as any).objetivo || (card as any).objective || '');
    setEditCardContent((card as any).conteudo || (card as any).descricao || (card as any).description || '');
    setEditCardDate((card as any).data_sugerida || (card as any).suggested_date || (card as any).date || '');
    setEditCardModalOpen(true);
  };

  const handleSaveEditCard = async () => {
    if (!editingCard) return;
    const period = periods.find(p => p.id === editingCard._periodId);
    if (!period) return;
    setEditCardSaving(true);
    try {
      const isDefault = editingCard._source === 'default';
      const planKey = isDefault ? 'default_plan' : 'ultra_plan';
      const plan = isDefault
        ? (Array.isArray(period.default_plan) ? [...period.default_plan] : [])
        : (Array.isArray(period.ultra_plan) ? [...period.ultra_plan] : []);

      const idx = editingCard._indexInPlan;
      if (idx >= 0 && idx < plan.length) {
        const item = { ...plan[idx] };
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

        plan[idx] = item;

        const { error } = await supabase.from('period_plans').update({
          [planKey]: plan as unknown as null,
        } as any).eq('id', period.id);
        if (error) throw error;

        setEditCardModalOpen(false);
        toast.success("Card atualizado!");
        fetchData();
      }
    } catch (error) {
      console.error('Error updating card:', error);
      toast.error("Erro ao atualizar card");
    } finally {
      setEditCardSaving(false);
    }
  };

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const formatDateStr = (d: string) => {
    try {
      return format(new Date(d + 'T12:00:00'), "dd MMM yyyy", { locale: ptBR });
    } catch {
      return d;
    }
  };

  // Global counts (across all periods)
  let totalCards = 0;
  let pendingCount = 0;
  Object.values(cardsByPeriod).forEach(list => {
    list.forEach(c => {
      totalCards++;
      const title = String((c as any).titulo ?? (c as any).title ?? '').trim();
      if (!approvedKeys.has(approvedKey(c._periodId, title))) pendingCount++;
    });
  });

  const anyCards = totalCards > 0;

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
        ) : !anyCards ? (
          <Card className="p-8 text-center mt-6">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum card pendente</h3>
            <p className="text-muted-foreground mb-4">
              Não há períodos em andamento com cards pendentes de avaliação.
            </p>
            <Button onClick={() => navigate('/plan-period')}>
              Planejar Período
            </Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-8">
            {periods.map((period) => {
              const list = cardsByPeriod[period.id] || [];
              if (list.length === 0) return null;
              const defaultCards = list.filter(c => c._source === 'default');
              const ultraCards = list.filter(c => c._source === 'ultra');
              const defaultPending = defaultCards.filter(c => !approvedKeys.has(approvedKey(period.id, String((c as any).titulo ?? (c as any).title ?? '').trim()))).length;
              const ultraPending = ultraCards.filter(c => !approvedKeys.has(approvedKey(period.id, String((c as any).titulo ?? (c as any).title ?? '').trim()))).length;

              return (
                <div key={period.id} className="space-y-4">
                  <Card className="p-4 sm:p-6 border-primary/20 bg-primary/5 relative">
                    <div className="flex items-center justify-center gap-3 flex-wrap pr-10">
                      <CalendarDays className="w-5 h-5 text-primary" />
                      <h2 className="text-xl sm:text-2xl font-bold">{period.period_title}</h2>
                      <span className="text-base sm:text-lg text-muted-foreground">
                        {formatDateStr(period.period_start)} — {formatDateStr(period.period_end)}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver configurações respondidas"
                        onClick={() => setConfigViewerPeriodId(period.id)}
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditPeriod(period)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>

                  <div className="flex flex-wrap gap-3">
                    {defaultCards.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => handleOpenReview(period.id, 'normal')}
                        className="gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Revisar Demandas Normais ({defaultPending}/{defaultCards.length})
                      </Button>
                    )}
                    {ultraCards.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => handleOpenReview(period.id, 'ultra')}
                        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                      >
                        <Rocket className="w-4 h-4" />
                        Revisar Demandas Ultra ({ultraPending}/{ultraCards.length})
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {defaultCards.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Demandas Normais — {defaultPending} pendente{defaultPending === 1 ? '' : 's'} · {defaultCards.length - defaultPending} aprovada{(defaultCards.length - defaultPending) === 1 ? '' : 's'}
                        </h3>
                        <div className="space-y-3">
                          {defaultCards.map((card) => {
                            const title = String((card as any).titulo ?? (card as any).title ?? '').trim();
                            const isApproved = approvedKeys.has(approvedKey(period.id, title));
                            const isApproving = approvingUid === card._uid;
                            return (
                              <div
                                key={card._uid}
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

                    {ultraCards.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Rocket className="w-4 h-4" />
                          Demandas Ultra — {ultraPending} pendente{ultraPending === 1 ? '' : 's'} · {ultraCards.length - ultraPending} aprovada{(ultraCards.length - ultraPending) === 1 ? '' : 's'}
                        </h3>
                        <div className="space-y-3">
                          {ultraCards.map((card) => {
                            const title = String((card as any).titulo ?? (card as any).title ?? '').trim();
                            const isApproved = approvedKeys.has(approvedKey(period.id, title));
                            const isApproving = approvingUid === card._uid;
                            return (
                              <div
                                key={card._uid}
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
              );
            })}
          </div>
        )}

        <PeriodConfigViewerModal
          open={!!configViewerPeriodId}
          onOpenChange={(v) => { if (!v) setConfigViewerPeriodId(null); }}
          periodId={configViewerPeriodId || ''}
        />

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
