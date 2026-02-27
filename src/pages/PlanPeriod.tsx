// Plan Period Page
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Zap, Shield, Rocket, Check, X, Package, History, Plus, Calendar as CalendarIcon, Target, ChevronRight, LayoutGrid, Trash2, AlertTriangle, PlayCircle, List, RefreshCw, Eye, Instagram, Facebook, Youtube, Linkedin, Clock, ChevronDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose, DrawerFooter } from "@/components/ui/drawer";
import { DemandaCard, DemandaItem } from "@/components/DemandaCard";
import { DemandReviewModal } from "@/components/DemandReviewModal";
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

type Step = 'form' | 'loading-normal' | 'review-normal' | 'choose-ultra' | 'loading-ultra' | 'review-ultra' | 'completed';

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
  const [expandedLatestCard, setExpandedLatestCard] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);

  // Demand execution metrics per period
  const [periodDemandMetrics, setPeriodDemandMetrics] = useState<Record<string, { total: number; published: number; demands: any[] }>>({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

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
  const [productionLine, setProductionLine] = useState<{ type: string; quantity: number }[]>([
    { type: 'Vídeos Curtos', quantity: 0 },
    { type: 'Carrossel', quantity: 0 },
    { type: 'Post Estático', quantity: 0 },
    { type: 'Stories', quantity: 0 },
  ]);
  const productionLineTotal = productionLine.reduce((sum, item) => sum + item.quantity, 0);
  
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

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

        // Check for incomplete periods
        const incomplete = historyData.find(p => p.status === 'generating_default' || p.status === 'generating_ultra' || p.status === 'review_normal');
        if (incomplete) {
          setIncompletePeriod(incomplete);
        }

        // Fetch demand metrics for all periods
        if (historyData.length > 0) {
          setLoadingMetrics(true);
          const periodIds = historyData.map(p => p.id);
          const { data: demandsData, error: demandsError } = await supabase
            .from('demands')
            .select(`
              id, title, period_plan_id, channel, demand_type, publish_date, publish_time,
              pipeline_statuses!demands_status_id_fkey (
                name, is_final, color
              )
            `)
            .eq('tenant_id', tenantId)
            .in('period_plan_id', periodIds);

          if (!demandsError && demandsData) {
            const metrics: Record<string, { total: number; published: number; demands: any[] }> = {};
            demandsData.forEach(d => {
              if (!d.period_plan_id) return;
              if (!metrics[d.period_plan_id]) {
                metrics[d.period_plan_id] = { total: 0, published: 0, demands: [] };
              }
              metrics[d.period_plan_id].total++;
              metrics[d.period_plan_id].demands.push(d);
              if (d.pipeline_statuses?.is_final) {
                metrics[d.period_plan_id].published++;
              }
            });
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
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  if (!selectedClient || !tenantId) return null;
  const displayName = selectedClient.fantasy_name || selectedClient.name;

  // Resume incomplete period
  const handleResumeIncomplete = async () => {
    if (!incompletePeriod) return;
    setPeriodPlanId(incompletePeriod.id);
    setDefaultPlan(incompletePeriod.default_plan as PlanItem[] || []);
    setUltraPlan(incompletePeriod.ultra_plan as PlanItem[] || []);
    
    if (incompletePeriod.status === 'review_normal' && incompletePeriod.default_plan && incompletePeriod.default_plan.length > 0) {
      setCurrentStep('review-normal');
    } else if (incompletePeriod.default_plan && incompletePeriod.default_plan.length > 0) {
      setCurrentStep('review-normal');
    }
    setIncompletePeriod(null);
    toast.success("Período retomado com sucesso!");
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

  const handleDeletePeriod = async () => {
    if (!periodToDelete) return;
    setIsDeleting(true);
    try {
      await supabase.from('demands').delete().eq('period_plan_id', periodToDelete.id);
      const { error } = await supabase.from('period_plans').delete().eq('id', periodToDelete.id);
      if (error) throw error;
      setPeriodHistory(prev => prev.filter(p => p.id !== periodToDelete.id));
      toast.success("Período excluído com sucesso");
      setPeriodToDelete(null);
    } catch (error) {
      console.error('Error deleting period:', error);
      toast.error("Erro ao excluir período");
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate a single plan type - use direct response, polling as fallback
  const generateSinglePlan = async (planId: string, planType: 'default' | 'ultra'): Promise<{ success: boolean; plan?: any[]; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-period-plans', {
        body: { periodPlanId: planId, tenantId, planType }
      });
      
      console.log(`[PlanPeriod] Edge function response (${planType}):`, { data, error });

      // Use direct response if available
      if (!error && data?.success && data?.plan && Array.isArray(data.plan) && data.plan.length > 0) {
        console.log(`[PlanPeriod] Direct response: ${data.plan.length} demands for ${planType}`);
        return { success: true, plan: data.plan };
      }

      if (error) {
        console.error(`[PlanPeriod] Edge function error (${planType}):`, error);
      }
    } catch (err) {
      console.error(`[PlanPeriod] Edge function invocation failed (${planType}):`, err);
    }

    // Fallback: polling
    console.warn('[PlanPeriod] Direct response failed, falling back to polling');
    const fieldName = planType === 'default' ? 'default_plan' : 'ultra_plan';
    for (let attempt = 0; attempt < 40; attempt++) {
      setPollingProgress(Math.min(10 + attempt * 2, 90));
      await new Promise(resolve => setTimeout(resolve, 4000));
      const { data, error } = await supabase
        .from('period_plans')
        .select(`status, ${fieldName}`)
        .eq('id', planId)
        .single();
      
      if (error) continue;
      if (data.status === 'error') {
        return { success: false, error: 'Erro na geração. Verifique o prompt em /dev/prompts' };
      }

      const planData = (data as any)[fieldName];
      if (planData && Array.isArray(planData) && planData.length > 0) {
        console.log(`[PlanPeriod] Polling success: ${planData.length} demands for ${planType}`);
        return { success: true, plan: planData };
      }
    }
    return { success: false, error: 'Tempo limite excedido' };
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
        instructions: [descricao, instrucoesParts.length > 0 ? instrucoesParts.join('\n\n') : ''].filter(Boolean).join('\n\n') || null,
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
    if (productionLineTotal === 0) {
      toast.error("Defina a linha de produção antes de gerar demandas");
      return;
    }
    setCurrentStep('loading-normal');
    try {
      const priorityChannel = selectedChannels.length === 0 ? 'Multi-canal' : selectedChannels.length === 1 ? selectedChannels[0].charAt(0).toUpperCase() + selectedChannels[0].slice(1) : selectedChannels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
      const fullObservations = observations || null;

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

      // Generate ONLY the normal plan
      setLoadingMessage("Gerando demandas normais...");
      setPollingProgress(10);
      const defaultResult = await generateSinglePlan(periodPlan.id, 'default');
      if (!defaultResult.success) {
        throw new Error(defaultResult.error || 'Erro ao gerar plano Normal');
      }
      setDefaultPlan(defaultResult.plan as PlanItem[] || []);
      setPollingProgress(100);

      // Go to review-normal
      await supabase.from('period_plans').update({ status: 'review_normal' }).eq('id', periodPlan.id);
      setCurrentStep('review-normal');
    } catch (error) {
      console.error('Error creating period plan:', error);
      toast.error(error instanceof Error ? error.message : "Erro ao gerar planos");
      setCurrentStep('form');
    }
  };

  // Handle confirm from normal review - save to kanban, then show ultra choice
  const handleReviewNormalConfirm = async (selectedDemands: PlanItem[], _smartSelections: PlanItem[]) => {
    setReviewModalOpen(false);
    try {
      const savedCount = await saveDemandToKanban(selectedDemands);
      setNormalSavedCount(savedCount);
      toast.success(`${savedCount} demandas normais salvas no Kanban!`);
      setCurrentStep('choose-ultra');
    } catch (error) {
      console.error('Error in normal confirm flow:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar');
      setCurrentStep('review-normal');
    }
  };

  // Finalize planning without ultra
  const handleFinalizePlanning = async () => {
    try {
      await supabase.from('period_plans').update({
        status: 'completed',
        final_plan: defaultPlan as unknown as null
      }).eq('id', periodPlanId!);
      setCurrentStep('completed');
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
      setCurrentStep('review-ultra');
    } catch (error) {
      console.error('Error generating ultra:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar planos ultra');
      setCurrentStep('choose-ultra');
    }
  };

  // Handle confirm from ultra review - save to kanban, complete
  const handleReviewUltraConfirm = async (selectedDemands: PlanItem[], _smartSelections: PlanItem[]) => {
    setReviewModalOpen(false);
    try {
      const savedCount = await saveDemandToKanban(selectedDemands);
      setUltraSavedCount(savedCount);
      toast.success(`${savedCount} demandas ultra salvas no Kanban!`);

      // Mark as completed
      await supabase.from('period_plans').update({
        status: 'completed',
        final_plan: [...defaultPlan, ...ultraPlan] as unknown as null
      }).eq('id', periodPlanId!);

      setCurrentStep('completed');
    } catch (error) {
      console.error('Error in ultra confirm flow:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar');
    }
  };

  // Handle regenerate - regenerate only the current step's plan type
  const handleRegenerate = async () => {
    if (!periodPlanId) return;
    setIsRegenerating(true);
    setReviewModalOpen(false);
    
    const isNormalStep = currentStep === 'review-normal';
    const planType = isNormalStep ? 'default' : 'ultra';
    const fieldToReset = isNormalStep ? 'default_plan' : 'ultra_plan';

    try {
      await supabase.from('period_plans').update({ [fieldToReset]: [] }).eq('id', periodPlanId);
      
      setCurrentStep(isNormalStep ? 'loading-normal' : 'loading-ultra');
      setLoadingMessage(isNormalStep ? "Regenerando demandas normais..." : "Regenerando demandas ultra...");
      setPollingProgress(10);

      const result = await generateSinglePlan(periodPlanId, planType);
      if (!result.success) throw new Error(result.error || 'Erro ao regenerar');
      
      if (isNormalStep) {
        setDefaultPlan(result.plan as PlanItem[] || []);
      } else {
        setUltraPlan(result.plan as PlanItem[] || []);
      }
      setPollingProgress(100);

      setCurrentStep(isNormalStep ? 'review-normal' : 'review-ultra');
      toast.success('Demandas regeneradas com sucesso!');
    } catch (error) {
      console.error('Error regenerating:', error);
      toast.error('Erro ao regenerar demandas');
      setCurrentStep(isNormalStep ? 'review-normal' : 'review-ultra');
    } finally {
      setIsRegenerating(false);
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

      {/* Production Line */}
      <Card className="p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
          <List className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Linha de Produção *
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Defina a quantidade exata de cada formato de conteúdo para este período.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {productionLine.map((item, index) => (
            <div key={item.type} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/50 bg-muted/30">
              <Label className="text-sm font-medium">{item.type}</Label>
              <div className="flex items-center gap-0">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-r-none border-r-0"
                  onClick={() => {
                    const newLine = [...productionLine];
                    newLine[index] = { ...item, quantity: Math.max(0, item.quantity - 1) };
                    setProductionLine(newLine);
                  }}
                  disabled={item.quantity === 0}
                >
                  <span className="text-lg font-medium">−</span>
                </Button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^[0-9]$/.test(val)) {
                      const newLine = [...productionLine];
                      newLine[index] = { ...item, quantity: val === '' ? 0 : parseInt(val) };
                      setProductionLine(newLine);
                    }
                  }}
                  className="h-9 w-12 text-center border border-input bg-background text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring"
                  maxLength={1}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-l-none border-l-0"
                  onClick={() => {
                    const newLine = [...productionLine];
                    newLine[index] = { ...item, quantity: Math.min(9, item.quantity + 1) };
                    setProductionLine(newLine);
                  }}
                >
                  <span className="text-lg font-medium">+</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-sm font-semibold">
            Total: {productionLineTotal} conteúdo{productionLineTotal !== 1 ? 's' : ''}
          </span>
          {productionLineTotal === 0 && (
            <span className="text-xs text-destructive">Preencha ao menos 1 formato</span>
          )}
        </div>
      </Card>

      {/* Observations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-muted-foreground" />
          Restrições do Período
        </h3>
        
        <div className="space-y-6">
          <div className="space-y-4">
            {[{
              id: 'no-video-appearance', category: 'Disponibilidade para aparecer', label: 'O cliente NÃO pode aparecer em vídeos.'
            }, {
              id: 'no-products-environment', category: 'Ambiente e recursos visuais', label: 'O cliente NÃO pode disponibilizar produtos/ambiente para fotos/vídeos.'
            }, {
              id: 'no-clients-patients', category: 'Limitações legais do segmento', label: 'O cliente NÃO pode mostrar clientes/pacientes.'
            }, {
              id: 'no-visual-materials', category: 'Limitações operacionais', label: 'O cliente NÃO possui materiais visuais suficientes (fotos/vídeos).'
            }, {
              id: 'no-promotional-content', category: 'Restrições de narrativa e posicionamento', label: 'O cliente NÃO quer conteúdos promocionais.'
            }].map(restriction => <div key={restriction.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
              <Checkbox id={restriction.id} checked={excludedFormats.includes(restriction.id)} onCheckedChange={checked => {
                if (checked) setExcludedFormats([...excludedFormats, restriction.id]);
                else setExcludedFormats(excludedFormats.filter(f => f !== restriction.id));
              }} className="mt-0.5" />
              <label htmlFor={restriction.id} className="cursor-pointer flex-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">{restriction.category}</span>
                <span className="text-sm leading-snug">{restriction.label}</span>
              </label>
            </div>)}
          </div>

          <div>
            <Label htmlFor="observations">Observações Adicionais (opcional)</Label>
            <Textarea id="observations" placeholder="Informe restrições, datas comemorativas importantes, produtos em foco, ou qualquer informação relevante..." value={observations} onChange={e => setObservations(e.target.value)} rows={4} />
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
      <h2 className="text-3xl font-bold mb-4">Período Planejado com Sucesso!</h2>
      <p className="text-muted-foreground mb-8">
        Todas as demandas selecionadas já foram salvas no Kanban.
      </p>

      <Card className="p-6 text-left mb-8">
        <h3 className="font-semibold mb-4">Resumo do Planejamento:</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Período:</span> {periodTitle}</p>
          <p><span className="text-muted-foreground">Demandas Normais:</span> {normalSavedCount}</p>
          <p><span className="text-muted-foreground">Demandas Ultra:</span> {ultraSavedCount}</p>
          <p><span className="text-muted-foreground">Total salvo no Kanban:</span> {totalDemands}</p>
        </div>
      </Card>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={() => navigate('/client-hub')}>
          Voltar ao Hub
        </Button>
        <Button onClick={() => navigate('/kanban-central')}>
          <LayoutGrid className="w-4 h-4 mr-2" />
          Ver no Kanban
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
        <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
          <div className="flex flex-col gap-2">
            {periodHistory.map(period => (
              <div
                key={period.id}
                className="flex items-center justify-between gap-4 px-5 py-4 bg-background rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-all duration-200 group"
                onClick={() => setSelectedHistoryPlan(period)}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-base sm:text-lg font-bold text-foreground truncate block">
                    {period.period_title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(period.period_start + 'T00:00:00'), "dd/MM/yyyy")} – {format(new Date(period.period_end + 'T00:00:00'), "dd/MM/yyyy")}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
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

        // --- "Período Atual": show only generated cards inline ---
        if (isLatestView) {
          const plan = selectedHistoryPlan.final_plan?.length ? selectedHistoryPlan.final_plan
            : selectedHistoryPlan.default_plan?.length ? selectedHistoryPlan.default_plan
            : selectedHistoryPlan.ultra_plan?.length ? selectedHistoryPlan.ultra_plan
            : [];

          const getType = (item: any) => item.tipo || item.tipo_conteudo || item.type || '';
          const getTitle = (item: any) => item.titulo || item.title || 'Sem título';
          const getObjective = (item: any) => item.objetivo || item.objective || '';

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
                <Badge variant="secondary" className="text-sm px-3 py-1">{plan.length} demandas</Badge>
              </div>

              {plan.length > 0 ? (
                <div className="grid gap-3">
                  {plan.map((item: any, idx: number) => {
                    const tipo = getType(item);
                    const title = getTitle(item);
                    const objetivo = getObjective(item);
                    return (
                      <Card
                        key={idx}
                        className="p-4 cursor-pointer hover:bg-muted/50 transition-all duration-200 hover:shadow-md border-border/50"
                        onClick={() => setExpandedLatestCard(expandedLatestCard === idx ? null : idx)}
                      >
                        {/* Summary - always visible */}
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {tipo && <Badge variant="secondary" className="text-xs">{tipo}</Badge>}
                            </div>
                            <h4 className="font-semibold text-foreground">{title}</h4>
                            {objetivo && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{objetivo}</p>
                            )}
                          </div>
                          <ChevronDown className={cn("w-5 h-5 text-muted-foreground shrink-0 transition-transform mt-1", expandedLatestCard === idx && "rotate-180")} />
                        </div>

                        {/* Expanded detail */}
                        {expandedLatestCard === idx && (
                          <div className="mt-4 pt-4 border-t border-border/50" onClick={e => e.stopPropagation()}>
                            <DemandaCard demanda={item as unknown as DemandaItem} />
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma demanda gerada neste período</p>
                </div>
              )}
            </div>
          );
        }

        // --- Normal history modal ---
        return (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedHistoryPlan(null)}>
            <Card className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold">{selectedHistoryPlan.period_title}</h2>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4" />
                        {format(new Date(selectedHistoryPlan.period_start + 'T00:00:00'), "dd/MM/yyyy")} – {format(new Date(selectedHistoryPlan.period_end + 'T00:00:00'), "dd/MM/yyyy")}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedHistoryPlan(null)} className="shrink-0" aria-label="Fechar detalhes">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <Card className="p-5 border-primary/20 bg-primary/5">
                  <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Resumo Executivo
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{metrics.total}</p>
                      <p className="text-xs text-muted-foreground">Aprovadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-600">{metrics.published}</p>
                      <p className="text-xs text-muted-foreground">Publicadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-600">{pending}</p>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{executionPercent}%</p>
                      <p className="text-xs text-muted-foreground">Execução</p>
                    </div>
                  </div>
                  <Progress value={executionPercent} className="h-2" />
                </Card>

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    Linha do Tempo de Execução
                  </h3>
                  {executedDemands.length === 0 && pendingDemands.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma demanda vinculada a este período</p>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-xl border border-border/50">
                      {executedDemands.length > 0 && (
                        <div className="p-4">
                          <p className="text-xs font-medium text-emerald-600 mb-2 uppercase tracking-wide">Publicadas ({executedDemands.length})</p>
                          <div className="flex flex-col gap-1.5">
                            {executedDemands.map((d: any) => (
                              <div key={d.id} className="flex items-center gap-3 px-3 py-2 bg-background rounded-md border border-border/50 text-sm">
                                <span className="text-xs text-muted-foreground whitespace-nowrap w-20">
                                  {d.publish_date ? format(new Date(d.publish_date + 'T00:00:00'), "dd/MM") : '—'}
                                </span>
                                {d.demand_type && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.demand_type}</Badge>}
                                {d.channel && <span className="text-xs text-muted-foreground shrink-0">{d.channel}</span>}
                                <span className="text-xs font-medium truncate flex-1">{d.title}</span>
                                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Publicado</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingDemands.length > 0 && (
                        <div className={cn("p-4", executedDemands.length > 0 && "border-t border-border/50")}>
                          <p className="text-xs font-medium text-amber-600 mb-2 uppercase tracking-wide">Pendentes ({pendingDemands.length})</p>
                          <div className="flex flex-col gap-1.5">
                            {pendingDemands.map((d: any) => (
                              <div key={d.id} className="flex items-center gap-3 px-3 py-2 bg-background rounded-md border border-border/50 text-sm opacity-70">
                                <span className="text-xs text-muted-foreground whitespace-nowrap w-20">
                                  {d.publish_date ? format(new Date(d.publish_date + 'T00:00:00'), "dd/MM") : '—'}
                                </span>
                                {d.demand_type && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{d.demand_type}</Badge>}
                                {d.channel && <span className="text-xs text-muted-foreground shrink-0">{d.channel}</span>}
                                <span className="text-xs font-medium truncate flex-1">{d.title}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.pipeline_statuses?.name || 'Pendente'}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Collapsible open={generationHistoryOpen} onOpenChange={setGenerationHistoryOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={cn("w-4 h-4 transition-transform", generationHistoryOpen && "rotate-180")} />
                    Histórico Técnico de Geração
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 mt-3">
                    {selectedHistoryPlan.final_plan && selectedHistoryPlan.final_plan.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Plano Final ({selectedHistoryPlan.final_plan.length})</p>
                        <div className="grid gap-2">
                          {selectedHistoryPlan.final_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} />)}
                        </div>
                      </div>
                    )}
                    {selectedHistoryPlan.default_plan && selectedHistoryPlan.default_plan.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Modo Normal ({selectedHistoryPlan.default_plan.length})</p>
                        <div className="grid gap-2">
                          {selectedHistoryPlan.default_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} variant="normal" />)}
                        </div>
                      </div>
                    )}
                    {selectedHistoryPlan.ultra_plan && selectedHistoryPlan.ultra_plan.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Modo Ultra ({selectedHistoryPlan.ultra_plan.length})</p>
                        <div className="grid gap-2">
                          {selectedHistoryPlan.ultra_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} variant="ultra" />)}
                        </div>
                      </div>
                    )}
                    {!selectedHistoryPlan.final_plan?.length && !selectedHistoryPlan.default_plan?.length && !selectedHistoryPlan.ultra_plan?.length && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado de geração disponível</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
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

      {/* Delete Confirmation Modal */}
      {periodToDelete && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !isDeleting && setPeriodToDelete(null)}>
        <Card className="max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Excluir Período</h2>
              <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita</p>
            </div>
          </div>
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <p className="font-medium">{periodToDelete.period_title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(periodToDelete.period_start + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(periodToDelete.period_end + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setPeriodToDelete(null)} disabled={isDeleting}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeletePeriod} disabled={isDeleting}>
              {isDeleting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Excluindo...</> : <><Trash2 className="w-4 h-4 mr-2" />Excluir Período</>}
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

  // Determine current review mode and handler
  const currentReviewMode = currentStep === 'review-normal' ? 'normal' : 'ultra';
  const currentReviewDemands = currentStep === 'review-normal' ? defaultPlan : ultraPlan;
  const currentReviewHandler = currentStep === 'review-normal' ? handleReviewNormalConfirm : handleReviewUltraConfirm;
  const currentConfirmLabel = currentStep === 'review-normal' 
    ? `Salvar Demandas (${defaultPlan.length})` 
    : `Confirmar Planejamento`;

  return <div className="pb-8">
    <PageHeader title={searchParams.get('view') === 'latest' ? "Cronograma Atual" : activeTab === 'history' ? "Histórico de Períodos" : "Planejar Período"} subtitle={displayName} backTo="/client-hub" actions={currentStep === 'form' && activeTab === 'new' ? [{
      label: "Gerar Demandas",
      onClick: handleSubmit,
      icon: <Rocket className="w-4 h-4" />,
      className: "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
      disabled: productionLineTotal === 0 || !periodTitle || !periodStart || !periodEnd
    }] : []} rightContent={currentStep !== 'form' && currentStep !== 'loading-normal' && currentStep !== 'loading-ultra' && currentStep !== 'choose-ultra' ? <Badge variant="outline" className="text-xs">
      {currentStep === 'review-normal' && 'Etapa 1/2: Demandas Normais'}
      {currentStep === 'review-ultra' && 'Etapa 2/2: Demandas Ultra'}
      {currentStep === 'completed' && 'Concluído'}
    </Badge> : null} />

    <div className="container max-w-6xl mx-auto px-6 py-8">
      {currentStep === 'form' && (activeTab === 'history' ? (searchParams.get('view') === 'latest' ? renderHistory() : renderHistory()) : renderForm())}


      {currentStep === 'loading-normal' && renderLoading(loadingMessage)}
      {currentStep === 'loading-ultra' && renderLoading(loadingMessage)}

      {currentStep === 'choose-ultra' && (
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Demandas Normais Salvas!</h2>
          <p className="text-muted-foreground mb-8">
            {normalSavedCount} demandas foram salvas no Kanban. O que deseja fazer agora?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card 
              className="p-6 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all text-left"
              onClick={handleFinalizePlanning}
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Finalizar Planejamento</h3>
              <p className="text-sm text-muted-foreground">
                Salvar as demandas geradas e concluir o planejamento do período.
              </p>
            </Card>
            <Card 
              className="p-6 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all text-left border-primary/20 bg-primary/5"
              onClick={handleGenerateUltra}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Gerar Planos Ultra</h3>
              <p className="text-sm text-muted-foreground">
                Criar 3 demandas extras de alto impacto com ideias criativas e diferenciadas.
              </p>
            </Card>
          </div>
        </div>
      )}

      {(currentStep === 'review-normal' || currentStep === 'review-ultra') && (
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div className={cn(
              "w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 bg-gradient-to-br",
              currentStep === 'review-normal' ? 'from-blue-400 to-cyan-500' : 'from-pink-400 to-purple-500'
            )}>
              {currentStep === 'review-normal' ? <Shield className="w-8 h-8 text-white" /> : <Rocket className="w-8 h-8 text-white" />}
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {currentStep === 'review-normal' ? 'Revise as Demandas Normais' : 'Revise as Demandas Ultra'}
            </h2>
            <p className="text-muted-foreground">
              {currentStep === 'review-normal' 
                ? 'Selecione as demandas normais que deseja salvar no Kanban' 
                : 'Selecione as demandas ultra para complementar seu planejamento'}
            </p>
          </div>

          <Card className="p-6 mb-6">
            <div className="mb-4">
              <h3 className="font-semibold">{currentReviewDemands.length} demandas geradas</h3>
            </div>
            <div className="space-y-2">
              {currentReviewDemands.slice(0, 3).map((item, idx) => {
                const anyItem = item as any;
                const tipo = anyItem.tipo || item.tipo_conteudo || '';
                return <div key={idx} className="text-sm bg-muted/50 p-3 rounded-lg flex items-center gap-3">
                  <Badge variant="secondary" className="text-xs shrink-0">{tipo || item.canal}</Badge>
                  <span className="font-medium truncate">{item.titulo}</span>
                </div>;
              })}
              {currentReviewDemands.length > 3 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {currentReviewDemands.length - 3} demandas...
                </p>
              )}
            </div>
          </Card>

          <div className="flex justify-center">
            <Button size="lg" onClick={() => setReviewModalOpen(true)} className={cn(
              currentStep === 'review-ultra' && "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
            )}>
              <Eye className="w-5 h-5 mr-2" />
              Revisar Conteúdo
            </Button>
          </div>

          <DemandReviewModal
            open={reviewModalOpen}
            onOpenChange={setReviewModalOpen}
            mode={currentReviewMode}
            demands={currentReviewDemands}
            onConfirm={currentReviewHandler}
            onRegenerate={handleRegenerate}
            isRegenerating={isRegenerating}
            hideSmartSuggestions={true}
            confirmLabel={currentConfirmLabel}
          />
        </div>
      )}

      {currentStep === 'completed' && renderCompleted()}
    </div>
  </div>;
};
export default PlanPeriod;
