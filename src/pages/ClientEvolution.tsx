import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, CheckCircle2, Clock3, ListChecks, AlertTriangle, Circle, ChevronRight } from "lucide-react";
import BackButton from "@/components/BackButton";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { useRealtimeDemands, useDebouncedCallback } from "@/hooks/realtime";
import { cn } from "@/lib/utils";

const FINAL_STATUSES = new Set(["feito", "feitos", "publicado"]);
const EXCLUDED_FUNCTION_KEYS = new Set(["avaliar"]);

interface FlowFunction {
  function_key: string;
  name: string;
  position: number;
}

interface TypeRule {
  demand_type_key: string;
  function_key: string;
  requirement: string;
}

type Filter = "all" | "done" | "in_progress" | "overdue" | "queued";

const isOverdue = (deliveryDate?: string | null, deliveryTime?: string | null, status?: string) => {
  if (!deliveryDate) return false;
  if (FINAL_STATUSES.has((status || "").toLowerCase())) return false;
  const time = deliveryTime || "23:59";
  const t = time.length === 5 ? `${time}:00` : time;
  const deadline = new Date(`${deliveryDate}T${t}`);
  if (isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

const formatDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const relativeDays = (iso?: string | null) => {
  if (!iso) return "";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
};

const ClientEvolution = () => {
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient } = useSelectedClient();
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [typeRules, setTypeRules] = useState<TypeRule[]>([]);
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // Load static data (flow_functions, rules, pipeline)
  useEffect(() => {
    if (tenantLoading || !tenantId) return;
    (async () => {
      const [{ data: fns }, { data: rules }, { data: pipelines }] = await Promise.all([
        supabase
          .from("flow_functions")
          .select("function_key, name, position, active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("position"),
        supabase
          .from("demand_type_flow_rules")
          .select("demand_type_key, function_key, requirement")
          .eq("tenant_id", tenantId),
        supabase.from("pipelines").select("id").eq("tenant_id", tenantId).limit(1),
      ]);
      const filteredFns = ((fns as any[]) || []).filter((f) => !EXCLUDED_FUNCTION_KEYS.has(f.function_key));
      setFunctions(filteredFns);
      setTypeRules((rules as TypeRule[]) || []);

      if (pipelines?.length) {
        const { data: statuses } = await supabase
          .from("pipeline_statuses")
          .select("*")
          .eq("pipeline_id", pipelines[0].id)
          .order("position");
        if (statuses) {
          setPipelineStatuses(
            statuses.map((s: any) => ({
              id: s.id, name: s.name, color: s.color, position: s.position,
              pipeline_id: s.pipeline_id, is_fixed: s.is_fixed, parent_status_id: s.parent_status_id,
            })),
          );
        }
      }
    })();
  }, [tenantId, tenantLoading]);

  const fetchDemands = useCallback(async () => {
    if (!tenantId || !selectedClient?.id) {
      setCards([]);
      return;
    }
    setLoading(true);
    try {
      const { data: demands } = await supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .eq("client_id", selectedClient.id)
        .is("archived_at", null)
        .eq("is_draft", false)
        .order("updated_at", { ascending: false });

      if (demands) {
        const mapped: KanbanCardData[] = demands.map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description || "",
          status: d.pipeline_statuses.name,
          due_date: d.due_date || "",
          publish_date: d.publish_date || "",
          publish_time: d.publish_time || "",
          channel: d.channel || "",
          demand_type: d.demand_type || "",
          demand_type_key: d.demand_type_key ?? null,
          objective: d.objective || "",
          instructions: d.instructions || "",
          observations: d.observations || "",
          post_caption: d.post_caption || "",
          attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
          additional_publish_dates: Array.isArray(d.additional_publish_dates) ? (d.additional_publish_dates as string[]) : [],
          source: d.source || "manual",
          delivery_date: d.delivery_date || "",
          due_time: d.due_time || "",
          delivery_time: d.delivery_time || "",
          period_plan_id: d.period_plan_id || "",
          tenant_id: d.tenant_id,
          created_at: d.created_at,
          updated_at: d.updated_at,
          assigned_to: d.assigned_to || null,
          clientName: d.tenant_companies.fantasy_name || d.tenant_companies.name,
          clientId: d.client_id,
          current_function_key: d.current_function_key ?? null,
        } as any));
        setCards(mapped);

        const userIds = Array.from(new Set(mapped.map((c) => c.assigned_to).filter(Boolean))) as string[];
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
          if (profs) {
            const map: Record<string, string> = {};
            profs.forEach((p: any) => { map[p.id] = p.full_name || "—"; });
            setAssigneeMap(map);
          }
        } else {
          setAssigneeMap({});
        }
      }
    } catch (err) {
      console.error("[ClientEvolution] fetch error", err);
      sonnerToast.error("Erro ao carregar demandas");
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedClient?.id]);

  useEffect(() => { fetchDemands(); }, [fetchDemands]);

  const debouncedRefetch = useDebouncedCallback(() => fetchDemands(), 250);
  useRealtimeDemands({
    tenantId,
    clientId: selectedClient?.id || null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });

  // Compute sequence expected for a card given its demand_type_key.
  const sequenceForCard = useCallback((demandTypeKey?: string | null): FlowFunction[] => {
    if (!demandTypeKey) return functions;
    const required = new Set(
      typeRules
        .filter((r) => r.demand_type_key === demandTypeKey && r.requirement === "required")
        .map((r) => r.function_key)
        .filter((k) => !EXCLUDED_FUNCTION_KEYS.has(k)),
    );
    if (required.size === 0) return functions;
    return functions.filter((f) => required.has(f.function_key));
  }, [functions, typeRules]);

  // Classify each card
  type Classified = {
    card: KanbanCardData;
    isDone: boolean;
    isOverdue: boolean;
    hasStage: boolean;
    stageKey: string | null;
    stageName: string | null;
    stageIndex: number; // -1 if none
    sequence: FlowFunction[];
    nextStageName: string | null;
  };

  const classified = useMemo<Classified[]>(() => {
    return cards.map((c) => {
      const stageKey = (c as any).current_function_key as string | null;
      const isDone = FINAL_STATUSES.has((c.status || "").toLowerCase());
      const seq = sequenceForCard(c.demand_type_key);
      const idx = stageKey ? seq.findIndex((f) => f.function_key === stageKey) : -1;
      const currentFn = idx >= 0 ? seq[idx] : null;
      const nextFn = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
      return {
        card: c,
        isDone,
        isOverdue: isOverdue(c.delivery_date, c.delivery_time, c.status),
        hasStage: !!stageKey,
        stageKey,
        stageName: currentFn?.name ?? null,
        stageIndex: idx,
        sequence: seq,
        nextStageName: nextFn?.name ?? null,
      };
    });
  }, [cards, sequenceForCard]);

  // Summary counters
  const summary = useMemo(() => {
    const total = classified.length;
    const done = classified.filter((c) => c.isDone).length;
    const overdue = classified.filter((c) => c.isOverdue).length;
    const queued = classified.filter((c) => !c.isDone && !c.hasStage).length;
    const inProgress = total - done - queued;
    return { total, done, overdue, queued, inProgress };
  }, [classified]);

  // Counts per stage (only active, non-done cards)
  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    classified.forEach((c) => {
      if (c.isDone) return;
      if (!c.stageKey) return;
      map.set(c.stageKey, (map.get(c.stageKey) || 0) + 1);
    });
    return map;
  }, [classified]);

  // Filtered timeline
  const timeline = useMemo(() => {
    let list = classified;
    if (filter === "done") list = list.filter((c) => c.isDone);
    else if (filter === "in_progress") list = list.filter((c) => !c.isDone && c.hasStage);
    else if (filter === "overdue") list = list.filter((c) => c.isOverdue);
    else if (filter === "queued") list = list.filter((c) => !c.isDone && !c.hasStage);
    if (selectedStage) list = list.filter((c) => c.stageKey === selectedStage && !c.isDone);
    // Order: in progress → queued → done
    const rank = (c: Classified) => (c.isDone ? 2 : c.hasStage ? 0 : 1);
    return [...list].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const at = a.card.updated_at ? new Date(a.card.updated_at).getTime() : 0;
      const bt = b.card.updated_at ? new Date(b.card.updated_at).getTime() : 0;
      return bt - at;
    });
  }, [classified, filter, selectedStage]);

  const handleSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    try {
      const updateData: Record<string, any> = {};
      if (field === "status") {
        const st = pipelineStatuses.find((s) => s.name === value);
        if (st) updateData.status_id = st.id;
      } else {
        updateData[field] = value || null;
      }
      const { error } = await supabase.from("demands").update(updateData as any).eq("id", selectedCard.id);
      if (error) throw error;
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, [field]: value } as KanbanCardData : c));
      setSelectedCard((prev) => prev ? { ...prev, [field]: value } as KanbanCardData : prev);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("[ClientEvolution] save error", err);
      sonnerToast.error("Erro ao salvar");
    }
  };

  if (!selectedClient) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-10 text-center">
        <BackButton to="/home" />
        <p className="text-muted-foreground mt-8">Selecione um cliente no Hub para visualizar a evolução.</p>
      </div>
    );
  }

  const displayName = selectedClient.fantasy_name || selectedClient.name;
  const progressPct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/client-hub" />

      <div className="flex flex-col items-center gap-2 mb-6 text-center">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Evolução das Demandas</h1>
        </div>
        <p className="text-sm text-muted-foreground">{displayName}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : summary.total === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma demanda ativa para este cliente.</p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <SummaryCard
              label="Total"
              value={summary.total}
              icon={ListChecks}
              tone="muted"
              active={filter === "all"}
              onClick={() => { setFilter("all"); setSelectedStage(null); }}
            />
            <SummaryCard
              label="Em andamento"
              value={summary.inProgress}
              icon={Activity}
              tone="primary"
              active={filter === "in_progress"}
              onClick={() => { setFilter("in_progress"); setSelectedStage(null); }}
            />
            <SummaryCard
              label="Concluídas"
              value={summary.done}
              icon={CheckCircle2}
              tone="emerald"
              active={filter === "done"}
              onClick={() => { setFilter("done"); setSelectedStage(null); }}
            />
            <SummaryCard
              label="Fila"
              value={summary.queued}
              icon={Clock3}
              tone="amber"
              active={filter === "queued"}
              onClick={() => { setFilter("queued"); setSelectedStage(null); }}
            />
            <SummaryCard
              label="Atrasadas"
              value={summary.overdue}
              icon={AlertTriangle}
              tone="destructive"
              active={filter === "overdue"}
              onClick={() => { setFilter("overdue"); setSelectedStage(null); }}
            />
          </div>

          {/* Barra de progresso */}
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-medium text-foreground">Progresso geral</span>
              <span className="text-muted-foreground">{summary.done} de {summary.total} concluídas · {progressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </Card>

          {/* Pipeline por etapa */}
          {functions.length > 0 && (
            <Card className="p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Pipeline por etapa</h2>
                {selectedStage && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedStage(null)}>
                    Limpar etapa
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {functions.map((fn, i) => {
                  const count = stageCounts.get(fn.function_key) || 0;
                  const active = selectedStage === fn.function_key;
                  return (
                    <div key={fn.function_key} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedStage(active ? null : fn.function_key)}
                        className={cn(
                          "px-3 py-1.5 rounded-full border text-xs font-medium transition-colors flex items-center gap-2",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : count > 0
                              ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
                              : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                        )}
                      >
                        <span>{fn.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-5 min-w-5 px-1.5 text-[10px]",
                            active && "bg-primary-foreground/20 text-primary-foreground",
                          )}
                        >
                          {count}
                        </Badge>
                      </button>
                      {i < functions.length - 1 && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <div className="px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                    <span>Concluídas</span>
                    <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      {summary.done}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhuma demanda para o filtro selecionado.
              </div>
            ) : timeline.map((row) => (
              <TimelineRow
                key={row.card.id}
                row={row}
                assigneeName={assigneeMap[row.card.assigned_to || ""] || null}
                onOpen={() => setSelectedCard(row.card)}
              />
            ))}
          </div>
        </>
      )}

      <TaskCard
        open={!!selectedCard}
        onOpenChange={(open) => { if (!open) setSelectedCard(null); }}
        card={selectedCard}
        onCardChange={(updated) => setSelectedCard((prev) => prev ? { ...prev, ...updated } : prev)}
        onSave={handleSave}
        onFileUpload={async () => {}}
        onRemoveAttachment={async () => {}}
        onReorderAttachments={async () => {}}
        onDelete={async () => {
          if (!selectedCard) return;
          await supabase.from("demands").delete().eq("id", selectedCard.id);
          setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
          setSelectedCard(null);
          sonnerToast.success("Demanda excluída");
        }}
        pipelineStatuses={pipelineStatuses}
      />
    </div>
  );
};

