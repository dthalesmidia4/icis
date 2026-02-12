import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, Loader2, CalendarDays, ChevronRight, Building2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PeriodWithClient {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  operational_status: string;
  company_id: string;
  client_name: string;
  client_fantasy_name: string | null;
  client_logo_url: string | null;
  total_demands: number;
  executed_demands: number;
}

const PeriodClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { setSelectedClient } = useSelectedClient();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: periods, isLoading } = useQuery({
    queryKey: ['schedules-periods', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      // Fetch period plans with client info
      const { data: plansData, error: plansError } = await supabase
        .from('period_plans')
        .select(`
          id,
          period_title,
          period_start,
          period_end,
          operational_status,
          company_id,
          tenant_companies!period_plans_company_id_fkey (
            id, name, fantasy_name, logo_url, cnpj_cpf, email
          )
        `)
        .eq('tenant_id', tenantId)
        .order('period_end', { ascending: false });

      if (plansError) throw plansError;
      if (!plansData || plansData.length === 0) return [];

      // Fetch demands for execution count
      const planIds = plansData.map(p => p.id);
      const { data: demandsData, error: demandsError } = await supabase
        .from('demands')
        .select(`
          id,
          period_plan_id,
          pipeline_statuses!demands_status_id_fkey (
            is_final
          )
        `)
        .eq('tenant_id', tenantId)
        .in('period_plan_id', planIds);

      if (demandsError) throw demandsError;

      // Count demands per period
      const demandCounts = new Map<string, { total: number; executed: number }>();
      (demandsData || []).forEach(d => {
        if (!d.period_plan_id) return;
        const current = demandCounts.get(d.period_plan_id) || { total: 0, executed: 0 };
        current.total++;
        if (d.pipeline_statuses?.is_final) {
          current.executed++;
        }
        demandCounts.set(d.period_plan_id, current);
      });

      return plansData.map(plan => {
        const company = plan.tenant_companies as any;
        const counts = demandCounts.get(plan.id) || { total: 0, executed: 0 };
        return {
          id: plan.id,
          period_title: plan.period_title,
          period_start: plan.period_start,
          period_end: plan.period_end,
          operational_status: plan.operational_status,
          company_id: plan.company_id,
          client_name: company?.name || '',
          client_fantasy_name: company?.fantasy_name || null,
          client_logo_url: company?.logo_url || null,
          client_cnpj_cpf: company?.cnpj_cpf || '',
          client_email: company?.email || '',
          total_demands: counts.total,
          executed_demands: counts.executed,
        } as PeriodWithClient & { client_cnpj_cpf: string; client_email: string };
      });
    },
    enabled: !!tenantId
  });

  const filteredPeriods = useMemo(() => {
    if (!periods) return [];
    if (!searchTerm) return periods;
    const term = searchTerm.toLowerCase();
    return periods.filter(p => {
      const displayName = p.client_fantasy_name || p.client_name;
      return displayName.toLowerCase().includes(term) || p.period_title.toLowerCase().includes(term);
    });
  }, [periods, searchTerm]);

  const handlePeriodClick = (period: any) => {
    setSelectedClient({
      id: period.company_id,
      name: period.client_name,
      fantasy_name: period.client_fantasy_name,
      cnpj_cpf: period.client_cnpj_cpf,
      email: period.client_email,
    });
    navigate('/plan-period');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'concluido') {
      return { label: 'Concluído', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
    }
    return { label: 'Em andamento', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="mb-4">
            <BackButton to="/home" />
          </div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <CalendarDays className="h-5 w-5 text-violet-500" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Cronogramas
            </h1>
            {filteredPeriods.length > 0 && (
              <Badge variant="secondary">
                {filteredPeriods.length} {filteredPeriods.length === 1 ? 'período' : 'períodos'}
              </Badge>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou período..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !filteredPeriods || filteredPeriods.length === 0 ? (
          <div className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[300px] flex flex-col items-center justify-center">
            <CalendarDays className="h-12 w-12 mb-4 opacity-30 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {searchTerm ? "Nenhum resultado encontrado" : "Nenhum período cadastrado"}
            </p>
            <p className="text-xs mt-1 text-muted-foreground/70">
              {searchTerm ? "Tente buscar por outro termo" : "Crie períodos para seus clientes"}
            </p>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
            <div className="flex flex-col gap-2">
              {filteredPeriods.map(period => {
                const displayName = period.client_fantasy_name || period.client_name;
                const statusBadge = getStatusBadge(period.operational_status);

                return (
                  <div
                    key={period.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-all duration-200 group"
                    onClick={() => handlePeriodClick(period)}
                  >
                    {/* Left side */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="h-9 w-9 shrink-0">
                        {period.client_logo_url ? (
                          <AvatarImage src={period.client_logo_url} alt={displayName} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate block">
                          {displayName}
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          {period.period_title}
                        </span>
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap border", statusBadge.className)}>
                        {statusBadge.label}
                      </Badge>

                      {period.total_demands > 0 && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                          {period.executed_demands} de {period.total_demands} executadas
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/80 rounded-md border border-border/50 hidden sm:flex">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-foreground whitespace-nowrap">
                          {formatDate(period.period_end)}
                        </span>
                      </div>

                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
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

export default PeriodClientList;
