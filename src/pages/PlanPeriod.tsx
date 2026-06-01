// Plan Period Page
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Zap, Check, X, Package, History, Plus, Calendar as CalendarIcon, ChevronRight, LayoutGrid, Trash2, AlertTriangle, PlayCircle, List, RefreshCw, Instagram, Facebook, Youtube, Linkedin, ChevronDown, TrendingUp, CheckSquare, Rocket, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose, DrawerFooter } from "@/components/ui/drawer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DemandaCard, DemandaItem } from "@/components/DemandaCard";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PlanItem {
  titulo: string;
  canal: string;
  data_sugerida?: string;
  // Campos reais retornados pela IA
  tipo?: string;
  objetivo?: string;
  conteudo?: string;
  instrucoes_de_producao?: string;
  cta_recomendado?: string;
  contexto_sazonal?: string;
  // Campos legados (retrocompatibilidade)
  descricao?: string;
  tipo_conteudo?: string;
}

interface PeriodPlanHistory {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  objective: string;
  priority_channel: string;
  primary_mode: string | null;
  status: string;
  operational_status: string;
  created_at: string;
  final_plan: PlanItem[] | null;
  default_plan: PlanItem[] | null;
  ultra_plan: PlanItem[] | null;
}

type Step = 'form' | 'loading-normal' | 'choose-ultra' | 'loading-ultra' | 'completed';

