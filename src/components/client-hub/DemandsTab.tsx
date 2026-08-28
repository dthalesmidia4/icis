import { useMemo, useState } from "react";
import { ArrowRight, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { cn } from "@/lib/utils";
import { dedupeSnapshotAgainstLive } from "@/lib/demandCode";

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const dayOf = (iso: string | null) => {
  if (!iso) return "—";
  const [, , d] = iso.split("-").map(Number);
  return d ? String(d).padStart(2, "0") : "—";
};
const monthOf = (iso: string | null) => {
  if (!iso) return "";
  const [, m] = iso.split("-").map(Number);
  return m ? MONTHS[m - 1] : "";
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
    // Dedupe por código estável (DF-XXX) + título normalizado: o snapshot chega
    // completo do hook e nunca deve duplicar a demand viva do mesmo conteúdo.
    const pendingPlanItems = dedupeSnapshotAgainstLive(planItems, demands);
    const list = demands.map((d, idx) => {
      const status = d.status_id ? statusNames[d.status_id] : undefined;
      const done = !!status?.isFinal || !!d.archived_at;
      return {
        key: d.id,
        demandId: d.id,
        code: `DF-${String(idx + 1).padStart(3, "0")}`,
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

    pendingPlanItems.forEach((i, idx) => {
      list.push({
        key: `plan-${i.demand_id || i.titulo}-${idx}`,
        demandId: null as string | null,
        code: `PL-${String(idx + 1).padStart(3, "0")}`,
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

  const byType = planItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.tipo || "Outros";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      {!!typeEntries.length && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Arquitetura do período
          </p>
          <div className="mt-4 divide-y border-y">
            {typeEntries.map(([type, count]) => {
              const pct = Math.round((count / planItems.length) * 100);
              return (
                <div key={type} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-bold">{type}</span>
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

        <div className="w-full lg:max-w-xs">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Buscar
          </p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tema, tipo ou demanda"
            className="h-11 rounded-lg"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors",
                filter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="divide-y border-y">
          {filtered.map((r) => (
            <div
              key={r.key}
              className={cn(
                "group flex items-center gap-5 py-4 transition-colors hover:bg-muted/40",
                r.done && "opacity-55"
              )}
            >
              <div className="w-12 shrink-0 text-center">
                <p className="text-2xl font-black leading-none tabular-nums text-primary">
                  {dayOf(r.date)}
                </p>
                <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  {monthOf(r.date)}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  {r.code}
                  {r.stage ? ` · ${r.stage}` : ""}
                </p>
                <p className="mt-1 truncate text-[15px] font-bold leading-snug">{r.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[r.type, r.owner].filter(Boolean).join(" · ") || "Sem tipo definido"}
                </p>
              </div>

              <span
                className={cn(
                  "hidden shrink-0 rounded-full px-3 py-1 text-[10px] font-bold sm:block",
                  r.planned
                    ? "bg-muted text-muted-foreground"
                    : r.done
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary"
                )}
              >
                {r.status}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="border-y py-12 text-center text-sm text-muted-foreground">
          Nenhuma demanda encontrada com esses filtros.
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        <button
          type="button"
          onClick={onOpenEvolution}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
        >
          <Activity className="h-3.5 w-3.5" />
          Evolução detalhada
        </button>
        <button
          type="button"
          onClick={onOpenOverview}
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
        >
          Visão geral das tarefas
        </button>
      </div>
    </div>
  );
}
