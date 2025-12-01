import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Zap, Shield, Rocket, Check, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Badge } from "@/components/ui/badge";

interface PlanItem {
  titulo: string;
  descricao: string;
  tipo_conteudo: string;
  canal: string;
  data_sugerida: string;
}

type Step = 'form' | 'loading' | 'mode-selection' | 'optional-package' | 'completed';

const PlanPeriod = () => {
  const navigate = useNavigate();
  const { selectedClient } = useSelectedClient();
  const { tenantId } = useTenant();

  // Form state
  const [periodTitle, setPeriodTitle] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [objective, setObjective] = useState("");
  const [priorityChannel, setPriorityChannel] = useState("");
  const [observations, setObservations] = useState("");

  // Process state
  const [currentStep, setCurrentStep] = useState<Step>('form');
  const [periodPlanId, setPeriodPlanId] = useState<string | null>(null);
  const [defaultPlan, setDefaultPlan] = useState<PlanItem[]>([]);
  const [ultraPlan, setUltraPlan] = useState<PlanItem[]>([]);
  const [normalSummary, setNormalSummary] = useState("");
  const [ultraSummary, setUltraSummary] = useState("");
  const [selectedMode, setSelectedMode] = useState<'normal' | 'ultra' | null>(null);
  const [optionalPackage, setOptionalPackage] = useState<PlanItem[]>([]);

  useEffect(() => {
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  if (!selectedClient || !tenantId) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  const channels = [
    "Instagram",
    "Facebook",
    "LinkedIn",
    "TikTok",
    "YouTube",
    "WhatsApp",
    "Email Marketing",
    "Google Ads",
    "Blog/Site",
    "Multi-canal"
  ];

  const handleSubmit = async () => {
    if (!periodTitle || !periodStart || !periodEnd || !objective || !priorityChannel) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (new Date(periodEnd) < new Date(periodStart)) {
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
          period_start: periodStart,
          period_end: periodEnd,
          budget: budget || null,
          objective,
          priority_channel: priorityChannel,
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
              <div>
                <Label htmlFor="periodStart">Data Início *</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="periodEnd">Data Fim *</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
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

        {/* Objective & Channel */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Objetivo e Canal
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="objective">Objetivo do Período *</Label>
              <Textarea
                id="objective"
                placeholder="Descreva o que você deseja alcançar neste período..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="priorityChannel">Canal Prioritário *</Label>
              <Select value={priorityChannel} onValueChange={setPriorityChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o canal principal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Observations */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            Observações e Restrições
          </h3>
          
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
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            size="lg"
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Rocket className="w-5 h-5 mr-2" />
            Gerar Demandas
          </Button>
        </div>
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
          {optionalPackage.map((item, idx) => (
            <div key={idx} className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{item.titulo}</p>
                  <p className="text-sm text-muted-foreground mt-1">{item.descricao.slice(0, 100)}...</p>
                </div>
                <Badge variant="outline">{item.canal}</Badge>
              </div>
            </div>
          ))}
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

  const renderCompleted = () => (
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
            <span className="text-muted-foreground">Total de Demandas:</span>{' '}
            {(selectedMode === 'normal' ? defaultPlan.length : ultraPlan.length) + (optionalPackage.length > 0 ? optionalPackage.length : 0)}
          </p>
          {optionalPackage.length > 0 && (
            <p><span className="text-muted-foreground">Pacote Extra:</span> Adicionado ({optionalPackage.length} demandas)</p>
          )}
        </div>
      </Card>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={() => navigate('/client-hub')}>
          Voltar ao Hub
        </Button>
        <Button onClick={() => navigate('/schedule')}>
          Ver Demandas
        </Button>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        {/* Fixed Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
          <div className="container max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/client-hub')}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold">Planejar Período</h1>
                  <p className="text-sm text-muted-foreground">{displayName}</p>
                </div>
              </div>
              
              {currentStep !== 'form' && currentStep !== 'loading' && (
                <Badge variant="outline" className="text-xs">
                  {currentStep === 'mode-selection' && 'Etapa 2/3: Escolha do Modo'}
                  {currentStep === 'optional-package' && 'Etapa 3/3: Pacote Opcional'}
                  {currentStep === 'completed' && 'Concluído'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="container max-w-6xl mx-auto px-6 py-8">
          {currentStep === 'form' && renderForm()}
          {currentStep === 'loading' && (
            <LoadingScreen
              title="Gerando Planos de Demandas"
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