const PlanPeriod = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();

  // Tab state - check URL param for initial tab
  const [activeTab, setActiveTab] = useState<'new' | 'history'>(
    searchParams.get('tab') === 'history' ? 'history' : 'new'
  );

  // History state
  const [periodHistory, setPeriodHistory] = useState<PeriodPlanHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryPlan, setSelectedHistoryPlan] = useState<PeriodPlanHistory | null>(null);
  const [historyViewTab, setHistoryViewTab] = useState<'final' | 'normal' | 'ultra'>('final');
  const [periodToDelete, setPeriodToDelete] = useState<PeriodPlanHistory | null>(null);
  const [linkedDemands, setLinkedDemands] = useState<any[]>([]);
  const [loadingLinkedDemands, setLoadingLinkedDemands] = useState(false);
  const [expandedLatestCard, setExpandedLatestCard] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);
  const [selectedDemandDetail, setSelectedDemandDetail] = useState<any | null>(null);

  // Demand execution metrics per period
  const [periodDemandMetrics, setPeriodDemandMetrics] = useState<Record<string, { total: number; published: number; demands: any[] }>>({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);


  // Incomplete period resume state
  const [incompletePeriod, setIncompletePeriod] = useState<PeriodPlanHistory | null>(null);

  // Form state
  const [periodTitle, setPeriodTitle] = useState("");
  const [periodStart, setPeriodStart] = useState<Date | undefined>(undefined);
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>(undefined);
  const [budget, setBudget] = useState("");
  const [observations, setObservations] = useState("");
  const [excludedFormats, setExcludedFormats] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  // Linha de produção - distribuição proporcional baseada em quantidadeConteudos (proporção 4:2:4)
  // A definição real de productionLine acontece via useMemo após quantidadeConteudos ser declarado.
  
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Bloco 1 — Objetivo do período
  const OBJETIVO_OPCOES = [
    'Gerar vendas',
    'Atrair leads',
    'Lançar produto',
    'Crescer seguidores',
    'Educar o mercado',
  ];
  const [objetivosSelecionados, setObjetivosSelecionados] = useState<string[]>([]);
  const [objetivoOutro, setObjetivoOutro] = useState("");
  const [metaNumerica, setMetaNumerica] = useState("");
  const [porqueObjetivo, setPorqueObjetivo] = useState("");

  // Bloco 2 — Produto/serviço em foco
  const [produtoFoco, setProdutoFoco] = useState("");
  const [temPromocao, setTemPromocao] = useState<'sim' | 'nao' | ''>('');
  const [promocaoDescricao, setPromocaoDescricao] = useState("");
  const [comoComprar, setComoComprar] = useState("");

  // Bloco 3 — Contexto do período
  const [temDataComemorativa, setTemDataComemorativa] = useState<'sim' | 'nao' | ''>('');
  const [dataComemorativaDescricao, setDataComemorativaDescricao] = useState("");
  const [temNovidade, setTemNovidade] = useState<'sim' | 'nao' | ''>('');
  const [novidadeDescricao, setNovidadeDescricao] = useState("");

  // Bloco 4 — Capacidade de produção do período
  const [disponibilidadeVideo, setDisponibilidadeVideo] = useState<'sim' | 'nao' | 'talvez' | ''>('');
  const [temMateriaisNovos, setTemMateriaisNovos] = useState<'sim' | 'nao' | ''>('');
  const [materiaisNovosDescricao, setMateriaisNovosDescricao] = useState("");
  const [quantidadeConteudos, setQuantidadeConteudos] = useState<number>(10);

  // Linha de produção derivada da quantidade escolhida (proporção 4:2:4 = Post/Vídeo/Carrossel)
  const productionLine = useMemo(() => {
    const target = Math.max(1, Math.min(50, Number(quantidadeConteudos) || 10));
    const base = [
      { type: 'Post Estático', ratio: 4 },
      { type: 'Vídeos Curtos', ratio: 2 },
      { type: 'Carrossel', ratio: 4 },
    ];
    if (target === 10) return base.map(b => ({ type: b.type, quantity: b.ratio }));
    const raw = base.map(b => ({ type: b.type, quantity: Math.max(1, Math.round((b.ratio / 10) * target)) }));
    let diff = target - raw.reduce((s, r) => s + r.quantity, 0);
    while (diff !== 0) {
      const idx = diff > 0
        ? raw.indexOf(raw.reduce((a, b) => (a.quantity >= b.quantity ? a : b)))
        : raw.indexOf(raw.reduce((a, b) => (a.quantity <= b.quantity ? a : b)));
      raw[idx].quantity += diff > 0 ? 1 : -1;
      if (raw[idx].quantity < 1) raw[idx].quantity = 1;
      diff = target - raw.reduce((s, r) => s + r.quantity, 0);
      if (raw.every(r => r.quantity <= 1) && diff < 0) break;
    }
    return raw;
  }, [quantidadeConteudos]);
  const productionLineTotal = useMemo(
    () => productionLine.reduce((s, r) => s + r.quantity, 0),
    [productionLine]
  );

  // Process state
  const [currentStep, setCurrentStep] = useState<Step>('form');
  const [periodPlanId, setPeriodPlanId] = useState<string | null>(null);
  const [defaultPlan, setDefaultPlan] = useState<PlanItem[]>([]);
  const [ultraPlan, setUltraPlan] = useState<PlanItem[]>([]);
  const [normalSavedCount, setNormalSavedCount] = useState(0);
  const [ultraSavedCount, setUltraSavedCount] = useState(0);
  const [pollingProgress, setPollingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Gerando demandas...");

  // Fetch period history and check for incomplete periods
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedClient || !tenantId) return;
      setLoadingHistory(true);
      try {
        const { data, error } = await supabase.from('period_plans').select('id, period_title, period_start, period_end, objective, priority_channel, primary_mode, status, operational_status, created_at, final_plan, default_plan, ultra_plan').eq('company_id', selectedClient.id).eq('tenant_id', tenantId).order('created_at', { ascending: false });
        if (error) throw error;
        const historyData = data as unknown as PeriodPlanHistory[] || [];
        setPeriodHistory(historyData);

        // Check for incomplete periods.
        // Includes anything that's mid-flight OR a draft/error that already has
        // partial demands persisted from an early save (so users can resume).
        const incomplete = historyData.find(p => {
          const recoverableStatus = p.status === 'generating_default' || p.status === 'generating_ultra';
          const hasPartial = Array.isArray(p.default_plan) && p.default_plan.length > 0
            && (!Array.isArray(p.final_plan) || p.final_plan.length === 0);
          const stuckDraft = (p.status === 'draft' || p.status === 'error') && hasPartial;
          return recoverableStatus || stuckDraft;
        });
        if (incomplete) {
          setIncompletePeriod(incomplete);
        }

        // Fetch demand metrics for all periods + all client demands
        if (historyData.length > 0) {
          setLoadingMetrics(true);
          const periodIds = historyData.map(p => p.id);
          
          // Fetch all demands for the client (period-linked AND unlinked)
          const { data: demandsData, error: demandsError } = await supabase
            .from('demands')
            .select(`
              id, title, period_plan_id, channel, demand_type, publish_date, publish_time, source, objective, instructions,
              pipeline_statuses!demands_status_id_fkey (
                name, is_final, color
              )
            `)
            .eq('tenant_id', tenantId)
            .eq('client_id', selectedClient.id)
            .is('archived_at', null);

          if (!demandsError && demandsData) {
            const metrics: Record<string, { total: number; published: number; demands: any[] }> = {};
            demandsData.forEach(d => {
              // Group by period_plan_id for period metrics
              if (d.period_plan_id && periodIds.includes(d.period_plan_id)) {
                if (!metrics[d.period_plan_id]) {
                  metrics[d.period_plan_id] = { total: 0, published: 0, demands: [] };
                }
                metrics[d.period_plan_id].total++;
                metrics[d.period_plan_id].demands.push(d);
                if (d.pipeline_statuses?.is_final) {
                  metrics[d.period_plan_id].published++;
                }
              }
            });
            
            // Store ALL client demands under a special key for the latest view
            metrics['__all_client__'] = {
              total: demandsData.length,
              published: demandsData.filter(d => d.pipeline_statuses?.is_final).length,
              demands: demandsData
            };
            
            setPeriodDemandMetrics(metrics);
          }
          setLoadingMetrics(false);
        }
      } catch (error) {
        console.error('Error fetching period history:', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [selectedClient, tenantId]);

  // Auto-open latest period if view=latest
  useEffect(() => {
    if (!loadingHistory && searchParams.get('view') === 'latest' && periodHistory.length > 0 && !selectedHistoryPlan) {
      setSelectedHistoryPlan(periodHistory[0]);
    }
  }, [loadingHistory, periodHistory]);

  useEffect(() => {
    // Só redireciona se não houver cliente E não estiver no meio de uma geração
    // Evita kick-out durante operações longas quando o contexto pode oscilar
    if (!selectedClient && currentStep === 'form') {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if ((!selectedClient || !tenantId) && currentStep === 'form') return null;
  const displayName = selectedClient?.fantasy_name || selectedClient?.name || '';

  // Resume incomplete period: just go straight to approval (auto flow).
  const handleResumeIncomplete = async () => {
    if (!incompletePeriod) return;
    setPeriodPlanId(incompletePeriod.id);
    setDefaultPlan(incompletePeriod.default_plan as PlanItem[] || []);
    setUltraPlan(incompletePeriod.ultra_plan as PlanItem[] || []);
    setIncompletePeriod(null);
    toast.success("Período retomado. Abrindo aprovação...");
    navigate('/approve-cards');
  };

  const dismissIncomplete = () => {
    setIncompletePeriod(null);
  };

  // Toggle operational status
  const handleToggleOperationalStatus = async (period: PeriodPlanHistory, e: React.MouseEvent) => {
    e.stopPropagation();
    const statusCycle: Record<string, string> = {
      'em_planejamento': 'em_andamento',
      'em_andamento': 'concluido',
      'concluido': 'em_planejamento'
    };
    const currentStatus = period.operational_status || 'em_planejamento';
    const newStatus = statusCycle[currentStatus] || 'em_andamento';
    try {
      const { error } = await supabase.from('period_plans').update({ operational_status: newStatus }).eq('id', period.id);
      if (error) throw error;

      // Auto-archive demands when period is completed
      if (newStatus === 'concluido') {
        const { error: archiveError } = await supabase
          .from('demands')
          .update({ archived_at: new Date().toISOString() })
          .eq('period_plan_id', period.id)
          .is('archived_at', null);
        if (archiveError) console.error('Error archiving demands:', archiveError);
      }

      // Unarchive demands when period is reopened from concluido
      if (currentStatus === 'concluido' && newStatus === 'em_planejamento') {
        const { error: unarchiveError } = await supabase
          .from('demands')
          .update({ archived_at: null })
          .eq('period_plan_id', period.id)
          .not('archived_at', 'is', null);
        if (unarchiveError) console.error('Error unarchiving demands:', unarchiveError);
      }

      setPeriodHistory(prev => prev.map(p => p.id === period.id ? { ...p, operational_status: newStatus } : p));
      const statusMessages: Record<string, string> = {
        'em_planejamento': 'Período marcado como em planejamento',
        'em_andamento': 'Período marcado como em andamento',
        'concluido': 'Período marcado como concluído!'
      };
      toast.success(statusMessages[newStatus]);
    } catch (error) {
      console.error('Error updating operational status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  // Carrega cards vinculados ao período sempre que abrir o modal de exclusão
  useEffect(() => {
    if (!periodToDelete) {
      setLinkedDemands([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingLinkedDemands(true);
      try {
        const { data, error } = await supabase
          .from('demands')
          .select('id, title, demand_type, channel, created_at, client_id, tenant_companies:client_id(name), pipeline_statuses:status_id(name, color)')
          .eq('period_plan_id', periodToDelete.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (!cancelled) setLinkedDemands(data || []);
      } catch (err) {
        console.error('Error loading linked demands:', err);
        if (!cancelled) setLinkedDemands([]);
      } finally {
        if (!cancelled) setLoadingLinkedDemands(false);
      }
    })();
    return () => { cancelled = true; };
  }, [periodToDelete]);

  const handleDeletePeriod = async () => {
    if (!periodToDelete) return;
    setIsDeleting(true);
    try {
      // RLS já garante isolamento por tenant. Filtro extra por period_plan_id assegura que só esses cards são excluídos.
      const { error: demandsError } = await supabase
        .from('demands')
        .delete()
        .eq('period_plan_id', periodToDelete.id);
      if (demandsError) throw demandsError;
      const { error } = await supabase.from('period_plans').delete().eq('id', periodToDelete.id);
      if (error) throw error;
      setPeriodHistory(prev => prev.filter(p => p.id !== periodToDelete.id));
      console.log('[PlanPeriod] Período excluído', { periodId: periodToDelete.id, cardsExcluidos: linkedDemands.length });
      toast.success(`Período excluído com ${linkedDemands.length} card(s) vinculado(s)`);
      setPeriodToDelete(null);
    } catch (error) {
      console.error('Error deleting period:', error);
      toast.error("Erro ao excluir período");
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate a single plan type - use direct response, polling as fallback
  const generateSinglePlan = async (
    planId: string,
    planType: 'default' | 'ultra',
    options?: { batchType?: string; batchQuantity?: number; isFinalBatch?: boolean }
  ): Promise<{ success: boolean; plan?: any[]; mergedDefaultPlan?: any[]; error?: string }> => {
    let directResult: any = null;
    let directMerged: any = null;
    const customQuantity = Math.max(1, Math.min(50, Number(quantidadeConteudos) || productionLineTotal));
    const invokeBody: Record<string, any> = { periodPlanId: planId, tenantId, planType, customQuantity };
    if (options?.batchType) invokeBody.batchType = options.batchType;
    if (options?.batchQuantity) invokeBody.batchQuantity = options.batchQuantity;
    if (options?.isFinalBatch) invokeBody.isFinalBatch = true;

    let directError: any = null;
    const edgeFunctionPromise = supabase.functions.invoke('generate-period-plans', {
      body: invokeBody
    }).then(({ data, error }) => {
      console.log(`[PlanPeriod] Edge function response (${planType}${options?.batchType ? `/${options.batchType}` : ''}):`, { hasData: !!data, error });
      if (error) {
        directError = error;
        return;
      }
      if (data?.success && Array.isArray(data?.plan) && data.plan.length > 0) {
        directResult = data.plan;
        directMerged = Array.isArray(data?.mergedDefaultPlan) ? data.mergedDefaultPlan : null;
      }
    }).catch(err => {
      directError = err;
      console.warn(`[PlanPeriod] Edge function invocation failed:`, err);
    });

    const fieldName = planType === 'default' ? 'default_plan' : 'ultra_plan';
    const initialCount = (planType === 'default' && options?.batchType)
      ? (defaultPlan?.length || 0)
      : 0;

    // Poll up to ~90s for batches, ~180s for full
    const maxAttempts = options?.batchType ? 30 : 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      setPollingProgress(Math.min(10 + attempt * (options?.batchType ? 3 : 1.5), 95));

      if (directResult) {
        return { success: true, plan: directResult, mergedDefaultPlan: directMerged };
      }
      if (directError) {
        // Edge function returned a real error → stop polling immediately
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const { data, error } = await supabase
          .from('period_plans')
          .select(`status, ${fieldName}`)
          .eq('id', planId)
          .single();

        if (!error && data) {
          if ((data as any).status === 'error') {
            return { success: false, error: 'Erro na geração. Verifique o prompt em /dev/prompts' };
          }
          const planData = (data as any)[fieldName];
          if (planData && Array.isArray(planData) && planData.length > initialCount) {
            const newSlice = planData.slice(initialCount);
            return { success: true, plan: newSlice, mergedDefaultPlan: planData };
          }
        }
      } catch (pollErr) {
        console.warn('[PlanPeriod] Poll error:', pollErr);
      }
    }

    await edgeFunctionPromise;
    if (directResult) {
      return { success: true, plan: directResult, mergedDefaultPlan: directMerged };
    }

    // Final DB check
    try {
      const { data: finalCheck } = await supabase
        .from('period_plans')
        .select(`status, ${fieldName}`)
        .eq('id', planId)
        .single();
      const finalPlan = (finalCheck as any)?.[fieldName];
      if (finalPlan && Array.isArray(finalPlan) && finalPlan.length > initialCount) {
        const newSlice = finalPlan.slice(initialCount);
        return { success: true, plan: newSlice, mergedDefaultPlan: finalPlan };
      }
    } catch (finalErr) {
      console.warn('[PlanPeriod] Final DB check failed:', finalErr);
    }

    const errMsg = directError
      ? (typeof directError === 'object' && directError?.message ? directError.message : 'Erro na geração')
      : 'Tempo limite excedido. Acesse a aba Histórico para retomar.';
    return { success: false, error: errMsg };
  };

  // Helper: save demands to Kanban
  const saveDemandToKanban = async (demands: PlanItem[]): Promise<number> => {
    if (!periodPlanId || !tenantId || !selectedClient) return 0;

    const { data: pipelineData } = await supabase
      .from('pipelines')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    
    const pipelineId = pipelineData?.id;
    let statusId: string | null = null;
    if (pipelineId) {
      const { data: statusData } = await supabase
        .from('pipeline_statuses')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('is_initial', true)
        .limit(1)
        .maybeSingle();
      statusId = statusData?.id || null;
    }

    if (!pipelineId || !statusId) {
      toast.error('Pipeline não configurado.');
      return 0;
    }

    const demandsToInsert = demands.map(item => {
      const anyItem = item as any;
      const titleBase = item.titulo || anyItem.title || 'Sem título';
      const tipo = anyItem.tipo || item.tipo_conteudo || anyItem.type || '';
      const channel = item.canal || anyItem.channel || '';
      const title = tipo ? `${tipo} - ${titleBase}` : titleBase;
      const publicationDate = item.data_sugerida || anyItem.suggested_date || anyItem.date || new Date().toISOString().split('T')[0];
      const descricao = anyItem.conteudo || anyItem.texto_da_peca || anyItem.descricao_da_tarefa || item.descricao || anyItem.description || '';
      const objetivo = anyItem.objetivo || anyItem.objective || '';
      const instrucoesProducao = anyItem.instrucoes_de_producao || '';
      const ctaRecomendado = anyItem.cta_recomendado || '';
      const instrucoesParts = [instrucoesProducao, ctaRecomendado && `CTA: ${ctaRecomendado}`].filter(Boolean);

      return {
        tenant_id: tenantId,
        client_id: selectedClient.id,
        pipeline_id: pipelineId,
        status_id: statusId,
        period_plan_id: periodPlanId,
        title,
        objective: objetivo || null,
        description: descricao || null,
        instructions: instrucoesParts.length > 0 ? instrucoesParts.join('\n\n') : null,
        publish_date: publicationDate,
        channel: channel || null,
        demand_type: tipo || null,
        source: 'card',
        observations: null
      };
    });

    if (demandsToInsert.length > 0) {
      const { error } = await supabase.from('demands').insert(demandsToInsert);
      if (error) throw error;
    }
    return demandsToInsert.length;
  };

  const handleSubmit = async () => {
    if (!periodTitle || !periodStart || !periodEnd) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (periodEnd < periodStart) {
      toast.error("A data final deve ser posterior à data inicial");
      return;
    }
    setCurrentStep('loading-normal');
    try {
      const priorityChannel = selectedChannels.length === 0 ? 'Multi-canal' : selectedChannels.length === 1 ? selectedChannels[0].charAt(0).toUpperCase() + selectedChannels[0].slice(1) : selectedChannels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
      const objetivosTexto = [...objetivosSelecionados, objetivoOutro.trim()].filter(Boolean).join(', ');
      const respostasBlocos = [
        '=== BLOCO 1 — OBJETIVO DO PERÍODO ===',
        `Objetivo principal: ${objetivosTexto || 'Não informado'}`,
        `Meta numérica: ${metaNumerica || 'Não informada'}`,
        `Por que é prioridade agora: ${porqueObjetivo || 'Não informado'}`,
        '',
        '=== BLOCO 2 — PRODUTO/SERVIÇO EM FOCO ===',
        `Produto/serviço foco: ${produtoFoco || 'Não informado'}`,
        `Promoção/bônus/condição: ${temPromocao === 'sim' ? `Sim — ${promocaoDescricao || 'sem detalhes'}` : temPromocao === 'nao' ? 'Não' : 'Não informado'}`,
        `Como comprar/contato: ${comoComprar || 'Não informado'}`,
        '',
        '=== BLOCO 3 — CONTEXTO DO PERÍODO ===',
        `Data comemorativa/evento: ${temDataComemorativa === 'sim' ? `Sim — ${dataComemorativaDescricao || 'sem detalhes'}` : temDataComemorativa === 'nao' ? 'Não' : 'Não informado'}`,
        `Novidade no negócio: ${temNovidade === 'sim' ? `Sim — ${novidadeDescricao || 'sem detalhes'}` : temNovidade === 'nao' ? 'Não' : 'Não informado'}`,
        '',
        '=== BLOCO 4 — CAPACIDADE DE PRODUÇÃO DO PERÍODO ===',
        `Disponibilidade para gravar vídeos: ${disponibilidadeVideo || 'Não informado'}`,
        `Fotos/materiais visuais novos: ${temMateriaisNovos === 'sim' ? `Sim — ${materiaisNovosDescricao || 'sem detalhes'}` : temMateriaisNovos === 'nao' ? 'Não' : 'Não informado'}`,
        `Quantidade de conteúdos desejada no período: ${quantidadeConteudos}`,
        '',
        observations ? `=== OBSERVAÇÕES ADICIONAIS ===\n${observations}` : '',
      ].filter(Boolean).join('\n');
      const fullObservations = respostasBlocos;

      const activeProductionLine = productionLine.filter(item => item.quantity > 0);
      const { data: periodPlan, error: createError } = await supabase.from('period_plans').insert({
        tenant_id: tenantId,
        company_id: selectedClient.id,
        period_title: periodTitle,
        period_start: format(periodStart, 'yyyy-MM-dd'),
        period_end: format(periodEnd, 'yyyy-MM-dd'),
        budget: budget || null,
        objective: 'Gerado automaticamente',
        priority_channel: priorityChannel,
        observations: fullObservations,
        client_acquisition: null,
        paid_traffic_budget: null,
        production_line: activeProductionLine,
        status: 'draft'
      } as any).select().single();
      if (createError) throw createError;
      setPeriodPlanId(periodPlan.id);

      // Generate the normal plan in BATCHES per format type.
      // Splitting the heavy single call into 3 smaller ones (one per format)
      // dramatically reduces per-call latency and avoids the 150s edge timeout,
      // while still saving partial progress between batches.
      setLoadingMessage("Gerando demandas normais...");
      setPollingProgress(5);
      // Reset local default state for this fresh generation
      setDefaultPlan([]);

      const batches = activeProductionLine
        .filter(b => b.quantity > 0)
        .map(b => ({ type: b.type, quantity: b.quantity }));

      let accumulatedDefault: PlanItem[] = [];
      const missing: { type: string; quantity: number }[] = [];

      const runBatch = async (b: { type: string; quantity: number }, isFinalBatch: boolean) => {
        const before = accumulatedDefault.length;
        setDefaultPlan(accumulatedDefault);
        const batchResult = await generateSinglePlan(periodPlan.id, 'default', {
          batchType: b.type,
          batchQuantity: b.quantity,
          isFinalBatch,
        });
        if (batchResult.success && Array.isArray(batchResult.mergedDefaultPlan)) {
          accumulatedDefault = batchResult.mergedDefaultPlan as PlanItem[];
        } else if (batchResult.success && Array.isArray(batchResult.plan)) {
          accumulatedDefault = [...accumulatedDefault, ...(batchResult.plan as PlanItem[])];
        }
        setDefaultPlan(accumulatedDefault);
        const generated = accumulatedDefault.length - before;
        return { ok: batchResult.success === true && generated >= b.quantity, generated };
      };

      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        const isFinalBatch = i === batches.length - 1;
        setLoadingMessage(`Gerando ${b.quantity} ${b.type} (${i + 1}/${batches.length})...`);
        const { ok, generated } = await runBatch(b, isFinalBatch);
        if (!ok) {
          const remaining = Math.max(0, b.quantity - generated);
          if (remaining > 0) missing.push({ type: b.type, quantity: remaining });
          console.warn(`[PlanPeriod] Batch ${b.type} incompleto: gerou ${generated}/${b.quantity}`);
        }
      }

      // Auto-retry missing batches once
      if (missing.length > 0) {
        setLoadingMessage(`Refazendo ${missing.length} lote(s) que falharam...`);
        const stillMissing: { type: string; quantity: number }[] = [];
        for (const m of missing) {
          const { ok, generated } = await runBatch(m, true);
          if (!ok) {
            const remaining = Math.max(0, m.quantity - generated);
            if (remaining > 0) stillMissing.push({ type: m.type, quantity: remaining });
          }
        }
        if (stillMissing.length > 0) {
          const list = stillMissing.map(s => `${s.quantity} ${s.type}`).join(', ');
          toast.warning(`Algumas demandas não puderam ser geradas: ${list}. Você pode refazer depois.`);
        }
      }

      const planData = accumulatedDefault;
      setPollingProgress(100);

      // Final consistency save (status enum only allows draft/generated/mode_selected/completed,
      // so keep 'draft' until ultra is generated, then flip to 'generated').
      const { error: saveError } = await supabase.from('period_plans').update({
        status: 'draft',
        default_plan: planData as unknown as null
      }).eq('id', periodPlan.id);
      if (saveError) {
        console.error('[PlanPeriod] Error saving default_plan to DB:', saveError);
      } else {
        console.log(`[PlanPeriod] default_plan saved to DB: ${planData.length} demands`);
      }
      setNormalSavedCount(planData.length);

      // Auto-generate ultra plan immediately after default
      setCurrentStep('loading-ultra');
      setLoadingMessage("Gerando demandas ultra...");
      setPollingProgress(10);

      const ultraResult = await generateSinglePlan(periodPlan.id, 'ultra');
      if (!ultraResult.success) {
        // Ultra failed but default was saved - redirect to approve anyway
        console.error('[PlanPeriod] Ultra generation failed:', ultraResult.error);
        toast.warning('Demandas normais geradas! Ultra não pôde ser gerado.');
        await supabase.from('period_plans').update({
          status: 'generated',
          default_plan: planData as unknown as null,
          final_plan: planData as unknown as null
        }).eq('id', periodPlan.id);
        navigate('/approve-cards');
        return;
      }

      const ultraData = ultraResult.plan as PlanItem[] || [];
      setUltraPlan(ultraData);
      setPollingProgress(100);

      const { error: ultraSaveError } = await supabase.from('period_plans').update({
        default_plan: planData as unknown as null,
        ultra_plan: ultraData as unknown as null,
        status: 'generated',
        final_plan: [...planData, ...ultraData] as unknown as null
      }).eq('id', periodPlan.id);
      if (ultraSaveError) {
        console.error('[PlanPeriod] Error saving ultra_plan to DB:', ultraSaveError);
      }

      setUltraSavedCount(ultraData.length);
      toast.success('Todas as demandas foram geradas! Aprove agora.');
      navigate('/approve-cards');
    } catch (error) {
      console.error('Error creating period plan:', error);
      toast.error(error instanceof Error ? error.message : "Erro ao gerar planos");
      setCurrentStep('form');
    }
  };


  // Finalize planning without ultra - redirect to approve cards
  const handleFinalizePlanning = async () => {
    try {
      const { error: finalizeError } = await supabase.from('period_plans').update({
        status: 'generated',
        default_plan: defaultPlan as unknown as null,
        final_plan: defaultPlan as unknown as null
      }).eq('id', periodPlanId!);
      if (finalizeError) console.error('[PlanPeriod] Finalize error:', finalizeError);
      toast.success('Período gerado! Agora aprove as demandas.');
      navigate('/approve-cards');
    } catch (error) {
      console.error('Error finalizing planning:', error);
      toast.error('Erro ao finalizar planejamento');
    }
  };

  // Generate ultra plans
  const handleGenerateUltra = async () => {
    try {
      setCurrentStep('loading-ultra');
      setLoadingMessage("Gerando demandas ultra...");
      setPollingProgress(10);

      const ultraResult = await generateSinglePlan(periodPlanId!, 'ultra');
      if (!ultraResult.success) {
        throw new Error(ultraResult.error || 'Erro ao gerar plano Ultra');
      }
      setUltraPlan(ultraResult.plan as PlanItem[] || []);
      setPollingProgress(100);
      
      // Save ultra plan and redirect to approve-cards
      const ultraData = ultraResult.plan as PlanItem[] || [];
      const { error: ultraSaveError } = await supabase.from('period_plans').update({
        ultra_plan: ultraData as unknown as null,
        status: 'generated',
        final_plan: [...defaultPlan, ...ultraData] as unknown as null
      }).eq('id', periodPlanId!);
      if (ultraSaveError) {
        console.error('[PlanPeriod] Error saving ultra_plan to DB:', ultraSaveError);
      }
      
      setUltraSavedCount((ultraResult.plan as PlanItem[])?.length || 0);
      toast.success('Demandas ultra geradas! Agora aprove as demandas.');
      navigate('/approve-cards');
    } catch (error) {
      console.error('Error generating ultra:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar planos ultra');
      navigate('/approve-cards');
    }
  };


  const renderForm = () => <div className="max-w-3xl mx-auto px-4 sm:px-0">
    {/* Incomplete Period Banner */}
    {incompletePeriod && <Card className="mb-6 p-4 border-primary/50 bg-primary/5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <PlayCircle className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">Período em andamento</h4>
          <p className="text-sm text-muted-foreground mb-3">
            <strong>{incompletePeriod.period_title}</strong> - Você tem um período com demandas geradas aguardando seleção.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleResumeIncomplete}>
              <PlayCircle className="w-4 h-4 mr-1" />
              Retomar
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissIncomplete}>
              Ignorar
            </Button>
          </div>
        </div>
      </div>
    </Card>}

    <div className="space-y-4 sm:space-y-6">
      {/* Period Info */}
      <Card className="p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Informações do Período
        </h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="periodTitle" className="text-sm">Título do Período *</Label>
            <Input id="periodTitle" placeholder="Ex: Campanha de Verão 2025" value={periodTitle} onChange={e => setPeriodTitle(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Data Início *</Label>
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !periodStart && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodStart ? format(periodStart, "dd/MM/yyyy", { locale: ptBR }) : <span className="truncate">Selecione</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                  <Calendar mode="single" selected={periodStart} onSelect={date => { setPeriodStart(date); setStartDateOpen(false); }} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Data Fim *</Label>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !periodEnd && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodEnd ? format(periodEnd, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                  <Calendar mode="single" selected={periodEnd} onSelect={date => { setPeriodEnd(date); setEndDateOpen(false); }} locale={ptBR} disabled={date => periodStart ? date < periodStart : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Channel Selection */}
          <div className="space-y-3">
            <Label className="text-sm">Selecione as redes prioritárias</Label>
            <div className="flex flex-wrap gap-3">
              {[{
                id: 'instagram', label: 'Instagram', icon: Instagram, color: 'from-pink-500 to-purple-500'
              }, {
                id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-500'
              }, {
                id: 'tiktok', label: 'TikTok',
                icon: () => <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" /></svg>,
                color: 'from-gray-900 to-gray-700'
              }, {
                id: 'youtube', label: 'YouTube', icon: Youtube, color: 'from-red-600 to-red-500'
              }, {
                id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'from-blue-700 to-blue-600'
              }].map(channel => {
                const isSelected = selectedChannels.includes(channel.id);
                const IconComponent = channel.icon;
                return <button key={channel.id} type="button" onClick={() => {
                  setSelectedChannels(prev => prev.includes(channel.id) ? prev.filter(c => c !== channel.id) : [...prev, channel.id]);
                }} className={cn("relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 min-w-[72px]", isSelected ? "border-primary bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.3)]" : "border-border/50 bg-card hover:border-primary/50 hover:bg-primary/5")}>
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-all", isSelected ? `bg-gradient-to-br ${channel.color} text-white` : "bg-muted text-muted-foreground")}>
                    <IconComponent />
                  </div>
                  <span className={cn("text-[10px] font-medium transition-colors", isSelected ? "text-foreground" : "text-muted-foreground")}>
                    {channel.label}
                  </span>
                  {isSelected && <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>}
                </button>;
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Bloco 1 — Objetivo do período */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          🎯 Bloco 1 — Objetivo do período
        </h3>
        <p className="text-sm text-muted-foreground mb-4">O que esse período precisa gerar para o negócio</p>
        <div className="space-y-5">
          <div>
            <Label className="text-sm">Qual é o objetivo principal deste período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: gerar vendas, atrair leads, lançar produto, crescer seguidores, educar o mercado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OBJETIVO_OPCOES.map(op => (
                <label key={op} className="flex items-center gap-2 p-2 rounded-md border border-border/50 hover:bg-muted/30 cursor-pointer">
                  <Checkbox
                    checked={objetivosSelecionados.includes(op)}
                    onCheckedChange={(checked) => {
                      if (checked) setObjetivosSelecionados([...objetivosSelecionados, op]);
                      else setObjetivosSelecionados(objetivosSelecionados.filter(o => o !== op));
                    }}
                  />
                  <span className="text-sm">{op}</span>
                </label>
              ))}
            </div>
            <Input className="mt-2" placeholder="Outro objetivo (campo livre)" value={objetivoOutro} onChange={e => setObjetivoOutro(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Você tem uma meta numérica para este período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: 30 vendas, 50 leads, 200 novos seguidores — deixe em branco se não tiver</p>
            <Input placeholder="Meta numérica (opcional)" value={metaNumerica} onChange={e => setMetaNumerica(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Por que esse objetivo é prioridade agora? O que está acontecendo?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: lançamento próximo, mês fraco no histórico, concorrente crescendo, estoque parado</p>
            <Textarea rows={3} value={porqueObjetivo} onChange={e => setPorqueObjetivo(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Bloco 2 — Produto/serviço em foco */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          🛍️ Bloco 2 — Produto ou serviço em foco
        </h3>
        <p className="text-sm text-muted-foreground mb-4">O que será promovido e como será vendido</p>
        <div className="space-y-5">
          <div>
            <Label className="text-sm">Qual produto ou serviço será o foco principal deste período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Se tiver mais de um, qual é o prioritário?</p>
            <Input value={produtoFoco} onChange={e => setProdutoFoco(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Vai ter promoção, bônus ou condição especial neste período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: desconto de 20%, bônus de consultoria, parcelamento especial, vagas limitadas</p>
            <RadioGroup value={temPromocao} onValueChange={(v) => setTemPromocao(v as any)} className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sim" /> <span className="text-sm">Sim</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="nao" /> <span className="text-sm">Não</span></label>
            </RadioGroup>
            {temPromocao === 'sim' && (
              <Textarea rows={2} placeholder="Descreva a promoção/bônus/condição" value={promocaoDescricao} onChange={e => setPromocaoDescricao(e.target.value)} />
            )}
          </div>
          <div>
            <Label className="text-sm">Como o cliente faz para comprar ou entrar em contato?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: link do site, WhatsApp, DM, formulário, telefone</p>
            <Input value={comoComprar} onChange={e => setComoComprar(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Bloco 3 — Contexto do período */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          📆 Bloco 3 — Contexto do período
        </h3>
        <p className="text-sm text-muted-foreground mb-4">O que torna este período diferente dos outros</p>
        <div className="space-y-5">
          <div>
            <Label className="text-sm">Existe alguma data comemorativa, evento ou marco importante neste período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: Dia das Mães, aniversário da empresa, feriado prolongado, evento do setor</p>
            <RadioGroup value={temDataComemorativa} onValueChange={(v) => setTemDataComemorativa(v as any)} className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sim" /> <span className="text-sm">Sim</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="nao" /> <span className="text-sm">Não</span></label>
            </RadioGroup>
            {temDataComemorativa === 'sim' && (
              <Textarea rows={2} placeholder="Quais datas/eventos/marcos?" value={dataComemorativaDescricao} onChange={e => setDataComemorativaDescricao(e.target.value)} />
            )}
          </div>
          <div>
            <Label className="text-sm">Tem alguma novidade no negócio que precisa ser comunicada agora?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: novo serviço, mudança de preço, nova estrutura, parceria, conquista recente</p>
            <RadioGroup value={temNovidade} onValueChange={(v) => setTemNovidade(v as any)} className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sim" /> <span className="text-sm">Sim</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="nao" /> <span className="text-sm">Não</span></label>
            </RadioGroup>
            {temNovidade === 'sim' && (
              <Textarea rows={2} placeholder="Qual é a novidade?" value={novidadeDescricao} onChange={e => setNovidadeDescricao(e.target.value)} />
            )}
          </div>
        </div>
      </Card>

      {/* Bloco 4 — Capacidade de produção do período */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          🎬 Bloco 4 — Capacidade de produção do período
        </h3>
        <p className="text-sm text-muted-foreground mb-4">O que é possível entregar neste período específico</p>
        <div className="space-y-5">
          <div>
            <Label className="text-sm">Neste período você terá disponibilidade para gravar vídeos?</Label>
            <p className="text-xs text-muted-foreground mb-2">Pode mudar a cada período — férias, agenda cheia, viagem</p>
            <RadioGroup value={disponibilidadeVideo} onValueChange={(v) => setDisponibilidadeVideo(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sim" /> <span className="text-sm">Sim</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="nao" /> <span className="text-sm">Não</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="talvez" /> <span className="text-sm">Talvez</span></label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-sm">Terá acesso a fotos ou materiais visuais novos para usar?</Label>
            <p className="text-xs text-muted-foreground mb-2">Ex: ensaio fotográfico marcado, registro de evento, produto novo chegando</p>
            <RadioGroup value={temMateriaisNovos} onValueChange={(v) => setTemMateriaisNovos(v as any)} className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sim" /> <span className="text-sm">Sim</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="nao" /> <span className="text-sm">Não</span></label>
            </RadioGroup>
            {temMateriaisNovos === 'sim' && (
              <Textarea rows={2} placeholder="Descreva os materiais visuais novos" value={materiaisNovosDescricao} onChange={e => setMateriaisNovosDescricao(e.target.value)} />
            )}
          </div>
          <div>
            <Label className="text-sm">Quantos conteúdos você quer produzir neste período?</Label>
            <p className="text-xs text-muted-foreground mb-2">Sugerido pela estratégia: {productionLineTotal} conteúdos — ajuste conforme necessário</p>
            <Input
              type="number"
              min={1}
              value={quantidadeConteudos}
              onChange={e => setQuantidadeConteudos(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="observations" className="text-sm">Observações adicionais (opcional)</Label>
            <Textarea id="observations" placeholder="Qualquer informação adicional relevante..." value={observations} onChange={e => setObservations(e.target.value)} rows={3} />
          </div>
        </div>
      </Card>
    </div>
  </div>;

  const renderCompleted = () => {
    const totalDemands = normalSavedCount + ultraSavedCount;
    return <div className="max-w-2xl mx-auto text-center">
      <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6">
        <Check className="w-12 h-12 text-white" />
      </div>
      <h2 className="text-3xl font-bold mb-4">Período Gerado com Sucesso!</h2>
      <p className="text-muted-foreground mb-8">
        As demandas foram geradas e estão prontas para aprovação.
      </p>

      <Card className="p-6 text-left mb-8">
        <h3 className="font-semibold mb-4">Resumo do Planejamento:</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Período:</span> {periodTitle}</p>
          <p><span className="text-muted-foreground">Demandas Normais:</span> {normalSavedCount}</p>
          <p><span className="text-muted-foreground">Demandas Ultra:</span> {ultraSavedCount}</p>
          <p><span className="text-muted-foreground">Total gerado:</span> {totalDemands}</p>
        </div>
      </Card>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={() => navigate('/client-hub')}>
          Voltar ao Hub
        </Button>
        <Button onClick={() => navigate('/approve-cards')}>
          <CheckSquare className="w-4 h-4 mr-2" />
          Aprovar Demandas
        </Button>
      </div>
    </div>;
  };

  const renderHistory = () => {
    return <div className="max-w-4xl mx-auto">
      {loadingHistory ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : periodHistory.length === 0 ? (
        <Card className="p-8 text-center">
          <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum período planejado</h3>
          <p className="text-muted-foreground mb-4">Você ainda não criou nenhum planejamento de período para este cliente.</p>
          <Button onClick={() => setActiveTab('new')}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Primeiro Período
          </Button>
        </Card>
      ) : searchParams.get('view') === 'latest' && selectedHistoryPlan ? (
        null
      ) : (
        <div className="bg-muted/30 rounded-xl border border-border/50 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.5fr_1fr_auto] sm:grid-cols-[2fr_1fr_140px] items-center gap-4 px-5 py-3 border-b border-border/50 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Nome do período</div>
            <div>Data do período</div>
            <div className="text-right">Ações</div>
          </div>
          <div className="divide-y divide-border/50">
            {periodHistory.map(period => (
              <div
                key={period.id}
                className="grid grid-cols-[1.5fr_1fr_auto] sm:grid-cols-[2fr_1fr_140px] items-center gap-4 px-5 py-3 bg-background hover:bg-muted/50 transition-colors duration-200 group cursor-pointer"
                onClick={() => setSelectedHistoryPlan(period)}
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">
                    {period.period_title}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-sm text-foreground truncate block">
                    {format(new Date(period.period_start + 'T00:00:00'), "dd/MM/yyyy")} – {format(new Date(period.period_end + 'T00:00:00'), "dd/MM/yyyy")}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); setPeriodToDelete(period); }}
                    aria-label="Excluir período"
                    title="Excluir período e cards vinculados"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

      )}

      {/* ===== DETAIL VIEW ===== */}
      {selectedHistoryPlan && (() => {
        const isLatestView = searchParams.get('view') === 'latest';
        const metrics = periodDemandMetrics[selectedHistoryPlan.id] || { total: 0, published: 0, demands: [] };
        const pending = metrics.total - metrics.published;
        const executionPercent = metrics.total > 0 ? Math.round((metrics.published / metrics.total) * 100) : 0;

        const executedDemands = metrics.demands
          .filter((d: any) => d.pipeline_statuses?.is_final)
          .sort((a: any, b: any) => (a.publish_date || '').localeCompare(b.publish_date || ''));

        const pendingDemands = metrics.demands
          .filter((d: any) => !d.pipeline_statuses?.is_final)
          .sort((a: any, b: any) => (a.publish_date || '').localeCompare(b.publish_date || ''));

        // --- "Período Atual": show approved demands from DB ---
        if (isLatestView) {
          const isUltraMode = searchParams.get('mode') === 'ultra';
          const allClientDemands = periodDemandMetrics['__all_client__']?.demands || [];
          
          // Show demands linked to this period + unlinked (manual) demands
          const periodDemands = allClientDemands.filter((d: any) => 
            d.period_plan_id === selectedHistoryPlan.id || !d.period_plan_id
          );
          
          const filteredDemands = isUltraMode 
            ? (metrics.demands || []).filter((d: any) => d.source === 'card')
            : periodDemands;
          
          const sortedDemands = [...filteredDemands].sort((a: any, b: any) => 
            (a.publish_date || '').localeCompare(b.publish_date || '')
          );

          return (
            <div className="space-y-6">
              {/* Period date - large */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="w-5 h-5 text-primary" />
                  <span className="text-xl font-bold text-foreground">
                    {format(new Date(selectedHistoryPlan.period_start + 'T00:00:00'), "dd/MM/yyyy")} – {format(new Date(selectedHistoryPlan.period_end + 'T00:00:00'), "dd/MM/yyyy")}
                  </span>
                </div>
                <Badge variant="secondary" className="text-sm px-3 py-1">{sortedDemands.length} demandas</Badge>
              </div>

              {sortedDemands.length > 0 ? (
                <div className="grid gap-2">
                  {sortedDemands.map((demand: any, idx: number) => {
                    const statusInfo = demand.pipeline_statuses;
                    return (
                      <div
                        key={demand.id || idx}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                      >
                        <h4 className="text-base font-bold text-foreground truncate flex-1 min-w-0">{demand.title}</h4>
                        <div className="flex items-center gap-2 shrink-0">
                          {demand.demand_type && <Badge variant="secondary" className="text-xs">{demand.demand_type}</Badge>}
                          {statusInfo && (
                            <Badge 
                              className="text-[10px] px-2 py-0.5" 
                              style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color, borderColor: `${statusInfo.color}40` }}
                            >
                              {statusInfo.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma demanda aprovada neste período</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/approve-cards')}>
                    Ir para Aprovação
                  </Button>
                </div>
              )}
            </div>
          );
        }

        // --- Normal history modal ---
        return (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedHistoryPlan(null)}>
            <Card className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b bg-muted/30 relative">
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold">{selectedHistoryPlan.period_title}</h2>
                  <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarIcon className="w-4 h-4" />
                    {format(new Date(selectedHistoryPlan.period_start + 'T00:00:00'), "dd/MM/yyyy")} – {format(new Date(selectedHistoryPlan.period_end + 'T00:00:00'), "dd/MM/yyyy")}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedHistoryPlan(null)} className="absolute top-4 right-4" aria-label="Fechar detalhes">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {(() => {
                  // Build a unified list of all demands of this period.
                  // Prefer real DB demands; merge plan items not matched by title.
                  const dbDemands = (metrics.demands || []).map((d: any) => ({
                    key: `db-${d.id}`,
                    title: d.title || 'Sem título',
                    tipo: d.demand_type || '',
                    status: d.pipeline_statuses,
                    raw: d,
                    source: 'db' as const,
                  }));
                  const dbTitles = new Set(dbDemands.map(d => d.title.trim().toLowerCase()));

                  const planItems: any[] = [
                    ...(selectedHistoryPlan.final_plan || []),
                    ...(selectedHistoryPlan.default_plan || []),
                    ...(selectedHistoryPlan.ultra_plan || []),
                  ];
                  const extraPlan = planItems
                    .map((item: any, idx: number) => ({
                      key: `plan-${idx}`,
                      title: item.titulo || item.title || 'Sem título',
                      tipo: item.tipo || item.tipo_conteudo || item.type || '',
                      status: null as any,
                      raw: item,
                      source: 'plan' as const,
                    }))
                    .filter(item => !dbTitles.has(item.title.trim().toLowerCase()));

                  // Dedupe extras by title
                  const seen = new Set<string>();
                  const uniqueExtras = extraPlan.filter(i => {
                    const k = i.title.trim().toLowerCase();
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                  });

                  const allDemands = [...dbDemands, ...uniqueExtras];

                  if (allDemands.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhum card disponível neste período</p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-muted/30 rounded-xl border border-border/50 overflow-hidden">
                      {/* Header */}
                      <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 border-b border-border/50 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <div>Nome do card</div>
                        <div className="text-right">Tags</div>
                      </div>
                      <div className="divide-y divide-border/50">
                        {allDemands.map((d) => (
                          <div
                            key={d.key}
                            className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setSelectedDemandDetail(d)}
                          >
                            <span className="text-base font-semibold text-foreground truncate">{d.title}</span>
                            <div className="flex items-center gap-2 shrink-0 justify-end">
                              {d.tipo && <Badge variant="secondary" className="text-xs">{d.tipo}</Badge>}
                              {d.status && (
                                <Badge
                                  className="text-xs"
                                  style={{ backgroundColor: `${d.status.color}20`, color: d.status.color, borderColor: `${d.status.color}40` }}
                                >
                                  {d.status.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>



              <div className="p-4 border-t bg-muted/30 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {metrics.published} de {metrics.total} demandas executadas ({executionPercent}%)
                </p>
                <div className="flex gap-2">
                  {selectedHistoryPlan.status === 'completed' && (
                    <Button onClick={() => navigate('/kanban-central')}>
                      <LayoutGrid className="w-4 h-4 mr-2" />
                      Ver no Kanban
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Demand detail dialog */}
      <Dialog open={!!selectedDemandDetail} onOpenChange={(open) => !open && setSelectedDemandDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedDemandDetail && (() => {
            const d = selectedDemandDetail;
            const raw = d.raw || {};
            const objetivo = raw.objective || raw.objetivo || '';
            const content = raw.description || raw.descricao || raw.conteudo || raw.texto_da_peca || raw.descricao_da_tarefa || '';
            const instrucoes = raw.instrucoes_de_producao || raw.production_instructions || '';
            const cta = raw.cta_recomendado || raw.cta || '';
            const channel = raw.channel || raw.canal || '';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">{d.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.tipo && <Badge variant="secondary">{d.tipo}</Badge>}
                    {channel && <Badge variant="outline">{channel}</Badge>}
                    {d.status && (
                      <Badge
                        style={{ backgroundColor: `${d.status.color}20`, color: d.status.color, borderColor: `${d.status.color}40` }}
                      >
                        {d.status.name}
                      </Badge>
                    )}
                  </div>
                  {objetivo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Objetivo</p>
                      <p className="text-sm text-foreground whitespace-pre-line">{objetivo}</p>
                    </div>
                  )}
                  {content && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Conteúdo</p>
                      <div className="text-sm bg-muted/50 rounded-lg p-3 border whitespace-pre-line">{content}</div>
                    </div>
                  )}
                  {instrucoes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Instruções de Produção</p>
                      <div className="text-sm bg-muted/50 rounded-lg p-3 border whitespace-pre-line">{instrucoes}</div>
                    </div>
                  )}
                  {cta && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">CTA Recomendado</p>
                      <p className="text-sm">{cta}</p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      {periodToDelete && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !isDeleting && setPeriodToDelete(null)}>
        <Card className="max-w-2xl w-full p-6 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Excluir Período</h2>
              <p className="text-sm text-muted-foreground">Essa ação vai excluir todos os cards gerados por este período. Não pode ser desfeita.</p>
            </div>
          </div>
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <p className="font-medium">{periodToDelete.period_title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(periodToDelete.period_start + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(periodToDelete.period_end + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>

          <div className="mb-4 flex-1 min-h-0 flex flex-col">
            <p className="text-sm font-medium mb-2">
              Cards vinculados {loadingLinkedDemands ? '' : `(${linkedDemands.length})`}
            </p>
            <div className="flex-1 overflow-y-auto border border-border/50 rounded-lg bg-background">
              {loadingLinkedDemands ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Carregando cards vinculados...</div>
              ) : linkedDemands.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum card vinculado a este período.</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {linkedDemands.map((d: any) => (
                    <li key={d.id} className="p-3 flex items-start justify-between gap-3 hover:bg-muted/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{d.title || 'Sem título'}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {d.demand_type && <span>{d.demand_type}</span>}
                          {d.channel && <span>· {d.channel}</span>}
                          {d.tenant_companies?.name && <span>· {d.tenant_companies.name}</span>}
                          {d.created_at && <span>· {format(new Date(d.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>}
                        </div>
                      </div>
                      {d.pipeline_statuses?.name && (
                        <span
                          className="text-xs px-2 py-1 rounded-full shrink-0 font-medium"
                          style={{
                            backgroundColor: `${d.pipeline_statuses.color || '#6366f1'}22`,
                            color: d.pipeline_statuses.color || '#6366f1',
                          }}
                        >
                          {d.pipeline_statuses.name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setPeriodToDelete(null)} disabled={isDeleting}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeletePeriod} disabled={isDeleting || loadingLinkedDemands}>
              {isDeleting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Excluindo...</> : <><Trash2 className="w-4 h-4 mr-2" />Excluir período e cards</>}
            </Button>
          </div>
        </Card>
      </div>}
    </div>;
  };

  const renderLoading = (message: string) => (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="relative">
        <Sparkles className="h-16 w-16 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{message}</h2>
        <p className="text-muted-foreground max-w-md">Aguarde alguns segundos...</p>
      </div>
      <div className="w-full max-w-md space-y-2">
        <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500 ease-out rounded-full" style={{ width: `${pollingProgress}%` }} />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{Math.round(pollingProgress)}% concluído</span>
          <span>{pollingProgress >= 100 ? 'Finalizando...' : 'Aguarde'}</span>
        </div>
      </div>
    </div>
  );

  return <div className="pb-8">
    <PageHeader title={searchParams.get('view') === 'latest' ? (searchParams.get('mode') === 'ultra' ? "Demanda Ultra" : "Demanda Comum") : activeTab === 'history' ? "Histórico de Períodos" : "Planejar Período"} subtitle={displayName} backTo="/client-hub" actions={currentStep === 'form' && activeTab === 'new' ? [{
      label: "Gerar Demandas",
      onClick: handleSubmit,
      icon: <Rocket className="w-4 h-4" />,
      className: "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
      disabled: !periodTitle || !periodStart || !periodEnd
    }] : []} rightContent={currentStep === 'completed' ? <Badge variant="outline" className="text-xs">Concluído</Badge> : null} />

    <div className="container max-w-6xl mx-auto px-6 py-8">
      {currentStep === 'form' && (activeTab === 'history' ? renderHistory() : renderForm())}

      {currentStep === 'loading-normal' && renderLoading(loadingMessage)}
      {currentStep === 'loading-ultra' && renderLoading(loadingMessage)}

      {/* choose-ultra step removed: flow now auto-generates ultra and goes
          straight to /approve-cards. Kept type for backward compat only. */}

      {currentStep === 'completed' && renderCompleted()}
    </div>
  </div>;
};
export default PlanPeriod;
