import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Zap, Shield, Rocket, Check, X, Package, History, Plus, Calendar as CalendarIcon, Target, Eye, LayoutGrid, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
}

type Step = 'form' | 'loading' | 'mode-selection' | 'optional-package' | 'completed';

const PlanPeriod = () => {
  const navigate = useNavigate();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();

  // Tab state
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  
  // History state
  const [periodHistory, setPeriodHistory] = useState<PeriodPlanHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryPlan, setSelectedHistoryPlan] = useState<PeriodPlanHistory | null>(null);
  const [periodToDelete, setPeriodToDelete] = useState<PeriodPlanHistory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [periodTitle, setPeriodTitle] = useState("");
  const [periodStart, setPeriodStart] = useState<Date | undefined>(undefined);
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>(undefined);
  const [budget, setBudget] = useState("");
  const [observations, setObservations] = useState("");
  const [excludedFormats, setExcludedFormats] = useState<string[]>([]);
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

  // Fetch period history
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedClient || !tenantId) return;
      
      setLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from('period_plans')
          .select('id, period_title, period_start, period_end, objective, priority_channel, primary_mode, status, created_at, final_plan')
          .eq('company_id', selectedClient.id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPeriodHistory((data as unknown as PeriodPlanHistory[]) || []);
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

  const handleDeletePeriod = async () => {
    if (!periodToDelete) return;
    
    setIsDeleting(true);
    try {
      // First, delete associated cards
      await supabase
        .from('cards')
        .delete()
        .eq('period_plan_id', periodToDelete.id);

      // Then delete the period plan
      const { error } = await supabase
        .from('period_plans')
        .delete()
        .eq('id', periodToDelete.id);

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
      const { data: periodPlan, error: createError } = await supabase
        .from('period_plans')
        .insert({
          tenant_id: tenantId,
          company_id: selectedClient.id,
          period_title: periodTitle,
          period_start: format(periodStart, 'yyyy-MM-dd'),
          period_end: format(periodEnd, 'yyyy-MM-dd'),
          budget: budget || null,
          objective: 'Gerado automaticamente',
          priority_channel: 'Multi-canal',
          observations: observations || null,
          status: 'draft'
        })
        .select()
        .single();

      if (createError) throw createError;

      setPeriodPlanId(periodPlan.id);

      // Call edge function to generate plans
      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-period-plans', {
        body: { periodPlanId: periodPlan.id, tenantId }
      });

      if (functionError) throw functionError;

      if (functionData.error) {
        throw new Error(functionData.error);
      }

      setDefaultPlan(functionData.default_plan || []);
      setUltraPlan(functionData.ultra_plan || []);
      setNormalSummary(functionData.normal_summary || '');
      setUltraSummary(functionData.ultra_summary || '');
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
      await supabase
        .from('period_plans')
        .update({
          primary_mode: mode,
          optional_package: bestIdeas as unknown as null,
          status: 'mode_selected'
        })
        .eq('id', periodPlanId);
    }

    setCurrentStep('optional-package');
  };

  const handlePackageDecision = async (accept: boolean) => {
    if (!periodPlanId) return;

    const primaryPlan = selectedMode === 'normal' ? defaultPlan : ultraPlan;
    const finalPlan = accept ? [...primaryPlan, ...optionalPackage] : primaryPlan;

    try {
      await supabase
        .from('period_plans')
        .update({
          optional_package: accept ? (optionalPackage as unknown as null) : null,
          package_accepted: accept,
          final_plan: finalPlan as unknown as null,
          status: 'completed'
        })
        .eq('id', periodPlanId);

      toast.success(accept ? "Pacote extra adicionado com sucesso!" : "Período planejado com sucesso!");
      setCurrentStep('completed');

    } catch (error) {
      console.error('Error finalizing plan:', error);
      toast.error("Erro ao finalizar planejamento");
    }
  };

  const renderForm = () => (
    <div className="max-w-3xl mx-auto">
      <div className="space-y-6">
        {/* Period Info */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Informações do Período
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="periodTitle">Título do Período *</Label>
              <Input
                id="periodTitle"
                placeholder="Ex: Campanha de Verão 2025"
                value={periodTitle}
                onChange={(e) => setPeriodTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Início *</Label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !periodStart && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {periodStart ? format(periodStart, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                    <Calendar
                      mode="single"
                      selected={periodStart}
                      onSelect={(date) => {
                        setPeriodStart(date);
                        setStartDateOpen(false);
                      }}
                      locale={ptBR}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data Fim *</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !periodEnd && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {periodEnd ? format(periodEnd, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background border shadow-lg" align="start">
                    <Calendar
                      mode="single"
                      selected={periodEnd}
                      onSelect={(date) => {
                        setPeriodEnd(date);
                        setEndDateOpen(false);
                      }}
                      locale={ptBR}
                      disabled={(date) => periodStart ? date < periodStart : false}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label htmlFor="budget">Orçamento (opcional)</Label>
              <Input
                id="budget"
                placeholder="Ex: R$ 5.000,00 ou Sem limite definido"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Observations */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            Observações e Restrições
          </h3>
          
          <div className="space-y-6">
            {/* Restrictions Checklist */}
            <div>
              <Label className="text-sm font-medium mb-4 block">Restrições do Cliente</Label>
              <div className="space-y-4">
                {[
                  { 
                    id: 'no-video-appearance', 
                    category: 'Disponibilidade para aparecer',
                    label: 'O cliente NÃO pode aparecer em vídeos.'
                  },
                  { 
                    id: 'no-products-environment', 
                    category: 'Ambiente e recursos visuais',
                    label: 'O cliente NÃO pode disponibilizar produtos/ambiente para fotos/vídeos.'
                  },
                  { 
                    id: 'no-clients-patients', 
                    category: 'Limitações legais do segmento',
                    label: 'O cliente NÃO pode mostrar clientes/pacientes.'
                  },
                  { 
                    id: 'no-visual-materials', 
                    category: 'Limitações operacionais',
                    label: 'O cliente NÃO possui materiais visuais suficientes (fotos/vídeos).'
                  },
                  { 
                    id: 'no-promotional-content', 
                    category: 'Restrições de narrativa e posicionamento',
                    label: 'O cliente NÃO quer conteúdos promocionais.'
                  },
                ].map((restriction) => (
                  <div 
                    key={restriction.id} 
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={restriction.id}
                      checked={excludedFormats.includes(restriction.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setExcludedFormats([...excludedFormats, restriction.id]);
                        } else {
                          setExcludedFormats(excludedFormats.filter(f => f !== restriction.id));
                        }
                      }}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={restriction.id}
                      className="cursor-pointer flex-1"
                    >
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        {restriction.category}
                      </span>
                      <span className="text-sm leading-snug">
                        {restriction.label}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="observations">Observações Adicionais (opcional)</Label>
              <Textarea
                id="observations"
                placeholder="Informe restrições, datas comemorativas importantes, produtos em foco, ou qualquer informação relevante..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </Card>

      </div>
    </div>
  );

  const renderModeSelection = () => (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Escolha o Modo Principal</h2>
        <p className="text-muted-foreground">
          Selecione a linha de demandas que melhor se adequa ao seu momento
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Normal Mode Card */}
        <Card 
          className={`p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 ${
            selectedMode === 'normal' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
          }`}
          onClick={() => handleModeSelection('normal')}
        >
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Modo Normal</h3>
            <p className="text-sm text-muted-foreground mt-1">{normalSummary}</p>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Demandas geradas:</span>
              <Badge variant="secondary">{defaultPlan.length} demandas</Badge>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-2">Prévia de ideias:</p>
            <ul className="space-y-2">
              {defaultPlan.slice(0, 2).map((item, idx) => (
                <li key={idx} className="text-sm bg-muted/50 p-2 rounded">
                  <span className="font-medium">{item.titulo}</span>
                  <span className="text-muted-foreground text-xs ml-2">({item.canal})</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Ultra Mode Card */}
        <Card 
          className={`p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 ${
            selectedMode === 'ultra' ? 'border-pink-500 ring-2 ring-pink-500/20' : 'hover:border-pink-500/50'
          }`}
          onClick={() => handleModeSelection('ultra')}
        >
          <div className="text-center mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center mb-4">
              <Rocket className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-pink-600 dark:text-pink-400">Modo Ultra</h3>
            <p className="text-sm text-muted-foreground mt-1">{ultraSummary}</p>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Demandas geradas:</span>
              <Badge variant="secondary" className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                {ultraPlan.length} demandas
              </Badge>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-2">Prévia de ideias:</p>
            <ul className="space-y-2">
              {ultraPlan.slice(0, 2).map((item, idx) => (
                <li key={idx} className="text-sm bg-pink-50 dark:bg-pink-900/20 p-2 rounded">
                  <span className="font-medium">{item.titulo}</span>
                  <span className="text-muted-foreground text-xs ml-2">({item.canal})</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderOptionalPackage = () => (
    <div className="max-w-3xl mx-auto">
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
          {optionalPackage.map((item, idx) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyItem = item as any;
            const title = item.titulo || anyItem.title || 'Sem título';
            const tipo = anyItem.tipo || item.tipo_conteudo || '';
            const objetivo = anyItem.objetivo || anyItem.objective || '';
            // Priorizar conteudo (conteúdo dos slides/roteiros)
            const descricao = anyItem.conteudo || anyItem.texto_da_peca || anyItem.descricao_da_tarefa || item.descricao || anyItem.description || '';
            const channel = item.canal || anyItem.channel || '';
            return (
              <div key={idx} className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {tipo && <Badge variant="secondary" className="text-xs">{tipo}</Badge>}
                      <Badge variant="outline">{channel}</Badge>
                    </div>
                    <p className="font-medium">{title}</p>
                    {objetivo && <p className="text-xs text-primary mt-1">📎 {objetivo}</p>}
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{descricao.slice(0, 300)}{descricao.length > 300 ? '...' : ''}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex gap-4 justify-center">
        <Button
          variant="outline"
          size="lg"
          onClick={() => handlePackageDecision(false)}
          className="min-w-[180px]"
        >
          <X className="w-5 h-5 mr-2" />
          Ignorar
        </Button>
        <Button
          size="lg"
          onClick={() => handlePackageDecision(true)}
          className="min-w-[180px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
        >
          <Check className="w-5 h-5 mr-2" />
          Adicionar Pacote Extra
        </Button>
      </div>
    </div>
  );

  const [integratingKanban, setIntegratingKanban] = useState(false);
  const [kanbanIntegrated, setKanbanIntegrated] = useState(false);

  const handleIntegrateToKanban = async () => {
    if (!periodPlanId || !tenantId) return;
    
    setIntegratingKanban(true);
    try {
      // Get the final plan from the current state
      const primaryPlan = selectedMode === 'normal' ? defaultPlan : ultraPlan;
      const finalPlanItems = kanbanIntegrated ? [] : (optionalPackage.length > 0 ? [...primaryPlan, ...optionalPackage] : primaryPlan);
      
      // Create cards from the final plan - map new prompt format to card fields
      const cardsToInsert = finalPlanItems.map((item) => {
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
        const instrucoesParts = [
          instrucoesProducao,
          ctaRecomendado && `CTA: ${ctaRecomendado}`
        ].filter(Boolean);
        
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
        const { error } = await supabase
          .from('cards')
          .insert(cardsToInsert);

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
    
    return (
      <div className="max-w-2xl mx-auto text-center">
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
            {optionalPackage.length > 0 && (
              <p><span className="text-muted-foreground">Pacote Extra:</span> Adicionado ({optionalPackage.length} demandas)</p>
            )}
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
          {kanbanIntegrated ? (
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              <span className="font-medium">Demandas integradas ao Kanban!</span>
            </div>
          ) : (
            <Button 
              onClick={handleIntegrateToKanban}
              disabled={integratingKanban}
              className="w-full"
            >
              {integratingKanban ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Integrando...
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Adicionar {totalDemands} demandas ao Kanban
                </>
              )}
            </Button>
          )}
        </Card>

        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => navigate('/client-hub')}>
            Voltar ao Hub
          </Button>
          <Button onClick={() => navigate(`/schedule?periodPlanId=${periodPlanId}`)}>
            Ver Demandas
          </Button>
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="max-w-4xl mx-auto">
      {loadingHistory ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : periodHistory.length === 0 ? (
        <Card className="p-8 text-center">
          <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum período planejado</h3>
          <p className="text-muted-foreground mb-4">
            Você ainda não criou nenhum planejamento de período para este cliente.
          </p>
          <Button onClick={() => setActiveTab('new')}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Primeiro Período
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {periodHistory.map((period) => (
            <Card 
              key={period.id} 
              className="p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedHistoryPlan(period)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{period.period_title}</h3>
                    <Badge 
                      variant={period.status === 'completed' ? 'default' : 'secondary'}
                      className={period.status === 'completed' ? 'bg-green-500' : ''}
                    >
                      {period.status === 'completed' ? 'Concluído' : 
                       period.status === 'mode_selected' ? 'Em Progresso' : 
                       period.status === 'generated' ? 'Gerado' : 'Rascunho'}
                    </Badge>
                    {period.primary_mode && (
                      <Badge variant="outline" className={period.primary_mode === 'ultra' ? 'border-pink-500 text-pink-500' : ''}>
                        Modo {period.primary_mode === 'ultra' ? 'Ultra' : 'Normal'}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-4 h-4" />
                      {format(new Date(period.period_start), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(period.period_end), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      {period.priority_channel}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {period.objective}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHistoryPlan(period);
                    }}
                  >
                    <Eye className="w-5 h-5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPeriodToDelete(period);
                    }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              
              {period.final_plan && period.final_plan.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    {period.final_plan.length} demandas geradas
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedHistoryPlan && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedHistoryPlan(null)}>
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedHistoryPlan.period_title}</h2>
                <p className="text-sm text-muted-foreground">
                  Criado em {format(new Date(selectedHistoryPlan.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedHistoryPlan(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Período</Label>
                  <p className="font-medium">
                    {format(new Date(selectedHistoryPlan.period_start), "dd/MM/yyyy")} - {format(new Date(selectedHistoryPlan.period_end), "dd/MM/yyyy")}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Canal Prioritário</Label>
                  <p className="font-medium">{selectedHistoryPlan.priority_channel}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Objetivo</Label>
                <p className="font-medium">{selectedHistoryPlan.objective}</p>
              </div>

              {selectedHistoryPlan.primary_mode && (
                <div>
                  <Label className="text-muted-foreground">Modo Selecionado</Label>
                  <Badge className={selectedHistoryPlan.primary_mode === 'ultra' ? 'bg-pink-500' : 'bg-blue-500'}>
                    {selectedHistoryPlan.primary_mode === 'ultra' ? 'Ultra' : 'Normal'}
                  </Badge>
                </div>
              )}

              {selectedHistoryPlan.final_plan && selectedHistoryPlan.final_plan.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Demandas ({selectedHistoryPlan.final_plan.length})</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedHistoryPlan.final_plan.map((item, idx) => (
                      <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium text-sm">{item.titulo}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{item.canal}</Badge>
                          <Badge variant="outline" className="text-xs">{item.tipo_conteudo}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {periodToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !isDeleting && setPeriodToDelete(null)}>
          <Card className="max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
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
                {format(new Date(periodToDelete.period_start), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(periodToDelete.period_end), "dd/MM/yyyy", { locale: ptBR })}
              </p>
              {periodToDelete.final_plan && periodToDelete.final_plan.length > 0 && (
                <p className="text-sm text-destructive mt-2">
                  ⚠️ {periodToDelete.final_plan.length} demandas associadas também serão excluídas
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setPeriodToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={handleDeletePeriod}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Período
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        {/* Fixed Header */}
        <PageHeader
          title="Planejar Período"
          subtitle={displayName}
          backTo="/client-hub"
          actions={currentStep === 'form' && activeTab === 'new' ? [
            {
              label: "Gerar Demandas",
              onClick: handleSubmit,
              icon: <Rocket className="w-4 h-4" />,
              className: "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
            }
          ] : []}
          rightContent={
            currentStep !== 'form' && currentStep !== 'loading' ? (
              <Badge variant="outline" className="text-xs">
                {currentStep === 'mode-selection' && 'Etapa 2/3: Escolha do Modo'}
                {currentStep === 'optional-package' && 'Etapa 3/3: Pacote Opcional'}
                {currentStep === 'completed' && 'Concluído'}
              </Badge>
            ) : null
          }
        />

        {/* Content */}
        <div className="container max-w-6xl mx-auto px-6 py-8">
          {currentStep === 'form' && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'new' | 'history')} className="w-full">
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
            </Tabs>
          )}
          {currentStep === 'loading' && (
            <LoadingScreen
              title="Gerando Demandas"
              description="A IA está criando duas linhas de demandas personalizadas: Normal e Ultra. Isso pode levar alguns segundos..."
              icon={Sparkles}
            />
          )}
          {currentStep === 'mode-selection' && renderModeSelection()}
          {currentStep === 'optional-package' && renderOptionalPackage()}
          {currentStep === 'completed' && renderCompleted()}
        </div>
      </div>
    </Layout>
  );
};

export default PlanPeriod;
