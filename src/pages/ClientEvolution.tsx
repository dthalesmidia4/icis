import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Activity, CheckCircle2, Clock3, ListChecks, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
type ScopeFilter = "active" | "all";
type PeriodFilter = "all" | "7d" | "30d" | "this_month" | "last_month";
type SortKey = "title" | "type" | "assignee" | "area" | "stage" | "progress" | "next" | "publish" | "deadline";
type SortDir = "asc" | "desc";

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

const sortValue = (
  row: {
    card: KanbanCardData;
    isDone: boolean;
    hasStage: boolean;
    stageIndex: number;
    sequence: { function_key: string; name: string }[];
    stageName: string | null;
    nextStageName: string | null;
    workArea: "midia" | "sistemas" | null;
  },
  key: SortKey,
  assigneeMap: Record<string, string>,
): string | number | null => {
  const { card, isDone, stageIndex, sequence, stageName, nextStageName, workArea } = row;
  switch (key) {
    case "title": return card.title || null;
    case "type": return card.demand_type || null;
    case "assignee": return assigneeMap[card.assigned_to || ""] || null;
    case "area": return workArea || null;
    case "stage": return isDone ? "zzzz_concluida" : stageName || null;
    case "progress": {
      const total = sequence.length;
      const done = isDone ? total : Math.max(0, stageIndex);
      return total > 0 ? done / total : -1;
    }
    case "next": return nextStageName || null;
    case "publish": return card.publish_date || null;
    case "deadline": return card.delivery_date || null;
    default: return null;
  }
};

