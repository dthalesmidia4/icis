import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, Loader2, CalendarDays, ChevronRight, ChevronDown,
  Plus, ArrowLeft, Paperclip, Building2
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────

interface SelectedClientLocal {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
}

interface PeriodItem {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  operational_status: string;
}

interface DemandRow {
  id: string;
  title: string;
  publish_date: string | null;
  attachments: any;
  status_id: string;
  period_plan_id: string | null;
}

interface StatusGroup {
  id: string;
  name: string;
  color: string;
  position: number;
  is_final: boolean;
  is_initial: boolean;
  demands: DemandRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────

const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

const getStatusBadge = (status: string) => {
  if (status === "concluido") return { label: "Concluído", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (status === "em_andamento") return { label: "Em andamento", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "Em planejamento", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
};

const hasAttachments = (att: any) => {
  if (!att) return false;
  if (Array.isArray(att)) return att.length > 0;
  return false;
};

// ─── Component ───────────────────────────────────────────────────

const PeriodClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { setSelectedClient } = useSelectedClient();

  // Local navigation state: client → period → detail
  const [selectedClientLocal, setSelectedClientLocal] = useState<SelectedClientLocal | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // ── Step 1: Fetch clients ──
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["schedules-clients", tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from("tenant_companies")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,fantasy_name.ilike.%${searchTerm}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId && !selectedClientLocal,
  });

  // ── Step 2: Fetch periods for selected client ──
  const { data: periods, isLoading: loadingPeriods } = useQuery({
    queryKey: ["schedules-periods", tenantId, selectedClientLocal?.id],
    queryFn: async () => {
      if (!tenantId || !selectedClientLocal) return [];
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, operational_status")
        .eq("tenant_id", tenantId)
        .eq("company_id", selectedClientLocal.id)
        .order("period_end", { ascending: false });
      if (error) throw error;
      return data as PeriodItem[];
    },
    enabled: !!tenantId && !!selectedClientLocal && !selectedPeriodId,
  });

  // ── Step 3: Fetch demands + statuses for selected period ──
  const { data: statusGroups, isLoading: loadingDetail } = useQuery({
    queryKey: ["schedules-detail", tenantId, selectedPeriodId],
    queryFn: async () => {
      if (!tenantId || !selectedPeriodId || !selectedClientLocal) return [];

      // Get pipeline for tenant
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .single();

      if (!pipeline) return [];

      // Fetch statuses
      const { data: statuses } = await supabase
        .from("pipeline_statuses")
        .select("id, name, color, position, is_final, is_initial")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true });

      if (!statuses) return [];

      // Fetch demands
      const { data: demands } = await supabase
        .from("demands")
        .select("id, title, publish_date, attachments, status_id, period_plan_id")
        .eq("tenant_id", tenantId)
        .eq("client_id", selectedClientLocal.id)
        .eq("period_plan_id", selectedPeriodId);

      const demandsList = (demands || []) as DemandRow[];

      // Group demands by status
      const groups: StatusGroup[] = statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        position: s.position,
        is_final: s.is_final,
        is_initial: s.is_initial,
        demands: demandsList.filter((d) => d.status_id === s.id),
      }));

      return groups;
    },
    enabled: !!tenantId && !!selectedPeriodId && !!selectedClientLocal,
  });

  const selectedPeriod = useMemo(
    () => periods?.find((p) => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  // ── Handlers ──
  const handleSelectClient = (client: any) => {
    const c: SelectedClientLocal = {
      id: client.id,
      name: client.name,
      fantasy_name: client.fantasy_name,
      cnpj_cpf: client.cnpj_cpf,
      email: client.email,
    };
    setSelectedClientLocal(c);
    setSearchTerm("");
  };

  const handleBack = () => {
    if (selectedPeriodId) {
      setSelectedPeriodId(null);
    } else if (selectedClientLocal) {
      setSelectedClientLocal(null);
      setSearchTerm("");
    }
  };

  // ─── RENDER: Step 3 — Detail (status-grouped demands) ───
  if (selectedPeriodId && selectedClientLocal) {
    const clientDisplay = selectedClientLocal.fantasy_name || selectedClientLocal.name;

    return (
      <div className="pb-8">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
              {selectedPeriod?.period_title || "Cronograma"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {clientDisplay}
              {selectedPeriod && (
                <> · {formatDate(selectedPeriod.period_start)} – {formatDate(selectedPeriod.period_end)}</>
              )}
            </p>
          </div>

          {/* Status groups */}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !statusGroups || statusGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum status encontrado</p>
          ) : (
            <div className="flex flex-col gap-6">
              {statusGroups.map((group) => (
                <div key={group.id}>
                  {/* Status header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="text-sm font-semibold text-foreground">{group.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {group.demands.length}
                    </Badge>
                  </div>

                  {/* Demands list */}
                  {group.demands.length === 0 ? (
                    <div className="pl-5 py-3">
                      <p className="text-xs text-muted-foreground italic">Nenhuma demanda neste status</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 pl-5">
                      {group.demands.map((demand) => (
                        <div
                          key={demand.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-sm text-foreground truncate flex-1">
                            {demand.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasAttachments(demand.attachments) && (
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {demand.publish_date && (
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {formatDate(demand.publish_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 2 — Period list for selected client ───
  if (selectedClientLocal) {
    const clientDisplay = selectedClientLocal.fantasy_name || selectedClientLocal.name;

    return (
      <div className="pb-8">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
                  Cronogramas de {clientDisplay}
                </h1>
                <p className="text-sm text-muted-foreground">Selecione um período para ver a execução</p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedClient({
                    id: selectedClientLocal.id,
                    name: selectedClientLocal.name,
                    fantasy_name: selectedClientLocal.fantasy_name,
                    cnpj_cpf: selectedClientLocal.cnpj_cpf,
                    email: selectedClientLocal.email,
                  });
                  navigate("/plan-period");
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Novo Período
              </Button>
            </div>
          </div>

          {/* Periods grouped by operational status */}
          {loadingPeriods ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !periods || periods.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhum período cadastrado para este cliente</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {[
                { key: "em_andamento", label: "Em andamento", color: "bg-amber-500" },
                { key: "analise", label: "Análise", color: "bg-blue-500" },
                { key: "concluido", label: "Concluído", color: "bg-emerald-500" },
              ].map((section) => {
                const sectionPeriods = periods.filter((p) => p.operational_status === section.key);
                return (
                  <div key={section.key}>
                    <button
                      onClick={() => setExpandedSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                      className="flex items-center gap-2 mb-2 w-full text-left"
                    >
                      {expandedSections[section.key] ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className={cn("w-3 h-3 rounded-full shrink-0", section.color)} />
                      <span className="text-sm font-semibold text-foreground">{section.label}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {sectionPeriods.length}
                      </Badge>
                    </button>
                    {expandedSections[section.key] && (
                      sectionPeriods.length === 0 ? (
                        <div className="pl-9 py-3">
                          <p className="text-xs text-muted-foreground italic">Nenhum período neste status</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 pl-9">
                          {sectionPeriods.map((period) => (
                            <div
                              key={period.id}
                              className="flex items-center justify-between gap-4 px-4 py-3 bg-muted/30 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group"
                              onClick={() => setSelectedPeriodId(period.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-foreground block truncate">
                                  {period.period_title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(period.period_start)} – {formatDate(period.period_end)}
                                </span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 1 — Client selection (big cards) ───
  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/home" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3">
            Cronogramas
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Selecione um cliente para ver os cronogramas
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou fantasia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Client grid */}
        {loadingClients ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !clients || clients.length === 0 ? (
          <div className="text-center py-12 sm:py-20 px-4">
            <CalendarDays className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <p className="text-base sm:text-lg font-medium mb-2">Nenhum cliente encontrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre clientes para acessar os cronogramas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => handleSelectClient(client)}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  {client.logo_url ? (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 bg-muted flex items-center justify-center">
                      <img
                        src={client.logo_url}
                        alt={client.fantasy_name || client.name}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <CalendarDays className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
                    </div>
                  )}
                  <h3 className="text-base sm:text-xl font-bold text-primary line-clamp-2">
                    {client.fantasy_name || client.name}
                  </h3>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PeriodClientList;
