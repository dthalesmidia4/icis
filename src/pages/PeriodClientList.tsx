import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, Loader2, CalendarDays, ChevronRight, ChevronDown } from "lucide-react";
import BackButton from "@/components/BackButton";
import { cn } from "@/lib/utils";

interface PeriodData {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  operational_status: string;
  total_demands: number;
  executed_demands: number;
}

interface ClientGroup {
  company_id: string;
  client_name: string;
  client_fantasy_name: string | null;
  client_logo_url: string | null;
  client_cnpj_cpf: string;
  client_email: string;
  periods: PeriodData[];
}

const PeriodClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { setSelectedClient } = useSelectedClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const { data: clientGroups, isLoading } = useQuery({
    queryKey: ['schedules-periods-grouped', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data: plansData, error: plansError } = await supabase
        .from('period_plans')
        .select(`
          id, period_title, period_start, period_end, operational_status, company_id,
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
      const { data: demandsData } = await supabase
        .from('demands')
        .select(`id, period_plan_id, pipeline_statuses!demands_status_id_fkey ( is_final )`)
        .eq('tenant_id', tenantId)
        .in('period_plan_id', planIds);

      const demandCounts = new Map<string, { total: number; executed: number }>();
      (demandsData || []).forEach(d => {
        if (!d.period_plan_id) return;
        const current = demandCounts.get(d.period_plan_id) || { total: 0, executed: 0 };
        current.total++;
        if (d.pipeline_statuses?.is_final) current.executed++;
        demandCounts.set(d.period_plan_id, current);
      });

      // Group by client
      const groupMap = new Map<string, ClientGroup>();
      plansData.forEach(plan => {
        const company = plan.tenant_companies as any;
        const companyId = plan.company_id;
        if (!groupMap.has(companyId)) {
          groupMap.set(companyId, {
            company_id: companyId,
            client_name: company?.name || '',
            client_fantasy_name: company?.fantasy_name || null,
            client_logo_url: company?.logo_url || null,
            client_cnpj_cpf: company?.cnpj_cpf || '',
            client_email: company?.email || '',
            periods: [],
          });
        }
        const counts = demandCounts.get(plan.id) || { total: 0, executed: 0 };
        groupMap.get(companyId)!.periods.push({
          id: plan.id,
          period_title: plan.period_title,
          period_start: plan.period_start,
          period_end: plan.period_end,
          operational_status: plan.operational_status,
          total_demands: counts.total,
          executed_demands: counts.executed,
        });
      });

      return Array.from(groupMap.values()).sort((a, b) => {
        const nameA = (a.client_fantasy_name || a.client_name).toLowerCase();
        const nameB = (b.client_fantasy_name || b.client_name).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    },
    enabled: !!tenantId
  });

  const filteredGroups = useMemo(() => {
    if (!clientGroups) return [];
    if (!searchTerm) return clientGroups;
    const term = searchTerm.toLowerCase();
    return clientGroups
      .map(group => {
        const clientMatch = (group.client_fantasy_name || group.client_name).toLowerCase().includes(term);
        if (clientMatch) return group;
        const matchingPeriods = group.periods.filter(p => p.period_title.toLowerCase().includes(term));
        if (matchingPeriods.length > 0) return { ...group, periods: matchingPeriods };
        return null;
      })
      .filter(Boolean) as ClientGroup[];
  }, [clientGroups, searchTerm]);

  const toggleClient = (companyId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const handleClientClick = (group: ClientGroup) => {
    setSelectedClient({
      id: group.company_id,
      name: group.client_name,
      fantasy_name: group.client_fantasy_name,
      cnpj_cpf: group.client_cnpj_cpf,
      email: group.client_email,
    });
    navigate('/plan-period');
  };

  const formatDate = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');

  const getStatusBadge = (status: string) => {
    if (status === 'concluido') return { label: 'Concluído', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
    if (status === 'em_andamento') return { label: 'Em andamento', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
    return { label: 'Em planejamento', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' };
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const totalPeriods = filteredGroups.reduce((sum, g) => sum + g.periods.length, 0);

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
            {totalPeriods > 0 && (
              <Badge variant="secondary">
                {filteredGroups.length} {filteredGroups.length === 1 ? 'cliente' : 'clientes'} · {totalPeriods} {totalPeriods === 1 ? 'período' : 'períodos'}
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
        ) : filteredGroups.length === 0 ? (
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
          <div className="flex flex-col gap-3">
            {filteredGroups.map(group => {
              const displayName = group.client_fantasy_name || group.client_name;
              const isExpanded = expandedClients.has(group.company_id);

              return (
                <div key={group.company_id} className="bg-muted/30 rounded-xl border border-border/50 overflow-hidden">
                  {/* Client header row */}
                  <div
                    className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleClient(group.company_id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="h-9 w-9 shrink-0">
                        {group.client_logo_url ? <AvatarImage src={group.client_logo_url} alt={displayName} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {group.periods.length} {group.periods.length === 1 ? 'período' : 'períodos'}
                      </Badge>
                    </div>
                    <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>

                  {/* Periods list (expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-3 flex flex-col gap-1.5">
                      {group.periods.map(period => {
                        const statusBadge = getStatusBadge(period.operational_status);
                        const execPercent = period.total_demands > 0 ? Math.round((period.executed_demands / period.total_demands) * 100) : 0;

                        return (
                          <div
                            key={period.id}
                            className="flex items-center justify-between gap-4 px-4 py-2.5 bg-background rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-all duration-200 group"
                            onClick={() => handleClientClick(group)}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-foreground truncate block">{period.period_title}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(period.period_start)} – {formatDate(period.period_end)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {period.total_demands > 0 && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                                  {period.executed_demands}/{period.total_demands} · {execPercent}%
                                </span>
                              )}
                              <Badge className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap border", statusBadge.className)}>
                                {statusBadge.label}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PeriodClientList;
