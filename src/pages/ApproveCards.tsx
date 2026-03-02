import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { PageHeader } from "@/components/PageHeader";
import { DemandaCard, DemandaItem } from "@/components/DemandaCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Package, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PeriodWithDemands {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  status: string;
  default_plan: any[];
  ultra_plan: any[];
}

interface DemandRow {
  id: string;
  title: string;
  objective: string | null;
  instructions: string | null;
  demand_type: string | null;
  channel: string | null;
  publish_date: string | null;
  description: string | null;
  source: string;
}

const ApproveCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodWithDemands | null>(null);
  const [demands, setDemands] = useState<DemandRow[]>([]);
  const [unsavedPlans, setUnsavedPlans] = useState<DemandaItem[]>([]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate('/home');
      return;
    }
    fetchLatestPeriod();
  }, [isInitialized, selectedClient]);

  const fetchLatestPeriod = async () => {
    if (!selectedClient || !tenantId) return;
    setLoading(true);
    try {
      // Fetch the latest period plan for this client
      const { data: periods, error: periodError } = await supabase
        .from('period_plans')
        .select('id, period_title, period_start, period_end, status, default_plan, ultra_plan')
        .eq('company_id', selectedClient.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (periodError) throw periodError;
      if (!periods || periods.length === 0) {
        setPeriod(null);
        setLoading(false);
        return;
      }

      // Find the best period: first one with demands saved, or first with plans in JSON, or just the latest
      let bestPeriod: PeriodWithDemands | null = null;
      let bestDemands: DemandRow[] = [];

      for (const p of periods) {
        // Check if this period has demands saved in the demands table
        const { data: periodDemands, error: demandError } = await supabase
          .from('demands')
          .select('id, title, objective, instructions, demand_type, channel, publish_date, description, source')
          .eq('period_plan_id', p.id)
          .eq('client_id', selectedClient.id)
          .is('archived_at', null)
          .order('publish_date', { ascending: true });

        if (!demandError && periodDemands && periodDemands.length > 0) {
          bestPeriod = p as PeriodWithDemands;
          bestDemands = periodDemands;
          break;
        }

        // Check if period has unsaved plans in JSON columns
        const defaultPlan = Array.isArray(p.default_plan) ? p.default_plan : [];
        const ultraPlan = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
        if (defaultPlan.length > 0 || ultraPlan.length > 0) {
          bestPeriod = p as PeriodWithDemands;
          bestDemands = [];
          break;
        }
      }

      if (!bestPeriod) {
        // Just use the latest period
        bestPeriod = periods[0] as PeriodWithDemands;
      }

      setPeriod(bestPeriod);
      setDemands(bestDemands);

      // Check for unsaved plans in JSON
      const defaultPlan = Array.isArray(bestPeriod.default_plan) ? bestPeriod.default_plan : [];
      const ultraPlan = Array.isArray(bestPeriod.ultra_plan) ? bestPeriod.ultra_plan : [];
      const allPlans = [...defaultPlan, ...ultraPlan];
      setUnsavedPlans(allPlans as DemandaItem[]);

    } catch (error) {
      console.error('Error fetching period:', error);
      toast.error("Erro ao carregar período");
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;
  const hasContent = demands.length > 0 || unsavedPlans.length > 0;

  const formatDate = (d: string) => {
    try {
      return format(new Date(d + 'T12:00:00'), "dd MMM yyyy", { locale: ptBR });
    } catch {
      return d;
    }
  };

  // Convert demand rows to DemandaItem for display
  const demandToItem = (d: DemandRow): DemandaItem => ({
    titulo: d.title,
    objetivo: d.objective || undefined,
    conteudo: d.description || d.instructions || undefined,
    tipo: d.demand_type || undefined,
    canal: d.channel || undefined,
    data_sugerida: d.publish_date || undefined,
  });

  return (
    <div className="pb-8">
      <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <PageHeader
          title="Aprovar Produção"
          subtitle={`Cards gerados para ${displayName}`}
          backTo="/client-hub"
          actions={[
            {
              label: "Atualizar",
              onClick: fetchLatestPeriod,
              icon: <RefreshCw className="w-4 h-4" />,
              variant: "outline",
            }
          ]}
        />

        {loading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : !period ? (
          <Card className="p-8 text-center mt-6">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum período encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Crie um período primeiro para gerar os cards de produção.
            </p>
            <Button onClick={() => navigate('/plan-period')}>
              Planejar Período
            </Button>
          </Card>
        ) : !hasContent ? (
          <Card className="p-8 text-center mt-6">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum card gerado ainda</h3>
            <p className="text-muted-foreground mb-4">
              O período <strong>"{period.period_title}"</strong> existe mas ainda não possui cards gerados. 
              Isso pode ter acontecido por um timeout na geração. Tente retomar o planejamento.
            </p>
            <Button onClick={() => navigate('/plan-period?tab=history')}>
              Ver Histórico de Períodos
            </Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Period header */}
            <Card className="p-4 sm:p-6 border-primary/20 bg-primary/5">
              <div className="flex items-center gap-3 mb-3">
                <CalendarDays className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">{period.period_title}</h2>
                <Badge variant="secondary">{period.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(period.period_start)} — {formatDate(period.period_end)}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {demands.length > 0 
                    ? `${demands.length} cards salvos no Kanban` 
                    : `${unsavedPlans.length} cards gerados (não salvos)`}
                </span>
              </div>
            </Card>

            {/* Saved demands */}
            {demands.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Cards do Período ({demands.length})
                </h3>
                {demands.map((d) => (
                  <DemandaCard key={d.id} demanda={demandToItem(d)} variant="normal" />
                ))}
              </div>
            )}

            {/* Unsaved plans from JSON */}
            {unsavedPlans.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Cards Gerados — Pendentes de Aprovação ({unsavedPlans.length})
                </h3>
                {unsavedPlans.map((plan, idx) => (
                  <DemandaCard key={idx} demanda={plan} variant="normal" />
                ))}
                <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/30">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    ⚠️ Estes cards estão pendentes. Para salvá-los no Kanban, acesse o{" "}
                    <button 
                      onClick={() => navigate('/plan-period?tab=history')} 
                      className="underline font-medium hover:text-primary"
                    >
                      Histórico de Períodos
                    </button>{" "}
                    e retome o planejamento.
                  </p>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApproveCards;
