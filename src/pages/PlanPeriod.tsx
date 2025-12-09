// Plan Period Page
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Zap, Shield, Rocket, Check, X, Package, History, Plus, Calendar as CalendarIcon, Target, ChevronRight, LayoutGrid, Trash2, AlertTriangle, PlayCircle, List, RefreshCw, Eye, Instagram, Facebook, Youtube, Linkedin } from "lucide-react";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
interface PlanItem {
  titulo: string;
  descricao: string;
  tipo_conteudo: string;
  canal: string;
  data_sugerida: string;
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
  created_at: string;
  final_plan: PlanItem[] | null;
  default_plan: PlanItem[] | null;
  ultra_plan: PlanItem[] | null;
}
type Step = 'form' | 'loading' | 'mode-selection' | 'optional-package' | 'completed';
const PlanPeriod = () => {
  const navigate = useNavigate();
  const {
    selectedClient
  } = useSelectedClient();
  const {
    tenantId
  } = useTenant();

  // Tab state
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // History state
  const [periodHistory, setPeriodHistory] = useState<PeriodPlanHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryPlan, setSelectedHistoryPlan] = useState<PeriodPlanHistory | null>(null);
  const [historyViewTab, setHistoryViewTab] = useState<'final' | 'normal' | 'ultra'>('final');
  const [periodToDelete, setPeriodToDelete] = useState<PeriodPlanHistory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preview drawer state
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'normal' | 'ultra'>('normal');

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<'normal' | 'ultra'>('normal');
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
  const [clientAcquisition, setClientAcquisition] = useState("");
  const [paidTrafficBudget, setPaidTrafficBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState<'BRL' | 'USD'>('BRL');
  const [periodLimitations, setPeriodLimitations] = useState("");
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Process state
  const [currentStep, setCurrentStep] = useState<Step>('form');
  const [periodPlanId, setPeriodPlanId] = useState<string | null>(null);
  const [defaultPlan, setDefaultPlan] = useState<PlanItem[]>([]);
  const [ultraPlan, setUltraPlan] = useState<PlanItem[]>([]);
  const [normalSummary, setNormalSummary] = useState("");
  const [ultraSummary, setUltraSummary] = useState("");
  const [selectedMode, setSelectedMode] = useState<'normal' | 'ultra' | null>(null);
  const [optionalPackage, setOptionalPackage] = useState<PlanItem[]>([]);
  const [pollingProgress, setPollingProgress] = useState(0);

  // Fetch period history and check for incomplete periods
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedClient || !tenantId) return;
      setLoadingHistory(true);
      try {
        const {
          data,
          error
        } = await supabase.from('period_plans').select('id, period_title, period_start, period_end, objective, priority_channel, primary_mode, status, created_at, final_plan, default_plan, ultra_plan').eq('company_id', selectedClient.id).eq('tenant_id', tenantId).order('created_at', {
          ascending: false
        });
        if (error) throw error;
        const historyData = data as unknown as PeriodPlanHistory[] || [];
        setPeriodHistory(historyData);

        // Check for incomplete periods (generated or mode_selected status)
        const incomplete = historyData.find(p => p.status === 'generated' || p.status === 'mode_selected');
        if (incomplete) {
          setIncompletePeriod(incomplete);
        }
      } catch (error) {
        console.error('Error fetching period history:', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [selectedClient, tenantId]);
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
    if (incompletePeriod.status === 'generated') {
      setCurrentStep('mode-selection');
    } else if (incompletePeriod.status === 'mode_selected') {
      setSelectedMode(incompletePeriod.primary_mode as 'normal' | 'ultra');
      const secondaryPlan = incompletePeriod.primary_mode === 'normal' ? incompletePeriod.ultra_plan || [] : incompletePeriod.default_plan || [];
      const bestIdeas = secondaryPlan.slice(0, Math.min(4, Math.max(2, Math.floor(secondaryPlan.length / 3))));
      setOptionalPackage(bestIdeas as PlanItem[]);
      setCurrentStep('optional-package');
    }
    setIncompletePeriod(null);
    toast.success("Período retomado com sucesso!");
  };
  const dismissIncomplete = () => {
    setIncompletePeriod(null);
  };
  const handleDeletePeriod = async () => {
    if (!periodToDelete) return;
    setIsDeleting(true);
    try {
      // First, delete associated cards
      await supabase.from('cards').delete().eq('period_plan_id', periodToDelete.id);

      // Then delete the period plan
      const {
        error
      } = await supabase.from('period_plans').delete().eq('id', periodToDelete.id);
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

  // Polling function to check generation status
  const pollForCompletion = async (planId: string, maxAttempts = 60, intervalMs = 5000) => {
    setPollingProgress(0);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Update progress (0-100%)
      const progress = Math.min((attempt + 1) / maxAttempts * 100, 99);
      setPollingProgress(progress);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      const {
        data,
        error
      } = await supabase.from('period_plans').select('status, default_plan, ultra_plan').eq('id', planId).single();
      if (error) {
        console.error('Error polling status:', error);
        continue;
      }
      if (data.status === 'generated' || data.status === 'mode_selected' || data.status === 'completed') {
        setPollingProgress(100);
        return {
          success: true,
          default_plan: data.default_plan,
          ultra_plan: data.ultra_plan
        };
      }
      if (data.status === 'error') {
        return {
          success: false,
          error: 'Erro na geração'
        };
      }
    }
    return {
      success: false,
      error: 'Tempo limite excedido'
    };
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
    setCurrentStep('loading');
    try {
      // Create period plan record
      // Determine priority channel from selected channels
      const priorityChannel = selectedChannels.length === 0 
        ? 'Multi-canal' 
        : selectedChannels.length === 1 
          ? selectedChannels[0].charAt(0).toUpperCase() + selectedChannels[0].slice(1)
          : selectedChannels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');

      // Build comprehensive observations including period limitations
      const fullObservations = [
        periodLimitations && `LIMITAÇÕES DO PERÍODO: ${periodLimitations}`,
        observations && observations
      ].filter(Boolean).join('\n\n') || null;

      const {
        data: periodPlan,
        error: createError
      } = await supabase.from('period_plans').insert({
        tenant_id: tenantId,
        company_id: selectedClient.id,
        period_title: periodTitle,
        period_start: format(periodStart, 'yyyy-MM-dd'),
        period_end: format(periodEnd, 'yyyy-MM-dd'),
        budget: budget || null,
        objective: 'Gerado automaticamente',
        priority_channel: priorityChannel,
        observations: fullObservations,
        client_acquisition: clientAcquisition || null,
        paid_traffic_budget: paidTrafficBudget ? `${budgetCurrency === 'BRL' ? 'R$' : '$'} ${paidTrafficBudget}` : null,
        status: 'draft'
      }).select().single();
      if (createError) throw createError;
      setPeriodPlanId(periodPlan.id);

      // Fire edge function without waiting - ignore ALL errors (timeout is expected)
      // Using void to explicitly discard the promise
      void (async () => {
        try {
          await supabase.functions.invoke('generate-period-plans', {
            body: {
              periodPlanId: periodPlan.id,
              tenantId
            }
          });
        } catch {
          // Silently ignore - edge function continues on server regardless
        }
      })();

      // Small delay to ensure edge function started before polling
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Poll for completion
      const result = await pollForCompletion(periodPlan.id);
      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar planos');
      }
      setDefaultPlan(result.default_plan as unknown as PlanItem[] || []);
      setUltraPlan(result.ultra_plan as unknown as PlanItem[] || []);
      setCurrentStep('mode-selection');
    } catch (error) {
      console.error('Error creating period plan:', error);
      toast.error(error instanceof Error ? error.message : "Erro ao gerar planos");
      setCurrentStep('form');
    }
  };
  const handleModeSelection = async (mode: 'normal' | 'ultra') => {
    setSelectedMode(mode);

    // Generate optional package from non-selected mode
    const secondaryPlan = mode === 'normal' ? ultraPlan : defaultPlan;
    const bestIdeas = secondaryPlan.slice(0, Math.min(4, Math.max(2, Math.floor(secondaryPlan.length / 3))));
    setOptionalPackage(bestIdeas);

    // Update database with mode selection
    if (periodPlanId) {
      await supabase.from('period_plans').update({
        primary_mode: mode,
        optional_package: bestIdeas as unknown as null,
        status: 'mode_selected'
      }).eq('id', periodPlanId);
    }
    setCurrentStep('optional-package');
  };
  const handlePackageDecision = async (accept: boolean) => {
    if (!periodPlanId) return;
    const primaryPlan = selectedMode === 'normal' ? defaultPlan : ultraPlan;
    const finalPlan = accept ? [...primaryPlan, ...optionalPackage] : primaryPlan;
    try {
      await supabase.from('period_plans').update({
        optional_package: accept ? optionalPackage as unknown as null : null,
        package_accepted: accept,
        final_plan: finalPlan as unknown as null,
        status: 'completed'
      }).eq('id', periodPlanId);
      toast.success(accept ? "Pacote extra adicionado com sucesso!" : "Período planejado com sucesso!");
      setCurrentStep('completed');
    } catch (error) {
      console.error('Error finalizing plan:', error);
      toast.error("Erro ao finalizar planejamento");
    }
  };

  // Open review modal for selecting demands
  const openReviewModal = (mode: 'normal' | 'ultra') => {
    setReviewMode(mode);
    setReviewModalOpen(true);
  };

  // Handle confirm from review modal - directly integrate selected demands
  const handleReviewConfirm = async (selectedDemands: PlanItem[], smartSelections: PlanItem[]) => {
    if (!periodPlanId || !tenantId) return;
    setReviewModalOpen(false);

    // Combine selected demands with smart selections
    const allDemands = [...selectedDemands, ...smartSelections];
    try {
      // Update the period plan with the selected mode and final plan
      await supabase.from('period_plans').update({
        primary_mode: reviewMode,
        final_plan: allDemands as unknown as null,
        status: 'completed'
      }).eq('id', periodPlanId);

      // Create cards from all selected demands
      const cardsToInsert = allDemands.map(item => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyItem = item as any;
        const title = item.titulo || anyItem.title || 'Sem título';
        const tipo = anyItem.tipo || item.tipo_conteudo || anyItem.type || '';
        const channel = item.canal || anyItem.channel || '';
        const publicationDate = item.data_sugerida || anyItem.suggested_date || anyItem.date || new Date().toISOString().split('T')[0];
        const descricao = anyItem.conteudo || anyItem.texto_da_peca || anyItem.descricao_da_tarefa || item.descricao || anyItem.description || '';
        const objetivo = anyItem.objetivo || anyItem.objective || '';
        const instrucoesProducao = anyItem.instrucoes_de_producao || '';
        const ctaRecomendado = anyItem.cta_recomendado || '';
        const instrucoesParts = [instrucoesProducao, ctaRecomendado && `CTA: ${ctaRecomendado}`].filter(Boolean);
        return {
          tenant_id: tenantId,
          period_plan_id: periodPlanId,
          title,
          objetivo: objetivo || null,
          description: descricao,
          instrucoes: instrucoesParts.length > 0 ? instrucoesParts.join('\n\n') : null,
          delivery_date: publicationDate,
          file_location: tipo ? `${tipo} - ${channel}`.trim().replace(/^- | -$/g, '') : channel,
          status: 'unassigned',
          column_name: 'Planejamento Automatizado',
          observations: null
        };
      });
      if (cardsToInsert.length > 0) {
        const {
          error
        } = await supabase.from('cards').insert(cardsToInsert);
        if (error) throw error;
      }
      toast.success(`${selectedDemands.length} demandas integradas ao Kanban!`);

      // Navigate to schedule
      navigate(`/schedule?periodPlanId=${periodPlanId}`);
    } catch (error) {
      console.error('Error confirming plan:', error);
      toast.error('Erro ao confirmar planejamento');
    }
  };

  // Handle regenerate from review modal
  const handleRegenerate = async () => {
    if (!periodPlanId) return;
    setIsRegenerating(true);
    setReviewModalOpen(false);
    try {
      // Reset status to draft
      await supabase.from('period_plans').update({
        status: 'draft',
        default_plan: [],
        ultra_plan: []
      }).eq('id', periodPlanId);
      setCurrentStep('loading');

      // Fire edge function
      void (async () => {
        try {
          await supabase.functions.invoke('generate-period-plans', {
            body: {
              periodPlanId,
              tenantId
            }
          });
        } catch {
          // Silently ignore
        }
      })();
      await new Promise(resolve => setTimeout(resolve, 2000));
      const result = await pollForCompletion(periodPlanId);
      if (!result.success) {
        throw new Error(result.error || 'Erro ao regenerar planos');
      }
      setDefaultPlan(result.default_plan as unknown as PlanItem[] || []);
      setUltraPlan(result.ultra_plan as unknown as PlanItem[] || []);
      setCurrentStep('mode-selection');
      toast.success('Demandas regeneradas com sucesso!');
    } catch (error) {
      console.error('Error regenerating:', error);
      toast.error('Erro ao regenerar demandas');
      setCurrentStep('mode-selection');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Open preview drawer
  const openPreview = (mode: 'normal' | 'ultra', e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewMode(mode);
    setPreviewDrawerOpen(true);
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
                      {periodStart ? format(periodStart, "dd/MM/yyyy", {
                      locale: ptBR
                    }) : <span className="truncate">Selecione</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                    <Calendar mode="single" selected={periodStart} onSelect={date => {
                    setPeriodStart(date);
                    setStartDateOpen(false);
                  }} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Data Fim *</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !periodEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {periodEnd ? format(periodEnd, "dd/MM/yyyy", {
                      locale: ptBR
                    }) : <span>Selecione a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                    <Calendar mode="single" selected={periodEnd} onSelect={date => {
                    setPeriodEnd(date);
                    setEndDateOpen(false);
                  }} locale={ptBR} disabled={date => periodStart ? date < periodStart : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Perguntas estratégicas do período */}
            <div className="space-y-2">
              <Label htmlFor="clientAcquisition" className="text-sm">Como a empresa atrai clientes hoje?</Label>
              <p className="text-xs text-muted-foreground">Fontes atuais: redes sociais, indicações, anúncios, Google, WhatsApp</p>
              <Textarea 
                id="clientAcquisition" 
                placeholder="Descreva as principais formas de aquisição de clientes da empresa..." 
                value={clientAcquisition} 
                onChange={e => setClientAcquisition(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodLimitations" className="text-sm">Quais limitações considerar neste período?</Label>
              <p className="text-xs text-muted-foreground">Tempo, equipe, estoque, gravação, orçamento, restrições internas, legislação</p>
              <Textarea 
                id="periodLimitations" 
                placeholder="Descreva as limitações e restrições específicas para este período..." 
                value={periodLimitations} 
                onChange={e => setPeriodLimitations(e.target.value)}
                rows={2}
              />
            </div>

            {/* Channel Selection */}
            <div className="space-y-3">
              <Label className="text-sm">Selecione as redes prioritárias</Label>
              <p className="text-xs text-muted-foreground -mt-1">Selecione as redes sociais para este período</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'from-pink-500 to-purple-500' },
                  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-500' },
                  { id: 'tiktok', label: 'TikTok', icon: () => (
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  ), color: 'from-gray-900 to-gray-700' },
                  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'from-red-600 to-red-500' },
                  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'from-blue-700 to-blue-600' },
                ].map(channel => {
                  const isSelected = selectedChannels.includes(channel.id);
                  const IconComponent = channel.icon;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannels(prev => 
                          prev.includes(channel.id) 
                            ? prev.filter(c => c !== channel.id)
                            : [...prev, channel.id]
                        );
                      }}
                      className={cn(
                        "relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 min-w-[72px]",
                        isSelected 
                          ? "border-primary bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.3)]" 
                          : "border-border/50 bg-card hover:border-primary/50 hover:bg-primary/5"
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                        isSelected 
                          ? `bg-gradient-to-br ${channel.color} text-white` 
                          : "bg-muted text-muted-foreground"
                      )}>
                        <IconComponent />
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium transition-colors",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {channel.label}
                      </span>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paid Traffic Budget */}
            <div className="space-y-2">
              <Label htmlFor="paidTrafficBudget" className="text-sm">Como a empresa atrai clientes hoje?</Label>
              <p className="text-xs text-muted-foreground">Valor aproximado mensal</p>
              <div className="flex gap-2">
                <Select value={budgetCurrency} onValueChange={(value: 'BRL' | 'USD') => setBudgetCurrency(value)}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="BRL">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">R$</span>
                        <span className="text-muted-foreground text-xs">Reais</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="USD">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">$</span>
                        <span className="text-muted-foreground text-xs">Dólar</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  id="paidTrafficBudget" 
                  placeholder={budgetCurrency === 'BRL' ? "Ex: 2.000,00" : "Ex: 500.00"}
                  value={paidTrafficBudget} 
                  onChange={e => {
                    const value = e.target.value.replace(/[^0-9.,]/g, '');
                    setPaidTrafficBudget(value);
                  }}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {budgetCurrency === 'BRL' ? '💵 Moeda selecionada: Real Brasileiro (BRL)' : '💵 Moeda selecionada: Dólar Americano (USD)'}
              </p>
            </div>
          </div>
        </Card>

        {/* Observations */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            Restrições do Período
          </h3>
          
          <div className="space-y-6">
            {/* Restrictions Checklist */}
            <div className="space-y-4">
                {[{
              id: 'no-video-appearance',
              category: 'Disponibilidade para aparecer',
              label: 'O cliente NÃO pode aparecer em vídeos.'
            }, {
              id: 'no-products-environment',
              category: 'Ambiente e recursos visuais',
              label: 'O cliente NÃO pode disponibilizar produtos/ambiente para fotos/vídeos.'
            }, {
              id: 'no-clients-patients',
              category: 'Limitações legais do segmento',
              label: 'O cliente NÃO pode mostrar clientes/pacientes.'
            }, {
              id: 'no-visual-materials',
              category: 'Limitações operacionais',
              label: 'O cliente NÃO possui materiais visuais suficientes (fotos/vídeos).'
            }, {
              id: 'no-promotional-content',
              category: 'Restrições de narrativa e posicionamento',
              label: 'O cliente NÃO quer conteúdos promocionais.'
            }].map(restriction => <div key={restriction.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <Checkbox id={restriction.id} checked={excludedFormats.includes(restriction.id)} onCheckedChange={checked => {
                if (checked) {
                  setExcludedFormats([...excludedFormats, restriction.id]);
                } else {
                  setExcludedFormats(excludedFormats.filter(f => f !== restriction.id));
                }
              }} className="mt-0.5" />
                    <label htmlFor={restriction.id} className="cursor-pointer flex-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        {restriction.category}
                      </span>
                      <span className="text-sm leading-snug">
                        {restriction.label}
                      </span>
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
  const renderModeSelection = () => <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Revise as Demandas Geradas</h2>
        <p className="text-muted-foreground">
          Clique em um modo para revisar e selecionar as demandas que deseja incluir no seu planejamento
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Normal Mode Card */}
        <Card className="p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-primary/50" onClick={() => openReviewModal('normal')}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Modo Normal</h3>
            <p className="text-sm text-muted-foreground mt-1">{normalSummary}</p>
          </div>

          <div className="flex justify-center mb-4">
            <Badge variant="secondary">{defaultPlan.length} demandas</Badge>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-2">Prévia de ideias:</p>
            <ul className="space-y-2">
              {defaultPlan.slice(0, 2).map((item, idx) => <li key={idx} className="text-sm bg-muted/50 p-2 rounded">
                  <span className="font-medium">{item.titulo}</span>
                  <span className="text-muted-foreground text-xs ml-2">({item.canal})</span>
                </li>)}
            </ul>
            <div className="mt-3 flex items-center justify-center text-sm text-blue-600 dark:text-blue-400">
              <Eye className="w-4 h-4 mr-2" />
              Clique para revisar todas as {defaultPlan.length} demandas
            </div>
          </div>
        </Card>

        {/* Ultra Mode Card */}
        <Card className="p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-pink-500/50" onClick={() => openReviewModal('ultra')}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center mb-4">
              <Rocket className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-pink-600 dark:text-pink-400">Modo Ultra</h3>
            <p className="text-sm text-muted-foreground mt-1">{ultraSummary}</p>
          </div>

          <div className="flex justify-center mb-4">
            <Badge variant="secondary" className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
              {ultraPlan.length} demandas
            </Badge>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-2">Prévia de ideias:</p>
            <ul className="space-y-2">
              {ultraPlan.slice(0, 2).map((item, idx) => <li key={idx} className="text-sm bg-pink-50 dark:bg-pink-900/20 p-2 rounded">
                  <span className="font-medium">{item.titulo}</span>
                  <span className="text-muted-foreground text-xs ml-2">({item.canal})</span>
                </li>)}
            </ul>
            <div className="mt-3 flex items-center justify-center text-sm text-pink-600 dark:text-pink-400">
              <Eye className="w-4 h-4 mr-2" />
              Clique para revisar todas as {ultraPlan.length} demandas
            </div>
          </div>
        </Card>
      </div>

      {/* Demand Review Modal */}
      <DemandReviewModal open={reviewModalOpen} onOpenChange={setReviewModalOpen} mode={reviewMode} demands={reviewMode === 'normal' ? defaultPlan : ultraPlan} smartSuggestions={reviewMode === 'normal' ? ultraPlan : defaultPlan} onConfirm={handleReviewConfirm} onRegenerate={handleRegenerate} isRegenerating={isRegenerating} />
    </div>;
  const renderOptionalPackage = () => <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4">
          <Package className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Pacote Inteligente Opcional</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Selecionamos as {optionalPackage.length} melhores ideias do modo {selectedMode === 'normal' ? 'Ultra' : 'Normal'} 
          que podem potencializar ainda mais o seu período!
        </p>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-4">Ideias Selecionadas:</h3>
        <div className="space-y-3">
          {optionalPackage.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} variant={selectedMode === 'normal' ? 'ultra' : 'normal'} />)}
        </div>
      </Card>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" size="lg" onClick={() => handlePackageDecision(false)} className="min-w-[180px]">
          <X className="w-5 h-5 mr-2" />
          Ignorar
        </Button>
        <Button size="lg" onClick={() => handlePackageDecision(true)} className="min-w-[180px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
          <Check className="w-5 h-5 mr-2" />
          Adicionar Pacote Extra
        </Button>
      </div>
    </div>;
  const [integratingKanban, setIntegratingKanban] = useState(false);
  const [kanbanIntegrated, setKanbanIntegrated] = useState(false);
  const handleIntegrateToKanban = async () => {
    if (!periodPlanId || !tenantId) return;
    setIntegratingKanban(true);
    try {
      // Get the final plan from the current state
      const primaryPlan = selectedMode === 'normal' ? defaultPlan : ultraPlan;
      const finalPlanItems = kanbanIntegrated ? [] : optionalPackage.length > 0 ? [...primaryPlan, ...optionalPackage] : primaryPlan;

      // Create cards from the final plan - map new prompt format to card fields
      const cardsToInsert = finalPlanItems.map(item => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyItem = item as any;

        // Campos principais
        const title = item.titulo || anyItem.title || 'Sem título';
        const tipo = anyItem.tipo || item.tipo_conteudo || anyItem.type || '';
        const channel = item.canal || anyItem.channel || '';
        const publicationDate = item.data_sugerida || anyItem.suggested_date || anyItem.date || new Date().toISOString().split('T')[0];

        // ATIVIDADE: priorizar conteudo (conteúdo dos slides/roteiros) > texto_da_peca > descricao_da_tarefa
        const descricao = anyItem.conteudo || anyItem.texto_da_peca || anyItem.descricao_da_tarefa || item.descricao || anyItem.description || '';

        // OBJETIVO: campo separado
        const objetivo = anyItem.objetivo || anyItem.objective || '';

        // INSTRUÇÕES: combinar instruções de produção + CTA recomendado
        const instrucoesProducao = anyItem.instrucoes_de_producao || '';
        const ctaRecomendado = anyItem.cta_recomendado || '';
        const instrucoesParts = [instrucoesProducao, ctaRecomendado && `CTA: ${ctaRecomendado}`].filter(Boolean);
        return {
          tenant_id: tenantId,
          period_plan_id: periodPlanId,
          title,
          objetivo: objetivo || null,
          description: descricao,
          instrucoes: instrucoesParts.length > 0 ? instrucoesParts.join('\n\n') : null,
          delivery_date: publicationDate,
          file_location: tipo ? `${tipo} - ${channel}`.trim().replace(/^- | -$/g, '') : channel,
          status: 'unassigned',
          column_name: 'Planejamento Automatizado',
          observations: null
        };
      });
      if (cardsToInsert.length > 0) {
        const {
          error
        } = await supabase.from('cards').insert(cardsToInsert);
        if (error) throw error;
      }
      setKanbanIntegrated(true);
      toast.success(`${cardsToInsert.length} demandas integradas ao Kanban!`);
    } catch (error) {
      console.error('Error integrating to Kanban:', error);
      toast.error('Erro ao integrar demandas ao Kanban');
    } finally {
      setIntegratingKanban(false);
    }
  };
  const renderCompleted = () => {
    const totalDemands = (selectedMode === 'normal' ? defaultPlan.length : ultraPlan.length) + (optionalPackage.length > 0 ? optionalPackage.length : 0);
    return <div className="max-w-2xl mx-auto text-center">
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6">
          <Check className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-bold mb-4">Período Planejado com Sucesso!</h2>
        <p className="text-muted-foreground mb-8">
          Seu planejamento de período foi salvo e está pronto para ser executado.
        </p>

        <Card className="p-6 text-left mb-8">
          <h3 className="font-semibold mb-4">Resumo do Planejamento:</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Período:</span> {periodTitle}</p>
            <p><span className="text-muted-foreground">Modo Escolhido:</span> {selectedMode === 'normal' ? 'Normal' : 'Ultra'}</p>
            <p>
              <span className="text-muted-foreground">Total de Demandas:</span> {totalDemands}
            </p>
            {optionalPackage.length > 0 && <p><span className="text-muted-foreground">Pacote Extra:</span> Adicionado ({optionalPackage.length} demandas)</p>}
          </div>
        </Card>

        {/* Kanban Integration */}
        <Card className="p-6 mb-8 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3 mb-3">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Integrar ao Kanban</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione as demandas geradas diretamente ao seu quadro Kanban para gerenciamento.
          </p>
          {kanbanIntegrated ? <div className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              <span className="font-medium">Demandas integradas ao Kanban!</span>
            </div> : <Button onClick={handleIntegrateToKanban} disabled={integratingKanban} className="w-full">
              {integratingKanban ? <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Integrando...
                </> : <>
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Adicionar {totalDemands} demandas ao Kanban
                </>}
            </Button>}
        </Card>

        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => navigate('/client-hub')}>
            Voltar ao Hub
          </Button>
          <Button onClick={() => navigate(`/schedule?periodPlanId=${periodPlanId}`)}>
            Ver Demandas
          </Button>
        </div>
      </div>;
  };
  const renderHistory = () => <div className="max-w-4xl mx-auto">
      {loadingHistory ? <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div> : periodHistory.length === 0 ? <Card className="p-8 text-center">
          <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum período planejado</h3>
          <p className="text-muted-foreground mb-4">
            Você ainda não criou nenhum planejamento de período para este cliente.
          </p>
          <Button onClick={() => setActiveTab('new')}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Primeiro Período
          </Button>
        </Card> : <div className="space-y-3">
          {periodHistory.map(period => {
        const demandCount = period.final_plan?.length || 0;
        return <Card key={period.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedHistoryPlan(period)}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold truncate">{period.period_title}</h3>
                    {period.primary_mode && <Badge variant="outline" className={`shrink-0 ${period.primary_mode === 'ultra' ? 'border-pink-500 text-pink-500' : ''}`}>
                        {period.primary_mode === 'ultra' ? 'Ultra' : 'Normal'}
                      </Badge>}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                    <span>{format(new Date(period.created_at), "dd/MM/yyyy", {
                  locale: ptBR
                })}</span>
                    <span>{demandCount} demandas</span>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => {
                e.stopPropagation();
                setPeriodToDelete(period);
              }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </Card>;
      })}
        </div>}

      {/* Detail Modal with Tabs */}
      {selectedHistoryPlan && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedHistoryPlan(null)}>
          <Card className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b bg-muted/30">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold">{selectedHistoryPlan.period_title}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" />
                      {format(new Date(selectedHistoryPlan.period_start), "dd/MM/yyyy")} - {format(new Date(selectedHistoryPlan.period_end), "dd/MM/yyyy")}
                    </span>
                    <span>•</span>
                    <span>Criado em {format(new Date(selectedHistoryPlan.created_at), "dd/MM/yyyy", {
                    locale: ptBR
                  })}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedHistoryPlan(null)} className="shrink-0">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                <Card className={cn("p-4 cursor-pointer transition-all border-2", historyViewTab === 'final' ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50")} onClick={() => setHistoryViewTab('final')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-500" />
                      </div>
                      <span className="font-semibold">Plano Final</span>
                    </div>
                    {historyViewTab === 'final' && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-2xl font-bold">{selectedHistoryPlan.final_plan?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">demandas aprovadas</p>
                </Card>

                <Card className={cn("p-4 cursor-pointer transition-all border-2", historyViewTab === 'normal' ? "border-blue-500 bg-blue-500/5" : "border-transparent hover:border-border hover:bg-muted/50")} onClick={() => setHistoryViewTab('normal')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="font-semibold">Normal</span>
                    </div>
                    {selectedHistoryPlan.primary_mode === 'normal' && <Badge className="bg-blue-500 text-white text-[10px] px-1.5">Escolhido</Badge>}
                  </div>
                  <p className="text-2xl font-bold">{selectedHistoryPlan.default_plan?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">demandas geradas</p>
                </Card>

                <Card className={cn("p-4 cursor-pointer transition-all border-2", historyViewTab === 'ultra' ? "border-pink-500 bg-pink-500/5" : "border-transparent hover:border-border hover:bg-muted/50")} onClick={() => setHistoryViewTab('ultra')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-pink-500" />
                      </div>
                      <span className="font-semibold">Ultra</span>
                    </div>
                    {selectedHistoryPlan.primary_mode === 'ultra' && <Badge className="bg-pink-500 text-white text-[10px] px-1.5">Escolhido</Badge>}
                  </div>
                  <p className="text-2xl font-bold">{selectedHistoryPlan.ultra_plan?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">demandas geradas</p>
                </Card>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {historyViewTab === 'final' && <>
                  {selectedHistoryPlan.final_plan && selectedHistoryPlan.final_plan.length > 0 ? <div className="grid gap-3">
                      {selectedHistoryPlan.final_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} />)}
                    </div> : <div className="text-center py-12 text-muted-foreground">
                      <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">Nenhuma demanda no plano final</p>
                      <p className="text-sm mt-1">O planejamento pode não ter sido finalizado</p>
                    </div>}
                </>}

              {historyViewTab === 'normal' && <>
                  {selectedHistoryPlan.default_plan && selectedHistoryPlan.default_plan.length > 0 ? <div className="grid gap-3">
                      {selectedHistoryPlan.default_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} variant="normal" />)}
                    </div> : <div className="text-center py-12 text-muted-foreground">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">Nenhuma demanda no plano Normal</p>
                    </div>}
                </>}

              {historyViewTab === 'ultra' && <>
                  {selectedHistoryPlan.ultra_plan && selectedHistoryPlan.ultra_plan.length > 0 ? <div className="grid gap-3">
                      {selectedHistoryPlan.ultra_plan.map((item, idx) => <DemandaCard key={idx} demanda={item as unknown as DemandaItem} variant="ultra" />)}
                    </div> : <div className="text-center py-12 text-muted-foreground">
                      <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">Nenhuma demanda no plano Ultra</p>
                    </div>}
                </>}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/30 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {historyViewTab === 'final' && `${selectedHistoryPlan.final_plan?.length || 0} demandas finalizadas`}
                {historyViewTab === 'normal' && `${selectedHistoryPlan.default_plan?.length || 0} demandas no modo Normal`}
                {historyViewTab === 'ultra' && `${selectedHistoryPlan.ultra_plan?.length || 0} demandas no modo Ultra`}
              </p>
              <div className="flex gap-2">
                
                {selectedHistoryPlan.status === 'completed' && <Button onClick={() => navigate(`/schedule?periodPlanId=${selectedHistoryPlan.id}`)}>
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Ver no Kanban
                  </Button>}
              </div>
            </div>
          </Card>
        </div>}

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
                {format(new Date(periodToDelete.period_start), "dd/MM/yyyy", {
              locale: ptBR
            })} - {format(new Date(periodToDelete.period_end), "dd/MM/yyyy", {
              locale: ptBR
            })}
              </p>
              {periodToDelete.final_plan && periodToDelete.final_plan.length > 0 && <p className="text-sm text-destructive mt-2">
                  ⚠️ {periodToDelete.final_plan.length} demandas associadas também serão excluídas
                </p>}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPeriodToDelete(null)} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleDeletePeriod} disabled={isDeleting}>
                {isDeleting ? <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Excluindo...
                  </> : <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Período
                  </>}
              </Button>
            </div>
          </Card>
        </div>}
    </div>;
  return <div className="pb-8">
      {/* Fixed Header */}
      <PageHeader title="Planejar Período" subtitle={displayName} backTo="/client-hub" actions={currentStep === 'form' && activeTab === 'new' ? [{
      label: "Gerar Demandas",
      onClick: handleSubmit,
      icon: <Rocket className="w-4 h-4" />,
      className: "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
    }] : []} rightContent={currentStep !== 'form' && currentStep !== 'loading' ? <Badge variant="outline" className="text-xs">
                {currentStep === 'mode-selection' && 'Etapa 2/3: Escolha do Modo'}
                {currentStep === 'optional-package' && 'Etapa 3/3: Pacote Opcional'}
                {currentStep === 'completed' && 'Concluído'}
              </Badge> : null} />

        {/* Content */}
        <div className="container max-w-6xl mx-auto px-6 py-8">
          {currentStep === 'form' && <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'new' | 'history')} className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="new" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Novo Período
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Histórico ({periodHistory.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="new">
                {renderForm()}
              </TabsContent>
              
              <TabsContent value="history">
                {renderHistory()}
              </TabsContent>
            </Tabs>}
          {currentStep === 'loading' && <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <div className="relative">
                <Sparkles className="h-16 w-16 text-primary animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Gerando Demandas</h2>
                <p className="text-muted-foreground max-w-md">
                  A IA está criando duas linhas de demandas personalizadas: Normal e Ultra.
                </p>
              </div>
              <div className="w-full max-w-md space-y-2">
                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500 ease-out rounded-full" style={{
              width: `${pollingProgress}%`
            }} />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{Math.round(pollingProgress)}% concluído</span>
                  <span>
                    {pollingProgress >= 100 ? 'Finalizando...' : 'Aguarde alguns segundos'}
                  </span>
                </div>
              </div>
            </div>}
          {currentStep === 'mode-selection' && renderModeSelection()}
          {currentStep === 'optional-package' && renderOptionalPackage()}
          {currentStep === 'completed' && renderCompleted()}
        </div>
      </div>;
};
export default PlanPeriod;