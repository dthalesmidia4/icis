import { useMemo, useState } from "react";
import { Search, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { cn } from "@/lib/utils";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return "—";
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
};

type FilterId = "all" | "producao" | "concluidas" | "planejadas";

interface DemandsTabProps {
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  statusNames: Record<string, { name: string; isFinal: boolean }>;
  stageNames: Record<string, string>;
  memberNames: Record<string, string>;
  onOpenEvolution: () => void;
  onOpenOverview: () => void;
}

export default function DemandsTab({
  planItems,
  demands,
  statusNames,
  stageNames,
  memberNames,
  onOpenEvolution,
  onOpenOverview,
}: DemandsTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");

  const rows = useMemo(() => {
    const demandTitles = new Set(demands.map((d) => (d.title || "").trim()));
    const list = demands.map((d) => {
      const status = d.status_id ? statusNames[d.status_id] : undefined;
      const done = !!status?.isFinal || !!d.archived_at;
      return {
        key: d.id,
        title: d.title,
        type: d.demand_type,
        date: d.publish_date || d.delivery_date || d.due_date,
        stage: d.current_function_key ? stageNames[d.current_function_key] || d.current_function_key : null,
        status: status?.name || "Sem status",
        owner: d.assigned_to ? memberNames[d.assigned_to] || "—" : null,
        done,
        planned: false,
      };
    });

    planItems.forEach((i) => {
      if (demandTitles.has(i.titulo)) return;
      list.push({
        key: `plan-${i.titulo}`,
        title: i.titulo,
        type: i.tipo,
        date: i.data,
        stage: null,
        status: "Aguardando aprovação",
        owner: null,
        done: false,
        planned: true,
      });
    });

    return list.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  }, [demands, planItems, statusNames, stageNames, memberNames]);

  const filtered = rows.filter((r) => {
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "producao") return !r.planned && !r.done;
    if (filter === "concluidas") return r.done;
    if (filter === "planejadas") return r.planned;
    return true;
  });

  const filters: Array<{ id: FilterId; label: string; count: number }> = [
    { id: "all", label: "Todas", count: rows.length },
    { id: "producao", label: "Em produção", count: rows.filter((r) => !r.planned && !r.done).length },
    { id: "concluidas", label: "Concluídas", count: rows.filter((r) => r.done).length },
    { id: "planejadas", label: "Planejadas", count: rows.filter((r) => r.planned).length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar demanda..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50 hover:text-primary"
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="divide-y rounded-xl border bg-card">
          {filtered.map((r) => (
            <div
              key={r.key}
              className={cn(
                "flex flex-wrap items-center gap-3 p-4",
                r.done && "opacity-60",
                r.planned && "bg-muted/30"
              )}
            >
              <div className="w-14 shrink-0 text-xs font-bold uppercase tracking-wide text-primary tabular-nums">
                {shortDate(r.date)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {r.type && <span className="font-medium uppercase tracking-wide">{r.type}</span>}
                  {r.stage && <span>· {r.stage}</span>}
                  {r.owner && <span>· {r.owner}</span>}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  r.planned
                    ? "text-muted-foreground"
                    : r.done
                      ? "border-primary/30 text-muted-foreground"
                      : "border-primary/40 bg-primary/10 text-primary"
                )}
              >
                {r.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma demanda encontrada com esses filtros.
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={onOpenEvolution}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Activity className="h-3.5 w-3.5" />
          Abrir evolução detalhada
        </button>
        <button
          type="button"
          onClick={onOpenOverview}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver na visão geral das tarefas
        </button>
      </div>
    </div>
  );
}