function periodRange(period: PeriodFilter): { start: Date; end: Date } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  if (period === "7d") {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: s, end: endOfToday };
  }
  if (period === "30d") {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { start: s, end: endOfToday };
  }
  if (period === "this_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }
  if (period === "last_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  }
  return null;
}

const periodLabel: Record<PeriodFilter, string> = {
  all: "Todas as datas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  this_month: "Este mês (inclui prazos futuros)",
  last_month: "Mês passado",
};

const periodShortLabel: Record<PeriodFilter, string> = {
  all: "Todas as datas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
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
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  // Load static data
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
      let q = supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .eq("client_id", selectedClient.id)
        .eq("is_draft", false)
        .order("updated_at", { ascending: false });

      // Scope: "Ativas" = não arquivadas. "Todas" = inclui arquivadas.
      if (scope === "active") {
        q = q.is("archived_at", null);
      }

      const { data: demands } = await q;

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
          work_area: d.work_area ?? null,
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
  }, [tenantId, selectedClient?.id, scope]);

  useEffect(() => { fetchDemands(); }, [fetchDemands]);

  const debouncedRefetch = useDebouncedCallback(() => fetchDemands(), 250);
  useRealtimeDemands({
    tenantId,
    clientId: selectedClient?.id || null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });

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

  type Classified = {
    card: KanbanCardData;
    isDone: boolean;
    isOverdue: boolean;
    hasStage: boolean;
    stageKey: string | null;
    stageName: string | null;
    stageIndex: number;
    sequence: FlowFunction[];
    nextStageName: string | null;
    workArea: "midia" | "sistemas" | null;
  };

  // Scope de conclusão + período
  const scopedCards = useMemo(() => {
    const range = periodRange(period);
    return cards.filter((c) => {
      const done = FINAL_STATUSES.has((c.status || "").toLowerCase());
      if (scope === "active" && done) return false;

      if (range) {
        const ref = c.delivery_date || c.created_at?.slice(0, 10) || null;
        if (!ref) return false;
        const [y, m, d] = ref.split("-").map((n) => parseInt(n, 10));
        if (!y || !m || !d) return false;
        const dt = new Date(y, m - 1, d);
        if (dt < range.start || dt > range.end) return false;
      }
      return true;
    });
  }, [cards, scope, period]);

  const classified = useMemo<Classified[]>(() => {
    return scopedCards.map((c) => {
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
        workArea: ((c as any).work_area as "midia" | "sistemas" | null) ?? null,
      };
    });
  }, [scopedCards, sequenceForCard]);

  const summary = useMemo(() => {
    const total = classified.length;
    const done = classified.filter((c) => c.isDone).length;
    const overdue = classified.filter((c) => c.isOverdue).length;
    const queued = classified.filter((c) => !c.isDone && !c.hasStage).length;
    const inProgress = total - done - queued;
    return { total, done, overdue, queued, inProgress };
  }, [classified]);

  const timeline = useMemo(() => {
    let list = classified;
    if (filter === "done") list = list.filter((c) => c.isDone);
    else if (filter === "in_progress") list = list.filter((c) => !c.isDone && c.hasStage);
    else if (filter === "overdue") list = list.filter((c) => c.isOverdue);
    else if (filter === "queued") list = list.filter((c) => !c.isDone && !c.hasStage);

    const rank = (c: Classified) => (c.isDone ? 2 : c.hasStage ? 0 : 1);
    const sorted = [...list].sort((a, b) => {
      if (sort) {
        const dir = sort.dir === "asc" ? 1 : -1;
        const aVal = sortValue(a, sort.key, assigneeMap);
        const bVal = sortValue(b, sort.key, assigneeMap);
        if (aVal !== bVal) {
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;
          if (typeof aVal === "string" && typeof bVal === "string") {
            return aVal.localeCompare(bVal, undefined, { sensitivity: "base" }) * dir;
          }
          if (typeof aVal === "number" && typeof bVal === "number") {
            return (aVal - bVal) * dir;
          }
          return String(aVal).localeCompare(String(bVal)) * dir;
        }
      }
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const at = a.card.updated_at ? new Date(a.card.updated_at).getTime() : 0;
      const bt = b.card.updated_at ? new Date(b.card.updated_at).getTime() : 0;
      return bt - at;
    });
    return sorted;
  }, [classified, filter, sort, assigneeMap]);

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
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
      {/* Header em uma linha */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <BackButton to="/client-hub" />
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            Evolução das Demandas
            <span className="text-muted-foreground font-normal"> · {displayName}</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["active", "all"] as ScopeFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  scope === s ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
                title={s === "active" ? "Não arquivadas" : "Inclui concluídas e arquivadas"}
              >
                {s === "active" ? "Ativas" : "Todas"}
              </button>
            ))}
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(periodShortLabel) as PeriodFilter[]).map((p) => (
                <SelectItem key={p} value={p} className="text-xs" title={periodLabel[p]}>
                  {periodShortLabel[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma demanda para este cliente.</p>
        </div>
      ) : (
        <>
          {/* Barra de progresso full-width */}
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {summary.done}/{summary.total} · {progressPct}%
              </span>
            </div>
          </div>

          {/* Chips de filtro por status */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <CounterChip label="Total" value={summary.total} icon={ListChecks} tone="muted"
              active={filter === "all"} onClick={() => setFilter("all")} />
            <CounterChip label="Em andamento" value={summary.inProgress} icon={Activity} tone="primary"
              active={filter === "in_progress"} onClick={() => setFilter("in_progress")} />
            <CounterChip label="Concluídas" value={summary.done} icon={CheckCircle2} tone="emerald"
              active={filter === "done"} onClick={() => setFilter("done")} />
            <CounterChip label="Fila" value={summary.queued} icon={Clock3} tone="amber"
              active={filter === "queued"} onClick={() => setFilter("queued")} />
            <CounterChip label="Atrasadas" value={summary.overdue} icon={AlertTriangle} tone="destructive"
              active={filter === "overdue"} onClick={() => setFilter("overdue")} />
          </div>

          {/* Tabela densa */}
          <div className="rounded-lg border bg-card">
            {timeline.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhuma demanda para o filtro selecionado.
              </div>
            ) : (
              <table className="w-full text-sm table-fixed border-collapse">
                <colgroup>
                  <col className="w-[6px]" />
                  <col />
                  <col className="hidden md:table-column w-[9%]" />
                  <col className="hidden md:table-column w-[11%]" />
                  <col className="w-[7%]" />
                  <col className="w-[13%]" />
                  <col className="hidden lg:table-column w-[12%]" />
                  <col className="hidden xl:table-column w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th aria-hidden className="p-0" />
                    <SortHeader label="Título" sortKey="title" sort={sort} onToggle={toggleSort} />
                    <SortHeader label="Tipo" sortKey="type" sort={sort} onToggle={toggleSort} className="hidden md:table-cell" />
                    <SortHeader label="Responsável" sortKey="assignee" sort={sort} onToggle={toggleSort} className="hidden md:table-cell" />
                    <SortHeader label="Área" sortKey="area" sort={sort} onToggle={toggleSort} />
                    <SortHeader label="Etapa" sortKey="stage" sort={sort} onToggle={toggleSort} />
                    <SortHeader label="Progresso" sortKey="progress" sort={sort} onToggle={toggleSort} className="hidden lg:table-cell" />
                    <SortHeader label="Próxima" sortKey="next" sort={sort} onToggle={toggleSort} className="hidden xl:table-cell" />
                    <SortHeader label="Publicação" sortKey="publish" sort={sort} onToggle={toggleSort} />
                    <SortHeader label="Prazo" sortKey="deadline" sort={sort} onToggle={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((row, i) => (
                    <TableRow
                      key={row.card.id}
                      row={row}
                      assigneeName={assigneeMap[row.card.assigned_to || ""] || null}
                      onOpen={() => setSelectedCard(row.card)}
                      zebra={i % 2 === 1}
                    />
                  ))}
                </tbody>
              </table>
            )}
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

const chipTone: Record<string, { active: string; idle: string; icon: string }> = {
  muted:       { active: "border-foreground/40 bg-foreground/5",        idle: "hover:bg-muted/60 border-border/60", icon: "text-muted-foreground" },
  primary:     { active: "border-primary bg-primary/15 text-primary",   idle: "hover:bg-primary/5 border-border/60", icon: "text-primary" },
  emerald:     { active: "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", idle: "hover:bg-emerald-500/5 border-border/60", icon: "text-emerald-600 dark:text-emerald-400" },
  amber:       { active: "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300", idle: "hover:bg-amber-500/5 border-border/60", icon: "text-amber-600 dark:text-amber-400" },
  destructive: { active: "border-destructive bg-destructive/15 text-destructive", idle: "hover:bg-destructive/5 border-border/60", icon: "text-destructive" },
};

function CounterChip({
  label, value, icon: Icon, tone, active, onClick,
}: {
  label: string;
  value: number;
  icon: any;
  tone: keyof typeof chipTone;
  active: boolean;
  onClick: () => void;
}) {
  const t = chipTone[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? t.active : cn("bg-transparent text-foreground", t.idle),
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", t.icon)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold text-foreground">{value}</span>
    </button>
  );
}

function AreaBadge({ workArea }: { workArea: "midia" | "sistemas" | null }) {
  if (!workArea) {
    return <span className="text-muted-foreground text-[11px]">—</span>;
  }
  if (workArea === "midia") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Mídia
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      Sistemas
    </span>
  );
}

function TableRow({
  row, assigneeName, onOpen, zebra,
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
    workArea: "midia" | "sistemas" | null;
  };
  assigneeName: string | null;
  onOpen: () => void;
  zebra: boolean;
}) {
  const { card, isDone, isOverdue: overdue, hasStage, stageIndex, sequence, stageName, nextStageName, workArea } = row;

  const stageCell = () => {
    if (isDone) {
      return <span className="text-emerald-600 dark:text-emerald-400 font-medium">Concluída</span>;
    }
    if (!hasStage) {
      return <span className="text-amber-600 dark:text-amber-400 font-medium">Aguardando início</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="font-medium text-foreground truncate">{stageName}</span>
        {card.updated_at && (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">· {relativeDays(card.updated_at)}</span>
        )}
      </span>
    );
  };

  const total = sequence.length;
  const doneCount = isDone ? total : Math.max(0, stageIndex);

  const prazoTone = overdue
    ? "text-destructive font-medium"
    : isDone
      ? "text-muted-foreground"
      : "text-foreground";

  const areaBar = workArea === "midia"
    ? "bg-primary"
    : workArea === "sistemas"
      ? "bg-slate-400 dark:bg-slate-500"
      : "bg-transparent";
  const areaTitle = workArea === "midia" ? "Mídia" : workArea === "sistemas" ? "Sistemas" : "Sem área";

  return (
    <tr
      onClick={onOpen}
      className={cn(
        "cursor-pointer border-t border-border/60 hover:bg-primary/5 transition-colors align-middle",
        zebra && "bg-muted/20",
        overdue && "bg-destructive/5 hover:bg-destructive/10",
        isDone && "opacity-70",
      )}
    >
      <td className="p-0" title={areaTitle}>
        <div className={cn("h-8 w-[3px] mx-auto rounded-full", areaBar)} />
      </td>
      <td className="px-3 py-2 min-w-0">
        <div className="font-medium text-foreground truncate" title={card.title}>
          {card.title}
        </div>
      </td>
      <td className="px-2 py-2 hidden md:table-cell text-muted-foreground text-[12px] truncate">
        {card.demand_type || "—"}
      </td>
      <td className="px-2 py-2 hidden md:table-cell text-foreground text-[12px] truncate">
        {assigneeName || <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-2">
        <AreaBadge workArea={workArea} />
      </td>
      <td className="px-2 py-2 text-[12px]">
        <div className="min-w-0 truncate">{stageCell()}</div>
      </td>
      <td className="px-2 py-2 hidden lg:table-cell">
        {total > 0 ? (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {sequence.map((fn, i) => {
                const isCompleted = isDone || (stageIndex >= 0 && i < stageIndex);
                const isCurrent = !isDone && i === stageIndex;
                return (
                  <span
                    key={fn.function_key}
                    title={fn.name}
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isCompleted && "bg-emerald-500",
                      isCurrent && "bg-primary ring-2 ring-primary/30",
                      !isCompleted && !isCurrent && "bg-muted-foreground/25",
                    )}
                  />
                );
              })}
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {doneCount}/{total}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">—</span>
        )}
      </td>
      <td className="px-2 py-2 hidden xl:table-cell text-muted-foreground text-[12px] truncate">
        {isDone ? "—" : nextStageName || <span className="text-muted-foreground/60">—</span>}
      </td>
      <td className="px-2 py-2 text-[12px] tabular-nums whitespace-nowrap text-muted-foreground">
        {card.publish_date ? (
          <span title={card.publish_time || undefined}>
            {formatDate(card.publish_date)}
            {card.publish_time && <span className="text-[11px] opacity-80"> · {card.publish_time.slice(0, 5)}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      <td className={cn("px-3 py-2 whitespace-nowrap text-[12px] tabular-nums", prazoTone)}>
        {card.delivery_date ? formatDate(card.delivery_date) : "—"}
      </td>
    </tr>
  );
}

export default ClientEvolution;