// ------- subcomponents -------

const toneClasses: Record<string, { active: string; idle: string; icon: string }> = {
  muted:       { active: "border-foreground/40 bg-muted",        idle: "hover:bg-muted/60", icon: "text-muted-foreground" },
  primary:     { active: "border-primary bg-primary/10",         idle: "hover:bg-primary/5",     icon: "text-primary" },
  emerald:     { active: "border-emerald-500 bg-emerald-500/10", idle: "hover:bg-emerald-500/5", icon: "text-emerald-600 dark:text-emerald-400" },
  amber:       { active: "border-amber-500 bg-amber-500/10",     idle: "hover:bg-amber-500/5",   icon: "text-amber-600 dark:text-amber-400" },
  destructive: { active: "border-destructive bg-destructive/10", idle: "hover:bg-destructive/5", icon: "text-destructive" },
};

function SummaryCard({
  label, value, icon: Icon, tone, active, onClick,
}: {
  label: string;
  value: number;
  icon: any;
  tone: keyof typeof toneClasses;
  active: boolean;
  onClick: () => void;
}) {
  const t = toneClasses[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card p-3 transition-colors",
        active ? t.active : cn("border-border", t.idle),
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn("h-4 w-4", t.icon)} />
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
    </button>
  );
}

function TimelineRow({
  row, assigneeName, onOpen,
}: {
  row: {
    card: KanbanCardData;
    isDone: boolean;
    isOverdue: boolean;
    hasStage: boolean;
    stageKey: string | null;
    stageName: string | null;
    stageIndex: number;
    sequence: { function_key: string; name: string }[];
    nextStageName: string | null;
  };
  assigneeName: string | null;
  onOpen: () => void;
}) {
  const { card, isDone, isOverdue: overdue, hasStage, stageIndex, sequence, stageName, nextStageName } = row;

  const stageMeta = () => {
    if (isDone) return <span className="text-emerald-600 dark:text-emerald-400 font-medium">Concluída {card.delivery_date ? `em ${formatDate(card.delivery_date)}` : ""}</span>;
    if (!hasStage) return <span className="text-amber-600 dark:text-amber-400 font-medium">Aguardando etapa inicial</span>;
    return (
      <>
        <span className="font-medium text-foreground">{stageName}</span>
        {card.updated_at && <span className="text-muted-foreground"> · {relativeDays(card.updated_at)}</span>}
        {nextStageName && <span className="text-muted-foreground"> · próximo: {nextStageName}</span>}
      </>
    );
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full text-left rounded-lg border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-sm",
        overdue && "border-destructive/40 bg-destructive/5",
        isDone && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {card.clientName && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{card.clientName}</Badge>
            )}
            {card.demand_type && (
              <span className="text-[11px] text-muted-foreground">{card.demand_type}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2">{card.title}</h3>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-tight">
          {overdue && <div className="text-destructive font-medium mb-0.5">Atrasada</div>}
          {assigneeName && <div className="text-muted-foreground">{assigneeName}</div>}
        </div>
      </div>

      {/* Micro stepper */}
      {sequence.length > 0 && (
        <div className="flex items-center gap-1 mb-2 overflow-x-auto">
          {sequence.map((fn, i) => {
            const done = isDone || (stageIndex >= 0 && i < stageIndex);
            const current = !isDone && i === stageIndex;
            const future = !done && !current;
            return (
              <div key={fn.function_key} className="flex items-center gap-1 shrink-0">
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    done && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    current && "bg-primary text-primary-foreground",
                    future && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <CheckCircle2 className="h-3 w-3" /> : current ? <Activity className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  <span>{fn.name}</span>
                </div>
                {i < sequence.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
              </div>
            );
          })}
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
              isDone
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            <span>Concluída</span>
          </div>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        {stageMeta()}
      </div>
    </button>
  );
}

export default ClientEvolution;
